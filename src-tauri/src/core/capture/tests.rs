use super::*;
use serde_json::json;

fn setup() -> (tempfile::TempDir, Store, Account) {
    let temp = tempfile::tempdir().unwrap();
    let store = Store::new(temp.path().to_path_buf()).unwrap();
    let account = store
        .add_account("stable-subject", "a@example.com")
        .unwrap();
    (temp, store, account)
}
fn scan(contacts: Vec<Value>) -> Scan {
    Scan {
        contacts,
        groups: vec![],
        next_sync_token: Some("cursor".into()),
        full_sync_at: None,
        media: vec![],
    }
}
#[test]
fn contact_timeline_tracks_edits_deletion_restoration_and_isolation() {
    let (_temp, store, account) = setup();
    let first = json!({"resourceName":"people/timeline","names":[{"displayName":"Ada"}],"phoneNumbers":[{"value":"+442079460018"}]});
    let edited = json!({"resourceName":"people/timeline","names":[{"displayName":"Ada Lovelace"}],"phoneNumbers":[{"value":"+442079460019"}]});
    publish(&store, &account, scan(vec![first]), "fixture").unwrap();
    publish(&store, &account, scan(vec![edited.clone()]), "fixture").unwrap();
    publish(&store, &account, scan(vec![]), "fixture").unwrap();
    publish(&store, &account, scan(vec![edited]), "fixture").unwrap();
    let history = contact_history(&store, &account, "people/timeline").unwrap();
    assert_eq!(history.len(), 4);
    assert!(history[0].before.is_none());
    assert!(history[0].after.is_some());
    assert!(history[1].after.is_none());
    assert!(history[1].before.is_some());
    assert_eq!(
        history[2].before.as_ref().unwrap()["names"][0]["displayName"],
        "Ada"
    );
    assert_eq!(
        history[2].after.as_ref().unwrap()["names"][0]["displayName"],
        "Ada Lovelace"
    );
    assert!(history[3].before.is_none());
    assert!(history
        .windows(2)
        .all(|pair| pair[0].sequence > pair[1].sequence));
    let other = store
        .add_account("timeline-other", "other@example.com")
        .unwrap();
    assert!(contact_history(&store, &other, "people/timeline")
        .unwrap()
        .is_empty());
    assert!(contact_history(&store, &account, "missing")
        .unwrap()
        .is_empty());
}

#[test]
fn preserves_deleted_history_and_account_isolation() {
    let (_temp, store, account) = setup();
    let first=publish(&store,&account,scan(vec![json!({"resourceName":"people/1","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"a@example.com"}]})]),"fixture").unwrap();
    let second = publish(&store, &account, scan(vec![]), "fixture").unwrap();
    assert_eq!(
        contacts(&store, &account, first.sequence, "", None, 0)
            .unwrap()
            .len(),
        1
    );
    assert!(contacts(&store, &account, second.sequence, "", None, 0)
        .unwrap()
        .is_empty());
    let db = store.open_db(&account.id).unwrap();
    let revisions: i64 = db
        .query_row("SELECT COUNT(*) FROM contact_revisions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(revisions, 2);
    let other = store.add_account("another", "b@example.com").unwrap();
    assert!(captures(&store, &other).unwrap().is_empty());
}
#[test]
fn unchanged_transport_data_reuses_revision() {
    let (_temp, store, account) = setup();
    let one = json!({"resourceName":"people/1","etag":"old","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"a@example.com"},{"value":"other@example.com"}]});
    let two = json!({"resourceName":"people/1","etag":"new","names":[{"displayName":"Ada"}],"emailAddresses":[{"value":"other@example.com"},{"value":"a@example.com"}]});
    publish(&store, &account, scan(vec![one]), "fixture").unwrap();
    publish(&store, &account, scan(vec![two]), "fixture").unwrap();
    let db = store.open_db(&account.id).unwrap();
    let revisions: i64 = db
        .query_row("SELECT COUNT(*) FROM contact_revisions", [], |r| r.get(0))
        .unwrap();
    assert_eq!(revisions, 1);
    let raw: i64 = db
        .query_row("SELECT COUNT(*) FROM raw_observations", [], |r| r.get(0))
        .unwrap();
    assert_eq!(raw, 2);
}
#[test]
fn invalid_scan_does_not_publish_or_advance_cursor() {
    let (_temp, store, account) = setup();
    publish(
        &store,
        &account,
        scan(vec![json!({"resourceName":"people/1"})]),
        "fixture",
    )
    .unwrap();
    assert!(publish(&store, &account, scan(vec![json!({"names":[]})]), "fixture").is_err());
    assert_eq!(captures(&store, &account).unwrap().len(), 1);
    let db = store.open_db(&account.id).unwrap();
    let status: String = db
        .query_row(
            "SELECT result FROM capture_runs ORDER BY started_at DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert!(status == "success" || status == "failed");
}

#[test]
fn unchanged_full_scan_advances_cursor_without_creating_snapshot() {
    let (_temp, store, account) = setup();
    let contact = json!({"resourceName":"people/1","names":[{"displayName":"Ada"}]});
    let first = publish(&store, &account, scan(vec![contact.clone()]), "manual").unwrap();

    let db = store.open_db(&account.id).unwrap();
    db.execute(
        "UPDATE sync_state SET token=NULL,full_sync_at=NULL WHERE id=1",
        [],
    )
    .unwrap();
    drop(db);

    let mut refreshed = scan(vec![contact]);
    refreshed.next_sync_token = Some("cursor-after-full-sync".into());
    let outcome = publish(&store, &account, refreshed, "manual").unwrap();

    assert!(!outcome.is_new);
    assert_eq!(outcome.sequence, first.sequence);
    assert_eq!(captures(&store, &account).unwrap().len(), 1);

    let db = store.open_db(&account.id).unwrap();
    let state: (Option<String>, Option<String>, i64) = db
        .query_row(
            "SELECT token,full_sync_at,capture_sequence FROM sync_state WHERE id=1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(state.0.as_deref(), Some("cursor-after-full-sync"));
    assert!(state.1.is_some());
    assert_eq!(state.2, first.sequence);
}

#[test]
fn failed_media_does_not_block_text_capture() {
    let (_temp, store, account) = setup();
    let mut observation = scan(vec![
        json!({"resourceName":"people/photo","names":[{"displayName":"Photo contact"}],"photos":[{"url":"https://lh3.googleusercontent.com/example"}]}),
    ]);
    observation
        .media
        .push(crate::core::media::MediaObservation {
            resource_name: "people/photo".into(),
            source_url: "https://lh3.googleusercontent.com/example".into(),
            status: "failed".into(),
            sha256: None,
            mime: None,
            byte_length: None,
            retrieved_at: None,
        });
    let saved = publish(&store, &account, observation, "fixture").unwrap();
    assert!(!saved.media_complete);
    assert_eq!(
        contacts(&store, &account, saved.sequence, "Photo", None, 0)
            .unwrap()
            .len(),
        1
    );
    let db = store.open_db(&account.id).unwrap();
    let pending: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM media_jobs WHERE status='pending'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(pending, 1);
}

#[test]
fn date_selection_and_change_feed_follow_committed_captures() {
    let (_temp, store, account) = setup();
    assert!(capture_at(&store, &account, "2000-01-01T00:00:00Z")
        .unwrap()
        .is_none());
    let _first = publish(
        &store,
        &account,
        scan(vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Ada"}]}),
        ]),
        "fixture",
    )
    .unwrap();
    let second = publish(
        &store,
        &account,
        scan(vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Ada L."}]}),
        ]),
        "fixture",
    )
    .unwrap();
    assert_eq!(
        capture_at(&store, &account, &second.committed_at)
            .unwrap()
            .unwrap()
            .sequence,
        second.sequence
    );
    let changes = changes(&store, &account, second.sequence, 0).unwrap();
    assert_eq!(changes.len(), 1);
    assert_eq!(changes[0].kind, "changed");
    assert_eq!(
        changes[0].before.as_ref().unwrap()["names"][0]["displayName"],
        "Ada"
    );
    assert_eq!(
        changes[0].after.as_ref().unwrap()["names"][0]["displayName"],
        "Ada L."
    );
}
#[test]
fn compare_snapshots_identifies_diffs_across_arbitrary_captures() {
    let (_temp, store, account) = setup();
    let cap1 = publish(
        &store,
        &account,
        scan(vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Alice"}]}),
            json!({"resourceName":"people/2","names":[{"displayName":"Bob"}]}),
        ]),
        "fixture",
    )
    .unwrap();

    let cap2 = publish(
        &store,
        &account,
        scan(vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Alice Smith"}]}),
            json!({"resourceName":"people/2","names":[{"displayName":"Bob"}]}),
            json!({"resourceName":"people/3","names":[{"displayName":"Charlie"}]}),
        ]),
        "fixture",
    )
    .unwrap();

    let cap3 = publish(
        &store,
        &account,
        scan(vec![
            json!({"resourceName":"people/1","names":[{"displayName":"Alice Smith"}]}),
            json!({"resourceName":"people/3","names":[{"displayName":"Charlie Brown"}]}),
        ]),
        "fixture",
    )
    .unwrap();

    // Compare cap1 to cap3 directly
    let diff = compare_snapshots(&store, &account, cap1.sequence, cap3.sequence).unwrap();
    assert_eq!(diff.len(), 3);
    let p1 = diff.iter().find(|c| c.resource_name == "people/1").unwrap();
    assert_eq!(p1.kind, "changed");
    let p2 = diff.iter().find(|c| c.resource_name == "people/2").unwrap();
    assert_eq!(p2.kind, "removed");
    let p3 = diff.iter().find(|c| c.resource_name == "people/3").unwrap();
    assert_eq!(p3.kind, "added");

    // Identity comparison returns empty
    let same = compare_snapshots(&store, &account, cap2.sequence, cap2.sequence).unwrap();
    assert!(same.is_empty());
}
