CREATE TABLE account_metadata (
  id INTEGER PRIMARY KEY CHECK(id=1), provider_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version=1)
);
CREATE TABLE capture_runs (
  id TEXT PRIMARY KEY, trigger TEXT NOT NULL, started_at TEXT NOT NULL,
  ended_at TEXT, result TEXT NOT NULL CHECK(result IN ('running','success','failed')),
  error TEXT, coverage TEXT NOT NULL
);
CREATE TABLE captures (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL UNIQUE REFERENCES capture_runs(id),
  started_at TEXT NOT NULL, committed_at TEXT NOT NULL, contact_count INTEGER NOT NULL,
  group_count INTEGER NOT NULL, coverage TEXT NOT NULL, media_complete INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE contact_identities (
  id INTEGER PRIMARY KEY, resource_name TEXT NOT NULL UNIQUE
);
CREATE TABLE contact_revisions (
  id INTEGER PRIMARY KEY, contact_id INTEGER NOT NULL REFERENCES contact_identities(id),
  version INTEGER NOT NULL CHECK(version>0), kind TEXT NOT NULL CHECK(kind IN ('present','deleted')),
  semantic_json TEXT NOT NULL, first_capture INTEGER NOT NULL REFERENCES captures(sequence),
  UNIQUE(contact_id,version)
);
CREATE TABLE raw_observations (
  run_id TEXT NOT NULL REFERENCES capture_runs(id), resource_name TEXT NOT NULL,
  payload TEXT NOT NULL, PRIMARY KEY(run_id,resource_name)
);
CREATE TABLE capture_contacts (
  capture_sequence INTEGER NOT NULL REFERENCES captures(sequence),
  contact_id INTEGER NOT NULL REFERENCES contact_identities(id),
  revision_id INTEGER NOT NULL REFERENCES contact_revisions(id),
  PRIMARY KEY(capture_sequence,contact_id)
);
CREATE INDEX capture_contacts_revision ON capture_contacts(revision_id);
CREATE TABLE group_revisions (
  id INTEGER PRIMARY KEY, resource_name TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
  payload TEXT NOT NULL, first_capture INTEGER NOT NULL REFERENCES captures(sequence),
  UNIQUE(resource_name,version)
);
CREATE TABLE capture_groups (
  capture_sequence INTEGER NOT NULL REFERENCES captures(sequence),
  resource_name TEXT NOT NULL, revision_id INTEGER NOT NULL REFERENCES group_revisions(id),
  PRIMARY KEY(capture_sequence,resource_name)
);
CREATE TABLE current_contacts (
  contact_id INTEGER PRIMARY KEY REFERENCES contact_identities(id), display_name TEXT NOT NULL,
  search_text TEXT NOT NULL, revision_id INTEGER NOT NULL REFERENCES contact_revisions(id)
);
CREATE INDEX current_contacts_name ON current_contacts(display_name);
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, full_sync_at TEXT, coverage TEXT NOT NULL,
  capture_sequence INTEGER NOT NULL REFERENCES captures(sequence)
);
CREATE TABLE media_objects (
  sha256 TEXT PRIMARY KEY, mime TEXT NOT NULL, byte_length INTEGER NOT NULL,
  retrieved_at TEXT NOT NULL
);
CREATE TABLE observation_media (
  run_id TEXT NOT NULL REFERENCES capture_runs(id), resource_name TEXT NOT NULL,
  source_url TEXT NOT NULL, sha256 TEXT REFERENCES media_objects(sha256),
  status TEXT NOT NULL CHECK(status IN ('available','pending','failed','generated')),
  PRIMARY KEY(run_id,resource_name,source_url)
);
CREATE TABLE media_jobs (
  id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES capture_runs(id),
  resource_name TEXT NOT NULL, source_url TEXT NOT NULL, status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0, next_retry_at TEXT,
  sha256 TEXT REFERENCES media_objects(sha256), completed_at TEXT
);
