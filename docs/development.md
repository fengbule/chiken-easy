# Development

## Scope

This branch upgrades `chiken-easy` from a sing-box helper panel into a broader operations console while keeping the existing codebase and runtime model:

- Express HTTP API
- WebSocket agent bus
- React single-page admin UI
- JSON state in `data/state.json`
- append-only audit log in `data/audit.jsonl`

The current implementation does not fork into separate services or copy external projects wholesale. It extends the original app in place.

## Main Modules

- `server/index.js`: control plane, auth, API, public probe endpoints, SSH/SFTP, node pool, memos, scripts, subscriptions
- `server/storage.js`: storage abstraction, JSON migration, atomic writes, backups, audit helpers
- `server/security.js`: hashing, secret encryption, masking, redaction
- `server/nodePool.js`: import/export, parsing, scoring, de-duplication
- `agent/index.js`: remote agent websocket loop, service control, config apply, forward apply
- `agent/systemProbe.js`: machine metrics collection
- `web/src/App.jsx`: admin UI pages and API client behavior

## Data Model

Primary state keys:

- `agents`
- `assets`
- `credentials`
- `sshProfiles`
- `configVersions`
- `forwardRules`
- `nodeProfiles`
- `subscriptionProfiles`
- `subscriptionSources`
- `subscriptionAccessLogs`
- `nodePool`
- `proxyChecks`
- `monitorHistory`
- `monitorAgg`
- `monitorEvents`
- `memos`
- `files`
- `scriptLibrary`
- `commandRuns`
- `apiTokens`
- `tokens`
- `settings`
- `auth`

## Auth Model

- Health and public probe endpoints remain unauthenticated
- Protected APIs require either:
  - session cookie, or
  - `Authorization: Bearer ck_xxx`
- Query token mode is off by default and only allowed when `CHIKEN_ALLOW_QUERY_TOKEN=1`
- Browser session cookies are now used so WebSocket terminal, SSE logs, and downloads still work when query token mode is disabled

## Storage

- Default mode is `CHIKEN_STORAGE=json`
- `saveState()` uses atomic replace
- recent `state.json` backups are rotated under `data/backups/`
- corrupt or empty state files fall back safely instead of crashing startup
- SQLite mode is reserved behind the storage abstraction but not fully implemented yet

## Local Validation

Standard validation pipeline:

```bash
npm install
npm run check
```

`npm run check` currently runs:

- `npm run lint`
- `npm run build`
- `npm run smoke`

## Smoke Coverage

`scripts/smoke.mjs` verifies:

- required files exist
- JSON templates parse
- server starts
- `/api/health` returns `ok`
- public probes do not leak host, IP, passwords, keys, or tokens
- public events route loads
- build output exists

## Deployment Layout

Main host:

- `docker-compose.server.yml`
- control plane
- local sing-box
- local agent

Remote hosts:

- `docker-compose.agent.yml`
- remote sing-box
- remote agent

## Current Limits

- UI is now broader, but still intentionally compact and single-file heavy
- SQLite storage mode is reserved, not production-ready
- Proxy checks currently validate TCP reachability and latency; they are not full protocol-specific end-to-end probes for every node type
- `realm` and `gost` forwarding depend on pulling upstream images, so offline or restricted registries can block those engines even when sing-box forwarding works
