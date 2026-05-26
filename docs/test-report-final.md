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

## 重启后恢复与 main 同步

- 恢复时间：`2026-05-26T11:06:42.2967203+08:00`
- 当前分支：`release/stabilize-integrated-chiken-stack`
- 原保存 commit：`89d9d0e`
- 当前 HEAD（恢复与合并验证时）：`c45e8c1`
- 当前 commit 状态：`working tree`（基于 `c45e8c1` 完成本地回归修复后再提交）
- `89d9d0e` 是否仍在当前分支历史中：是

### 与 origin/main 同步结果

- `git fetch --prune origin`：通过
- `origin/main` 最新提交（同步时）：`58d4cc0`
- 是否 merge `origin/main`：是
- merge 方式：先尝试普通 `git merge origin/main`，发现冲突后中止；随后使用 `git merge -X ours origin/main` 保留已远程验收的 release 主线，再补跑完整验收

### 冲突与处理摘要

- 首次普通 merge 冲突文件：
  - `.env.example`
  - `README.md`
  - `agent/index.js`
  - `docker-compose.agent.yml`
  - `docker-compose.server.yml`
  - `docs/development-report-2026-05-20.md`
  - `docs/development.md`
  - `docs/test-report-2026-05-20.md`
  - `server/index.js`
  - `server/subscriptions.js`
  - `web/src/App.jsx`
  - `web/src/style.css`
- 处理策略：
  - 先执行 `git merge --abort`，避免不可控人工拼接
  - 改用 `git merge -X ours origin/main`
  - 合并后发现 `web/src/App.jsx` 被混入重复定义并导致构建失败
  - 将以下关键文件恢复为已通过第三轮远程验收的 release 版本后重新验证：
    - `agent/index.js`
    - `server/index.js`
    - `web/src/App.jsx`
    - `web/src/style.css`
- 最终状态：无未解决 merge 冲突，且回归验证通过

### 本地验证结果

- `npm install`：通过
- `npm run check`：通过
- `CHIKEN_STORAGE=json npm run smoke`：通过
- `CHIKEN_STORAGE=sqlite npm run smoke`：通过

### 远程验证结果

- `node scripts/remote-verify.mjs`：通过
- `mima.txt` 解析：通过
- 解析来源：`C:\Users\fengbule\Desktop\mima.txt`
- 脱敏服务器摘要：
  - Server 1：`38.76.178.xxx`
  - Server 2：`38.76.208.xxx`
  - Server 3：`103.52.154.xxx`
- 关键远程验收摘要：
  - 3 台服务器 `SSH tcp/banner/auth/pwd/uname -a/docker ps`：全部通过
  - 3 台服务器 SFTP 小文件上传/下载/删除：全部通过
  - 3 Agents 在线：通过
  - 订阅访问与访问日志：通过
  - `mixed` 与 `shadowsocks` 协议级 proxy-check：通过
  - `vless` 协议级 proxy-check：明确返回 `not_implemented`
  - VLESS Reality 服务端校验：通过
  - VLESS Reality 从 Server 3 客户端探测：通过
  - sing-box TCP / UDP 转发：通过
  - Realm TCP 转发：通过
  - GOST TCP 转发：通过
  - 审计日志校验：通过

### PR 准备状态

- 是否准备创建 PR：是
- 是否确认没有敏感文件进入 git：是
- 核查结论：
  - `git status --ignored` 仅显示被忽略目录，如 `.local/`、`data/`、`dist/`、`node_modules/`
  - 未发现 `mima.txt`、`.local/test-servers.json`、`.env*`、`*.pem`、`*.key` 被跟踪或 staged
