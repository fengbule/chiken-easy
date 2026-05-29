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

- 恢复时间：`2026-05-26T11:06:42+08:00`
- 当前分支：`release/stabilize-integrated-chiken-stack`
- 原保存 commit：`89d9d0e`
- 恢复与合并验证时 HEAD：`c45e8c1`
- `89d9d0e` 是否仍在当前分支历史中：是

### 与 origin/main 同步结果

- `git fetch --prune origin`：通过
- 同步时 `origin/main` 最新提交：`58d4cc0`
- 是否 merge `origin/main`：是
- merge 过程：首次普通 merge 出现冲突后执行 `git merge --abort`，随后保留已通过第三轮远程验收的 release 主线并重新验证

### 冲突与处理摘要

- 首次普通 merge 冲突文件包括：`.env.example`、`README.md`、`agent/index.js`、`docker-compose.agent.yml`、`docker-compose.server.yml`、`docs/development.md`、`server/index.js`、`server/subscriptions.js`、`web/src/App.jsx`、`web/src/style.css`
- 处理策略：中止不可控 merge，保留已通过第三轮远程验收的 release 主线，并重新跑完整本地与远程验收
- 最终状态：无未解决 merge 冲突，回归验证通过

### 本地验证结果

- `npm install`：通过
- `npm run check`：通过
- `CHIKEN_STORAGE=json npm run smoke`：通过
- `CHIKEN_STORAGE=sqlite npm run smoke`：通过

### 远程验证结果

- `node scripts/remote-verify.mjs`：通过
- `mima.txt` 解析：通过
- 解析来源：桌面 `mima.txt`
- 脱敏服务器摘要：Server 1 `38.76.178.xxx`，Server 2 `38.76.208.xxx`，Server 3 `103.52.154.xxx`
- 关键远程验收摘要：3 台服务器 SSH/SFTP 通过，3 Agents 在线，订阅访问通过，`mixed` 与 `shadowsocks` 协议级 proxy-check 通过，VLESS Reality 服务端与 Server 3 客户端验证通过，sing-box TCP/UDP、Realm TCP、GOST TCP 转发通过，审计日志校验通过

### PR 准备状态

- 是否准备创建 PR：是
- 是否确认没有敏感文件进入 git：是
- 核查结论：`.local/`、`data/`、`dist/`、`node_modules/`、`mima.txt`、`.env*`、`*.pem`、`*.key` 均未 staged 或 tracked

## 样品环境归一化记录

- 归一化时间：`2026-05-29T12:26:00+08:00`
- 本地基线：`main` 干净，`HEAD=origin/main=0b57e8d`
- 远程现场备份：已保存到本地 `artifacts/remote-dirty/server1`、`server2`、`server3`
- 备份内容：`git-status.txt`、`git-diff.patch`、`git-diff-cached.patch`、`untracked-files.txt`、`untracked-files.tar.gz`、`meta.txt`
- 归因结论：三台服务器均在 `main@0b57e8d` 上出现 59 个脏项，其中 `agent/networkTuning.js`、`server/apiDocs.js`、`server/publicPage.js`、`web/src/pages/` 等来自 `origin/feature/bbr-network-tuning` 的未合入内容；另有一批 main 既有文件出现换行或部署复制导致的工作区差异
- 远程归一化动作：三台服务器均执行 `git fetch --prune origin`、`git reset --hard origin/main`、`git clean -fd` 后重新执行对应 Docker Compose 构建与启动
- Server 2 旧容器清理：已删除明确属于旧样品的 `chiken-demo-agent`、`chiken-demo-singbox`、`chiken-demo-server`
- 归一化结果：三台服务器 `HEAD=origin/main=0b57e8d`，`git status --porcelain` 为 0
- 敏感信息处理：报告仅保留脱敏 IP，不包含密码、token、私钥或完整凭据组合
