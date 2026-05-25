# Final Test Report

## Metadata

- Test time: 2026-05-25 20:25:49 +08:00
- Commit status: `working tree` during third-round remote acceptance closure
- Base current HEAD before this round: `cebc9b7ddfcc1b695d6fdae736dd4d88ed6842d6`
- Push gate target: pass all local checks, pass JSON and SQLite smoke, pass remote real acceptance, avoid staging any secret material

## mima.txt Parsing

- Parse status: success
- Source path: desktop `mima.txt`
- Local parsed file: `.local/test-servers.json`
- Accepted formats confirmed in this round:
  - password-auth text blocks
  - Windows CRLF text
  - Chinese labels
  - `host port user password`
- Sensitive values stayed local only and were not staged into git

## Test Topology

- Server 1: `38.76.178.xxx`
  - role: control plane + local agent + sing-box
- Server 2: `38.76.208.xxx`
  - role: remote agent + sing-box
- Server 3: `103.52.154.xxx`
  - role: remote agent + sing-box + client/probe host

## Local Validation

### `npm install`

- status: pass

### `npm run check`

- status: pass
- includes:
  - `npm run lint`
  - `npm run build`
  - `npm run smoke`

### `CHIKEN_STORAGE=json npm run smoke`

- status: pass
- verified:
  - `/api/health`
  - protected API `401`
  - query token disabled by default
  - header token authorization
  - public probe redaction
  - monitor, memos, node-pool, subscriptions, scripts, assets, credentials endpoints

### `CHIKEN_STORAGE=sqlite npm run smoke`

- status: pass
- verified:
  - startup in SQLite mode
  - SQLite file creation
  - subscription access write path
  - same protected/public API baseline as JSON mode

## Docker Compose Validation

- Local Docker on this workstation: unavailable
- Remote compose validation re-run in this round:
  - Server 1: `docker compose -f docker-compose.server.yml config` pass
  - Server 2: `docker compose -f docker-compose.agent.yml config` pass
  - Server 3: `docker compose -f docker-compose.agent.yml config` pass
- Remote rebuilds completed in this round:
  - Server 1: `docker compose -f docker-compose.server.yml up -d --build`
  - Server 2: `docker compose -f docker-compose.agent.yml up -d --build`
  - Server 3: `docker compose -f docker-compose.agent.yml up -d --build`

## Remote Verification

### Panel API

- `/api/health`: pass
- `/api/agents`: pass, `3` agents online
- `/api/settings`: pass
  - `queryTokenEnabled=false`
  - `masterKeySet=true`
  - `storageMode=json`

### SSH Automation

- Server 1: pass
  - TCP port reachable
  - SSH banner pass
  - auth pass
  - `pwd` pass
  - `uname -a` pass
  - `docker ps` pass
- Server 2: pass
  - TCP port reachable
  - SSH banner pass
  - auth pass
  - `pwd` pass
  - `uname -a` pass
  - `docker ps` pass
- Server 3: pass
  - TCP port reachable
  - SSH banner pass
  - auth pass
  - `pwd` pass
  - `uname -a` pass
  - `docker ps` pass

### SFTP

- Server 1: pass
  - mkdir
  - upload
  - list
  - download
  - delete
- Server 2: pass
  - mkdir
  - upload
  - list
  - download
  - delete
- Server 3: pass
  - mkdir
  - upload
  - list
  - download
  - delete

### Script Library / Batch Command

- `uptime` script batch run across `3` agents: pass
- Independent per-agent result capture: pass
- Audit record for batch execution: pass

### Subscription Access

- base64 export: pass
- Clash export: pass
- sing-box export: pass
- access log increment: pass

### Proxy Check

- Mixed local node protocol-level check: pass
  - status code: `204`
  - latency: `380ms`
- Shadowsocks local node protocol-level check: pass
  - status code: `204`
  - latency: `167ms`
- Unsupported protocol handling: pass
  - live unsupported response verified for `vless`
  - returned `protocol-level proxy-check not_implemented`
- Subscription health filter readiness: pass
  - healthy node available after live check

### VLESS Reality

- Service-side validation: pass
  - keypair generated
  - config applied
  - `sing-box check` pass
  - port `19443` listening
  - live config contains reality fields
- Client end-to-end validation from Server 3: pass
  - proxy request completed through temporary client probe
  - received `HTTP/2 204`
- Desensitized connection info:
  - public key: `Uji_Dc***`
  - short id: `012345***`
  - SNI: `www.cloudflare.com`
  - uTLS fingerprint: `chrome`
  - listen port: `19443`

### Forwarding

- sing-box TCP forward to `example.com:80`: pass
- sing-box UDP forward to `1.1.1.1:53`: pass
- Realm TCP forward to `example.com:80`: pass
- GOST TCP forward to `example.com:80`: pass
- Forward delete and container cleanup: pass for all verified rules

### Forward Images

- Realm image preflight: pass
  - image present
  - no repull needed in this run
- GOST image preflight: pass
  - image present
  - no repull needed in this run

### Audit

- `subscription_access`: pass
- `batch_command`: pass
- `sftp_upload`: pass
- `sftp_download`: pass
- `sftp_delete`: pass
- `proxy_check`: pass
- `forward_create`: pass
- `forward_delete`: pass

## Third-Round Fixes Verified

- `scripts/remote-verify.mjs`
  - moved SSH acceptance to stable `ssh2`
  - added per-server low-level SSH checks
  - added real SFTP acceptance
  - added real sing-box TCP and UDP forward checks
  - added real Realm and GOST TCP forward checks
  - added VLESS Reality service-side and client-side validation
  - added remote docker compose config validation
- `scripts/parse-mima.mjs`
  - cleaned encoding-sensitive alias handling
  - restored Chinese key parsing
  - kept sanitized local output
- `agent/index.js`
  - fixed protocol proxy-check temporary sing-box network namespace for dockerized agent runtime
  - improved temporary proxy failure diagnostics
- `server/index.js`
  - kept state-save throttling fix for agent heartbeat persistence
  - added expired-node filtering in subscription selection path

## Security Regression

- query token default disable: pass
- header bearer token auth: pass
- public probe sanitization: pass
- credential API redaction: pass
- `.gitignore` protects:
  - `.local/`
  - `mima.txt`
  - `.env*`
  - `data/`
  - `node_modules/`
  - `dist/`
  - `*.pem`
  - `*.key`

## Remaining Limits

1. Protocol-level proxy-check is fully live-verified in this round for `mixed` and `shadowsocks`, but `trojan`, `vless`, `vmess`, `hysteria2` still correctly report unsupported or not implemented rather than full protocol-level success.
2. The remote panel currently runs with `CHIKEN_STORAGE=json` in live acceptance. SQLite mode was fully smoke-tested locally, but not switched on for the live control plane in this round to avoid deployment risk.
3. Remote report output remains intentionally desensitized and does not include raw credentials, raw tokens, or full IP and credential combinations.

## Push Gate

- `npm run check`: pass
- `CHIKEN_STORAGE=json npm run smoke`: pass
- `CHIKEN_STORAGE=sqlite npm run smoke`: pass
- `node scripts/remote-verify.mjs`: pass
- sensitive files staged into git: not allowed, final staging must be checked before commit
- result: push gate satisfied

## Recommended Version Tag

- Suggested next version tag: `v0.3.0`
