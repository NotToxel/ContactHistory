use crate::core::capture::Scan;
use anyhow::{Context, Result};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::path::Path;

pub fn parse_csv(path: &Path) -> Result<Scan> {
    let file = File::open(path).with_context(|| format!("failed to open CSV at {}", path.display()))?;
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(true)
        .from_reader(file);

    let headers = rdr.headers()?.clone();
    let header_map: HashMap<String, usize> = headers
        .iter()
        .enumerate()
        .map(|(i, h)| (h.trim().to_lowercase(), i))
        .collect();

    let mut contacts: Vec<Value> = Vec::new();
    let mut group_names: BTreeMap<String, String> = BTreeMap::new();

    for result in rdr.records() {
        let record = result?;
        let get = |name: &str| -> &str {
            header_map
                .get(&name.to_lowercase())
                .and_then(|&idx| record.get(idx))
                .unwrap_or("")
                .trim()
        };

        // Extract Names
        let first_name = get("First Name");
        let middle_name = get("Middle Name");
        let last_name = get("Last Name");
        let prefix = get("Name Prefix");
        let suffix = get("Name Suffix");
        let given_name = if !first_name.is_empty() {
            first_name
        } else {
            get("Given Name")
        };
        let family_name = if !last_name.is_empty() {
            last_name
        } else {
            get("Family Name")
        };

        let mut display_name = get("Name").to_string();
        if display_name.is_empty() {
            display_name = [prefix, given_name, middle_name, family_name, suffix]
                .iter()
                .filter(|s| !s.is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join(" ");
        }

        let nickname = get("Nickname");
        let birthday = get("Birthday");
        let notes = get("Notes");
        let org_name = get("Organisation name");
        let org_title = get("Organisation title");
        let org_name_alt = if org_name.is_empty() {
            get("Organization Name")
        } else {
            org_name
        };
        let org_title_alt = if org_title.is_empty() {
            get("Organization Title")
        } else {
            org_title
        };

        // Extract Emails (Email 1 - Value, Email 2 - Value, etc.)
        let mut emails: Vec<Value> = Vec::new();
        for (h, &idx) in &header_map {
            if h.contains("email") && h.contains("value") {
                if let Some(val) = record.get(idx).map(str::trim).filter(|s| !s.is_empty()) {
                    let label_col = h.replace("value", "label").replace("type", "label");
                    let email_type = header_map
                        .get(&label_col)
                        .and_then(|&l_idx| record.get(l_idx))
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or("Home");
                    emails.push(json!({
                        "value": val,
                        "type": email_type,
                        "formattedType": email_type
                    }));
                }
            }
        }
        if emails.is_empty() {
            for col in &["e-mail 1 - value", "email", "e-mail address", "email address"] {
                if let Some(&idx) = header_map.get(*col) {
                    if let Some(val) = record.get(idx).map(str::trim).filter(|s| !s.is_empty()) {
                        emails.push(json!({
                            "value": val,
                            "type": "Home",
                            "formattedType": "Home"
                        }));
                        break;
                    }
                }
            }
        }

        // Extract Phones (Phone 1 - Value, Phone 2 - Value, etc.)
        let mut phones: Vec<Value> = Vec::new();
        for (h, &idx) in &header_map {
            if h.contains("phone") && h.contains("value") {
                if let Some(val) = record.get(idx).map(str::trim).filter(|s| !s.is_empty()) {
                    let label_col = h.replace("value", "label").replace("type", "label");
                    let phone_type = header_map
                        .get(&label_col)
                        .and_then(|&l_idx| record.get(l_idx))
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .unwrap_or("Mobile");
                    phones.push(json!({
                        "value": val,
                        "type": phone_type,
                        "formattedType": phone_type
                    }));
                }
            }
        }
        if phones.is_empty() {
            for col in &["phone", "mobile phone", "telephone", "phone number"] {
                if let Some(&idx) = header_map.get(*col) {
                    if let Some(val) = record.get(idx).map(str::trim).filter(|s| !s.is_empty()) {
                        phones.push(json!({
                            "value": val,
                            "type": "Mobile",
                            "formattedType": "Mobile"
                        }));
                        break;
                    }
                }
            }
        }

        // Extract Addresses (Address 1 - Street, City, Region, etc.)
        let mut addresses: Vec<Value> = Vec::new();
        for i in 1..=5 {
            let street = get(&format!("Address {i} - Street"));
            let city = get(&format!("Address {i} - City"));
            let region = get(&format!("Address {i} - Region"));
            let postcode = get(&format!("Address {i} - Postcode"));
            let country = get(&format!("Address {i} - Country"));
            let addr_type = get(&format!("Address {i} - Label"));
            if !street.is_empty() || !city.is_empty() || !postcode.is_empty() {
                let formatted = [street, city, region, postcode, country]
                    .iter()
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .collect::<Vec<_>>()
                    .join(", ");
                addresses.push(json!({
                    "formattedValue": formatted,
                    "streetAddress": street,
                    "city": city,
                    "region": region,
                    "postalCode": postcode,
                    "country": country,
                    "type": if addr_type.is_empty() { "Home" } else { addr_type }
                }));
            }
        }

        // Extract Labels / Memberships
        let raw_labels = get("Labels");
        let mut memberships: Vec<Value> = Vec::new();
        if !raw_labels.is_empty() {
            for raw_lbl in raw_labels.split(":::") {
                let lbl = raw_lbl.trim();
                if !lbl.is_empty() {
                    let mut hasher = Sha256::new();
                    hasher.update(lbl.as_bytes());
                    let res_name = format!("contactGroups/imported_{}", hex_prefix(&hasher.finalize(), 8));
                    group_names.insert(res_name.clone(), lbl.to_string());
                    memberships.push(json!({
                        "contactGroupMembership": {
                            "contactGroupResourceName": res_name
                        }
                    }));
                }
            }
        }

        // Check if row has any identity or data
        let primary_email = emails.first().and_then(|v| v["value"].as_str()).unwrap_or("");
        let primary_phone = phones.first().and_then(|v| v["value"].as_str()).unwrap_or("");
        if display_name.is_empty() && primary_email.is_empty() && primary_phone.is_empty() {
            continue;
        }

        // Deterministic resourceName
        let mut hasher = Sha256::new();
        if !primary_email.is_empty() {
            hasher.update(b"email:");
            hasher.update(primary_email.to_lowercase().as_bytes());
        } else if !primary_phone.is_empty() {
            hasher.update(b"phone:");
            hasher.update(primary_phone.as_bytes());
        } else {
            hasher.update(b"name:");
            hasher.update(display_name.to_lowercase().as_bytes());
        }
        let resource_name = format!("people/csv_{}", hex_prefix(&hasher.finalize(), 12));

        let mut person = json!({
            "resourceName": resource_name,
            "etag": "csv_import"
        });

        if !display_name.is_empty() || !given_name.is_empty() || !family_name.is_empty() {
            person["names"] = json!([{
                "displayName": if !display_name.is_empty() { display_name.clone() } else { "Unnamed".into() },
                "givenName": given_name,
                "middleName": middle_name,
                "familyName": family_name,
                "honorificPrefix": prefix,
                "honorificSuffix": suffix
            }]);
        }
        if !nickname.is_empty() {
            person["nicknames"] = json!([{ "value": nickname }]);
        }
        if !birthday.is_empty() {
            person["birthdays"] = json!([{ "text": birthday }]);
        }
        if !notes.is_empty() {
            person["biographies"] = json!([{ "value": notes, "contentType": "TEXT_PLAIN" }]);
        }
        if !org_name_alt.is_empty() || !org_title_alt.is_empty() {
            person["organizations"] = json!([{
                "name": org_name_alt,
                "title": org_title_alt
            }]);
        }
        if !emails.is_empty() {
            person["emailAddresses"] = json!(emails);
        }
        if !phones.is_empty() {
            person["phoneNumbers"] = json!(phones);
        }
        if !addresses.is_empty() {
            person["addresses"] = json!(addresses);
        }
        if !memberships.is_empty() {
            person["memberships"] = json!(memberships);
        }

        contacts.push(person);
    }

    let mut groups: Vec<Value> = Vec::new();
    for (res, name) in group_names {
        groups.push(json!({
            "resourceName": res,
            "name": name,
            "groupType": "USER_CONTACT_GROUP"
        }));
    }

    Ok(Scan {
        contacts,
        groups,
        media: vec![],
        next_sync_token: None,
        full_sync_at: None,
    })
}

fn hex_prefix(bytes: &[u8], len: usize) -> String {
    bytes
        .iter()
        .take(len)
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
}
