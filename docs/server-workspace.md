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
- script library stored an `uptime` script
- batch `uptime` ran successfully against all three agents
