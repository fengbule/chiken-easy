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
- SSH terminal, SFTP, credentials, scripts, and batch runs
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

See [docs/storage.md](./docs/storage.md).

## Realm / GOST Images

Forwarding engines use configurable images:

- `CHIKEN_REALM_IMAGE`
- `CHIKEN_GOST_IMAGE`

The agent now performs image preflight checks before create/apply. If pull fails, the API returns a readable error instead of a generic failure.

## Proxy Check

Current protocol-aware MVP supports:

- Shadowsocks via temporary local sing-box bridge
- HTTP proxy
- SOCKS proxy
- Mixed proxy

Protocols not yet fully implemented for authenticated end-to-end proxy-check return explicit unsupported/not-implemented results and do not fake success.

## Local Test Credentials

`mima.txt` is only for local operator testing and must never be committed. Parsed credentials are written to `.local/test-servers.json`, which is also ignored.

## Known Limits

- `state.json` is still the primary state store even in SQLite mode
- `trojan`, `vless`, `vmess`, and `hysteria2` proxy-check are not yet full protocol-level checks
- remote `Realm`/`GOST` validation still depends on registry reachability from the target host
- `web/src/App.jsx` has been reduced via shared extractions, but the page layer is still intentionally compact

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
