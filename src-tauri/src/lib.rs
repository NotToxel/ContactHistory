mod core;
use core::{
    backup, capture, export, google, media, scheduler,
    storage::{Account, Store},
};
use serde::Serialize;

fn store() -> Result<Store, String> {
    Store::new(core::storage::default_root().map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn error<T>(result: anyhow::Result<T>) -> Result<T, String> {
    result.map_err(|e| e.to_string())
}

#[tauri::command]
fn list_accounts() -> Result<Vec<Account>, String> {
    error(store()?.accounts())
}
#[tauri::command]
async fn connect_google(client_id: String, client_secret: String) -> Result<Account, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Account, String> {
        let store = store()?;
        error(google::connect(
            &store,
            google::ClientConfig {
                client_id,
                client_secret,
            },
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn capture_now(
    app: tauri::AppHandle,
    account_id: String,
) -> Result<capture::Capture, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<capture::Capture, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        let app_handle = app.clone();
        let emit = move |p: &google::CaptureProgress| {
            use tauri::Emitter;
            let _ = app_handle.emit("capture-progress", p);
        };
        error(capture::capture_with_progress(
            &store,
            &account,
            "manual",
            || google::observe_with_progress(&store, &account, &emit),
            &emit,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn list_captures(account_id: String) -> Result<Vec<capture::Capture>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::captures(&store, &account))
}
#[tauri::command]
fn capture_at_time(account_id: String, time: String) -> Result<Option<capture::Capture>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::capture_at(&store, &account, &time))
}
#[tauri::command]
fn list_changes(
    account_id: String,
    sequence: i64,
    offset: i64,
) -> Result<Vec<capture::ChangeRow>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::changes(&store, &account, sequence, offset))
}
#[tauri::command]
fn list_contacts(
    account_id: String,
    sequence: i64,
    search: String,
    offset: i64,
) -> Result<Vec<capture::ContactRow>, String> {
    if search.len() > 200 {
        return Err("search is too long".into());
    }
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::contacts(
        &store, &account, sequence, &search, offset,
    ))
}

#[derive(Serialize)]
struct Health {
    connected: bool,
    last_capture: Option<String>,
}
#[tauri::command]
fn account_health(account_id: String) -> Result<Health, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    let captures = error(capture::captures(&store, &account))?;
    Ok(Health {
        connected: store
            .account_dir(&account.id)
            .map_err(|e| e.to_string())?
            .join("google-client.json")
            .exists(),
        last_capture: captures.first().map(|c| c.committed_at.clone()),
    })
}
#[tauri::command]
fn disconnect_account(account_id: String) -> Result<(), String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(google::disconnect(&store, &account))
}
#[tauri::command]
fn contact_media(
    account_id: String,
    sequence: i64,
    resource_name: String,
) -> Result<Vec<media::MediaView>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(media::for_contact(
        &store,
        &account,
        sequence,
        &resource_name,
    ))
}
#[tauri::command]
fn due_status(account_id: String) -> Result<scheduler::DueStatus, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(scheduler::status(&store, &account))
}
#[tauri::command]
async fn capture_if_due(account_id: String) -> Result<Option<capture::Capture>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Option<capture::Capture>, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(scheduler::capture_due(&store, &account))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn retry_media(account_id: String) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<usize, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(media::retry_jobs(&store, &account))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(windows)]
#[tauri::command]
fn schedule_state() -> bool {
    scheduler::installed()
}
#[cfg(windows)]
#[tauri::command]
fn enable_schedule() -> Result<(), String> {
    error(scheduler::install())
}
#[cfg(windows)]
#[tauri::command]
fn disable_schedule() -> Result<(), String> {
    error(scheduler::uninstall())
}
#[tauri::command]
async fn export_capture(
    account_id: String,
    sequence: i64,
    format: String,
    destination: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(export::write_export(
            &store,
            &account,
            sequence,
            &format,
            std::path::Path::new(&destination),
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn backup_account(account_id: String, destination: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(backup::create(
            &store,
            &account,
            std::path::Path::new(&destination),
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn restore_archive(source: String) -> Result<Account, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<Account, String> {
        let store = store()?;
        error(backup::restore(&store, std::path::Path::new(&source)))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_accounts,
            connect_google,
            capture_now,
            list_captures,
            capture_at_time,
            list_changes,
            list_contacts,
            account_health,
            disconnect_account,
            contact_media,
            due_status,
            capture_if_due,
            retry_media,
            schedule_state,
            enable_schedule,
            disable_schedule,
            export_capture,
            backup_account,
            restore_archive
        ])
        .run(tauri::generate_context!())
        .expect("error while running Contact History");
}

pub fn import_fixture(path: &std::path::Path, subject: &str, email: &str) -> anyhow::Result<()> {
    let store = Store::new(core::storage::default_root()?)?;
    let account = store.add_account(subject, email)?;
    let scan: capture::Scan = serde_json::from_slice(&std::fs::read(path)?)?;
    capture::publish(&store, &account, scan, "fixture")?;
    Ok(())
}

pub fn capture_due_headless() -> anyhow::Result<()> {
    let store = Store::new(core::storage::default_root()?)?;
    let mut failures = Vec::new();
    for account in store.accounts()? {
        let _ = media::retry_jobs(&store, &account);
        if let Err(error) = scheduler::capture_due(&store, &account) {
            failures.push(format!("{}: {error:#}", account.id));
        }
    }
    if failures.is_empty() {
        Ok(())
    } else {
        anyhow::bail!(failures.join("; "))
    }
}

pub fn backup_headless(id: &str, destination: &std::path::Path) -> anyhow::Result<()> {
    let store = Store::new(core::storage::default_root()?)?;
    let account = store.account(id)?;
    backup::create(&store, &account, destination)
}

pub fn restore_headless(source: &std::path::Path) -> anyhow::Result<()> {
    let store = Store::new(core::storage::default_root()?)?;
    backup::restore(&store, source)?;
    Ok(())
}

pub fn export_headless(
    id: &str,
    sequence: i64,
    format: &str,
    destination: &std::path::Path,
) -> anyhow::Result<()> {
    let store = Store::new(core::storage::default_root()?)?;
    let account = store.account(id)?;
    export::write_export(&store, &account, sequence, format, destination)
}
