# Storage

## Modes

`chiken-easy` now supports two storage modes behind the same abstraction:

- `CHIKEN_STORAGE=json`
- `CHIKEN_STORAGE=sqlite`

The default remains:

```env
CHIKEN_STORAGE=json
```

## JSON Mode

`json` mode keeps the original compatibility model:

- primary state in `data/state.json`
- append-only audit log in `data/audit.jsonl`
- atomic state writes
- rotating backups under `data/backups/`

This mode remains the safest default for existing deployments.

## SQLite Mode

`sqlite` mode does **not** replace `state.json` yet. It adds a minimal event/history database for high-volume records while preserving the current state model.

Default SQLite path:

```env
CHIKEN_SQLITE_PATH=data/chiken.db
```

Current SQLite tables:

- `audit_logs`
- `probe_samples`
- `subscription_access_logs`
- `node_quality_history`

Current SQLite behavior:

- service starts with `CHIKEN_STORAGE=sqlite`
- `state.json` is still loaded and saved normally
- audit writes continue to `data/audit.jsonl` for compatibility and are also written into SQLite
- monitor probe samples are written into SQLite
- subscription access logs are written into SQLite
- node quality / proxy-check history is written into SQLite

## What Still Lives In `state.json`

These structures still use the JSON state file as the source of truth:

- agents
- assets
- credentials
- SSH profiles
- node profiles
- config versions
- forward rules
- memos and uploaded file metadata
- script library
- command runs
- subscription profiles and imported node definitions
- settings and auth state

## Backup And Rollback

The panel now exposes authenticated backup APIs:

- `GET /api/backups/download`
- `POST /api/backups/restore`

The download is a gzip-compressed JSON package (`*.json.gz`) with a manifest and base64 file payloads. It includes migratable runtime files under `data/`, such as:

- `data/state.json`
- `data/audit.jsonl`
- `data/chiken.db`, `data/chiken.db-wal`, and `data/chiken.db-shm` when SQLite mode is enabled
- `data/uploads/`
- `data/sing-box/`

The package intentionally excludes:

- `.env` and `.env.*`
- `.local/`
- private keys and external secrets
- `node_modules/`
- `dist/`
- rotating `data/backups/` snapshots

Before restore, the server writes a pre-restore package under `data/backups/`. Restore then validates every path, blocks directory traversal, writes files under `data/`, reloads state, and appends an audit record.

For a full new-server migration:

1. deploy the same or newer application version
2. set the same `CHIKEN_MASTER_KEY` if the old instance used encrypted credentials
3. start the server once so `data/` exists
4. upload the backup package via `POST /api/backups/restore` or the admin `终端 / SFTP` page
5. restart the container if environment variables changed
6. verify `/api/health`, Agent registration, subscriptions, memos, credentials, and SFTP profiles

To roll back from SQLite mode to JSON mode:

1. stop the service
2. set `CHIKEN_STORAGE=json`
3. keep `state.json` in place
4. start the service again

Because configuration state remains in `state.json`, rollback is low-risk.

## Current Limits

- SQLite is currently used for event/history workloads, not full application state
- no automatic migration of old monitor or proxy history from JSON into SQLite
- no cross-node DB replication or remote DB support
- the Node.js `node:sqlite` runtime is still marked experimental upstream, so keep regular file backups
