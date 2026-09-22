mod groups;
mod history;
mod queries;
#[cfg(test)]
mod tests;

pub use groups::groups;
pub use history::{
    all_changes, compare_snapshots, contact_at_snapshot, contact_history, contact_snapshots,
    ChangelogEntry, ContactHistoryEntry, ContactSnapshotEntry,
};
pub use queries::{capture_at, captures, changes, contacts};

use crate::core::storage::{Account, Store};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use fs2::FileExt;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fs::OpenOptions,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
};
use uuid::Uuid;

static ACTIVE_CAPTURES: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

pub fn cancel(account_id: &str) -> bool {
    if let Ok(map) = ACTIVE_CAPTURES.lock() {
        if let Some(token) = map.get(account_id) {
            token.store(true, Ordering::SeqCst);
            return true;
        }
    }
    false
}

pub const FIELDS: &str = "addresses,ageRanges,biographies,birthdays,calendarUrls,clientData,coverPhotos,emailAddresses,events,externalIds,genders,imClients,interests,locales,locations,memberships,metadata,miscKeywords,names,nicknames,occupations,organizations,phoneNumbers,photos,relations,sipAddresses,skills,urls,userDefined";
pub const COVERAGE: &str = "people.connections:v1:contact+profile:fields-v1";

#[derive(Clone, Deserialize)]
pub struct Scan {
    pub contacts: Vec<Value>,
    pub groups: Vec<Value>,
    pub next_sync_token: Option<String>,
    #[serde(default)]
    pub full_sync_at: Option<String>,
    #[serde(default)]
    pub media: Vec<crate::core::media::MediaObservation>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Capture {
    pub sequence: i64,
    pub started_at: String,
    pub committed_at: String,
    pub contact_count: i64,
    pub group_count: i64,
    pub media_complete: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct CaptureOutcome {
    pub capture: Capture,
    pub is_new: bool,
    pub change_count: usize,
}
impl std::ops::Deref for CaptureOutcome {
    type Target = Capture;
    fn deref(&self) -> &Self::Target {
        &self.capture
    }
}
#[derive(Clone, Serialize)]
pub struct GroupRow {
    pub resource_name: String,
    pub name: String,
    pub member_count: Option<i64>,
}
#[derive(Clone, Serialize)]
pub struct ContactRow {
    pub resource_name: String,
    pub display_name: String,
    pub payload: Value,
    pub version: i64,
}
#[derive(Clone, Serialize)]
pub struct ChangeRow {
    pub resource_name: String,
    pub kind: String,
    pub version: i64,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

fn canonical(mut value: Value) -> Result<String> {
    fn clean(v: &mut Value) {
        match v {
            Value::Object(map) => {
                for key in ["etag", "photoUrl", "url", "updateTime"] {
                    if key == "url" && !map.contains_key("default") {
                        continue;
                    }
                    map.remove(key);
                }
                for item in map.values_mut() {
                    clean(item);
                }
            }
            Value::Array(items) => {
                for item in items.iter_mut() {
                    clean(item);
                }
                items.sort_by_key(|x| serde_json::to_string(x).unwrap_or_default());
            }
            _ => {}
        }
    }
    clean(&mut value);
    Ok(serde_json::to_string(&value)?)
}

fn name(v: &Value) -> String {
    v.get("names")
        .and_then(Value::as_array)
        .and_then(|a| {
            a.iter()
                .find_map(|n| n.get("displayName").and_then(Value::as_str))
        })
        .unwrap_or("Unnamed contact")
        .to_owned()
}
fn resource(v: &Value) -> Result<&str> {
    v.get("resourceName")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .context("record missing resourceName")
}
fn deleted(v: &Value) -> bool {
    v.pointer("/metadata/deleted").and_then(Value::as_bool) == Some(true)
}

pub fn publish(
    store: &Store,
    account: &Account,
    scan: Scan,
    trigger: &str,
) -> Result<CaptureOutcome> {
    if !["manual", "due", "fixture", "import"].contains(&trigger) {
        bail!("invalid capture trigger");
    }
    let dir = store.account_dir(&account.id)?;
    let lock_file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("capture.lock"))?;
    lock_file
        .try_lock_exclusive()
        .context("capture already running for this account")?;
    let result = start_run(store, account, trigger).and_then(|(run_id, started)| {
        publish_locked(store, account, scan, &run_id, &started, trigger)
    });
    let _ = lock_file.unlock();
    result
}

pub fn capture_with<F>(
    store: &Store,
    account: &Account,
    trigger: &str,
    scan: F,
) -> Result<CaptureOutcome>
where
    F: FnOnce(Option<Arc<AtomicBool>>) -> Result<Scan>,
{
    capture_with_progress(store, account, trigger, scan, |_| {})
}

pub fn capture_with_progress<F, P>(
    store: &Store,
    account: &Account,
    trigger: &str,
    scan: F,
    progress: P,
) -> Result<CaptureOutcome>
where
    F: FnOnce(Option<Arc<AtomicBool>>) -> Result<Scan>,
    P: Fn(&crate::core::google::CaptureProgress) + Send + Sync,
{
    if !["manual", "due", "import"].contains(&trigger) {
        bail!("invalid capture trigger");
    }
    let dir = store.account_dir(&account.id)?;
    let lock_file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(dir.join("capture.lock"))?;
    lock_file
        .try_lock_exclusive()
        .context("capture already running for this account")?;

    let cancel_token = Arc::new(AtomicBool::new(false));
    {
        if let Ok(mut map) = ACTIVE_CAPTURES.lock() {
            map.insert(account.id.clone(), cancel_token.clone());
        }
    }

    struct CaptureGuard(String);
    impl Drop for CaptureGuard {
        fn drop(&mut self) {
            if let Ok(mut map) = ACTIVE_CAPTURES.lock() {
                map.remove(&self.0);
            }
        }
    }
    let _guard = CaptureGuard(account.id.clone());

    let result = start_run(store, account, trigger).and_then(|(run_id, started)| {
        match scan(Some(cancel_token.clone())) {
            Ok(result) => {
                if cancel_token.load(Ordering::Relaxed) {
                    bail!("Capture cancelled by user");
                }
                progress(&crate::core::google::CaptureProgress {
                    account_id: account.id.clone(),
                    stage: "indexing".into(),
                    message: "Writing snapshot to archive database...".into(),
                    current: None,
                    total: None,
                    percent: Some(90),
                });
                let outcome = publish_locked(store, account, result, &run_id, &started, trigger)?;
                let message = if outcome.is_new {
                    format!(
                        "Snapshot #{} captured ({} changes)",
                        outcome.sequence, outcome.change_count
                    )
                } else {
                    format!(
                        "No changes detected. Snapshot #{} is up to date",
                        outcome.sequence
                    )
                };
                progress(&crate::core::google::CaptureProgress {
                    account_id: account.id.clone(),
                    stage: "complete".into(),
                    message,
                    current: Some(outcome.contact_count as usize),
                    total: Some(outcome.contact_count as usize),
                    percent: Some(100),
                });
                Ok(outcome)
            }
            Err(error) => {
                mark_failed(store, account, &run_id, &error);
                Err(error)
            }
        }
    });
    let _ = lock_file.unlock();
    result
}

fn start_run(store: &Store, account: &Account, trigger: &str) -> Result<(String, String)> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let run_id = Uuid::new_v4().to_string();
    let started = Utc::now().to_rfc3339();
    db.execute("INSERT INTO capture_runs(id,trigger,started_at,result,coverage) VALUES(?1,?2,?3,'running',?4)", params![run_id,trigger,started,COVERAGE])?;
    Ok((run_id, started))
}

fn mark_failed(store: &Store, account: &Account, run_id: &str, error: &anyhow::Error) {
    if let Ok(db) = store.open_db(&account.id) {
        let _ = db.execute(
            "UPDATE capture_runs SET result='failed',ended_at=?2,error=?3 WHERE id=?1",
            params![run_id, Utc::now().to_rfc3339(), error.to_string()],
        );
    }
}

fn publish_locked(
    store: &Store,
    account: &Account,
    scan: Scan,
    run_id: &str,
    started: &str,
    trigger: &str,
) -> Result<CaptureOutcome> {
    let mut db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let outcome = (|| -> Result<CaptureOutcome> {
        let mut contacts = BTreeMap::<String, Value>::new();
        for person in scan.contacts {
            let id = resource(&person)?.to_owned();
            if contacts.insert(id.clone(), person).is_some() {
                bail!("duplicate contact {id}");
            }
        }
        let mut groups = BTreeMap::<String, Value>::new();
        for group in scan.groups {
            let id = resource(&group)?.to_owned();
            if groups.insert(id.clone(), group).is_some() {
                bail!("duplicate group {id}");
            }
        }
        let committed = Utc::now().to_rfc3339();
        let tx = db.transaction()?;
        let previous: Option<i64> =
            tx.query_row("SELECT MAX(sequence) FROM captures", [], |r| r.get(0))?;

        let mut prior = BTreeMap::<String, (i64, i64, String, String)>::new();
        if let Some(prev) = previous {
            let mut stmt = tx.prepare("SELECT i.resource_name,r.id,r.version,r.kind,r.semantic_json FROM capture_contacts c JOIN contact_identities i ON i.id=c.contact_id JOIN contact_revisions r ON r.id=c.revision_id WHERE c.capture_sequence=?1")?;
            let rows = stmt.query_map([prev], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                ))
            })?;
            for row in rows {
                let (key, id, version, kind, semantic) = row?;
                prior.insert(key, (id, version, kind, semantic));
            }
        }

        let mut prior_groups = BTreeMap::<String, String>::new();
        if let Some(prev) = previous {
            let mut stmt = tx.prepare(
                "SELECT g.resource_name, r.payload FROM capture_groups g JOIN group_revisions r ON r.id=g.revision_id WHERE g.capture_sequence=?1"
            )?;
            let rows = stmt.query_map([prev], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for row in rows {
                let (key, payload) = row?;
                prior_groups.insert(key, payload);
            }
        }

        // Change detection
        let mut changes_count = 0usize;
        let mut all_ids: BTreeSet<String> = contacts.keys().cloned().collect();
        all_ids.extend(prior.keys().cloned());
        for key in &all_ids {
            let value = contacts.get(key);
            let is_deleted = value.map(deleted).unwrap_or(true);
            let kind = if is_deleted { "deleted" } else { "present" };
            let semantic = if is_deleted {
                "{}".to_string()
            } else {
                canonical(value.unwrap().clone())?
            };
            if let Some((_, _, old_kind, old_semantic)) = prior.get(key) {
                if old_kind != kind || old_semantic != &semantic {
                    changes_count += 1;
                }
            } else {
                if !is_deleted {
                    changes_count += 1;
                }
            }
        }

        let mut all_group_ids: BTreeSet<String> = groups.keys().cloned().collect();
        all_group_ids.extend(prior_groups.keys().cloned());
        for key in &all_group_ids {
            let value = groups.get(key);
            if let Some(v) = value {
                let payload = serde_json::to_string(v)?;
                if let Some(old_payload) = prior_groups.get(key) {
                    if old_payload != &payload {
                        changes_count += 1;
                    }
                } else {
                    changes_count += 1;
                }
            } else {
                changes_count += 1;
            }
        }

        // Diff-only snapshot creation: if no changes occurred and a snapshot already exists, don't create duplicate
        if previous.is_some() && trigger != "fixture" && changes_count == 0 {
            let prev_seq = previous.unwrap();
            if let Some(sync_token) = scan.next_sync_token {
                tx.execute(
                    "INSERT INTO sync_state(id,token,full_sync_at,coverage,capture_sequence) VALUES(1,?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET token=excluded.token,full_sync_at=excluded.full_sync_at,coverage=excluded.coverage,capture_sequence=excluded.capture_sequence",
                    params![
                        sync_token,
                        scan.full_sync_at.unwrap_or_else(|| committed.clone()),
                        COVERAGE,
                        prev_seq
                    ],
                )?;
            }
            tx.execute(
                "UPDATE capture_runs SET result='success',ended_at=?2 WHERE id=?1",
                params![run_id, Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
            let prev_cap = db.query_row(
                "SELECT sequence,started_at,committed_at,contact_count,group_count,media_complete FROM captures WHERE sequence=?1",
                [prev_seq],
                |r| Ok(Capture {
                    sequence: r.get(0)?,
                    started_at: r.get(1)?,
                    committed_at: r.get(2)?,
                    contact_count: r.get(3)?,
                    group_count: r.get(4)?,
                    media_complete: r.get(5)?,
                }),
            )?;
            return Ok(CaptureOutcome {
                capture: prev_cap,
                is_new: false,
                change_count: 0,
            });
        }

        let group_count = groups.len() as i64;
        let media_complete = scan
            .media
            .iter()
            .all(|m| m.status == "available" || m.status == "generated");
        tx.execute("INSERT INTO captures(run_id,started_at,committed_at,contact_count,group_count,coverage,media_complete) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![run_id,started,committed,contacts.values().filter(|v| !deleted(v)).count() as i64,groups.len() as i64,COVERAGE,media_complete])?;
        let sequence = tx.last_insert_rowid();

        tx.execute("DELETE FROM current_contacts", [])?;

        {
            let mut stmt_id_insert = tx.prepare_cached(
                "INSERT INTO contact_identities(resource_name) VALUES(?1) ON CONFLICT(resource_name) DO NOTHING",
            )?;
            let mut stmt_id_get =
                tx.prepare_cached("SELECT id FROM contact_identities WHERE resource_name=?1")?;
            let mut stmt_rev_insert = tx.prepare_cached(
                "INSERT INTO contact_revisions(contact_id,version,kind,semantic_json,first_capture) VALUES(?1,?2,?3,?4,?5)",
            )?;
            let mut stmt_cap_contact = tx.prepare_cached(
                "INSERT INTO capture_contacts(capture_sequence,contact_id,revision_id) VALUES(?1,?2,?3)",
            )?;
            let mut stmt_raw_obs = tx.prepare_cached(
                "INSERT INTO raw_observations(run_id,resource_name,payload) VALUES(?1,?2,?3)",
            )?;
            let mut stmt_curr_contact = tx.prepare_cached(
                "INSERT INTO current_contacts(contact_id,display_name,search_text,revision_id) VALUES(?1,?2,?3,?4)",
            )?;

            for key in all_ids {
                let value = contacts.get(&key);
                let is_deleted = value.map(deleted).unwrap_or(true);
                let kind = if is_deleted { "deleted" } else { "present" };
                let semantic = if is_deleted {
                    "{}".to_string()
                } else {
                    canonical(value.unwrap().clone())?
                };

                stmt_id_insert.execute([&key])?;
                let contact_id: i64 = stmt_id_get.query_row([&key], |r| r.get(0))?;

                let prior_row = prior.get(&key);
                let revision_id = if let Some((id, _, old_kind, old_semantic)) = prior_row {
                    if old_kind == kind && old_semantic == &semantic {
                        *id
                    } else {
                        stmt_rev_insert.execute(params![
                            contact_id,
                            prior_row.map(|r| r.1 + 1).unwrap_or(1),
                            kind,
                            &semantic,
                            sequence
                        ])?;
                        tx.last_insert_rowid()
                    }
                } else {
                    stmt_rev_insert.execute(params![contact_id, 1, kind, &semantic, sequence])?;
                    tx.last_insert_rowid()
                };

                stmt_cap_contact.execute(params![sequence, contact_id, revision_id])?;
                if let Some(v) = value {
                    stmt_raw_obs.execute(params![run_id, key, serde_json::to_string(v)?])?;
                    if !is_deleted {
                        let display = name(v);
                        stmt_curr_contact.execute(params![
                            contact_id,
                            display,
                            serde_json::to_string(v)?.to_lowercase(),
                            revision_id
                        ])?;
                    }
                }
            }
        }

        {
            let mut stmt_grp_rev_get = tx.prepare_cached(
                "SELECT id,version,payload FROM group_revisions WHERE resource_name=?1 ORDER BY version DESC LIMIT 1",
            )?;
            let mut stmt_grp_rev_insert = tx.prepare_cached(
                "INSERT INTO group_revisions(resource_name,version,payload,first_capture) VALUES(?1,?2,?3,?4)",
            )?;
            let mut stmt_cap_grp = tx.prepare_cached(
                "INSERT INTO capture_groups(capture_sequence,resource_name,revision_id) VALUES(?1,?2,?3)",
            )?;

            for (key, value) in groups {
                let serialized = serde_json::to_string(&value)?;
                let latest: Option<(i64, i64, String)> = stmt_grp_rev_get
                    .query_row([&key], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                    .optional()?;
                let revision = match latest {
                    Some((id, _, ref payload)) if payload == &serialized => id,
                    old => {
                        stmt_grp_rev_insert.execute(params![
                            key,
                            old.map(|x| x.1 + 1).unwrap_or(1),
                            serialized,
                            sequence
                        ])?;
                        tx.last_insert_rowid()
                    }
                };
                stmt_cap_grp.execute(params![sequence, key, revision])?;
            }
        }

        {
            let mut stmt_media_obj = tx.prepare_cached(
                "INSERT INTO media_objects(sha256,mime,byte_length,retrieved_at) VALUES(?1,?2,?3,?4) ON CONFLICT(sha256) DO NOTHING",
            )?;
            let mut stmt_obs_media = tx.prepare_cached(
                "INSERT INTO observation_media(run_id,resource_name,source_url,sha256,status) VALUES(?1,?2,?3,?4,?5)",
            )?;
            let mut stmt_media_jobs = tx.prepare_cached(
                "INSERT INTO media_jobs(run_id,resource_name,source_url,status,attempts) VALUES(?1,?2,?3,'pending',0)",
            )?;

            for media in scan.media {
                if let Some(ref digest) = media.sha256 {
                    stmt_media_obj.execute(params![
                        digest,
                        media.mime,
                        media.byte_length,
                        media.retrieved_at
                    ])?;
                }
                stmt_obs_media.execute(params![
                    run_id,
                    media.resource_name,
                    media.source_url,
                    media.sha256,
                    media.status
                ])?;
                if media.status == "failed" {
                    stmt_media_jobs.execute(params![
                        run_id,
                        media.resource_name,
                        media.source_url
                    ])?;
                }
            }
        }
        tx.execute("INSERT INTO sync_state(id,token,full_sync_at,coverage,capture_sequence) VALUES(1,?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET token=excluded.token,full_sync_at=excluded.full_sync_at,coverage=excluded.coverage,capture_sequence=excluded.capture_sequence", params![scan.next_sync_token,scan.full_sync_at.unwrap_or_else(||committed.clone()),COVERAGE,sequence])?;
        tx.execute(
            "UPDATE capture_runs SET result='success',ended_at=?2 WHERE id=?1",
            params![run_id, committed],
        )?;
        tx.commit()?;
        Ok(CaptureOutcome {
            capture: Capture {
                sequence,
                started_at: started.to_owned(),
                committed_at: committed,
                contact_count: contacts.values().filter(|v| !deleted(v)).count() as i64,
                group_count,
                media_complete,
            },
            is_new: true,
            change_count: changes_count,
        })
    })();
    if let Err(ref err) = outcome {
        mark_failed(store, account, run_id, err);
    }
    outcome
}

#[allow(dead_code)]
fn insert_revision(
    tx: &rusqlite::Transaction<'_>,
    key: &str,
    version: i64,
    kind: &str,
    semantic: &str,
    sequence: i64,
) -> Result<i64> {
    tx.execute("INSERT INTO contact_identities(resource_name) VALUES(?1) ON CONFLICT(resource_name) DO NOTHING", [key])?;
    let contact_id: i64 = tx.query_row(
        "SELECT id FROM contact_identities WHERE resource_name=?1",
        [key],
        |r| r.get(0),
    )?;
    tx.execute("INSERT INTO contact_revisions(contact_id,version,kind,semantic_json,first_capture) VALUES(?1,?2,?3,?4,?5)", params![contact_id,version,kind,semantic,sequence])?;
    Ok(tx.last_insert_rowid())
}
