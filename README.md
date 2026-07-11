# chiken-easy

`chiken-easy` is a sing-box centered integrated operations panel built on the original Node.js + Express + WebSocket + React architecture of this repository. It keeps the existing control-plane shape and hardens it into a deployable stack that combines:

- Komari-style public probes, monitor summaries, history, and alerts
- Memos-style Markdown notes, attachments, and lightweight file workspace
- sublinkPro-style node pool, subscription output, and proxy quality scoring
- EasyNode-style assets, credentials, SSH, SFTP, scripts, and batch commands

## Positioning

This project is still one application:

- `server/index.js` is the control plane
- `agent/index.js` is the remote agent
- `web/src/App.jsx` remains the admin SPA entry
- JSON state is still the compatibility-first main storage path
- SQLite is now available as a minimal event/history backend

## Feature Overview

- dashboard and server inventory
- sing-box protocol wizard for `vmess-ws`, `vless-reality`, `trojan`, `hysteria2`, `shadowsocks`, `mixed`
- config versioning and rollback
- forward rules with `sing-box`, `realm`, and `gost`
- monitor summaries, public probes, history, and alert settings
- memos, files, attachments, and object linking
- node pool import/export and subscription tokens
- protocol-aware proxy-check MVP for `ss`, `http`, `socks`, `mixed`
- SSH terminal, dual-pane SFTP transfer, credentials, scripts, and batch runs
- one-click panel backup download and upload-based restore for server migration
- API token, session-cookie auth, audit logging, and secret redaction

## Quick Start

```bash
npm install
npm run check
```

On Windows PowerShell:

```powershell
npm.cmd run check
```

## Docker Deployment

Server host:

```bash
docker compose -f docker-compose.server.yml up -d --build
```

Agent host:

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

Compose validation commands:

```bash
docker compose -f docker-compose.server.yml config
docker compose -f docker-compose.agent.yml config
```

## Server And Agent Runtime

Server compose runs:

- control plane
- local agent
- local sing-box

Agent compose runs:

- remote agent
- remote sing-box

## Environment

Start from `.env.example`.

Important variables:

- `CHIKEN_REQUIRE_API_TOKEN=1`
- `CHIKEN_ALLOW_QUERY_TOKEN=0`
- `CHIKEN_MASTER_KEY=<long-random-secret>`
- `CHIKEN_STORAGE=json|sqlite`
- `CHIKEN_SQLITE_PATH=data/chiken.db`
- `CHIKEN_REALM_IMAGE=4points/realm:latest`
- `CHIKEN_GOST_IMAGE=gogost/gost:latest`
- `CHIKEN_PROXY_CHECK_URL=https://www.gstatic.com/generate_204`
- `CHIKEN_SFTP_TRANSFER_MAX_MB=64`
- `CHIKEN_BACKUP_MAX_MB=128`
- `CHIKEN_MONITOR_RAW_HOURS=24`
- `CHIKEN_MONITOR_AGG_DAYS=7`

## Security Guidance

- keep query token auth disabled unless strictly needed
- set `CHIKEN_MASTER_KEY` in production so secrets are encrypted at rest
- keep `.local/`, `mima.txt`, `.env*`, `*.pem`, `*.key`, `data/`, `node_modules/`, and `dist/` out of git
- rotate bootstrap and API tokens after provisioning
- terminate TLS in front of the panel if exposing it publicly

## Storage

- `CHIKEN_STORAGE=json` keeps `data/state.json` as the source of truth
- `CHIKEN_STORAGE=sqlite` keeps `state.json` for config state and adds SQLite for:
  - audit logs
  - probe samples
  - subscription access logs
  - node quality history
- `GET /api/backups/download` returns a gzip-compressed backup package for `data/`
- `POST /api/backups/restore` restores that package after creating a pre-restore snapshot

See [docs/storage.md](./docs/storage.md).

## SFTP And Migration

The admin `终端 / SFTP` page is a dual-pane file manager. Pick a source Agent on the left, a target Agent on the right, browse both sides visually, and click `传到右侧` or `传到左侧` on any file. Directory lists are scrollable so large folders do not stretch the page.

For migration:

1. click `下载备份压缩包`
2. deploy the new server with the same or newer code
3. set the same `CHIKEN_MASTER_KEY` if encrypted credentials must remain usable
4. upload the backup with `上传备份并恢复`
5. restart the container if environment variables changed

## Realm / GOST Images

Forwarding engines use configurable images:

- `CHIKEN_REALM_IMAGE`
- `CHIKEN_GOST_IMAGE`

The agent now performs image preflight checks before create/apply. If pull fails, the API returns a readable error instead of a generic failure.

## Proxy Check

End-to-end proxy detection uses temporary sing-box client bridges and supports:

- HTTP proxy (direct HTTP CONNECT)
- SOCKS proxy (SOCKS5 handshake)
- Mixed proxy (SOCKS5 + HTTP)
- Shadowsocks (temporary local sing-box bridge)
- Trojan (temporary local sing-box bridge with TLS)
- VLESS (temporary local sing-box bridge with TLS or Reality)
- VLESS Reality (temporary local sing-box bridge with Reality handshake)
- VMess WebSocket (temporary local sing-box bridge with WS transport)
- Hysteria2 (temporary local sing-box bridge with QUIC)

Each check records: success, HTTP status, latency, exit IP/country, failure stage (DNS, TCP, TLS, Reality, auth, timeout), and check timestamp. Results feed into node scoring and subscription filtering.

## Local Test Credentials

`mima.txt` is only for local operator testing and must never be committed. Parsed credentials are written to `.local/test-servers.json`, which is also ignored.

## Known Limits

- `state.json` is still the primary state store even in SQLite mode
- Proxy checks require Docker access on the agent host to run temporary sing-box containers
- remote `Realm`/`GOST` validation still depends on registry reachability from the target host
- `web/src/App.jsx` has been split into page components under `web/src/pages/`

## Rollback

If an upgrade needs to be reverted:

1. Stop the control plane container or process to prevent writes.
2. Backup the current `data/` directory:

```bash
cp -r data data.before-rollback-$(date +%s)
```

3. Identify the pre-restore snapshot (created automatically before each restore):

```bash
ls -t data/backups/panel-restore-before-*.chiken-backup.json.gz | head -1
```

4. Restore using `POST /api/backups/restore` with that file.
5. Restart and verify: `curl -s http://127.0.0.1:7788/api/health`
6. If the panel is down, manually decompress the snapshot into `data/` using the helper script or the panel's restore logic.

## Release Checklist

- `npm install`
- `npm run check`
- `CHIKEN_STORAGE=json npm run smoke`
- `CHIKEN_STORAGE=sqlite npm run smoke`
- `docker compose -f docker-compose.server.yml config`
- `docker compose -f docker-compose.agent.yml config`
- `node scripts/parse-mima.mjs`
- `node scripts/remote-verify.mjs`
- verify no sensitive files are staged before commit or push

## Documentation

- [Capability Baseline](./docs/capability-baseline.md)
- [Development](./docs/development.md)
- [Security Hardening](./docs/security-hardening.md)
- [Monitor](./docs/monitor.md)
- [Memos](./docs/memos.md)
- [Subscription](./docs/subscription.md)
- [Server Workspace](./docs/server-workspace.md)
- [Storage](./docs/storage.md)
- [Node Config Guide](./docs/node-config-guide.md)
- [Release Hardening Plan](./docs/release-hardening-plan.md)
- [Final Test Report](./docs/test-report-final.md)
