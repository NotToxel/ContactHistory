use super::{name, Capture, ChangeRow, ContactRow};
use crate::core::storage::{Account, Store};
use anyhow::{bail, Context, Result};
use rusqlite::{params, OptionalExtension};
use serde_json::Value;

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
    let sql = if offset > 0 {
        "SELECT i.resource_name,r.kind,r.version,r.semantic_json,(SELECT p.semantic_json FROM contact_revisions p WHERE p.contact_id=r.contact_id AND p.version=r.version-1) FROM contact_revisions r JOIN contact_identities i ON i.id=r.contact_id WHERE r.first_capture=?1 ORDER BY r.id LIMIT -1 OFFSET ?2"
    } else {
        "SELECT i.resource_name,r.kind,r.version,r.semantic_json,(SELECT p.semantic_json FROM contact_revisions p WHERE p.contact_id=r.contact_id AND p.version=r.version-1) FROM contact_revisions r JOIN contact_identities i ON i.id=r.contact_id WHERE r.first_capture=?1 ORDER BY r.id"
    };
    let mut stmt = db.prepare(sql)?;
    let rows = if offset > 0 {
        stmt.query_map(params![sequence, offset], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map(params![sequence], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };
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
