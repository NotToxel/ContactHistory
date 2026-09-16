use crate::core::storage::{Account, Store};
use anyhow::{bail, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{params, Connection};
use serde_json::Value;
use sha2::Digest;
use std::collections::HashMap;
use std::{fs, path::Path};
use uuid::Uuid;

fn rows(db: &Connection, sequence: i64) -> Result<Vec<(String, Value)>> {
    let exists: i64 = db.query_row(
        "SELECT COUNT(*) FROM captures WHERE sequence=?1",
        [sequence],
        |r| r.get(0),
    )?;
    if exists == 0 {
        bail!("capture does not exist");
    }
    let mut stmt=db.prepare("SELECT i.resource_name,o.payload FROM capture_contacts c JOIN contact_identities i ON i.id=c.contact_id JOIN contact_revisions r ON r.id=c.revision_id JOIN captures p ON p.sequence=c.capture_sequence JOIN raw_observations o ON o.run_id=p.run_id AND o.resource_name=i.resource_name WHERE c.capture_sequence=?1 AND r.kind='present' ORDER BY i.resource_name")?;
    let result = stmt
        .query_map([sequence], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .map(|row| {
            let (id, text) = row?;
            Ok((id, serde_json::from_str(&text)?))
        })
        .collect();
    result
}
fn array<'a>(value: &'a Value, key: &str) -> &'a [Value] {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
fn field<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}
fn first<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    array(value, key).first()
}
fn label(value: &Value) -> &str {
    let custom = field(value, "formattedType");
    if !custom.is_empty() {
        custom
    } else {
        field(value, "type")
    }
}
fn join_date(value: &Value) -> String {
    let date = value.get("date").unwrap_or(value);
    let year = date.get("year").and_then(Value::as_i64);
    let month = date.get("month").and_then(Value::as_u64);
    let day = date.get("day").and_then(Value::as_u64);
    match (year, month, day) {
        (Some(y), Some(m), Some(d)) => format!("{y:04}-{m:02}-{d:02}"),
        (None, Some(m), Some(d)) => format!("--{m:02}-{d:02}"),
        _ => String::new(),
    }
}
fn group_names(db: &Connection, sequence: i64) -> Result<HashMap<String, String>> {
    let mut stmt=db.prepare("SELECT g.resource_name,r.payload FROM capture_groups g JOIN group_revisions r ON r.id=g.revision_id WHERE g.capture_sequence=?1")?;
    let rows = stmt
        .query_map([sequence], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter()
        .map(|(id, payload)| {
            let value: Value = serde_json::from_str(&payload)?;
            Ok((id, field(&value, "name").to_owned()))
        })
        .collect()
}
fn labels(person: &Value, names: &HashMap<String, String>) -> Vec<String> {
    array(person, "memberships")
        .iter()
        .filter_map(|x| {
            x.pointer("/contactGroupMembership/contactGroupResourceName")
                .and_then(Value::as_str)
        })
        .map(|id| names.get(id).cloned().unwrap_or_else(|| id.to_owned()))
        .collect()
}

pub fn csv_bytes(db: &Connection, sequence: i64) -> Result<Vec<u8>> {
    let rows = rows(db, sequence)?;
    let names = group_names(db, sequence)?;
    let max_email = rows
        .iter()
        .map(|(_, v)| array(v, "emailAddresses").len())
        .max()
        .unwrap_or(0);
    let max_phone = rows
        .iter()
        .map(|(_, v)| array(v, "phoneNumbers").len())
        .max()
        .unwrap_or(0);
    let max_address = rows
        .iter()
        .map(|(_, v)| array(v, "addresses").len())
        .max()
        .unwrap_or(0);
    let mut header = vec![
        "First Name".to_string(),
        "Middle Name".into(),
        "Last Name".into(),
        "Name Prefix".into(),
        "Name Suffix".into(),
        "Nickname".into(),
        "Birthday".into(),
        "Notes".into(),
        "Organisation name".into(),
        "Organisation title".into(),
        "Labels".into(),
    ];
    for i in 1..=max_email {
        header.extend([format!("Email {i} - Label"), format!("Email {i} - Value")]);
    }
    for i in 1..=max_phone {
        header.extend([format!("Phone {i} - Label"), format!("Phone {i} - Value")]);
    }
    for i in 1..=max_address {
        for part in [
            "Label",
            "Street",
            "Extended address",
            "City",
            "Region",
            "Postcode",
            "Country",
            "PO box",
        ] {
            header.push(format!("Address {i} - {part}"));
        }
    }
    let mut writer = csv::WriterBuilder::new()
        .terminator(csv::Terminator::CRLF)
        .from_writer(vec![]);
    writer.write_record(&header)?;
    for (_, person) in rows {
        let n = first(&person, "names");
        let o = first(&person, "organizations");
        let mut record = vec![
            n.map(|x| field(x, "givenName")).unwrap_or("").into(),
            n.map(|x| field(x, "middleName")).unwrap_or("").into(),
            n.map(|x| field(x, "familyName")).unwrap_or("").into(),
            n.map(|x| field(x, "honorificPrefix")).unwrap_or("").into(),
            n.map(|x| field(x, "honorificSuffix")).unwrap_or("").into(),
            first(&person, "nicknames")
                .map(|x| field(x, "value"))
                .unwrap_or("")
                .into(),
            first(&person, "birthdays")
                .map(join_date)
                .unwrap_or_default(),
            array(&person, "biographies")
                .iter()
                .map(|x| field(x, "value"))
                .collect::<Vec<_>>()
                .join("\n"),
            o.map(|x| field(x, "name")).unwrap_or("").into(),
            o.map(|x| field(x, "title")).unwrap_or("").into(),
            labels(&person, &names).join(" ::: "),
        ];
        for i in 0..max_email {
            let value = array(&person, "emailAddresses").get(i);
            record.push(value.map(label).unwrap_or("").into());
            record.push(value.map(|x| field(x, "value")).unwrap_or("").into());
        }
        for i in 0..max_phone {
            let value = array(&person, "phoneNumbers").get(i);
            record.push(value.map(label).unwrap_or("").into());
            record.push(value.map(|x| field(x, "value")).unwrap_or("").into());
        }
        for i in 0..max_address {
            let value = array(&person, "addresses").get(i);
            for key in [
                "label",
                "streetAddress",
                "extendedAddress",
                "city",
                "region",
                "postalCode",
                "country",
                "poBox",
            ] {
                record.push(
                    value
                        .map(|x| {
                            if key == "label" {
                                label(x)
                            } else {
                                field(x, key)
                            }
                        })
                        .unwrap_or("")
                        .into(),
                );
            }
        }
        writer.write_record(&record)?;
    }
    Ok(writer.into_inner()?)
}

fn escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}
fn fold(line: &str, out: &mut String) {
    let mut width = 0;
    for ch in line.chars() {
        let bytes = ch.len_utf8();
        if width + bytes > 75 {
            out.push_str("\r\n ");
            width = 1;
        }
        out.push(ch);
        width += bytes;
    }
    out.push_str("\r\n");
}
fn property(name: &str, value: &str, out: &mut String) {
    if !value.is_empty() {
        fold(&format!("{name}:{}", escape(value)), out);
    }
}
fn type_param(value: &Value) -> String {
    let label = label(value);
    let sanitized: String = label
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect();
    if sanitized.is_empty() {
        String::new()
    } else {
        format!(";TYPE={sanitized}")
    }
}

fn photo(
    db: &Connection,
    store: &Store,
    account: &Account,
    sequence: i64,
    id: &str,
) -> Result<Option<(String, Vec<u8>)>> {
    let mut stmt=db.prepare("SELECT o.status,COALESCE(o.sha256,j.sha256),m.mime FROM captures c JOIN observation_media o ON o.run_id=c.run_id LEFT JOIN media_jobs j ON j.run_id=o.run_id AND j.resource_name=o.resource_name AND j.source_url=o.source_url AND j.status='available' LEFT JOIN media_objects m ON m.sha256=COALESCE(o.sha256,j.sha256) WHERE c.sequence=?1 AND o.resource_name=?2 ORDER BY o.source_url")?;
    let rows = stmt
        .query_map(params![sequence, id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for (status, hash, mime) in rows {
        if (status == "failed" || status == "pending") && hash.is_none() {
            bail!("historical photo is unavailable for {id}");
        }
        if let (Some(hash), Some(mime)) = (hash, mime) {
            let ext = match mime.as_str() {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/gif" => "gif",
                "image/webp" => "webp",
                _ => bail!("unsupported photo format"),
            };
            let bytes = fs::read(
                store
                    .account_dir(&account.id)?
                    .join("media")
                    .join(format!("{hash}.{ext}")),
            )?;
            let actual = format!("{:x}", sha2::Sha256::digest(&bytes));
            if actual != hash {
                bail!("historical photo hash mismatch");
            }
            if mime == "image/webp" {
                let image = image::load_from_memory(&bytes)?;
                let mut png = std::io::Cursor::new(Vec::new());
                image.write_to(&mut png, image::ImageFormat::Png)?;
                return Ok(Some(("PNG".into(), png.into_inner())));
            }
            return Ok(Some((
                match mime.as_str() {
                    "image/jpeg" => "JPEG",
                    "image/png" => "PNG",
                    _ => "GIF",
                }
                .into(),
                bytes,
            )));
        }
    }
    Ok(None)
}

pub fn vcard_bytes(
    db: &Connection,
    store: &Store,
    account: &Account,
    sequence: i64,
) -> Result<Vec<u8>> {
    let mut out = String::new();
    let names = group_names(db, sequence)?;
    for (id, person) in rows(db, sequence)? {
        fold("BEGIN:VCARD", &mut out);
        fold("VERSION:3.0", &mut out);
        let n = first(&person, "names");
        let display = n
            .map(|x| field(x, "displayName"))
            .filter(|x| !x.is_empty())
            .unwrap_or("Unnamed contact");
        property("FN", display, &mut out);
        let part = |key| n.map(|x| escape(field(x, key))).unwrap_or_default();
        fold(
            &format!(
                "N:{};{};{};{};{}",
                part("familyName"),
                part("givenName"),
                part("middleName"),
                part("honorificPrefix"),
                part("honorificSuffix")
            ),
            &mut out,
        );
        for item in array(&person, "emailAddresses") {
            property(
                &format!("EMAIL{}", type_param(item)),
                field(item, "value"),
                &mut out,
            );
        }
        for item in array(&person, "phoneNumbers") {
            property(
                &format!("TEL{}", type_param(item)),
                field(item, "value"),
                &mut out,
            );
        }
        for item in array(&person, "addresses") {
            let p = |key| escape(field(item, key));
            fold(
                &format!(
                    "ADR{}:{};{};{};{};{};{};{}",
                    type_param(item),
                    p("poBox"),
                    p("extendedAddress"),
                    p("streetAddress"),
                    p("city"),
                    p("region"),
                    p("postalCode"),
                    p("country")
                ),
                &mut out,
            );
        }
        for item in array(&person, "organizations") {
            property("ORG", field(item, "name"), &mut out);
            property("TITLE", field(item, "title"), &mut out);
        }
        for item in array(&person, "urls") {
            property("URL", field(item, "value"), &mut out);
        }
        for item in array(&person, "biographies") {
            property("NOTE", field(item, "value"), &mut out);
        }
        if let Some(birthday) = first(&person, "birthdays") {
            property("BDAY", &join_date(birthday), &mut out);
        }
        let categories = labels(&person, &names);
        if !categories.is_empty() {
            fold(
                &format!(
                    "CATEGORIES:{}",
                    categories
                        .iter()
                        .map(|x| escape(x))
                        .collect::<Vec<_>>()
                        .join(",")
                ),
                &mut out,
            );
        }
        if let Some((format, bytes)) = photo(db, store, account, sequence, &id)? {
            fold(
                &format!("PHOTO;ENCODING=b;TYPE={format}:{}", STANDARD.encode(bytes)),
                &mut out,
            );
        }
        fold("END:VCARD", &mut out);
    }
    Ok(out.into_bytes())
}

pub fn write_export(
    store: &Store,
    account: &Account,
    sequence: i64,
    format: &str,
    destination: &Path,
) -> Result<()> {
    if destination.exists() {
        bail!("export destination already exists");
    }
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let bytes = match format {
        "csv" => csv_bytes(&db, sequence)?,
        "vcf" => vcard_bytes(&db, store, account, sequence)?,
        _ => bail!("unsupported export format"),
    };
    let temp = destination.with_extension(format!("{}.partial", Uuid::new_v4()));
    fs::write(&temp, bytes)?;
    fs::rename(temp, destination)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::capture::{self, Scan};
    use serde_json::json;

    #[test]
    fn repeated_values_and_unicode_serialize() {
        let temp = tempfile::tempdir().unwrap();
        let store = Store::new(temp.path().to_path_buf()).unwrap();
        let account = store.add_account("sub", "unicode@example.test").unwrap();
        let capture=capture::publish(&store,&account,Scan {
            contacts:vec![json!({"resourceName":"people/1","names":[{"displayName":"Zoë Example","givenName":"Zoë","familyName":"Example"}],"emailAddresses":[{"value":"one@example.test","type":"home"},{"value":"two@example.test","type":"work"}],"biographies":[{"value":"Line one\nLine two"}],"memberships":[{"contactGroupMembership":{"contactGroupResourceName":"contactGroups/friends"}}]})],
            groups:vec![json!({"resourceName":"contactGroups/friends","name":"Friends"})],next_sync_token:None,full_sync_at:None,media:vec![]
        },"fixture").unwrap();
        let db = store.open_db(&account.id).unwrap();
        let csv = String::from_utf8(csv_bytes(&db, capture.sequence).unwrap()).unwrap();
        assert!(csv.contains("Email 2 - Value"));
        assert!(csv.contains("two@example.test"));
        assert!(csv.contains("Friends"));
        let vcard =
            String::from_utf8(vcard_bytes(&db, &store, &account, capture.sequence).unwrap())
                .unwrap();
        assert!(vcard.contains("FN:Zoë Example\r\n"));
        assert!(vcard.contains("NOTE:Line one\\nLine two"));
        assert!(vcard.contains("CATEGORIES:Friends"));
        assert!(vcard.contains("EMAIL;TYPE=work:two@example.test"));
    }
}
