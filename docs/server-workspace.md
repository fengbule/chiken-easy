# Server Workspace

## Overview

The server workspace consolidates machine operations around:

- assets
- credentials
- SSH profiles
- SFTP
- scripts
- batch command runs

## Assets

Asset API:

- `GET /api/assets`
- `POST /api/assets`
- `PUT /api/assets/:id`
- `DELETE /api/assets/:id`

Current asset fields include:

- `agentId`
- `displayName`
- `host`
- `ip`
- `port`
- `username`
- `authType`
- `credentialId`
- `group`
- `tags`
- `provider`
- `region`
- `expireAt`
- `price`
- `bandwidthLimit`
- `note`
- `jumpHost`
- public display metadata

## Credentials

Credential API:

- `GET /api/credentials`
- `POST /api/credentials`
- `POST /api/credentials/:id/test`
- `DELETE /api/credentials/:id`

Behavior:

- password and private-key modes are supported
- values are not returned in plaintext
- revocation is soft-state and audited
- successful test/use actions are audited

## SSH and SFTP

SSH profile API:

- `GET /api/agents/:id/ssh-profile`
- `PUT /api/agents/:id/ssh-profile`
- `POST /api/agents/:id/ssh-profile/test`
- `POST /api/agents/:id/ssh`
- `WebSocket /terminal`

SFTP API:

- `GET /api/agents/:id/sftp`
- `POST /api/agents/:id/sftp/upload`
- `GET /api/agents/:id/sftp/download`
- `DELETE /api/agents/:id/sftp`
- `POST /api/agents/:id/sftp/mkdir`
- `POST /api/agents/:id/sftp/rename`
- `POST /api/sftp/transfer`

The admin UI uses a dual-pane SFTP workspace. Each pane has its own Agent selector, path bar, scrollable directory listing, upload/new-folder actions, and per-file transfer buttons. Transfers stream the file through the controller and are limited by `CHIKEN_SFTP_TRANSFER_MAX_MB` (default 64 MB).

Backup and migration API:

- `GET /api/backups/download`
- `POST /api/backups/restore`

The backup download returns a gzip-compressed JSON package containing migratable `data/` runtime files. It intentionally excludes `.env`, `.local`, private keys, `node_modules`, `dist`, and rotating `data/backups/` snapshots. Restore validates the package, writes a pre-restore snapshot under `data/backups/`, restores the packaged files, reloads state, and writes an audit record.

Migration checklist:

1. deploy the same or newer `chiken-easy` version on the new server
2. set `CHIKEN_MASTER_KEY` to the same value as the old server if encrypted secrets must remain usable
3. open `终端 / SFTP`
4. click `下载备份压缩包` on the old server
5. upload that `.json.gz` package with `上传备份并恢复` on the new server
6. restart the service if container/environment variables changed

## Scripts and Batch Commands

Script API:

- `GET /api/scripts`
- `POST /api/scripts`
- `PUT /api/scripts/:id`
- `DELETE /api/scripts/:id`
- `POST /api/scripts/:id/run`
- `POST /api/scripts/run-batch`
- `GET /api/command-runs`

Current batch execution supports:

- multiple agents
- command text or saved script
- concurrency limit
- timeout
- per-agent result storage

## Real Acceptance Notes

Real validation completed against three servers:

- SSH profile test passed
- remote commands `pwd`, `uname -a`, `docker ps` executed
- SFTP list/upload/download/delete worked
- SFTP dual-pane transfer workflow is available
- panel backup download and restore endpoints are available
- script library stored an `uptime` script
- batch `uptime` ran successfully against all three agents
