use crate::core::storage::{Account, Store};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use image::{ImageFormat, ImageReader};
use reqwest::{blocking::Client, redirect::Policy};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::{Cursor, Read, Write},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
    time::Duration,
};
use url::Url;
use uuid::Uuid;

const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;

#[derive(Clone, Deserialize, Serialize)]
pub struct MediaObservation {
    pub resource_name: String,
    pub source_url: String,
    pub status: String,
    pub sha256: Option<String>,
    pub mime: Option<String>,
    pub byte_length: Option<i64>,
    pub retrieved_at: Option<String>,
}

#[derive(Serialize)]
pub struct MediaView {
    pub status: String,
    pub data_url: Option<String>,
    pub retrieved_at: Option<String>,
}

pub fn for_contact(
    store: &Store,
    account: &Account,
    sequence: i64,
    resource_name: &str,
) -> Result<Vec<MediaView>> {
    if sequence < 1 || resource_name.len() > 256 {
        bail!("invalid media query");
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt=db.prepare("SELECT o.status,COALESCE(o.sha256,j.sha256),m.mime,m.retrieved_at FROM captures c JOIN observation_media o ON o.run_id=c.run_id LEFT JOIN media_jobs j ON j.run_id=o.run_id AND j.resource_name=o.resource_name AND j.source_url=o.source_url AND j.status='available' LEFT JOIN media_objects m ON m.sha256=COALESCE(o.sha256,j.sha256) WHERE c.sequence=?1 AND o.resource_name=?2 ORDER BY o.source_url")?;
    let rows = stmt
        .query_map(params![sequence, resource_name], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(status, hash, mime, retrieved_at)| {
            let late = status == "failed" && hash.is_some();
            let data_url = if let (Some(hash), Some(mime)) = (hash, mime) {
                if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
                    bail!("invalid archived media hash");
                }
                let ext = match mime.as_str() {
                    "image/jpeg" => "jpg",
                    "image/png" => "png",
                    "image/webp" => "webp",
                    "image/gif" => "gif",
                    _ => bail!("unsupported archived media MIME"),
                };
                let bytes = fs::read(
                    store
                        .account_dir(&account.id)?
                        .join("media")
                        .join(format!("{hash}.{ext}")),
                )?;
                let actual = format!("{:x}", Sha256::digest(&bytes));
                if actual != hash {
                    bail!("archived photo hash mismatch");
                }
                Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
            } else {
                None
            };
            Ok(MediaView {
                status: if late { "late".into() } else { status },
                data_url,
                retrieved_at,
            })
        })
        .collect()
}

fn allowed(url: &Url) -> bool {
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|h| h == "googleusercontent.com" || h.ends_with(".googleusercontent.com"))
}

pub(crate) fn media_client() -> Result<Client> {
    Ok(Client::builder()
        .timeout(Duration::from_secs(20))
        .pool_max_idle_per_host(10)
        .tcp_nodelay(true)
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 || !allowed(attempt.url()) {
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()?)
}

pub(crate) fn retrieve_with_client(
    client: &Client,
    store: &Store,
    account: &Account,
    source: &str,
) -> Result<(String, String, i64, String)> {
    let url = Url::parse(source)?;
    if !allowed(&url) {
        bail!("photo URL host is not allowed");
    }
    let mut response = client.get(url).send()?.error_for_status()?;
    if response.content_length().is_some_and(|n| n > MAX_BYTES) {
        bail!("photo is too large");
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        bail!("photo is too large");
    }
    let reader = ImageReader::new(Cursor::new(&bytes)).with_guessed_format()?;
    let format = reader.format().context("unknown image format")?;
    let (mime, extension) = match format {
        ImageFormat::Jpeg => ("image/jpeg", "jpg"),
        ImageFormat::Png => ("image/png", "png"),
        ImageFormat::WebP => ("image/webp", "webp"),
        ImageFormat::Gif => ("image/gif", "gif"),
        _ => bail!("unsupported image format"),
    };
    let (width, height) = reader.into_dimensions()?;
    if width as u64 * height as u64 > MAX_PIXELS {
        bail!("photo dimensions are too large");
    }
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let path = store
        .account_dir(&account.id)?
        .join("media")
        .join(format!("{digest}.{extension}"));
    if !path.exists() {
        let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
        {
            let mut file = fs::File::create(&temp)?;
            file.write_all(&bytes)?;
            file.sync_all()?;
        }
        if let Err(error) = fs::rename(&temp, &path) {
            let _ = fs::remove_file(&temp);
            if !path.exists() {
                return Err(error.into());
            }
        }
    }
    Ok((
        digest,
        mime.into(),
        bytes.len() as i64,
        Utc::now().to_rfc3339(),
    ))
}

pub(crate) fn retrieve(
    store: &Store,
    account: &Account,
    source: &str,
) -> Result<(String, String, i64, String)> {
    let client = media_client()?;
    retrieve_with_client(&client, store, account, source)
}

#[allow(dead_code)]
pub fn collect(store: &Store, account: &Account, contacts: &[Value]) -> Vec<MediaObservation> {
    collect_with_progress(store, account, contacts, |_, _| {})
}

pub fn collect_with_progress<F>(
    store: &Store,
    account: &Account,
    contacts: &[Value],
    progress_callback: F,
) -> Vec<MediaObservation>
where
    F: Fn(usize, usize) + Send + Sync,
{
    let mut seen = BTreeSet::new();
    let mut items_to_fetch = Vec::new();
    let mut generated_items = Vec::new();

    for person in contacts {
        let Some(resource_name) = person.get("resourceName").and_then(Value::as_str) else {
            continue;
        };
        for field in ["photos", "coverPhotos"] {
            if let Some(items) = person.get(field).and_then(Value::as_array) {
                for photo in items {
                    let Some(url) = photo.get("url").and_then(Value::as_str) else {
                        continue;
                    };
                    if !seen.insert((resource_name.to_owned(), url.to_owned())) {
                        continue;
                    }
                    let generated = photo.get("default").and_then(Value::as_bool) == Some(true);
                    if generated {
                        generated_items.push(MediaObservation {
                            resource_name: resource_name.into(),
                            source_url: url.into(),
                            status: "generated".to_string(),
                            sha256: None,
                            mime: None,
                            byte_length: None,
                            retrieved_at: None,
                        });
                    } else {
                        items_to_fetch.push((resource_name.to_owned(), url.to_owned()));
                    }
                }
            }
        }
    }

    if items_to_fetch.is_empty() {
        return generated_items;
    }

    let unique_urls: Vec<String> = items_to_fetch
        .iter()
        .map(|(_, url)| url.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();

    let total = unique_urls.len();
    progress_callback(0, total);

    let client = match media_client() {
        Ok(c) => c,
        Err(_) => {
            let mut results = generated_items;
            for (res, url) in items_to_fetch {
                results.push(MediaObservation {
                    resource_name: res,
                    source_url: url,
                    status: "failed".to_string(),
                    sha256: None,
                    mime: None,
                    byte_length: None,
                    retrieved_at: None,
                });
            }
            return results;
        }
    };

    let completed = AtomicUsize::new(0);
    let url_index = AtomicUsize::new(0);
    let results_map: Mutex<BTreeMap<String, Result<(String, String, i64, String), String>>> =
        Mutex::new(BTreeMap::new());

    let worker_count = std::cmp::min(8, total);

    std::thread::scope(|s| {
        for _ in 0..worker_count {
            s.spawn(|| loop {
                let idx = url_index.fetch_add(1, Ordering::SeqCst);
                if idx >= total {
                    break;
                }
                let url = &unique_urls[idx];
                let res =
                    retrieve_with_client(&client, store, account, url).map_err(|e| e.to_string());

                {
                    let mut map = results_map.lock().unwrap();
                    map.insert(url.clone(), res);
                }

                let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
                progress_callback(done, total);
            });
        }
    });

    let results = results_map.into_inner().unwrap();
    let mut all_observations = generated_items;

    for (res, url) in items_to_fetch {
        let (status, sha256, mime, byte_length, retrieved_at) = match results.get(&url) {
            Some(Ok((hash, mime, length, time))) => (
                "available".to_string(),
                Some(hash.clone()),
                Some(mime.clone()),
                Some(*length),
                Some(time.clone()),
            ),
            _ => ("failed".to_string(), None, None, None, None),
        };
        all_observations.push(MediaObservation {
            resource_name: res,
            source_url: url,
            status,
            sha256,
            mime,
            byte_length,
            retrieved_at,
        });
    }

    all_observations
}

pub fn retry_jobs(store: &Store, account: &Account) -> Result<usize> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare("SELECT id,source_url,attempts FROM media_jobs WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at<=?1) ORDER BY id LIMIT 10")?;
    let jobs = stmt
        .query_map([Utc::now().to_rfc3339()], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let count = jobs.len();
    drop(stmt);
    for (id, url, attempts) in jobs {
        match retrieve(store, account, &url) {
            Ok((hash, mime, length, time)) => {
                db.execute("INSERT INTO media_objects(sha256,mime,byte_length,retrieved_at) VALUES(?1,?2,?3,?4) ON CONFLICT(sha256) DO NOTHING",params![hash,mime,length,time])?;
                db.execute("UPDATE media_jobs SET status='available',attempts=?2,sha256=?3,completed_at=?4,next_retry_at=NULL WHERE id=?1",params![id,attempts+1,hash,time])?;
            }
            Err(_) => {
                let next_attempt = attempts + 1;
                let next =
                    Utc::now() + chrono::Duration::hours(2_i64.pow((next_attempt as u32).min(6)));
                db.execute(
                    "UPDATE media_jobs SET status=?2,attempts=?3,next_retry_at=?4 WHERE id=?1",
                    params![
                        id,
                        if next_attempt >= 6 {
                            "failed"
                        } else {
                            "pending"
                        },
                        next_attempt,
                        next.to_rfc3339()
                    ],
                )?;
            }
        }
    }
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::capture::{self, Scan};
    use serde_json::json;

    #[test]
    fn retry_failure_keeps_capture_and_schedules_backoff() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store.add_account("sub", "a@example.test").unwrap();
        let scan = Scan {
            contacts: vec![
                json!({"resourceName":"people/1","photos":[{"url":"https://example.invalid/photo"}]}),
            ],
            groups: vec![],
            next_sync_token: None,
            full_sync_at: None,
            media: vec![MediaObservation {
                resource_name: "people/1".into(),
                source_url: "https://example.invalid/photo".into(),
                status: "failed".into(),
                sha256: None,
                mime: None,
                byte_length: None,
                retrieved_at: None,
            }],
        };
        let capture = capture::publish(&store, &account, scan, "fixture").unwrap();
        assert_eq!(retry_jobs(&store, &account).unwrap(), 1);
        let db = store.open_db(&account.id).unwrap();
        let attempts: i64 = db
            .query_row("SELECT attempts FROM media_jobs", [], |r| r.get(0))
            .unwrap();
        assert_eq!(attempts, 1);
        let old_status: String = db
            .query_row("SELECT status FROM observation_media", [], |r| r.get(0))
            .unwrap();
        assert_eq!(old_status, "failed");
        assert!(!capture.media_complete);
    }
}
