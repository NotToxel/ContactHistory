use super::GroupRow;
use crate::core::storage::{Account, Store};
use anyhow::Result;
use serde_json::Value;

// User-visible names are not identifiers: a custom label can have any name.
fn is_system_group(resource_name: &str, payload: &Value) -> bool {
    match payload.get("groupType").and_then(Value::as_str) {
        Some("SYSTEM_CONTACT_GROUP") => return true,
        Some("USER_CONTACT_GROUP") => return false,
        _ => {}
    }
    // Older archives may not contain groupType. Match protocol resource IDs only.
    let resource = resource_name.to_ascii_lowercase();
    if resource.starts_with("systemcontactgroups/") {
        return true;
    }
    matches!(
        resource.strip_prefix("contactgroups/"),
        Some(
            "mycontacts"
                | "starred"
                | "all"
                | "blocked"
                | "chatbuddies"
                | "coworkers"
                | "family"
                | "friends"
        )
    )
}

pub fn groups(store: &Store, account: &Account, sequence: i64) -> Result<Vec<GroupRow>> {
    let db = store.open_db(&account.id)?;
    store.verify(account, &db)?;
    let mut stmt = db.prepare(
        "SELECT g.resource_name, r.payload \
         FROM capture_groups g \
         JOIN group_revisions r ON r.id = g.revision_id \
         WHERE g.capture_sequence = ?1 \
         ORDER BY g.resource_name",
    )?;
    let rows = stmt.query_map([sequence], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (resource_name, payload_str) = row?;
        let payload: Value = serde_json::from_str(&payload_str)?;
        let name = payload
            .get("name")
            .and_then(Value::as_str)
            .or_else(|| payload.get("formattedName").and_then(Value::as_str))
            .unwrap_or(&resource_name)
            .to_string();

        if is_system_group(&resource_name, &payload) {
            continue;
        }

        let member_count = payload.get("memberCount").and_then(Value::as_i64);
        out.push(GroupRow {
            resource_name,
            name,
            member_count,
        });
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn custom_labels_are_never_classified_by_display_name() {
        for name in ["Friends", "family", "All Contacts", "Coworkers", "Starred"] {
            assert!(!is_system_group(
                "contactGroups/custom-id",
                &json!({"name": name})
            ));
            assert!(!is_system_group(
                "contactGroups/friends",
                &json!({"name": name, "groupType": "USER_CONTACT_GROUP"})
            ));
        }
    }

    #[test]
    fn system_metadata_and_legacy_resource_ids_are_supported() {
        assert!(is_system_group(
            "contactGroups/123",
            &json!({"name": "Family", "groupType": "SYSTEM_CONTACT_GROUP"})
        ));
        assert!(is_system_group("contactGroups/myContacts", &json!({})));
        assert!(is_system_group("systemContactGroups/starred", &json!({})));
        assert!(!is_system_group("imported/friends", &json!({})));
    }
}
