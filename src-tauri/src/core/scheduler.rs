use crate::core::{
    capture, google,
    storage::{Account, Store},
};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
#[cfg(windows)]
use std::process::Command;

#[derive(Serialize)]
pub struct DueStatus {
    pub due: bool,
    pub next_due_at: Option<String>,
}

pub fn status(store: &Store, account: &Account) -> Result<DueStatus> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let last: Option<String> =
        db.query_row("SELECT MAX(committed_at) FROM captures", [], |r| r.get(0))?;
    let next = last
        .map(|value| {
            DateTime::parse_from_rfc3339(&value)
                .map(|time| time.with_timezone(&Utc) + Duration::days(7))
        })
        .transpose()?;
    Ok(DueStatus {
        due: next.is_none_or(|time| Utc::now() >= time),
        next_due_at: next.map(|time| time.to_rfc3339()),
    })
}

pub fn capture_due(store: &Store, account: &Account) -> Result<Option<capture::Capture>> {
    if !status(store, account)?.due {
        return Ok(None);
    }
    if !store
        .account_dir(&account.id)?
        .join("google-client.json")
        .exists()
    {
        return Ok(None);
    }
    // A second process can publish after the first due check. The lock serializes the
    // scan and this recheck avoids an unnecessary second full observation.
    let result = capture::capture_with(store, account, "due", || {
        if !status(store, account)?.due {
            return Err(anyhow::anyhow!("capture is no longer due"));
        }
        google::observe(store, account)
    });
    match result {
        Err(error) if error.to_string() == "capture is no longer due" => Ok(None),
        other => other.map(Some),
    }
}

#[cfg(windows)]
const TASK_DAILY: &str = "ContactHistory Capture Daily";
#[cfg(windows)]
const TASK_LOGON: &str = "ContactHistory Capture Logon";

#[cfg(windows)]
fn task_run() -> Result<String> {
    let exe = std::env::current_exe()?;
    Ok(format!("\"{}\" capture --due", exe.display()))
}

#[cfg(windows)]
fn create_task(name: &str, schedule: &str, start: Option<&str>) -> Result<()> {
    let run = task_run()?;
    let mut command = Command::new("schtasks.exe");
    command.args([
        "/create", "/tn", name, "/tr", &run, "/sc", schedule, "/it", "/f",
    ]);
    if let Some(time) = start {
        command.args(["/st", time]);
    }
    let output = command.output()?;
    if !output.status.success() {
        anyhow::bail!(
            "Task Scheduler registration failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(())
}

#[cfg(windows)]
pub fn install() -> Result<()> {
    if cfg!(debug_assertions) {
        anyhow::bail!("Install the release app before enabling background capture");
    }
    create_task(TASK_DAILY, "daily", Some("09:00"))?;
    create_task(TASK_LOGON, "onlogon", None)?;
    Ok(())
}

#[cfg(windows)]
pub fn uninstall() -> Result<()> {
    for name in [TASK_DAILY, TASK_LOGON] {
        let output = Command::new("schtasks.exe")
            .args(["/delete", "/tn", name, "/f"])
            .output()?;
        if !output.status.success() && task_exists(name) {
            anyhow::bail!("Could not delete scheduled task {name}");
        }
    }
    Ok(())
}

#[cfg(windows)]
fn task_exists(name: &str) -> bool {
    Command::new("schtasks.exe")
        .args(["/query", "/tn", name])
        .output()
        .is_ok_and(|o| o.status.success())
}

#[cfg(windows)]
pub fn installed() -> bool {
    task_exists(TASK_DAILY) && task_exists(TASK_LOGON)
}
