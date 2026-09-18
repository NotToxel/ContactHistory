use crate::core::{
    capture, google,
    storage::{Account, Store},
};
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::process::Command;

#[derive(Serialize)]
pub struct DueStatus {
    pub due: bool,
    pub next_due_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScheduleConfig {
    pub enabled: bool,
    pub interval_days: u32,
    pub time_of_day: String,
    pub run_at_logon: bool,
    pub run_daily: bool,
    #[serde(default)]
    pub is_installed: bool,
}

impl Default for ScheduleConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            interval_days: 7,
            time_of_day: "09:00".to_string(),
            run_at_logon: true,
            run_daily: true,
            is_installed: false,
        }
    }
}

pub fn load_config(store: &Store) -> ScheduleConfig {
    let path = store.root.join("schedule-config.json");
    let mut config = if path.exists() {
        std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<ScheduleConfig>(&bytes).ok())
            .unwrap_or_default()
    } else {
        ScheduleConfig::default()
    };
    config.is_installed = installed();
    config
}

pub fn save_config(store: &Store, config: &ScheduleConfig) -> Result<()> {
    let path = store.root.join("schedule-config.json");
    let json = serde_json::to_vec_pretty(config)?;
    std::fs::write(path, json)?;
    Ok(())
}

pub fn status(store: &Store, account: &Account) -> Result<DueStatus> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let last: Option<String> =
        db.query_row("SELECT MAX(committed_at) FROM captures", [], |r| r.get(0))?;
    let config = load_config(store);
    let interval = if config.interval_days > 0 {
        config.interval_days as i64
    } else {
        7
    };
    let next = last
        .map(|value| {
            DateTime::parse_from_rfc3339(&value)
                .map(|time| time.with_timezone(&Utc) + Duration::days(interval))
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
    let result = capture::capture_with(store, account, "due", |_| {
        if !status(store, account)?.due {
            return Err(anyhow::anyhow!("capture is no longer due"));
        }
        google::observe(store, account)
    });
    match result {
        Err(error) if error.to_string() == "capture is no longer due" => Ok(None),
        other => other.map(|outcome| Some(outcome.capture)),
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
fn create_task(name: &str, schedule: &str, start: Option<&str>, days: Option<&str>) -> Result<()> {
    let run = task_run()?;
    let mut command = Command::new("schtasks.exe");
    command.args([
        "/create", "/tn", name, "/tr", &run, "/sc", schedule, "/it", "/f",
    ]);
    if let Some(time) = start {
        command.args(["/st", time]);
    }
    if let Some(d) = days {
        command.args(["/d", d]);
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

pub fn apply_schedule(store: &Store, config: &ScheduleConfig) -> Result<()> {
    save_config(store, config)?;
    #[cfg(windows)]
    {
        if !config.enabled {
            let _ = uninstall();
            return Ok(());
        }
        if cfg!(debug_assertions) {
            // In debug mode, don't fail, as task scheduler needs installed release path.
            return Ok(());
        }
        let _ = uninstall();

        if config.run_daily {
            let time = if config.time_of_day.trim().is_empty() {
                "09:00"
            } else {
                config.time_of_day.trim()
            };
            create_task(TASK_DAILY, "daily", Some(time), None)?;
        }
        if config.run_at_logon {
            create_task(TASK_LOGON, "onlogon", None, None)?;
        }
    }
    Ok(())
}

#[cfg(windows)]
#[allow(dead_code)]
pub fn install() -> Result<()> {
    if cfg!(debug_assertions) {
        anyhow::bail!("Install the release app before enabling background capture");
    }
    let config = ScheduleConfig {
        enabled: true,
        ..Default::default()
    };
    if config.run_daily {
        create_task(TASK_DAILY, "daily", Some(&config.time_of_day), None)?;
    }
    if config.run_at_logon {
        create_task(TASK_LOGON, "onlogon", None, None)?;
    }
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

#[cfg(not(windows))]
pub fn uninstall() -> Result<()> {
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
    task_exists(TASK_DAILY) || task_exists(TASK_LOGON)
}

#[cfg(not(windows))]
pub fn installed() -> bool {
    false
}
