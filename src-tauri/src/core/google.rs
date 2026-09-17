use crate::core::{
    capture::{Scan, FIELDS},
    media,
    storage::{Account, Store},
};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use rand::RngCore;
use reqwest::blocking::Client;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::{
    io::{Read, Write},
    net::TcpListener,
    time::Duration,
};
use url::Url;

const SCOPES: &str = "openid email https://www.googleapis.com/auth/contacts.readonly";

#[derive(Serialize, Deserialize)]
pub struct ClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CaptureProgress {
    pub account_id: String,
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
    pub percent: Option<u8>,
}

fn http() -> Result<Client> {
    Ok(Client::builder().timeout(Duration::from_secs(30)).build()?)
}
fn random_urlsafe() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
fn credential(account: &Account) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new("ContactHistory.Google", &account.id)?)
}
pub fn disconnect(store: &Store, account: &Account) -> Result<()> {
    let entry = credential(account)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(error.into()),
    }
    let config = store.account_dir(&account.id)?.join("google-client.json");
    if config.exists() {
        std::fs::remove_file(config)?;
    }
    Ok(())
}

pub fn connect(store: &Store, config: ClientConfig) -> Result<Account> {
    if !config.client_id.ends_with(".apps.googleusercontent.com") {
        bail!("enter a Google desktop OAuth client ID");
    }
    let listener = TcpListener::bind("127.0.0.1:0")?;
    listener.set_nonblocking(true)?;
    let redirect = format!("http://127.0.0.1:{}/", listener.local_addr()?.port());
    let state = random_urlsafe();
    let verifier = random_urlsafe();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut auth = Url::parse("https://accounts.google.com/o/oauth2/v2/auth")?;
    auth.query_pairs_mut()
        .append_pair("client_id", &config.client_id)
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state);
    open::that(auth.as_str()).context("could not open the system browser")?;
    let deadline = std::time::Instant::now() + Duration::from_secs(180);
    let code = loop {
        if std::time::Instant::now() > deadline {
            bail!("Google sign-in timed out");
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(5)))?;
                let mut buf = [0_u8; 8192];
                let n = stream.read(&mut buf)?;
                let request = String::from_utf8_lossy(&buf[..n]);
                let path = request
                    .lines()
                    .next()
                    .and_then(|line| line.split_whitespace().nth(1))
                    .context("invalid OAuth callback")?;
                let callback = Url::parse(&format!("http://localhost{path}"))?;
                let params: std::collections::HashMap<_, _> =
                    callback.query_pairs().into_owned().collect();
                let response = if params.get("state") == Some(&state) {
                    "Sign-in received. You can close this tab."
                } else {
                    "Invalid sign-in response."
                };
                let body = format!("<html><body>{response}</body></html>");
                let _=write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
                if params.get("state") != Some(&state) {
                    bail!("OAuth state mismatch");
                }
                if let Some(error) = params.get("error") {
                    bail!("Google sign-in: {error}");
                }
                break params
                    .get("code")
                    .context("authorization code missing")?
                    .clone();
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(e) => return Err(e.into()),
        }
    };
    let client = http()?;
    let token: Value = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("grant_type", "authorization_code"),
            ("code_verifier", verifier.as_str()),
        ])
        .send()?
        .error_for_status()?
        .json()?;
    let access = token
        .get("access_token")
        .and_then(Value::as_str)
        .context("access token missing")?;
    let refresh = token
        .get("refresh_token")
        .and_then(Value::as_str)
        .context("refresh token missing; reauthorize with consent")?;
    let identity: Value = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(access)
        .send()?
        .error_for_status()?
        .json()?;
    let subject = identity
        .get("sub")
        .and_then(Value::as_str)
        .context("verified identity missing")?;
    let email = identity
        .get("email")
        .and_then(Value::as_str)
        .context("email missing")?;
    let name = identity.get("name").and_then(Value::as_str).map(str::to_owned);
    let picture = identity.get("picture").and_then(Value::as_str).map(str::to_owned);
    let account = store.add_account(subject, email)?;
    credential(&account)?.set_password(refresh)?;
    let config_path = store.account_dir(&account.id)?.join("google-client.json");
    std::fs::write(config_path, serde_json::to_vec(&config)?)?;
    let _ = std::fs::write(
        store.account_dir(&account.id)?.join("profile.json"),
        serde_json::to_vec(&AccountProfile {
            email: email.to_string(),
            name,
            picture,
        })?,
    );
    Ok(account)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AccountProfile {
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

pub fn profile(store: &Store, account: &Account) -> Result<AccountProfile> {
    let cache_path = store.account_dir(&account.id)?.join("profile.json");
    if let Ok(bytes) = std::fs::read(&cache_path) {
        if let Ok(cached) = serde_json::from_slice::<AccountProfile>(&bytes) {
            return Ok(cached);
        }
    }
    let token = access_token(store, account)?;
    let client = http()?;
    let identity: Value = client
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(&token)
        .send()?
        .error_for_status()?
        .json()?;
    let name = identity.get("name").and_then(Value::as_str).map(str::to_owned);
    let picture = identity.get("picture").and_then(Value::as_str).map(str::to_owned);
    let profile = AccountProfile {
        email: account.email.clone(),
        name,
        picture,
    };
    let _ = std::fs::write(&cache_path, serde_json::to_vec(&profile)?);
    Ok(profile)
}

fn access_token(store: &Store, account: &Account) -> Result<String> {
    let config: ClientConfig = serde_json::from_slice(&std::fs::read(
        store.account_dir(&account.id)?.join("google-client.json"),
    )?)?;
    let refresh = credential(account)?
        .get_password()
        .context("Google sign-in required")?;
    let client = http()?;
    let token: Value = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("refresh_token", refresh.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()?
        .error_for_status()?
        .json()?;
    Ok(token
        .get("access_token")
        .and_then(Value::as_str)
        .context("access token missing")?
        .to_owned())
}

fn get_page(client: &Client, url: Url, token: &str) -> Result<Value> {
    let mut last = None;
    for attempt in 0..4 {
        match client.get(url.clone()).bearer_auth(token).send() {
            Ok(response) if response.status().is_success() => return Ok(response.json()?),
            Ok(response) => {
                let status = response.status();
                let text = response.text().unwrap_or_default();
                if text.contains("EXPIRED_SYNC_TOKEN") {
                    bail!("EXPIRED_SYNC_TOKEN");
                }
                if status.as_u16() != 429 && !status.is_server_error() {
                    bail!(
                        "Google API HTTP {}: {}",
                        status,
                        text.chars().take(300).collect::<String>()
                    );
                }
                last = Some(format!("Google API HTTP {status}"));
            }
            Err(e) => last = Some(e.to_string()),
        }
        std::thread::sleep(Duration::from_millis(500 * (1 << attempt)));
    }
    bail!("Google API retry exhausted: {}", last.unwrap_or_default())
}

#[allow(dead_code)]
pub fn full_scan(store: &Store, account: &Account) -> Result<Scan> {
    full_scan_with_progress(store, account, None, |_| {})
}

pub fn full_scan_with_progress<F>(
    store: &Store,
    account: &Account,
    cancel: Option<Arc<AtomicBool>>,
    progress: F,
) -> Result<Scan>
where
    F: Fn(&CaptureProgress) + Send + Sync,
{
    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "contacts".into(),
        message: "Connecting to Google People API...".into(),
        current: Some(0),
        total: None,
        percent: Some(5),
    });
    let token = access_token(store, account)?;
    let client = http()?;
    let mut contacts = Vec::new();
    let mut next: Option<String> = None;
    let mut seen_pages = BTreeSet::new();
    let mut page_count = 0;
    let sync_token = loop {
        if let Some(ref c) = cancel {
            if c.load(Ordering::Relaxed) {
                bail!("Capture cancelled by user");
            }
        }
        page_count += 1;
        if let Some(ref page) = next {
            if !seen_pages.insert(page.clone()) {
                bail!("repeated contact page token");
            }
        }
        let mut url = Url::parse("https://people.googleapis.com/v1/people/me/connections")?;
        url.query_pairs_mut()
            .append_pair("personFields", FIELDS)
            .append_pair("pageSize", "1000")
            .append_pair("requestSyncToken", "true");
        if let Some(ref page) = next {
            url.query_pairs_mut().append_pair("pageToken", page);
        }
        let page = get_page(&client, url, &token)?;
        if let Some(items) = page.get("connections").and_then(Value::as_array) {
            contacts.extend(items.iter().cloned());
        }
        progress(&CaptureProgress {
            account_id: account.id.clone(),
            stage: "contacts".into(),
            message: format!(
                "Retrieved {} contacts (page {})...",
                contacts.len(),
                page_count
            ),
            current: Some(contacts.len()),
            total: None,
            percent: Some(std::cmp::min(25, 5 + page_count * 8) as u8),
        });
        next = page
            .get("nextPageToken")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if next.is_none() {
            break page
                .get("nextSyncToken")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
    };

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "groups".into(),
        message: "Fetching contact groups...".into(),
        current: Some(contacts.len()),
        total: None,
        percent: Some(28),
    });

    let mut groups = Vec::new();
    let mut next: Option<String> = None;
    let mut seen_pages = BTreeSet::new();
    loop {
        if let Some(ref c) = cancel {
            if c.load(Ordering::Relaxed) {
                bail!("Capture cancelled by user");
            }
        }
        if let Some(ref page) = next {
            if !seen_pages.insert(page.clone()) {
                bail!("repeated group page token");
            }
        }
        let mut url = Url::parse("https://people.googleapis.com/v1/contactGroups")?;
        url.query_pairs_mut()
            .append_pair("pageSize", "1000")
            .append_pair(
                "groupFields",
                "clientData,groupType,memberCount,metadata,name",
            );
        if let Some(ref page) = next {
            url.query_pairs_mut().append_pair("pageToken", page);
        }
        let page = get_page(&client, url, &token)?;
        if let Some(items) = page.get("contactGroups").and_then(Value::as_array) {
            groups.extend(items.iter().cloned());
        }
        next = page
            .get("nextPageToken")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if next.is_none() {
            break;
        }
    }

    if let Some(ref c) = cancel {
        if c.load(Ordering::Relaxed) {
            bail!("Capture cancelled by user");
        }
    }

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "media".into(),
        message: "Checking contact photos...".into(),
        current: Some(0),
        total: None,
        percent: Some(32),
    });

    let media = media::collect_with_progress(store, account, &contacts, cancel.clone(), |done, total| {
        let pct = if total > 0 {
            35 + ((done as f32 / total as f32) * 45.0) as u8
        } else {
            80
        };
        progress(&CaptureProgress {
            account_id: account.id.clone(),
            stage: "media".into(),
            message: format!("Archiving photos concurrently ({done}/{total})..."),
            current: Some(done),
            total: Some(total),
            percent: Some(pct),
        });
    });

    if let Some(ref c) = cancel {
        if c.load(Ordering::Relaxed) {
            bail!("Capture cancelled by user");
        }
    }

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "indexing".into(),
        message: "Processing scan payload...".into(),
        current: Some(contacts.len()),
        total: None,
        percent: Some(82),
    });

    Ok(Scan {
        contacts,
        groups,
        next_sync_token: sync_token,
        full_sync_at: None,
        media,
    })
}

pub fn observe(store: &Store, account: &Account) -> Result<Scan> {
    observe_with_progress(store, account, None, |_| {})
}

pub fn observe_with_progress<F>(
    store: &Store,
    account: &Account,
    cancel: Option<Arc<AtomicBool>>,
    progress: F,
) -> Result<Scan>
where
    F: Fn(&CaptureProgress) + Send + Sync,
{
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let state: Option<(Option<String>, Option<String>, String)> = db
        .query_row(
            "SELECT token,full_sync_at,coverage FROM sync_state WHERE id=1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    if let Some((Some(cursor), Some(full_at), coverage)) = state {
        let age = DateTime::parse_from_rfc3339(&full_at)?.with_timezone(&Utc);
        if coverage == crate::core::capture::COVERAGE && Utc::now() - age < ChronoDuration::days(6)
        {
            match delta_scan_with_progress(store, account, &cursor, &full_at, cancel.clone(), |p| progress(p)) {
                Ok(result) => return Ok(result),
                Err(error) if error.to_string().contains("EXPIRED_SYNC_TOKEN") => {}
                Err(error) => return Err(error),
            }
        }
    }
    full_scan_with_progress(store, account, cancel, progress)
}

fn merge_delta(base: Vec<Value>, changes: Vec<Value>) -> Result<Vec<Value>> {
    let mut contacts = BTreeMap::new();
    for person in base {
        let key = person
            .get("resourceName")
            .and_then(Value::as_str)
            .context("base contact missing resourceName")?
            .to_owned();
        contacts.insert(key, person);
    }
    for person in changes {
        let key = person
            .get("resourceName")
            .and_then(Value::as_str)
            .context("delta contact missing resourceName")?
            .to_owned();
        if person.pointer("/metadata/deleted").and_then(Value::as_bool) == Some(true) {
            contacts.remove(&key);
        } else {
            contacts.insert(key, person);
        }
    }
    Ok(contacts.into_values().collect())
}

#[allow(dead_code)]
fn delta_scan(
    store: &Store,
    account: &Account,
    cursor: &str,
    full_at: &str,
) -> Result<Scan> {
    delta_scan_with_progress(store, account, cursor, full_at, None, |_| {})
}

fn delta_scan_with_progress<F>(
    store: &Store,
    account: &Account,
    cursor: &str,
    full_at: &str,
    cancel: Option<Arc<AtomicBool>>,
    progress: F,
) -> Result<Scan>
where
    F: Fn(&CaptureProgress) + Send + Sync,
{
    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "contacts".into(),
        message: "Checking Google delta changes...".into(),
        current: Some(0),
        total: None,
        percent: Some(10),
    });
    let token = access_token(store, account)?;
    let client = http()?;
    let mut changes = Vec::new();
    let mut next: Option<String> = None;
    let mut seen_pages = BTreeSet::new();
    let next_sync_token = loop {
        if let Some(ref c) = cancel {
            if c.load(Ordering::Relaxed) {
                bail!("Capture cancelled by user");
            }
        }
        if let Some(ref page) = next {
            if !seen_pages.insert(page.clone()) {
                bail!("repeated contact page token");
            }
        }
        let mut url = Url::parse("https://people.googleapis.com/v1/people/me/connections")?;
        url.query_pairs_mut()
            .append_pair("personFields", FIELDS)
            .append_pair("pageSize", "1000")
            .append_pair("requestSyncToken", "true")
            .append_pair("syncToken", cursor);
        if let Some(ref page) = next {
            url.query_pairs_mut().append_pair("pageToken", page);
        }
        let page = get_page(&client, url, &token)?;
        if let Some(items) = page.get("connections").and_then(Value::as_array) {
            changes.extend(items.iter().cloned());
        }
        progress(&CaptureProgress {
            account_id: account.id.clone(),
            stage: "contacts".into(),
            message: format!("Observed {} delta contact changes...", changes.len()),
            current: Some(changes.len()),
            total: None,
            percent: Some(25),
        });
        next = page
            .get("nextPageToken")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if next.is_none() {
            break page
                .get("nextSyncToken")
                .and_then(Value::as_str)
                .map(str::to_owned);
        }
    };
    let db = store.open_db(&account.id)?;
    let mut stmt=db.prepare("SELECT o.payload FROM sync_state s JOIN captures c ON c.sequence=s.capture_sequence JOIN raw_observations o ON o.run_id=c.run_id WHERE s.id=1")?;
    let base = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .map(|row| Ok(serde_json::from_str::<Value>(&row?)?))
        .collect::<Result<Vec<_>>>()?;
    let contacts = merge_delta(base, changes)?;

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "groups".into(),
        message: "Refreshing contact groups...".into(),
        current: Some(contacts.len()),
        total: None,
        percent: Some(30),
    });

    let mut groups = Vec::new();
    let mut next: Option<String> = None;
    let mut seen_pages = BTreeSet::new();
    loop {
        if let Some(ref c) = cancel {
            if c.load(Ordering::Relaxed) {
                bail!("Capture cancelled by user");
            }
        }
        if let Some(ref page) = next {
            if !seen_pages.insert(page.clone()) {
                bail!("repeated group page token");
            }
        }
        let mut url = Url::parse("https://people.googleapis.com/v1/contactGroups")?;
        url.query_pairs_mut()
            .append_pair("pageSize", "1000")
            .append_pair(
                "groupFields",
                "clientData,groupType,memberCount,metadata,name",
            );
        if let Some(ref page) = next {
            url.query_pairs_mut().append_pair("pageToken", page);
        }
        let page = get_page(&client, url, &token)?;
        if let Some(items) = page.get("contactGroups").and_then(Value::as_array) {
            groups.extend(items.iter().cloned());
        }
        next = page
            .get("nextPageToken")
            .and_then(Value::as_str)
            .map(str::to_owned);
        if next.is_none() {
            break;
        }
    }

    if let Some(ref c) = cancel {
        if c.load(Ordering::Relaxed) {
            bail!("Capture cancelled by user");
        }
    }

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "media".into(),
        message: "Checking contact photos...".into(),
        current: Some(0),
        total: None,
        percent: Some(35),
    });

    let media = media::collect_with_progress(store, account, &contacts, cancel.clone(), |done, total| {
        let pct = if total > 0 {
            35 + ((done as f32 / total as f32) * 45.0) as u8
        } else {
            80
        };
        progress(&CaptureProgress {
            account_id: account.id.clone(),
            stage: "media".into(),
            message: format!("Archiving photos concurrently ({done}/{total})..."),
            current: Some(done),
            total: Some(total),
            percent: Some(pct),
        });
    });

    if let Some(ref c) = cancel {
        if c.load(Ordering::Relaxed) {
            bail!("Capture cancelled by user");
        }
    }

    progress(&CaptureProgress {
        account_id: account.id.clone(),
        stage: "indexing".into(),
        message: "Processing scan payload...".into(),
        current: Some(contacts.len()),
        total: None,
        percent: Some(82),
    });

    Ok(Scan {
        contacts,
        groups,
        next_sync_token,
        full_sync_at: Some(full_at.into()),
        media,
    })
}

#[cfg(test)]
mod delta_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn delta_rebuilds_complete_current_state() {
        let base = vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Ada"}]}),
            json!({"resourceName":"people/2","names":[{"displayName":"Grace"}]}),
        ];
        let changes = vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Ada L."}]}),
            json!({"resourceName":"people/2","metadata":{"deleted":true}}),
            json!({"resourceName":"people/3","names":[{"displayName":"Katherine"}]}),
        ];
        let merged = merge_delta(base, changes).unwrap();
        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0]["names"][0]["displayName"], "Ada L.");
        assert_eq!(merged[1]["resourceName"], "people/3");
    }
}
