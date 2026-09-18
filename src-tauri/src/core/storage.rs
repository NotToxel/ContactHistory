use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf, time::Duration};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub subject: String,
    pub email: String,
}

#[derive(Clone)]
pub struct Store {
    pub root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root)?;
        Ok(Self { root })
    }
    fn registry_path(&self) -> PathBuf {
        self.root.join("accounts.json")
    }
    pub fn accounts(&self) -> Result<Vec<Account>> {
        let path = self.registry_path();
        if !path.exists() {
            return Ok(vec![]);
        }
        Ok(serde_json::from_slice(&fs::read(path)?)?)
    }
    pub fn account(&self, id: &str) -> Result<Account> {
        Uuid::parse_str(id).context("invalid account id")?;
        self.accounts()?
            .into_iter()
            .find(|a| a.id == id)
            .context("unknown account")
    }
    pub fn add_account(&self, subject: &str, email: &str) -> Result<Account> {
        if subject.trim().is_empty() || email.trim().is_empty() {
            bail!("account identity is required");
        }
        let mut accounts = self.accounts()?;
        if let Some(existing) = accounts.iter().find(|a| a.subject == subject) {
            return Ok(existing.clone());
        }
        let account = Account {
            id: Uuid::new_v4().to_string(),
            subject: subject.into(),
            email: email.into(),
        };
        let dir = self.account_dir(&account.id)?;
        fs::create_dir_all(dir.join("media"))?;
        fs::create_dir_all(dir.join("staging"))?;
        let db = self.open_db(&account.id)?;
        db.execute("INSERT INTO account_metadata(id,provider_subject,email,schema_version) VALUES(1,?1,?2,1)", params![subject,email])?;
        accounts.push(account.clone());
        let temp = self.root.join(format!("accounts-{}.tmp", Uuid::new_v4()));
        fs::write(&temp, serde_json::to_vec_pretty(&accounts)?)?;
        fs::rename(temp, self.registry_path())?;
        Ok(account)
    }
    pub fn register_restored(&self, account: Account) -> Result<()> {
        let mut accounts = self.accounts()?;
        if accounts
            .iter()
            .any(|a| a.subject == account.subject || a.id == account.id)
        {
            bail!("restored account already exists");
        }
        let db = self.open_db(&account.id)?;
        self.verify(&account, &db)?;
        accounts.push(account);
        let temp = self.root.join(format!("accounts-{}.tmp", Uuid::new_v4()));
        fs::write(&temp, serde_json::to_vec_pretty(&accounts)?)?;
        fs::rename(temp, self.registry_path())?;
        Ok(())
    }
    pub fn account_dir(&self, id: &str) -> Result<PathBuf> {
        Uuid::parse_str(id).context("invalid account id")?;
        Ok(self.root.join("accounts").join(id))
    }
    pub fn open_db(&self, id: &str) -> Result<Connection> {
        let dir = self.account_dir(id)?;
        fs::create_dir_all(&dir)?;
        let db = Connection::open(dir.join("archive.db"))?;
        db.busy_timeout(Duration::from_secs(10))?;
        db.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;",
        )?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version == 0 {
            db.execute_batch("BEGIN IMMEDIATE;")?;
            if let Err(e) = db.execute_batch(concat!(
                include_str!("../../migrations/001_init.sql"),
                "PRAGMA user_version=1; COMMIT;"
            )) {
                let _ = db.execute_batch("ROLLBACK;");
                return Err(e.into());
            }
        } else if version != 1 {
            bail!("unsupported archive schema version {version}");
        }
        Ok(db)
    }
    pub fn verify(&self, account: &Account, db: &Connection) -> Result<()> {
        let subject: Option<String> = db
            .query_row(
                "SELECT provider_subject FROM account_metadata WHERE id=1",
                [],
                |r| r.get(0),
            )
            .optional()?;
        match subject {
            Some(subject) => {
                if subject != account.subject {
                    bail!("account identity does not match archive");
                }
            }
            None => {
                db.execute(
                    "INSERT INTO account_metadata(id,provider_subject,email,schema_version) VALUES(1,?1,?2,1)",
                    params![account.subject, account.email],
                )?;
            }
        }
        Ok(())
    }
}

pub fn default_root() -> Result<PathBuf> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .context("APPDATA is unavailable")?;
    Ok(base.join("ContactHistory"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_auto_heals_missing_account_metadata() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store.add_account("sub-123", "user@example.com").unwrap();
        let db = store.open_db(&account.id).unwrap();

        // Simulate an unpopulated account_metadata table (e.g. from empty/reset db)
        db.execute("DELETE FROM account_metadata WHERE id=1", [])
            .unwrap();

        // verify() should auto-heal by inserting the account metadata instead of failing with QueryReturnedNoRows
        assert!(store.verify(&account, &db).is_ok());

        // Confirm it was populated
        let subject: String = db
            .query_row(
                "SELECT provider_subject FROM account_metadata WHERE id=1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(subject, "sub-123");

        // Confirm verify fails when subject mismatches
        let mismatched = Account {
            id: account.id.clone(),
            subject: "different-sub".into(),
            email: "other@example.com".into(),
        };
        let err = store.verify(&mismatched, &db).unwrap_err();
        assert!(err.to_string().contains("does not match"));
    }
}
