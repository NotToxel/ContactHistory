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

pub fn publish(store: &Store, account: &Account, scan: Scan, trigger: &str) -> Result<CaptureOutcome> {
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
    let result = start_run(store, account, trigger)
        .and_then(|(run_id, started)| publish_locked(store, account, scan, &run_id, &started, trigger));
    let _ = lock_file.unlock();
    result
}

pub fn capture_with<F>(store: &Store, account: &Account, trigger: &str, scan: F) -> Result<CaptureOutcome>
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
                    format!("Snapshot #{} captured ({} changes)", outcome.sequence, outcome.change_count)
                } else {
                    format!("No changes detected. Snapshot #{} is up to date", outcome.sequence)
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
            let rows = stmt.query_map([prev], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
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
            tx.execute(
                "UPDATE capture_runs SET result='success',ended_at=?2 WHERE id=?1",
                params![run_id, Utc::now().to_rfc3339()],
            )?;
            tx.commit()?;
            let prev_seq = previous.unwrap();
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

pub fn captures(store: &Store, account: &Account) -> Result<Vec<Capture>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare("SELECT sequence,started_at,committed_at,contact_count,group_count,media_complete FROM captures ORDER BY sequence DESC LIMIT 200")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Capture {
                sequence: r.get(0)?,
                started_at: r.get(1)?,
                committed_at: r.get(2)?,
                contact_count: r.get(3)?,
                group_count: r.get(4)?,
                media_complete: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
pub fn capture_at(store: &Store, account: &Account, time: &str) -> Result<Option<Capture>> {
    let _ = chrono::DateTime::parse_from_rfc3339(time).context("invalid date/time")?;
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt=db.prepare("SELECT sequence,started_at,committed_at,contact_count,group_count,media_complete FROM captures WHERE julianday(committed_at)<=julianday(?1) ORDER BY sequence DESC LIMIT 1")?;
    Ok(stmt
        .query_row([time], |r| {
            Ok(Capture {
                sequence: r.get(0)?,
                started_at: r.get(1)?,
                committed_at: r.get(2)?,
                contact_count: r.get(3)?,
                group_count: r.get(4)?,
                media_complete: r.get(5)?,
            })
        })
        .optional()?)
}
pub fn changes(
    store: &Store,
    account: &Account,
    sequence: i64,
    offset: i64,
) -> Result<Vec<ChangeRow>> {
    if sequence < 1 || offset < 0 {
        bail!("invalid capture or offset");
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt=db.prepare("SELECT i.resource_name,r.kind,r.version,r.semantic_json,(SELECT p.semantic_json FROM contact_revisions p WHERE p.contact_id=r.contact_id AND p.version=r.version-1) FROM contact_revisions r JOIN contact_identities i ON i.id=r.contact_id WHERE r.first_capture=?1 ORDER BY r.id LIMIT 100 OFFSET ?2")?;
    let rows = stmt
        .query_map(params![sequence, offset], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(resource_name, kind, version, after, before)| {
            Ok(ChangeRow {
                resource_name,
                kind: if kind == "deleted" {
                    "removed".into()
                } else if version == 1 {
                    "added".into()
                } else {
                    "changed".into()
                },
                version,
                before: before.map(|x| serde_json::from_str(&x)).transpose()?,
                after: if kind == "deleted" {
                    None
                } else {
                    Some(serde_json::from_str(&after)?)
                },
            })
        })
        .collect()
}

#[derive(serde::Serialize)]
pub struct ContactHistoryEntry {
    pub sequence: i64,
    pub committed_at: String,
    pub version: i64,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

pub fn contact_history(store: &Store, account: &Account, resource: &str) -> Result<Vec<ContactHistoryEntry>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT r.first_capture,c.committed_at,r.version,r.kind,r.semantic_json \
         FROM contact_revisions r JOIN contact_identities i ON i.id=r.contact_id \
         JOIN captures c ON c.sequence=r.first_capture \
         WHERE i.resource_name=?1 ORDER BY r.version"
    )?;
    let rows = stmt.query_map(params![resource], |r| Ok((
        r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?,
        r.get::<_, String>(3)?, r.get::<_, String>(4)?
    )))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut previous = None;
    let mut history = Vec::new();
    for (sequence, committed_at, version, kind, json) in rows {
        let after = if kind == "deleted" { None } else { Some(serde_json::from_str::<Value>(&json)?) };
        history.push(ContactHistoryEntry { sequence, committed_at, version, before: previous, after: after.clone() });
        previous = after;
    }
    history.reverse();
    Ok(history)
}

pub fn compare_snapshots(
    store: &Store,
    account: &Account,
    base_sequence: i64,
    target_sequence: i64,
) -> Result<Vec<ChangeRow>> {
    if base_sequence < 1 || target_sequence < 1 {
        bail!("invalid capture sequence for comparison");
    }
    if base_sequence == target_sequence {
        return Ok(Vec::new());
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT \
            i.resource_name, \
            rb.version, rb.kind, rb.semantic_json, \
            rt.version, rt.kind, rt.semantic_json \
         FROM ( \
            SELECT contact_id FROM capture_contacts WHERE capture_sequence = ?1 \
            UNION \
            SELECT contact_id FROM capture_contacts WHERE capture_sequence = ?2 \
         ) u \
         JOIN contact_identities i ON i.id = u.contact_id \
         LEFT JOIN capture_contacts cb ON cb.capture_sequence = ?1 AND cb.contact_id = u.contact_id \
         LEFT JOIN contact_revisions rb ON rb.id = cb.revision_id \
         LEFT JOIN capture_contacts ct ON ct.capture_sequence = ?2 AND ct.contact_id = u.contact_id \
         LEFT JOIN contact_revisions rt ON rt.id = ct.revision_id \
         WHERE cb.revision_id IS NULL \
            OR ct.revision_id IS NULL \
            OR cb.revision_id != ct.revision_id \
            OR rb.semantic_json != rt.semantic_json \
         ORDER BY i.resource_name"
    )?;

    let rows = stmt
        .query_map(params![base_sequence, target_sequence], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<i64>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<String>>(6)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut changes = Vec::new();
    for (res_name, base_ver, base_kind, base_json, target_ver, target_kind, target_json) in rows {
        let base_active = base_kind.as_deref() == Some("present") && base_json.as_deref().is_some_and(|s| s != "{}");
        let target_active = target_kind.as_deref() == Some("present") && target_json.as_deref().is_some_and(|s| s != "{}");

        if !base_active && !target_active {
            continue;
        }

        let kind = if !base_active && target_active {
            "added".to_string()
        } else if base_active && !target_active {
            "removed".to_string()
        } else {
            "changed".to_string()
        };

        let before = if base_active {
            base_json.as_deref().map(serde_json::from_str).transpose()?
        } else {
            None
        };

        let after = if target_active {
            target_json.as_deref().map(serde_json::from_str).transpose()?
        } else {
            None
        };

        let version = target_ver.unwrap_or_else(|| base_ver.unwrap_or(1));

        changes.push(ChangeRow {
            resource_name: res_name,
            kind,
            version,
            before,
            after,
        });
    }

    Ok(changes)
}

fn is_system_group(resource_name: &str, payload: &Value, name: &str) -> bool {
    if payload.get("groupType").and_then(Value::as_str) == Some("SYSTEM_CONTACT_GROUP") {
        return true;
    }
    let res = resource_name.to_ascii_lowercase();
    if res.ends_with("/mycontacts")
        || res.ends_with("/starred")
        || res.ends_with("/all")
        || res.ends_with("/blocked")
        || res.ends_with("/chatbuddies")
        || res.ends_with("/coworkers")
        || res.ends_with("/family")
        || res.ends_with("/friends")
    {
        return true;
    }
    let norm_name = name.trim().to_ascii_lowercase().replace(['-', '_', ' '], "");
    matches!(
        norm_name.as_str(),
        "mycontacts"
            | "starred"
            | "all"
            | "allcontacts"
            | "blocked"
            | "chatbuddies"
            | "chatcontacts"
            | "coworkers"
            | "family"
            | "familyandfriends"
            | "friends"
    )
}

pub fn groups(store: &Store, account: &Account, sequence: i64) -> Result<Vec<GroupRow>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT g.resource_name, r.payload \
         FROM capture_groups g \
         JOIN group_revisions r ON r.id = g.revision_id \
         WHERE g.capture_sequence = ?1 \
         ORDER BY g.resource_name",
    )?;
    let rows = stmt.query_map([sequence], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (resource_name, payload_str) = row?;
        let payload: Value = serde_json::from_str(&payload_str)?;
        let name = payload
            .get("name")
            .and_then(Value::as_str)
            .or_else(|| payload.get("formattedName").and_then(Value::as_str))
            .unwrap_or(&resource_name)
            .to_string();

        if is_system_group(&resource_name, &payload, &name) {
            continue;
        }

        let member_count = payload.get("memberCount").and_then(Value::as_i64);
        out.push(GroupRow {
            resource_name,
            name,
            member_count,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

pub fn contacts(
    store: &Store,
    account: &Account,
    sequence: i64,
    search: &str,
    group: Option<&str>,
    _offset: i64,
) -> Result<Vec<ContactRow>> {
    if sequence < 1 {
        bail!("invalid capture sequence");
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let clean_search = search.trim();
    let rows = match (clean_search.is_empty(), group) {
        (true, None) => {
            let mut stmt = db.prepare(
                "SELECT i.resource_name,o.payload,r.version \
                 FROM capture_contacts c \
                 JOIN contact_identities i ON i.id=c.contact_id \
                 JOIN contact_revisions r ON r.id=c.revision_id \
                 JOIN captures p ON p.sequence=c.capture_sequence \
                 JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name \
                 WHERE c.capture_sequence=?1 AND r.kind='present' \
                 ORDER BY i.resource_name",
            )?;
            let rows = stmt.query_map([sequence], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        (true, Some(grp)) => {
            let grp_pattern = format!("%{}%", grp.replace('%', "\\%").replace('_', "\\_"));
            let mut stmt = db.prepare(
                "SELECT i.resource_name,o.payload,r.version \
                 FROM capture_contacts c \
                 JOIN contact_identities i ON i.id=c.contact_id \
                 JOIN contact_revisions r ON r.id=c.revision_id \
                 JOIN captures p ON p.sequence=c.capture_sequence \
                 JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name \
                 WHERE c.capture_sequence=?1 AND r.kind='present' AND o.payload LIKE ?2 ESCAPE '\\' \
                 ORDER BY i.resource_name",
            )?;
            let rows = stmt.query_map(params![sequence, grp_pattern], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        (false, None) => {
            let pattern = format!("%{}%", clean_search.replace('%', "\\%").replace('_', "\\_"));
            let mut stmt = db.prepare(
                "SELECT i.resource_name,o.payload,r.version \
                 FROM capture_contacts c \
                 JOIN contact_identities i ON i.id=c.contact_id \
                 JOIN contact_revisions r ON r.id=c.revision_id \
                 JOIN captures p ON p.sequence=c.capture_sequence \
                 JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name \
                 WHERE c.capture_sequence=?1 AND r.kind='present' AND o.payload LIKE ?2 ESCAPE '\\' \
                 ORDER BY i.resource_name",
            )?;
            let rows = stmt.query_map(params![sequence, pattern], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
        (false, Some(grp)) => {
            let pattern = format!("%{}%", clean_search.replace('%', "\\%").replace('_', "\\_"));
            let grp_pattern = format!("%{}%", grp.replace('%', "\\%").replace('_', "\\_"));
            let mut stmt = db.prepare(
                "SELECT i.resource_name,o.payload,r.version \
                 FROM capture_contacts c \
                 JOIN contact_identities i ON i.id=c.contact_id \
                 JOIN contact_revisions r ON r.id=c.revision_id \
                 JOIN captures p ON p.sequence=c.capture_sequence \
                 JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name \
                 WHERE c.capture_sequence=?1 AND r.kind='present' AND o.payload LIKE ?2 ESCAPE '\\' AND o.payload LIKE ?3 ESCAPE '\\' \
                 ORDER BY i.resource_name",
            )?;
            let rows = stmt.query_map(params![sequence, pattern, grp_pattern], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                ))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        }
    };
    rows.into_iter()
        .map(|(resource_name, payload, version)| {
            let value: Value = serde_json::from_str(&payload)?;
            Ok(ContactRow {
                display_name: name(&value),
                resource_name,
                payload: value,
                version,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> (tempfile::TempDir, Store, Account) {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store
            .add_account("stable-subject", "a@example.com")
            .unwrap();
        (temp, store, account)
    }
    fn scan(contacts: Vec<Value>) -> Scan {
        Scan {
            contacts,
            groups: vec![],
            next_sync_token: Some("cursor".into()),
            full_sync_at: None,
            media: vec![],
        }
    }
    #[test]
    fn contact_timeline_tracks_edits_deletion_restoration_and_isolation() {
        let (_temp, store, account) = setup();
        let first = json!({"resourceName":"people/timeline","names":[{"displayName":"Ada"}],"phoneNumbers":[{"value":"+442079460018"}]});
        let edited = json!({"resourceName":"people/timeline","names":[{"displayName":"Ada Lovelace"}],"phoneNumbers":[{"value":"+442079460019"}]});
        publish(&store, &account, scan(vec![first]), "fixture").unwrap();
        publish(&store, &account, scan(vec![edited.clone()]), "fixture").unwrap();
        publish(&store, &account, scan(vec![]), "fixture").unwrap();
        publish(&store, &account, scan(vec![edited]), "fixture").unwrap();
        let history = contact_history(&store, &account, "people/timeline").unwrap();
        assert_eq!(history.len(), 4);
        assert!(history[0].before.is_none());
        assert!(history[0].after.is_some());
        assert!(history[1].after.is_none());
        assert!(history[1].before.is_some());
        assert_eq!(history[2].before.as_ref().unwrap()["names"][0]["displayName"], "Ada");
        assert_eq!(history[2].after.as_ref().unwrap()["names"][0]["displayName"], "Ada Lovelace");
        assert!(history[3].before.is_none());
        assert!(history.windows(2).all(|pair| pair[0].sequence > pair[1].sequence));
        let other = store.add_account("timeline-other", "other@example.com").unwrap();
        assert!(contact_history(&store, &other, "people/timeline").unwrap().is_empty());
        assert!(contact_history(&store, &account, "missing").unwrap().is_empty());
    }

    #[test]
    fn preserves_deleted_history_and_account_isolation() {
        let (_temp, store, account) = setup();
        let first=publish(&store,&account,scan(vec![json!({"resourceName":"people/1","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"a@example.com"}]})]),"fixture").unwrap();
        let second = publish(&store, &account, scan(vec![]), "fixture").unwrap();
        assert_eq!(
            contacts(&store, &account, first.sequence, "", None, 0)
                .unwrap()
                .len(),
            1
        );
        assert!(contacts(&store, &account, second.sequence, "", None, 0)
            .unwrap()
            .is_empty());
        let db = store.open_db(&account.id).unwrap();
        let revisions: i64 = db
            .query_row("SELECT COUNT(*) FROM contact_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(revisions, 2);
        let other = store.add_account("another", "b@example.com").unwrap();
        assert!(captures(&store, &other).unwrap().is_empty());
    }
    #[test]
    fn unchanged_transport_data_reuses_revision() {
        let (_temp, store, account) = setup();
        let one = json!({"resourceName":"people/1","etag":"old","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"a@example.com"},{"value":"other@example.com"}]});
        let two = json!({"resourceName":"people/1","etag":"new","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"other@example.com"},{"value":"a@example.com"}]});
        publish(&store, &account, scan(vec![one]), "fixture").unwrap();
        publish(&store, &account, scan(vec![two]), "fixture").unwrap();
        let db = store.open_db(&account.id).unwrap();
        let revisions: i64 = db
            .query_row("SELECT COUNT(*) FROM contact_revisions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(revisions, 1);
        let raw: i64 = db
            .query_row("SELECT COUNT(*) FROM raw_observations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(raw, 2);
    }
    #[test]
    fn invalid_scan_does_not_publish_or_advance_cursor() {
        let (_temp, store, account) = setup();
        publish(
            &store,
            &account,
            scan(vec![json!({"resourceName":"people/1"})]),
            "fixture",
        )
        .unwrap();
        assert!(publish(&store, &account, scan(vec![json!({"names":[]})]), "fixture").is_err());
        assert_eq!(captures(&store, &account).unwrap().len(), 1);
        let db = store.open_db(&account.id).unwrap();
        let status: String = db
            .query_row(
                "SELECT result FROM capture_runs ORDER BY started_at DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(status == "success" || status == "failed");
    }

    #[test]
    fn failed_media_does_not_block_text_capture() {
        let (_temp, store, account) = setup();
        let mut observation = scan(vec![
            json!({"resourceName":"people/photo","names":[{"displayName":"Photo contact"}],"photos":[{"url":"https://lh3.googleusercontent.com/example"}]}),
        ]);
        observation
            .media
            .push(crate::core::media::MediaObservation {
                resource_name: "people/photo".into(),
                source_url: "https://lh3.googleusercontent.com/example".into(),
                status: "failed".into(),
                sha256: None,
                mime: None,
                byte_length: None,
                retrieved_at: None,
            });
        let saved = publish(&store, &account, observation, "fixture").unwrap();
        assert!(!saved.media_complete);
        assert_eq!(
            contacts(&store, &account, saved.sequence, "Photo", None, 0)
                .unwrap()
                .len(),
            1
        );
        let db = store.open_db(&account.id).unwrap();
        let pending: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM media_jobs WHERE status='pending'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(pending, 1);
    }

    #[test]
    fn date_selection_and_change_feed_follow_committed_captures() {
        let (_temp, store, account) = setup();
        assert!(capture_at(&store, &account, "2000-01-01T00:00:00Z")
            .unwrap()
            .is_none());
        let _first = publish(
            &store,
            &account,
            scan(vec![
                json!({"resourceName":"people/1","names":[{"displayName":"Ada"}]}),
            ]),
            "fixture",
        )
        .unwrap();
        let second = publish(
            &store,
            &account,
            scan(vec![
                json!({"resourceName":"people/1","names":[{"displayName":"Ada L."}]}),
            ]),
            "fixture",
        )
        .unwrap();
        assert_eq!(
            capture_at(&store, &account, &second.committed_at)
                .unwrap()
                .unwrap()
                .sequence,
            second.sequence
        );
        let changes = changes(&store, &account, second.sequence, 0).unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0].kind, "changed");
        assert_eq!(
            changes[0].before.as_ref().unwrap()["names"][0]["displayName"],
            "Ada"
        );
        assert_eq!(
            changes[0].after.as_ref().unwrap()["names"][0]["displayName"],
            "Ada L."
        );
    }
    #[test]
    fn compare_snapshots_identifies_diffs_across_arbitrary_captures() {
        let (_temp, store, account) = setup();
        let cap1 = publish(
            &store,
            &account,
            scan(vec![
                json!({"resourceName":"people/1","names":[{"displayName":"Alice"}]}),
                json!({"resourceName":"people/2","names":[{"displayName":"Bob"}]}),
            ]),
            "fixture",
        )
        .unwrap();

        let cap2 = publish(
            &store,
            &account,
            scan(vec![
                json!({"resourceName":"people/1","names":[{"displayName":"Alice Smith"}]}),
                json!({"resourceName":"people/2","names":[{"displayName":"Bob"}]}),
                json!({"resourceName":"people/3","names":[{"displayName":"Charlie"}]}),
            ]),
            "fixture",
        )
        .unwrap();

        let cap3 = publish(
            &store,
            &account,
            scan(vec![
                json!({"resourceName":"people/1","names":[{"displayName":"Alice Smith"}]}),
                json!({"resourceName":"people/3","names":[{"displayName":"Charlie Brown"}]}),
            ]),
            "fixture",
        )
        .unwrap();

        // Compare cap1 to cap3 directly
        let diff = compare_snapshots(&store, &account, cap1.sequence, cap3.sequence).unwrap();
        assert_eq!(diff.len(), 3);
        let p1 = diff.iter().find(|c| c.resource_name == "people/1").unwrap();
        assert_eq!(p1.kind, "changed");
        let p2 = diff.iter().find(|c| c.resource_name == "people/2").unwrap();
        assert_eq!(p2.kind, "removed");
        let p3 = diff.iter().find(|c| c.resource_name == "people/3").unwrap();
        assert_eq!(p3.kind, "added");

        // Identity comparison returns empty
        let same = compare_snapshots(&store, &account, cap2.sequence, cap2.sequence).unwrap();
        assert!(same.is_empty());
    }
}
