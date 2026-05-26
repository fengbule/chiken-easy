# Capability Baseline

## Current Features

- Single-process control plane with Express HTTP API, agent WebSocket channel, WebSSH terminal, subscription export, sing-box config wizard, and forward wizard.
- Local JSON persistence in `data/state.json` with append-only audit log in `data/audit.jsonl`.
- Docker Compose deployment for server and remote agent roles.

## Current API

- Health and auth: `/api/health`, `/api/auth/*`
- Agent and monitor: `/api/dashboard`, `/api/agents`, `/api/monitor/summary`, `/api/public/probes`, `/api/public/events`
- SSH and server workspace: `/api/agents/:id/ssh-profile`, `/api/agents/:id/ssh`, `/api/agents/:id/sftp`, `/api/scripts/*`, `/api/command-runs`
- Config and forwarding: `/api/config/render`, `/api/agents/:id/config*`, `/api/forward/render`, `/api/agents/:id/forward/wizard`
- Subscriptions and node pool: `/api/subscriptions*`, `/api/node-pool*`, `/api/subscription-sources*`, `/sub/:token`
- Memos and files: `/api/memos*`, `/api/files*`
- Security and governance: `/api/api-tokens*`, `/api/credentials*`, `/api/audit`, `/api/settings`

## Current Data Model

- `agents`, `assets`, `credentials`, `sshProfiles`
- `configVersions`, `forwardRules`, `nodeProfiles`
- `subscriptionProfiles`, `subscriptionSources`, `subscriptionAccessLogs`
- `nodePool`, `proxyChecks`
- `monitorHistory`, `monitorAgg`, `monitorEvents`
- `memos`, `files`
- `scriptLibrary`, `commandRuns`
- `tokens`, `apiTokens`, `auth`, `settings`

## Current Deployment

- Local development with `npm install`, `npm run dev`, `npm run check`
- Production container build from `Dockerfile`
- Main control plane via `docker compose -f docker-compose.server.yml up -d --build`
- Remote agent via `docker compose -f docker-compose.agent.yml up -d --build`

## Current Security Risks

- If `CHIKEN_MASTER_KEY` is unset, secrets remain compatible but cannot be protected at rest.
- If `CHIKEN_REQUIRE_API_TOKEN=0`, API access is permissive by design.
- Query token mode is disabled by default and should remain off unless explicitly required.

## Known Limits

- SQLite mode is reserved but not fully implemented yet; JSON remains the active storage backend.
- Web UI still reflects the original navigation and does not expose every new backend module yet.
- Proxy health checks currently validate reachability and latency, not full HTTP egress semantics for every protocol.

## This Round Goals

- Harden persistence and secret handling without breaking existing deployment paths.
- Add monitor history, node pool, memos, credentials, SFTP, scripts, batch execution, and safer subscription controls.
- Validate the stack locally, verify Docker Compose manifests, and perform real remote deployment and acceptance testing when the parsed servers are reachable.
