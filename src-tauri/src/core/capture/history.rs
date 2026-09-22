use super::{name, ChangeRow, ContactRow};
use crate::core::storage::{Account, Store};
use anyhow::{bail, Result};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::Value;

#[derive(serde::Serialize)]
pub struct ContactHistoryEntry {
    pub sequence: i64,
    pub committed_at: String,
    pub version: i64,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

pub fn contact_history(
    store: &Store,
    account: &Account,
    resource: &str,
) -> Result<Vec<ContactHistoryEntry>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT r.first_capture,c.committed_at,r.version,r.kind,r.semantic_json \
         FROM contact_revisions r JOIN contact_identities i ON i.id=r.contact_id \
         JOIN captures c ON c.sequence=r.first_capture \
         WHERE i.resource_name=?1 ORDER BY r.version",
    )?;
    let rows = stmt
        .query_map(params![resource], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut previous = None;
    let mut history = Vec::new();
    for (sequence, committed_at, version, kind, json) in rows {
        let after = if kind == "deleted" {
            None
        } else {
            Some(serde_json::from_str::<Value>(&json)?)
        };
        history.push(ContactHistoryEntry {
            sequence,
            committed_at,
            version,
            before: previous,
            after: after.clone(),
        });
        previous = after;
    }
    history.reverse();
    Ok(history)
}

pub fn contact_at_snapshot(
    store: &Store,
    account: &Account,
    sequence: i64,
    resource: &str,
) -> Result<Option<ContactRow>> {
    if sequence < 1 {
        bail!("invalid capture sequence");
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let row: Option<(String, i64)> = db
        .query_row(
            "SELECT o.payload,r.version FROM capture_contacts c \
         JOIN contact_identities i ON i.id=c.contact_id \
         JOIN contact_revisions r ON r.id=c.revision_id \
         JOIN captures p ON p.sequence=c.capture_sequence \
         JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name \
         WHERE c.capture_sequence=?1 AND i.resource_name=?2 AND r.kind='present'",
            params![sequence, resource],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    row.map(|(payload, version)| {
        let payload: Value = serde_json::from_str(&payload)?;
        Ok(ContactRow {
            resource_name: resource.into(),
            display_name: name(&payload),
            payload,
            version,
        })
    })
    .transpose()
}

#[derive(Clone, Serialize)]
pub struct ContactSnapshotEntry {
    pub sequence: i64,
    pub committed_at: String,
    pub version: i64,
}

pub fn contact_snapshots(
    store: &Store,
    account: &Account,
    resource: &str,
) -> Result<Vec<ContactSnapshotEntry>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT c.capture_sequence,p.committed_at,r.version FROM capture_contacts c \
         JOIN contact_identities i ON i.id=c.contact_id \
         JOIN contact_revisions r ON r.id=c.revision_id \
         JOIN captures p ON p.sequence=c.capture_sequence \
         WHERE i.resource_name=?1 AND r.kind='present' ORDER BY c.capture_sequence DESC",
    )?;
    let entries = stmt
        .query_map(params![resource], |row| {
            Ok(ContactSnapshotEntry {
                sequence: row.get(0)?,
                committed_at: row.get(1)?,
                version: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(entries)
}

#[derive(Clone, serde::Serialize)]
pub struct ChangelogEntry {
    pub capture_sequence: i64,
    pub committed_at: String,
    pub resource_name: String,
    pub kind: String,
    pub version: i64,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

pub fn all_changes(
    store: &Store,
    account: &Account,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<ChangelogEntry>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let lim = limit.unwrap_or(2000);
    let off = offset.unwrap_or(0);
    let mut stmt = db.prepare(
        "SELECT \
            r.first_capture, \
            c.committed_at, \
            i.resource_name, \
            r.kind, \
            r.version, \
            r.semantic_json, \
            (SELECT p.semantic_json FROM contact_revisions p WHERE p.contact_id=r.contact_id AND p.version=r.version-1) \
         FROM contact_revisions r \
         JOIN contact_identities i ON i.id=r.contact_id \
         JOIN captures c ON c.sequence=r.first_capture \
         ORDER BY r.first_capture DESC, r.id DESC \
         LIMIT ?1 OFFSET ?2"
    )?;
    let rows = stmt
        .query_map(params![lim, off], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, Option<String>>(6)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(
            |(sequence, committed_at, resource_name, kind, version, after, before)| {
                Ok(ChangelogEntry {
                    capture_sequence: sequence,
                    committed_at,
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
            },
        )
        .collect()
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
        let base_active = base_kind.as_deref() == Some("present")
            && base_json.as_deref().is_some_and(|s| s != "{}");
        let target_active = target_kind.as_deref() == Some("present")
            && target_json.as_deref().is_some_and(|s| s != "{}");

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
            target_json
                .as_deref()
                .map(serde_json::from_str)
                .transpose()?
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
