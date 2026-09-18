use crate::core::storage::{Account, Store};
use anyhow::{bail, Context, Result};
use fs2::FileExt;
use rusqlite::{params, OptionalExtension, Transaction};
use std::{fs::OpenOptions, path::Path};

fn with_archive_lock<T>(store: &Store, account: &Account, action: impl FnOnce() -> Result<T>) -> Result<T> {
    let path = store.account_dir(&account.id)?.join("capture.lock");
    let file = OpenOptions::new().create(true).read(true).write(true).open(path)?;
    file.try_lock_exclusive().context("capture already running for this account")?;
    let result = action();
    let _ = file.unlock();
    result
}

fn renumber_revisions(tx: &Transaction<'_>, table: &str, identity: &str) -> Result<()> {
    let sql = format!("SELECT id,CAST({identity} AS TEXT) FROM {table} ORDER BY {identity},first_capture,id");
    let rows = tx.prepare(&sql)?.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // Temporary high versions avoid collisions while satisfying CHECK(version>0).
    for (id, _) in &rows {
        tx.execute(&format!("UPDATE {table} SET version=1000000000+id WHERE id=?1"), [id])?;
    }
    let mut previous = String::new();
    let mut version = 0;
    for (id, key) in rows {
        if key != previous { previous = key; version = 0; }
        version += 1;
        tx.execute(&format!("UPDATE {table} SET version=?1 WHERE id=?2"), params![version, id])?;
    }
    Ok(())
}

pub fn delete_snapshot(store: &Store, account: &Account, sequence: i64) -> Result<()> {
    if sequence < 1 { bail!("invalid snapshot"); }
    with_archive_lock(store, account, || {
        let mut db = store.open_db(&account.id)?;
        store.verify(account, &db)?;
        let tx = db.transaction()?;
        let run_id: String = tx.query_row("SELECT run_id FROM captures WHERE sequence=?1", [sequence], |r| r.get(0))
            .optional()?.context("snapshot does not exist")?;
        tx.execute("DELETE FROM sync_state", [])?;
        tx.execute("DELETE FROM current_contacts", [])?;
        tx.execute("DELETE FROM capture_contacts WHERE capture_sequence=?1", [sequence])?;
        tx.execute("DELETE FROM capture_groups WHERE capture_sequence=?1", [sequence])?;
        tx.execute("DELETE FROM contact_revisions WHERE NOT EXISTS (SELECT 1 FROM capture_contacts WHERE revision_id=contact_revisions.id)", [])?;
        tx.execute("DELETE FROM group_revisions WHERE NOT EXISTS (SELECT 1 FROM capture_groups WHERE revision_id=group_revisions.id)", [])?;
        tx.execute("UPDATE contact_revisions SET first_capture=(SELECT MIN(capture_sequence) FROM capture_contacts WHERE revision_id=contact_revisions.id)", [])?;
        tx.execute("UPDATE group_revisions SET first_capture=(SELECT MIN(capture_sequence) FROM capture_groups WHERE revision_id=group_revisions.id)", [])?;
        tx.execute("DELETE FROM captures WHERE sequence=?1", [sequence])?;
        tx.execute("DELETE FROM media_jobs WHERE run_id=?1", [&run_id])?;
        tx.execute("DELETE FROM observation_media WHERE run_id=?1", [&run_id])?;
        tx.execute("DELETE FROM raw_observations WHERE run_id=?1", [&run_id])?;
        tx.execute("DELETE FROM capture_runs WHERE id=?1", [&run_id])?;
        tx.execute("DELETE FROM media_objects WHERE NOT EXISTS (SELECT 1 FROM observation_media WHERE sha256=media_objects.sha256) AND NOT EXISTS (SELECT 1 FROM media_jobs WHERE sha256=media_objects.sha256)", [])?;
        renumber_revisions(&tx, "contact_revisions", "contact_id")?;
        renumber_revisions(&tx, "group_revisions", "resource_name")?;
        let latest: Option<i64> = tx.query_row("SELECT MAX(sequence) FROM captures", [], |r| r.get(0))?;
        if let Some(latest) = latest {
            tx.execute("INSERT INTO current_contacts(contact_id,display_name,search_text,revision_id) SELECT c.contact_id,COALESCE(json_extract(o.payload,'$.names[0].displayName'),'Unnamed contact'),lower(o.payload),r.id FROM capture_contacts c JOIN contact_revisions r ON r.id=c.revision_id JOIN contact_identities i ON i.id=c.contact_id JOIN captures p ON p.sequence=c.capture_sequence JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name WHERE c.capture_sequence=?1 AND r.kind='present'", [latest])?;
            // A full sync is required after deleting a snapshot, especially the latest one.
            tx.execute("INSERT INTO sync_state(id,token,full_sync_at,coverage,capture_sequence) SELECT 1,NULL,NULL,coverage,sequence FROM captures WHERE sequence=?1", [latest])?;
        }
        tx.execute("DELETE FROM contact_identities WHERE NOT EXISTS (SELECT 1 FROM contact_revisions WHERE contact_id=contact_identities.id)", [])?;
        tx.commit()?;
        let media_dir = store.account_dir(&account.id)?.join("media");
        if media_dir.exists() {
            for file in std::fs::read_dir(media_dir)? {
                let file = file?;
                let path = file.path();
                if !path.is_file() { continue; }
                let Some(hash) = path.file_stem().and_then(|value| value.to_str()) else { continue; };
                if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) { continue; }
                let retained: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM media_objects WHERE sha256=?1)", [hash], |r| r.get(0))?;
                if !retained { std::fs::remove_file(path)?; }
            }
        }
        Ok(())
    })
}

fn reset_account(store: &Store, account: &Account) -> Result<()> {
    with_archive_lock(store, account, || {
        let mut db = store.open_db(&account.id)?;
        store.verify(account, &db)?;
        let tx = db.transaction()?;
        tx.execute_batch("DELETE FROM sync_state; DELETE FROM current_contacts; DELETE FROM capture_contacts; DELETE FROM capture_groups; DELETE FROM contact_revisions; DELETE FROM group_revisions; DELETE FROM contact_identities; DELETE FROM captures; DELETE FROM media_jobs; DELETE FROM observation_media; DELETE FROM raw_observations; DELETE FROM capture_runs; DELETE FROM media_objects; DELETE FROM sqlite_sequence WHERE name='captures';")?;
        tx.commit()?;
        let media = store.account_dir(&account.id)?.join("media");
        if Path::new(&media).exists() { std::fs::remove_dir_all(&media)?; }
        std::fs::create_dir_all(media)?;
        Ok(())
    })
}

pub fn reset_database(store: &Store) -> Result<()> {
    for account in store.accounts()? { reset_account(store, &account)?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::capture::{self, Scan};
    use serde_json::json;

    fn scan(name: &str) -> Scan {
        Scan { contacts: vec![json!({"resourceName":"people/1","names":[{"displayName":name}]})], groups: vec![], next_sync_token: None, full_sync_at: None, media: vec![] }
    }

    #[test]
    fn deleting_middle_and_latest_snapshot_preserves_remaining_history() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store.add_account("subject", "test@example.com").unwrap();
        let first = capture::publish(&store, &account, scan("Ada"), "fixture").unwrap();
        let middle = capture::publish(&store, &account, scan("Ada B"), "fixture").unwrap();
        let latest = capture::publish(&store, &account, scan("Ada C"), "fixture").unwrap();
        delete_snapshot(&store, &account, middle.sequence).unwrap();
        assert_eq!(capture::captures(&store, &account).unwrap().len(), 2);
        assert_eq!(capture::compare_snapshots(&store, &account, first.sequence, latest.sequence).unwrap().len(), 1);
        assert_eq!(capture::changes(&store, &account, latest.sequence, 0).unwrap()[0].before.as_ref().unwrap()["names"][0]["displayName"], "Ada");
        delete_snapshot(&store, &account, latest.sequence).unwrap();
        assert_eq!(capture::captures(&store, &account).unwrap().len(), 1);
        assert_eq!(capture::contacts(&store, &account, first.sequence, "", None, 0).unwrap()[0].display_name, "Ada");
        let next = capture::publish(&store, &account, scan("Ada D"), "fixture").unwrap();
        assert_eq!(capture::changes(&store, &account, next.sequence, 0).unwrap()[0].version, 2);
        delete_snapshot(&store, &account, first.sequence).unwrap();
        assert_eq!(capture::contacts(&store, &account, next.sequence, "", None, 0).unwrap()[0].version, 1);
        reset_database(&store).unwrap();
        assert!(capture::captures(&store, &account).unwrap().is_empty());
        assert!(store.account(&account.id).is_ok());
    }
}
