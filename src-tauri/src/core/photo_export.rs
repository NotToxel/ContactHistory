use crate::core::{
    media,
    storage::{Account, Store},
};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageReader};
use rusqlite::OptionalExtension;
use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Cursor, Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Mutex,
    },
};
use url::Url;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipWriter};

#[derive(Clone, Debug, Serialize)]
pub struct PhotoExportProgress {
    pub current: usize,
    pub total: usize,
    pub name: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct PhotoExportResult {
    pub total_contacts: usize,
    pub exported_photos: usize,
    pub skipped_no_photo: usize,
    pub skipped_default: usize,
    pub destination: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct PhotoQualityInfo {
    pub width: u32,
    pub height: u32,
    pub resizable: bool,
    pub extension: String,
}

pub fn contact_display_name(contact: &Value) -> String {
    // 1. Display name from names array
    if let Some(names) = contact.get("names").and_then(Value::as_array) {
        if let Some(display) = names.iter().find_map(|n| {
            n.get("displayName")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
        }) {
            return display.trim().to_string();
        }
        // 2. Given + Family
        for n in names {
            let given = n.get("givenName").and_then(Value::as_str).unwrap_or("").trim();
            let family = n.get("familyName").and_then(Value::as_str).unwrap_or("").trim();
            let full = format!("{given} {family}").trim().to_string();
            if !full.is_empty() {
                return full;
            }
        }
    }
    // 3. Organization
    if let Some(orgs) = contact.get("organizations").and_then(Value::as_array) {
        if let Some(name) = orgs.iter().find_map(|o| {
            o.get("name")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
        }) {
            return name.trim().to_string();
        }
    }
    // 4. Email
    if let Some(emails) = contact.get("emailAddresses").and_then(Value::as_array) {
        if let Some(val) = emails.iter().find_map(|e| {
            e.get("value")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
        }) {
            return val.trim().to_string();
        }
    }
    // 5. Phone
    if let Some(phones) = contact.get("phoneNumbers").and_then(Value::as_array) {
        if let Some(val) = phones.iter().find_map(|p| {
            p.get("value")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
        }) {
            return val.trim().to_string();
        }
    }
    "Unnamed Contact".to_string()
}

pub fn sanitize_filename(name: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let s: String = name
        .chars()
        .map(|c| if invalid.contains(&c) || (c as u32) < 32 { '_' } else { c })
        .collect();
    let trimmed = s.trim_matches(|c| c == ' ' || c == '.' || c == '_').to_string();
    let result = if trimmed.is_empty() {
        "Unnamed Contact".to_string()
    } else {
        trimmed
    };
    let upper = result.to_ascii_uppercase();
    let base = upper.split('.').next().unwrap_or("");
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&base) {
        format!("{result}_")
    } else {
        result
    }
}

pub fn upgrade_to_high_res(url_str: &str) -> String {
    if let Ok(parsed) = Url::parse(url_str) {
        if let Some(host) = parsed.host_str() {
            if host == "googleusercontent.com" || host.ends_with(".googleusercontent.com") {
                // Check if URL ends with =s... or =w...
                if let Some(eq_idx) = url_str.rfind('=') {
                    let suffix = &url_str[eq_idx + 1..];
                    if suffix.starts_with('s') || suffix.starts_with('w') || suffix.starts_with('h') {
                        return format!("{}=s0", &url_str[..eq_idx]);
                    }
                }
                // If there is no '=' parameter in Google User Content, appending =s0 requests original full-res
                if !url_str.contains('=') {
                    return format!("{url_str}=s0");
                }
            }
        }
    }
    url_str.to_string()
}

#[derive(Clone, Debug)]
pub struct PhotoCandidate {
    pub url: String,
    pub is_default: bool,
}

pub fn find_photo_candidate(contact: &Value) -> Option<PhotoCandidate> {
    let photos = contact.get("photos")?.as_array()?;
    if photos.is_empty() {
        return None;
    }

    // Priority 1: User explicitly set contact photo (source.type == "CONTACT" or url contains /contacts/)
    if let Some(p) = photos.iter().find(|p| {
        let is_default = p.get("default").and_then(Value::as_bool).unwrap_or(false);
        if is_default {
            return false;
        }
        let source_type = p
            .pointer("/metadata/source/type")
            .or_else(|| p.pointer("/source/type"))
            .and_then(Value::as_str);
        let url = p.get("url").and_then(Value::as_str).unwrap_or("");
        (source_type == Some("CONTACT") || url.contains("/contacts/")) && !url.is_empty()
    }) {
        let url = p.get("url").and_then(Value::as_str)?.to_string();
        return Some(PhotoCandidate {
            url,
            is_default: false,
        });
    }

    // Priority 2: Non-default non-profile photo
    if let Some(p) = photos.iter().find(|p| {
        let is_default = p.get("default").and_then(Value::as_bool).unwrap_or(false);
        if is_default {
            return false;
        }
        let source_type = p
            .pointer("/metadata/source/type")
            .or_else(|| p.pointer("/source/type"))
            .and_then(Value::as_str);
        let url = p.get("url").and_then(Value::as_str).unwrap_or("");
        source_type != Some("PROFILE") && source_type != Some("DOMAIN_PROFILE") && !url.is_empty()
    }) {
        let url = p.get("url").and_then(Value::as_str)?.to_string();
        return Some(PhotoCandidate {
            url,
            is_default: false,
        });
    }

    // Priority 3: Non-default Google profile photo
    if let Some(p) = photos.iter().find(|p| {
        let is_default = p.get("default").and_then(Value::as_bool).unwrap_or(false);
        let url = p.get("url").and_then(Value::as_str).unwrap_or("");
        !is_default && !url.is_empty()
    }) {
        let url = p.get("url").and_then(Value::as_str)?.to_string();
        return Some(PhotoCandidate {
            url,
            is_default: false,
        });
    }

    // Fallback: first available photo (may have is_default == true)
    let p = photos.first()?;
    let url = p.get("url").and_then(Value::as_str)?.to_string();
    let is_default = p.get("default").and_then(Value::as_bool).unwrap_or(false);
    Some(PhotoCandidate { url, is_default })
}

fn detect_extension(bytes: &[u8]) -> Result<&'static str> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let format = reader.format().context("unknown format")?;
    match format {
        image::ImageFormat::Jpeg => Ok("jpg"),
        image::ImageFormat::Png => Ok("png"),
        image::ImageFormat::WebP => Ok("webp"),
        image::ImageFormat::Gif => Ok("gif"),
        _ => bail!("unsupported image format"),
    }
}

fn download_url_bytes(client: &Client, url_str: &str) -> Result<Vec<u8>> {
    let url = Url::parse(url_str)?;
    let resp = client.get(url).send()?.error_for_status()?;
    let mut bytes = Vec::new();
    std::io::Read::read_to_end(&mut resp.take(20 * 1024 * 1024 + 1), &mut bytes)?;
    if bytes.is_empty() {
        bail!("empty response");
    }
    Ok(bytes)
}

fn fetch_photo_bytes(
    client: &Option<Client>,
    store: &Store,
    account: &Account,
    original_url: &str,
    cached_fallback: Option<(&str, &str)>,
) -> Result<(Vec<u8>, &'static str)> {
    if let Some(client) = client {
        let high_res_url = upgrade_to_high_res(original_url);
        // 1. Try high-res (=s0) URL
        if let Ok(bytes) = download_url_bytes(client, &high_res_url) {
            if let Ok(ext) = detect_extension(&bytes) {
                return Ok((bytes, ext));
            }
        }
        // 2. If high-res failed and was different, try original URL
        if high_res_url != original_url {
            if let Ok(bytes) = download_url_bytes(client, original_url) {
                if let Ok(ext) = detect_extension(&bytes) {
                    return Ok((bytes, ext));
                }
            }
        }
    }

    // 3. Fallback to locally cached photo in store media directory
    if let Some((hash, ext_hint)) = cached_fallback {
        let media_dir = store.account_dir(&account.id)?.join("media");
        let path = media_dir.join(format!("{hash}.{ext_hint}"));
        if let Ok(bytes) = fs::read(&path) {
            let ext = detect_extension(&bytes).unwrap_or(match ext_hint {
                "png" => "png",
                "webp" => "webp",
                "gif" => "gif",
                _ => "jpg",
            });
            return Ok((bytes, ext));
        }
    }

    bail!("unable to retrieve photo for {}", original_url);
}

fn unique_filename(base_name: &str, ext: &str, used: &mut HashSet<String>) -> String {
    let candidate = format!("{base_name}.{ext}");
    let candidate_lower = candidate.to_lowercase();
    if !used.contains(&candidate_lower) {
        used.insert(candidate_lower);
        return candidate;
    }
    let mut i = 2;
    loop {
        let candidate = format!("{base_name} ({i}).{ext}");
        let candidate_lower = candidate.to_lowercase();
        if !used.contains(&candidate_lower) {
            used.insert(candidate_lower);
            return candidate;
        }
        i += 1;
    }
}

pub fn export_contact_photos<F>(
    store: &Store,
    account: &Account,
    sequence: i64,
    destination: &Path,
    format: &str,
    include_default: bool,
    progress_callback: F,
) -> Result<PhotoExportResult>
where
    F: Fn(usize, usize, &str) + Send + Sync,
{
    if format != "folder" && format != "zip" {
        bail!("unsupported export format: {}", format);
    }

    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;

    // Query contacts for the snapshot
    let mut stmt = db.prepare(
        "SELECT ro.resource_name, ro.payload \
         FROM captures c \
         JOIN raw_observations ro ON ro.run_id = c.run_id \
         WHERE c.sequence = ?1 \
         ORDER BY ro.resource_name",
    )?;

    let contacts_rows = stmt
        .query_map([sequence], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let total_contacts = contacts_rows.len();

    // Map cached media: source_url -> (sha256, ext)
    let mut media_stmt = db.prepare(
        "SELECT o.source_url, COALESCE(o.sha256, j.sha256), m.mime \
         FROM captures c \
         JOIN observation_media o ON o.run_id = c.run_id \
         LEFT JOIN media_jobs j ON j.run_id = o.run_id AND j.resource_name = o.resource_name AND j.source_url = o.source_url AND j.status = 'available' \
         JOIN media_objects m ON m.sha256 = COALESCE(o.sha256, j.sha256) \
         WHERE c.sequence = ?1 AND (o.status = 'available' OR j.status = 'available')",
    )?;

    let mut cached_map: HashMap<String, (String, &'static str)> = HashMap::new();
    let media_rows = media_stmt.query_map([sequence], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
        ))
    })?;

    for r in media_rows.flatten() {
        let (url, hash, mime) = r;
        let ext = match mime.as_str() {
            "image/jpeg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "jpg",
        };
        cached_map.insert(url, (hash, ext));
    }

    // Process contacts to identify candidates for export
    struct TaskItem {
        display_name: String,
        sanitized_name: String,
        photo_url: String,
        cached_fallback: Option<(String, &'static str)>,
    }

    let mut tasks = Vec::new();
    let mut skipped_no_photo = 0;
    let mut skipped_default = 0;

    for (_res_name, payload_str) in contacts_rows {
        let Ok(val) = serde_json::from_str::<Value>(&payload_str) else {
            skipped_no_photo += 1;
            continue;
        };

        let candidate = match find_photo_candidate(&val) {
            Some(c) => c,
            None => {
                skipped_no_photo += 1;
                continue;
            }
        };

        if candidate.is_default && !include_default {
            skipped_default += 1;
            continue;
        }

        let display = contact_display_name(&val);
        let sanitized = sanitize_filename(&display);
        let fallback = cached_map
            .get(&candidate.url)
            .map(|(h, ext)| (h.clone(), *ext));

        tasks.push(TaskItem {
            display_name: display,
            sanitized_name: sanitized,
            photo_url: candidate.url,
            cached_fallback: fallback,
        });
    }

    let total_photos_to_fetch = tasks.len();
    progress_callback(0, total_photos_to_fetch, "Starting export...");

    let client_opt = media::media_client().ok();

    // Concurrent fetching of photo bytes
    let completed_counter = AtomicUsize::new(0);
    let task_index = AtomicUsize::new(0);
    let worker_count = std::cmp::min(8, total_photos_to_fetch.max(1));

    struct DownloadedPhoto {
        sanitized_name: String,
        bytes: Vec<u8>,
        ext: &'static str,
    }

    let results: Mutex<Vec<Option<DownloadedPhoto>>> =
        Mutex::new((0..total_photos_to_fetch).map(|_| None).collect());

    if total_photos_to_fetch > 0 {
        std::thread::scope(|s| {
            for _ in 0..worker_count {
                s.spawn(|| loop {
                    let idx = task_index.fetch_add(1, Ordering::SeqCst);
                    if idx >= total_photos_to_fetch {
                        break;
                    }
                    let task = &tasks[idx];
                    let fallback_ref = task
                        .cached_fallback
                        .as_ref()
                        .map(|(h, e)| (h.as_str(), *e));
                    let res = fetch_photo_bytes(
                        &client_opt,
                        store,
                        account,
                        &task.photo_url,
                        fallback_ref,
                    );

                    if let Ok((bytes, ext)) = res {
                        let mut guard = results.lock().unwrap();
                        guard[idx] = Some(DownloadedPhoto {
                            sanitized_name: task.sanitized_name.clone(),
                            bytes,
                            ext,
                        });
                    }

                    let done = completed_counter.fetch_add(1, Ordering::SeqCst) + 1;
                    progress_callback(done, total_photos_to_fetch, &task.display_name);
                });
            }
        });
    }

    let downloaded = results.into_inner().unwrap();
    let mut valid_photos: Vec<DownloadedPhoto> = downloaded.into_iter().flatten().collect();

    // Deduplicate filenames
    let mut used_filenames = HashSet::new();
    let mut files_to_write: Vec<(String, Vec<u8>)> = Vec::with_capacity(valid_photos.len());

    for photo in valid_photos.drain(..) {
        let final_filename = unique_filename(&photo.sanitized_name, photo.ext, &mut used_filenames);
        files_to_write.push((final_filename, photo.bytes));
    }

    let exported_photos = files_to_write.len();

    // Write to destination
    if format == "folder" {
        fs::create_dir_all(destination)?;
        for (filename, bytes) in files_to_write {
            let target_path = destination.join(filename);
            fs::write(target_path, bytes)?;
        }
    } else if format == "zip" {
        let temp_zip_path = destination.with_extension(format!("{}.partial", Uuid::new_v4()));
        {
            let file = fs::File::create(&temp_zip_path)?;
            let mut zip = ZipWriter::new(file);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);

            for (filename, bytes) in files_to_write {
                zip.start_file(filename, options)?;
                zip.write_all(&bytes)?;
            }
            zip.finish()?;
        }
        if destination.exists() {
            let _ = fs::remove_file(destination);
        }
        fs::rename(temp_zip_path, destination)?;
    }

    Ok(PhotoExportResult {
        total_contacts,
        exported_photos,
        skipped_no_photo,
        skipped_default,
        destination: destination.to_string_lossy().to_string(),
    })
}

fn load_single_photo(
    store: &Store,
    account: &Account,
    sequence: i64,
    photo_url: &str,
) -> Result<(Vec<u8>, &'static str)> {
    if photo_url.starts_with("data:image/") {
        let encoded = photo_url.split_once(',').context("invalid photo data")?.1;
        if encoded.len() > 28 * 1024 * 1024 {
            bail!("photo data is too large");
        }
        let bytes = STANDARD.decode(encoded)?;
        let ext = detect_extension(&bytes)?;
        return Ok((bytes, ext));
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let cached: Option<(String, String)> = db.query_row(
        "SELECT COALESCE(o.sha256, j.sha256), m.mime \
         FROM captures c \
         JOIN observation_media o ON o.run_id = c.run_id \
         LEFT JOIN media_jobs j ON j.run_id = o.run_id AND j.resource_name = o.resource_name AND j.source_url = o.source_url AND j.status = 'available' \
         JOIN media_objects m ON m.sha256 = COALESCE(o.sha256, j.sha256) \
         WHERE c.sequence = ?1 AND o.source_url = ?2 AND (o.status = 'available' OR j.status = 'available') \
         LIMIT 1",
        rusqlite::params![sequence, photo_url],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).optional()?;
    let cached = cached.map(|(hash, mime)| {
        let ext = match mime.as_str() {
            "image/png" => "png",
            "image/webp" => "webp",
            "image/gif" => "gif",
            _ => "jpg",
        };
        (hash, ext)
    });
    fetch_photo_bytes(
        &media::media_client().ok(), store, account, photo_url,
        cached.as_ref().map(|(hash, ext)| (hash.as_str(), *ext)),
    )
}

pub fn single_photo_quality(
    store: &Store,
    account: &Account,
    sequence: i64,
    photo_url: &str,
) -> Result<PhotoQualityInfo> {
    let (bytes, ext) = load_single_photo(store, account, sequence, photo_url)?;
    let image = image::load_from_memory(&bytes)?;
    let (width, height) = image.dimensions();
    Ok(PhotoQualityInfo { width, height, resizable: ext != "gif", extension: ext.to_string() })
}

pub fn export_single_photo(
    store: &Store,
    account: &Account,
    sequence: i64,
    photo_url: &str,
    destination: &Path,
    size: Option<u32>,
) -> Result<String> {
    let (mut bytes, ext) = load_single_photo(store, account, sequence, photo_url)?;
    let chosen_ext = destination.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let output_ext = match chosen_ext.as_str() {
        "jpg" | "jpeg" => "jpg",
        "png" => "png",
        "webp" => "webp",
        "gif" if ext == "gif" && size.is_none() => "gif",
        "" => ext,
        _ => bail!("unsupported output format"),
    };
    if ext == "gif" && size.is_some() {
        bail!("animated GIF photos can only be downloaded at original size");
    }
    if let Some(target) = size {
        if target == 0 {
            bail!("this photo cannot be exported at the selected size");
        }
        let image = image::load_from_memory(&bytes)?;
        let (width, height) = image.dimensions();
        if target > width.max(height) {
            bail!("selected size exceeds the photo's available resolution");
        }
    }
    if size.is_some() || output_ext != ext {
        let image = image::load_from_memory(&bytes)?;
        let resized = if let Some(target) = size {
            image.resize(target, target, image::imageops::FilterType::Lanczos3)
        } else {
            image
        };
        let mut output = Cursor::new(Vec::new());
        if output_ext == "jpg" {
            let rgba = resized.to_rgba8();
            let mut white = image::RgbaImage::from_pixel(rgba.width(), rgba.height(), image::Rgba([255, 255, 255, 255]));
            image::imageops::overlay(&mut white, &rgba, 0, 0);
            let rgb = image::DynamicImage::ImageRgba8(white).to_rgb8();
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 92);
            image::DynamicImage::ImageRgb8(rgb).write_with_encoder(encoder)?;
        } else {
            let format = match output_ext {
                "png" => image::ImageFormat::Png,
                "webp" => image::ImageFormat::WebP,
                _ => bail!("unsupported image format"),
            };
            resized.write_to(&mut output, format)?;
        }
        bytes = output.into_inner();
    }
    let path = match destination.extension().and_then(|value| value.to_str()) {
        Some("jpg" | "jpeg" | "png" | "webp" | "gif") => destination.to_path_buf(),
        _ => destination.with_file_name(format!(
            "{}.{}",
            destination.file_name().and_then(|value| value.to_str()).context("invalid filename")?,
            output_ext,
        )),
    };
    if path == destination {
        fs::write(&path, bytes)?;
    } else {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&path)
            .with_context(|| format!("cannot create {} (choose another filename if it already exists)", path.display()))?;
        file.write_all(&bytes)?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filename_sanitization() {
        assert_eq!(sanitize_filename("Alice / Bob <Test>?"), "Alice _ Bob _Test");
        assert_eq!(sanitize_filename("John: Smith*"), "John_ Smith");
        assert_eq!(sanitize_filename("CON"), "CON_");
        assert_eq!(sanitize_filename("..."), "Unnamed Contact");
        assert_eq!(sanitize_filename("  Jane Doe  "), "Jane Doe");
    }

    #[test]
    fn test_high_res_url_upgrade() {
        let s100 = "https://lh3.googleusercontent.com/contacts/AG6tpzE=s100";
        assert_eq!(
            upgrade_to_high_res(s100),
            "https://lh3.googleusercontent.com/contacts/AG6tpzE=s0"
        );

        let s96c = "https://lh3.googleusercontent.com/a/ACg8oc=s96-c";
        assert_eq!(
            upgrade_to_high_res(s96c),
            "https://lh3.googleusercontent.com/a/ACg8oc=s0"
        );

        let no_eq = "https://lh3.googleusercontent.com/contacts/AG6tpzE";
        assert_eq!(
            upgrade_to_high_res(no_eq),
            "https://lh3.googleusercontent.com/contacts/AG6tpzE=s0"
        );

        let non_google = "https://example.com/photo.jpg";
        assert_eq!(upgrade_to_high_res(non_google), non_google);
    }

    #[test]
    fn test_unique_filename_collision() {
        let mut used = HashSet::new();
        assert_eq!(unique_filename("Alice", "jpg", &mut used), "Alice.jpg");
        assert_eq!(unique_filename("Alice", "jpg", &mut used), "Alice (2).jpg");
        assert_eq!(unique_filename("Alice", "jpg", &mut used), "Alice (3).jpg");
        assert_eq!(unique_filename("Alice", "png", &mut used), "Alice.png");
        assert_eq!(unique_filename("alice", "jpg", &mut used), "alice (4).jpg");
    }

    #[test]
    fn test_export_contact_photos_folder_and_zip() {
        use crate::core::capture::{self, Scan};
        use crate::core::media::MediaObservation;
        use serde_json::json;
        use sha2::{Digest, Sha256};

        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store.add_account("sub1", "user@example.test").unwrap();

        // 1x1 PNG image bytes
        let png_bytes = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let hash = format!("{:x}", Sha256::digest(&png_bytes));
        let media_dir = store.account_dir(&account.id).unwrap().join("media");
        fs::create_dir_all(&media_dir).unwrap();
        fs::write(media_dir.join(format!("{hash}.png")), &png_bytes).unwrap();

        let db = store.open_db(&account.id).unwrap();
        db.execute(
            "INSERT INTO media_objects(sha256, mime, byte_length, retrieved_at) VALUES(?1, ?2, ?3, ?4)",
            [&hash, "image/png", &png_bytes.len().to_string(), "2026-09-18T00:00:00Z"],
        ).unwrap();

        let photo_url = "https://lh3.googleusercontent.com/contacts/example=s100";
        let scan = Scan {
            contacts: vec![
                json!({
                    "resourceName": "people/1",
                    "names": [{"displayName": "Jane Doe"}],
                    "photos": [{"url": photo_url, "default": false}]
                }),
                json!({
                    "resourceName": "people/2",
                    "names": [{"displayName": "Bob Default"}],
                    "photos": [{"url": "https://lh3.googleusercontent.com/default", "default": true}]
                }),
            ],
            groups: vec![],
            next_sync_token: None,
            full_sync_at: None,
            media: vec![
                MediaObservation {
                    resource_name: "people/1".into(),
                    source_url: photo_url.into(),
                    status: "available".into(),
                    sha256: Some(hash),
                    mime: Some("image/png".into()),
                    byte_length: Some(png_bytes.len() as i64),
                    retrieved_at: Some("2026-09-18T00:00:00Z".into()),
                },
            ],
        };

        let outcome = capture::publish(&store, &account, scan, "fixture").unwrap();

        // 1. Test Folder Export without default avatars
        let folder_dest = temp.path().join("exported_photos");
        let res_folder = export_contact_photos(
            &store,
            &account,
            outcome.sequence,
            &folder_dest,
            "folder",
            false,
            |_, _, _| {},
        )
        .unwrap();

        assert_eq!(res_folder.total_contacts, 2);
        assert_eq!(res_folder.exported_photos, 1);
        assert_eq!(res_folder.skipped_default, 1);
        assert!(folder_dest.join("Jane Doe.png").exists());

        // 2. Test ZIP Export
        let zip_dest = temp.path().join("exported_photos.zip");
        let res_zip = export_contact_photos(
            &store,
            &account,
            outcome.sequence,
            &zip_dest,
            "zip",
            false,
            |_, _, _| {},
        )
        .unwrap();

        assert_eq!(res_zip.exported_photos, 1);
        assert!(zip_dest.exists());

        // Verify ZIP contents
        let zip_file = fs::File::open(&zip_dest).unwrap();
        let mut archive = zip::ZipArchive::new(zip_file).unwrap();
        assert_eq!(archive.len(), 1);
        let file = archive.by_index(0).unwrap();
        assert_eq!(file.name(), "Jane Doe.png");
    }
}
