mod core;
use core::{
    backup, capture, export, google, media, photo_export, scheduler,
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
) -> Result<capture::CaptureOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<capture::CaptureOutcome, String> {
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
            |cancel| google::observe_with_progress(&store, &account, cancel, &emit),
            &emit,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn import_csv(
    account_id: String,
    path: String,
) -> Result<capture::CaptureOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<capture::CaptureOutcome, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        let scan = error(core::import::parse_csv(std::path::Path::new(&path)))?;
        error(capture::publish(&store, &account, scan, "import"))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn cancel_capture(account_id: String) -> Result<bool, String> {
    Ok(capture::cancel(&account_id))
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
fn list_all_changes(
    account_id: String,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<capture::ChangelogEntry>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::all_changes(&store, &account, limit, offset))
}
#[tauri::command]
fn list_groups(account_id: String, sequence: i64) -> Result<Vec<capture::GroupRow>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::groups(&store, &account, sequence))
}
#[tauri::command]
async fn list_contacts(
    account_id: String,
    sequence: i64,
    search: String,
    group: Option<String>,
    offset: i64,
) -> Result<Vec<capture::ContactRow>, String> {
    if search.len() > 200 {
        return Err("search is too long".into());
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<Vec<capture::ContactRow>, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(capture::contacts(
            &store,
            &account,
            sequence,
            &search,
            group.as_deref(),
            offset,
        ))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_avatars(
    account_id: String,
    sequence: i64,
) -> Result<std::collections::HashMap<String, String>, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<std::collections::HashMap<String, String>, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        error(media::avatars_for_capture(&store, &account, sequence))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn contact_history(account_id: String, resource_name: String) -> Result<Vec<capture::ContactHistoryEntry>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::contact_history(&store, &account, &resource_name))
}

#[tauri::command]
fn account_profile(account_id: String) -> Result<google::AccountProfile, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(google::profile(&store, &account))
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
#[tauri::command]
fn schedule_state() -> Result<bool, String> {
    let store = store()?;
    let config = scheduler::load_config(&store);
    Ok(config.enabled)
}
#[tauri::command]
fn get_schedule_config() -> Result<scheduler::ScheduleConfig, String> {
    let store = store()?;
    Ok(scheduler::load_config(&store))
}
#[tauri::command]
fn save_schedule_config(config: scheduler::ScheduleConfig) -> Result<(), String> {
    let store = store()?;
    error(scheduler::apply_schedule(&store, &config))
}
#[tauri::command]
fn enable_schedule() -> Result<(), String> {
    let store = store()?;
    let mut config = scheduler::load_config(&store);
    config.enabled = true;
    error(scheduler::apply_schedule(&store, &config))
}
#[tauri::command]
fn disable_schedule() -> Result<(), String> {
    let store = store()?;
    let mut config = scheduler::load_config(&store);
    config.enabled = false;
    error(scheduler::apply_schedule(&store, &config))
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
async fn export_photos(
    app: tauri::AppHandle,
    account_id: String,
    sequence: i64,
    destination: String,
    format: String,
    include_default: bool,
) -> Result<photo_export::PhotoExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<photo_export::PhotoExportResult, String> {
        let store = store()?;
        let account = error(store.account(&account_id))?;
        let app_handle = app.clone();
        let emit = move |done: usize, total: usize, name: &str| {
            use tauri::Emitter;
            let _ = app_handle.emit(
                "photo-export-progress",
                photo_export::PhotoExportProgress {
                    current: done,
                    total,
                    name: name.to_string(),
                },
            );
        };
        error(photo_export::export_contact_photos(
            &store,
            &account,
            sequence,
            std::path::Path::new(&destination),
            &format,
            include_default,
            emit,
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

#[tauri::command]
fn compare_snapshots(
    account_id: String,
    base_sequence: i64,
    target_sequence: i64,
) -> Result<Vec<capture::ChangeRow>, String> {
    let store = store()?;
    let account = error(store.account(&account_id))?;
    error(capture::compare_snapshots(
        &store,
        &account,
        base_sequence,
        target_sequence,
    ))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn win_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn win_toggle_maximize(window: tauri::Window) -> Result<bool, String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
fn win_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn win_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_accounts,
            connect_google,
            capture_now,
            cancel_capture,
            list_captures,
            capture_at_time,
            list_changes,
            list_all_changes,
            compare_snapshots,
            list_groups,
            list_contacts,
            list_avatars,
            contact_history,
            account_profile,
            account_health,
            disconnect_account,
            contact_media,
            due_status,
            capture_if_due,
            retry_media,
            schedule_state,
            get_schedule_config,
            save_schedule_config,
            enable_schedule,
            disable_schedule,
            export_capture,
            export_photos,
            import_csv,
            backup_account,
            restore_archive,
            open_external_url,
            win_minimize,
            win_toggle_maximize,
            win_close,
            win_is_maximized
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
