use crate::core::storage::{Account, Store};
use anyhow::{bail, Context, Result};
use rusqlite::{backup::Backup, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, path::Path};
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct FileRecord {
    name: String,
    sha256: String,
    byte_length: u64,
}
#[derive(Serialize, Deserialize)]
struct Manifest {
    format_version: u32,
    subject: String,
    email: String,
    schema_version: u32,
    files: Vec<FileRecord>,
    media_complete: bool,
}

fn hash(path: &Path) -> Result<(String, u64)> {
    let bytes = fs::read(path)?;
    Ok((format!("{:x}", Sha256::digest(&bytes)), bytes.len() as u64))
}

pub fn create(store: &Store, account: &Account, destination: &Path) -> Result<()> {
    if destination.exists() {
        bail!("backup destination already exists");
    }
    let temp = destination.with_extension(format!("{}.partial", Uuid::new_v4()));
    fs::create_dir_all(temp.join("media"))?;
    let result = (|| -> Result<()> {
        let source = store.open_db(&account.id)?;
        store.verify(account, &source)?;
        let mut target = Connection::open(temp.join("archive.db"))?;
        Backup::new(&source, &mut target)?.run_to_completion(
            100,
            std::time::Duration::from_millis(100),
            None,
        )?;
        drop(target);
        let mut files = Vec::new();
        let db_path = temp.join("archive.db");
        let (digest, length) = hash(&db_path)?;
        files.push(FileRecord {
            name: "archive.db".into(),
            sha256: digest,
            byte_length: length,
        });
        let snapshot = Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        let mut stmt = snapshot.prepare("SELECT sha256,mime FROM media_objects ORDER BY sha256")?;
        let media = stmt
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (digest, mime) in media {
            let ext = match mime.as_str() {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/webp" => "webp",
                "image/gif" => "gif",
                _ => bail!("unsupported media MIME"),
            };
            let filename = format!("{digest}.{ext}");
            let source_file = store
                .account_dir(&account.id)?
                .join("media")
                .join(&filename);
            let (actual, length) = hash(&source_file)?;
            if actual != digest {
                bail!("media hash mismatch: {filename}");
            }
            fs::copy(source_file, temp.join("media").join(&filename))?;
            files.push(FileRecord {
                name: format!("media/{filename}"),
                sha256: digest,
                byte_length: length,
            });
        }
        let incomplete: i64 = snapshot.query_row(
            "SELECT COUNT(*) FROM captures WHERE media_complete=0",
            [],
            |r| r.get(0),
        )?;
        drop(stmt);
        drop(snapshot);
        let manifest = Manifest {
            format_version: 1,
            subject: account.subject.clone(),
            email: account.email.clone(),
            schema_version: 1,
            files,
            media_complete: incomplete == 0,
        };
        fs::write(
            temp.join("manifest.json"),
            serde_json::to_vec_pretty(&manifest)?,
        )?;
        fs::rename(&temp, destination)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&temp);
    }
    result
}

pub fn validate(source: &Path) -> Result<ManifestView> {
    let manifest: Manifest = serde_json::from_slice(&fs::read(source.join("manifest.json"))?)?;
    if manifest.format_version != 1 || manifest.schema_version != 1 {
        bail!("unsupported backup version");
    }
    for file in &manifest.files {
        let path = Path::new(&file.name);
        if path.is_absolute()
            || path
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            bail!("unsafe backup path");
        }
        let (digest, length) = hash(&source.join(path))?;
        if digest != file.sha256 || length != file.byte_length {
            bail!("backup file hash mismatch");
        }
    }
    if !manifest.files.iter().any(|file| file.name == "archive.db") {
        bail!("backup database missing");
    }
    let db =
        Connection::open_with_flags(source.join("archive.db"), OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let subject: String = db.query_row(
        "SELECT provider_subject FROM account_metadata WHERE id=1",
        [],
        |r| r.get(0),
    )?;
    if version != 1 || subject != manifest.subject {
        bail!("backup database identity or schema mismatch");
    }
    let mut stmt = db.prepare("SELECT sha256,mime FROM media_objects")?;
    let media = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (digest, mime) in media {
        let ext = match mime.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => bail!("unsupported backup media MIME"),
        };
        let name = format!("media/{digest}.{ext}");
        if !manifest
            .files
            .iter()
            .any(|file| file.name == name && file.sha256 == digest)
        {
            bail!("backup media dependency missing");
        }
    }
    Ok(ManifestView {
        subject: manifest.subject,
        email: manifest.email,
    })
}

pub struct ManifestView {
    pub subject: String,
    pub email: String,
}

pub fn restore(store: &Store, source: &Path) -> Result<Account> {
    let validated = validate(source)?;
    if store
        .accounts()?
        .iter()
        .any(|account| account.subject == validated.subject)
    {
        bail!("this Google identity already has a local archive");
    }
    let id = Uuid::new_v4().to_string();
    let dir = store.account_dir(&id)?;
    fs::create_dir_all(dir.join("media"))?;
    let result = (|| -> Result<Account> {
        fs::copy(source.join("archive.db"), dir.join("archive.db"))?;
        let manifest: Manifest = serde_json::from_slice(&fs::read(source.join("manifest.json"))?)?;
        for file in manifest
            .files
            .iter()
            .filter(|file| file.name.starts_with("media/"))
        {
            let filename = Path::new(&file.name)
                .file_name()
                .context("invalid media filename")?;
            fs::copy(source.join(&file.name), dir.join("media").join(filename))?;
        }
        let account = Account {
            id,
            subject: validated.subject,
            email: validated.email,
        };
        store.register_restored(account.clone())?;
        Ok(account)
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::capture::{self, Scan};
    use serde_json::json;

    #[test]
    fn roundtrip_and_corruption_check() {
        let temp = tempfile::tempdir().unwrap();
        let source = Store::new(temp.path().join("source")).unwrap();
        let account = source
            .add_account("stable-subject", "test@example.com")
            .unwrap();
        capture::publish(
            &source,
            &account,
            Scan {
                contacts: vec![json!({"resourceName":"people/1","names":[{"displayName":"Ada"}]})],
                groups: vec![],
                next_sync_token: None,
                full_sync_at: None,
                media: vec![],
            },
            "fixture",
        )
        .unwrap();
        let archive = temp.path().join("backup");
        create(&source, &account, &archive).unwrap();
        let destination = Store::new(temp.path().join("restored")).unwrap();
        let imported = restore(&destination, &archive).unwrap();
        assert_eq!(capture::captures(&destination, &imported).unwrap().len(), 1);
        assert_eq!(
            capture::contacts(&destination, &imported, 1, "", None, 0).unwrap()[0].display_name,
            "Ada"
        );
        fs::write(archive.join("archive.db"), b"corrupt").unwrap();
        assert!(validate(&archive).is_err());
    }
}
