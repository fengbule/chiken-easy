# chiken-easy 开发文档

本文档面向继续开发、二次部署、联调测试和线上排障。

## 1. 文档口径

- 本文档以 `main` 分支当前实现为准。
- 如果仓库里存在重复描述，以这里记录的最新行为为准。
- 当前版本已经把“WebSSH 终端”、“一键部署 Agent”、“实时探针”、“独立转发引擎”、“API Token 直入主控”纳入正式能力，不再是待办项。

## 2. 项目定位

`chiken-easy` 是一个以 `sing-box` 为核心的多服务器控制面板：

- 主控 `server` 提供 Web 面板、HTTP API、Agent WebSocket、WebSSH 终端、安装脚本下发和审计日志。
- 每台目标服务器部署一个 `agent`。
- `agent` 负责下发和回滚 `sing-box` 配置、控制服务、读取日志、管理独立转发容器、采集实时探针指标。
- 面板既可以通过 Agent 执行命令，也可以通过保存的 SSH 凭据直接进入目标服务器或远程执行一键部署。

## 3. 技术栈

- Server: Node.js, Express, ws, ssh2
- Agent: Node.js, ws, Docker CLI
- Web: React 19, Vite, xterm.js, lucide-react
- Runtime: Docker Compose
- 状态文件: `data/state.json`
- 审计日志: `data/audit.jsonl`

## 4. 目录结构

```text
server/
  index.js
  configFactory.js
  installers.js

agent/
  index.js
  systemProbe.js

shared/
  configFactory.js

web/src/
  App.jsx
  style.css

docs/
  development.md
  architecture.md
  node-config-guide.md

docker-compose.server.yml
docker-compose.agent.yml
Dockerfile
```

## 5. 本地开发

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run dev:server
npm run dev:web
npm run dev:agent
npm run build
npm run lint
```

Windows PowerShell 如果执行策略拦截：

```powershell
npm.cmd run build
npm.cmd run lint
```

## 6. 部署与关键环境变量

主控机：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

Agent 机：

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

关键挂载：

- `./data/sing-box:/etc/sing-box`
- `./data/forwarders:/app/forwarders`
- `/:/hostfs:ro`

关键环境变量：

- `CHIKEN_FORWARDER_DIR=/app/forwarders`
- `CHIKEN_FORWARDER_HOST_DIR=${PWD}/data/forwarders`
- `SINGBOX_CONFIG=/etc/sing-box/config.json`
- `SINGBOX_CONFIG_VOLUME=${PWD}/data/sing-box`
- `CHIKEN_REALM_IMAGE=4points/realm:latest`
- `CHIKEN_GOST_IMAGE=gogost/gost:latest`
- `CHIKEN_PROBE_INTERVAL=5`
- `CHIKEN_HOST_ROOT=/hostfs`
- `CHIKEN_PUBLIC_BASE_URL=https://panel.example.com`
- `CHIKEN_PUBLIC_WS_URL=wss://panel.example.com/agent`

说明：

- 端口转发依赖 Agent 的 Docker 模式。
- 节点主配置和转发规则已经解耦，转发不会再覆盖主 `sing-box` 配置。
- Docker 模式下探针通过只读挂载宿主机根目录来读取更接近真实机器的磁盘与系统指标。

## 7. API 与鉴权

所有接口默认在 `http://host:7788/api` 下。

基础接口：

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/audit`

Agent 与配置：

- `GET /api/agents`
- `GET /api/agents/:id`
- `POST /api/tokens`
- `POST /api/agents/:id/service/:action`
- `GET /api/agents/:id/config`
- `POST /api/agents/:id/config`
- `GET /api/agents/:id/config/versions`
- `POST /api/agents/:id/config/rollback/:versionId`
- `GET /api/agents/:id/logs/stream`

SSH：

- `GET /api/agents/:id/ssh-profile`
- `PUT /api/agents/:id/ssh-profile`
- `POST /api/agents/:id/ssh-profile/test`
- `POST /api/agents/:id/ssh`
- `WebSocket /terminal?agentId=...&mode=ssh`

部署：

- `POST /api/agents/:id/install-command`
- `POST /api/agents/:id/deploy`
- `GET /install/agent.sh?bundle=...`

节点向导：

- `GET /api/protocols`
- `POST /api/config/render`
- `POST /api/agents/:id/config/wizard`

转发向导：

- `GET /api/forwards`
- `POST /api/forward/render`
- `GET /api/agents/:id/forwards`
- `POST /api/agents/:id/forward/wizard`
- `DELETE /api/agents/:id/forwards/:ruleId`

API Token：

- `GET /api/api-tokens`
- `POST /api/api-tokens`
- `DELETE /api/api-tokens/:id`

## 8. API Token 设计

API Token 的定位就是：

> 只要持有这个 token，就可以直接进入主控并修改当前主控上的配置。

支持两种使用方式：

- Header

```http
Authorization: Bearer ck_xxx
```

- Query

```text
http://panel:7788/?token=ck_xxx
```

前端拿到 token 后会自动注入到：

- 普通 API 请求
- 日志 SSE
- SSH / Agent 终端 WebSocket

如果开启强制校验：

```bash
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_API_TOKEN=ck_bootstrap_token
```

则除 `/api/health` 外，其余 API、日志流和终端入口都需要合法 token。

## 9. WebSSH 工作流

当前版本已经支持“从服务器列表一键进入 WebSSH”：

1. 在“服务器”页或服务器详情页点击 `SSH`。
2. 首次进入后填写 `host / port / username / password` 或私钥。
3. 点击“保存 SSH”，再点“测试连接”。
4. 保存成功后，服务器列表右侧就会保留这个入口，后续点击 `SSH` 会直接进入该机器的交互式终端。

实现细节：

- `mode=ssh` 通过 `ssh2` 建立真实 SSH shell，会话走 `/terminal` WebSocket。
- 前端使用 `xterm.js` 渲染终端，支持原始按键、粘贴和窗口 resize。
- `mode=agent` 是兼容模式，底层仍通过 Agent 执行命令，便于 SSH 未就绪时兜底。
- 如果该 Agent 还没有配置可用的 SSH 凭据，终端会自动回退到 `agent` 模式。
- SSH 凭据由主控保存到 `state.json`，因此主控本身必须视为高敏感资产。

推荐：

- 日常运维、安装 Agent、排查系统问题，优先使用真实 SSH。
- 只需要快速跑一条命令时，再切回 `Agent 执行`。

## 10. 一键部署 Agent

SSH 页面现在同时提供：

- 复制可直接执行的一键部署命令
- 通过已保存的 SSH 凭据，直接从面板远程执行部署

支持两种部署模式：

### `service`

- 目标是 `systemd + Node.js`
- 适合目标机已经有 sing-box 服务的场景
- 会写入最小化 Agent 运行时、systemd 服务文件并启动

### `docker`

- 目标是 `Docker Compose`
- 适合从零接入的机器
- 会准备 `sing-box` 容器、Agent 容器、探针挂载和转发目录

实现方式：

- 主控为每次部署生成短时效安装 bundle
- 面板可复制 `curl -fsSL .../install/agent.sh?bundle=... | bash`
- 也可以直接把同一份脚本通过 SSH `sh -s` 推到远端执行

注意：

- 部署命令依赖 `CHIKEN_PUBLIC_BASE_URL / CHIKEN_PUBLIC_WS_URL` 正确可达，尤其是在反代或多网卡环境下。
- 如果直接通过面板 SSH 执行部署，远端不需要再额外访问 GitHub 下载 Agent 源码。

## 11. 实时探针

Agent 会持续上报：

- `CPU` 使用率、核心数、`load1 / load5 / load15`
- 内存和 Swap
- 根分区磁盘占用
- 网络上下行实时速率
- 网络累计流量
- 运行时长

实现要点：

- 采集逻辑位于 `agent/systemProbe.js`
- Linux 优先读取 `/proc` 和 `df`
- Docker 模式下通过 `CHIKEN_HOST_ROOT=/hostfs` 读取只读宿主机视角
- 主控会保留最近一段采样历史，用于前端趋势图展示

## 12. 节点协议与向导行为

当前面板向导支持：

- `vmess-ws`
- `vless-reality`
- `trojan`
- `hysteria2`
- `shadowsocks`
- `mixed`

最新实现的关键点：

- 切换协议时，前端会自动重置为该协议对应的字段和默认值，不再沿用上一个协议的残留表单。
- `Trojan` / `Hysteria2` 首次下发时，如果证书文件不存在，Agent 会自动生成自签名证书。
- `VLESS + Reality` 需要服务端私钥，客户端还需要 `public key + short_id + uTLS`。
- `Shadowsocks` 默认算法为 `aes-256-gcm`。

各协议测试时不要只看端口监听，要验证真实可用性：

- `VMess + WebSocket`：客户端通过 WS 入站访问公网，确认可正常拿到 HTTP 200。
- `VLESS + Reality`：客户端带完整 Reality 参数连接，确认能正常握手并访问公网。
- `Trojan + TLS`：先确认服务端自动补证书成功，再用客户端验证链路。
- `Hysteria2`：确认上/下行参数生效，客户端能正常跑通。
- `Shadowsocks`：确认密码和加密方法匹配后可正常访问公网。
- `Mixed`：确认 HTTP/SOCKS 代理都能正常工作，不只是面板显示下发成功。

## 13. 端口转发实现

端口转发现在是独立能力，不再复用主节点配置。

支持的转发引擎：

- `sing-box`
- `Realm`
- `GOST`

实现方式：

- 每条转发规则都会以独立容器运行。
- 容器名格式为 `chiken-forward-<rule-id>`。
- `sing-box` 转发会生成独立配置文件并以 `sing-box run -c` 启动。
- `Realm` 默认镜像为 `4points/realm:latest`。
- `GOST` 默认镜像为 `gogost/gost:latest`。

注意：

- 这些容器和主 `sing-box` 容器是并列关系，不会覆盖主配置。
- 规则的创建、更新、删除由 `apply_forward_rule` / `remove_forward_rule` 完成。
- 当前转发能力要求 Agent 运行在 Docker 模式。

## 14. Agent 关键行为

配置下发：

- 写入新配置前先备份旧配置到 `/etc/sing-box/chiken-backups`
- 写入后执行 `sing-box check`
- 校验失败自动恢复旧配置
- 成功后按需重启 `sing-box`

TLS 自动补齐：

- 仅当 inbound 开启 TLS 且指定证书路径不存在时才自动生成
- 依赖目标机存在 `openssl`
- 生成结果会直接写入配置指定路径

转发规则生命周期：

- `apply_forward_rule`
- `remove_forward_rule`

日志与审计：

- 所有配置、服务控制、SSH、部署、转发动作都会写审计日志
- Agent 的命令输出会回流到主控，用于前端展示和状态追踪

## 15. 测试清单

2026-05-14 当前版本至少应覆盖以下联调：

- WebSSH
- `ssh-profile/test` 可返回 `ssh ok`
- `/terminal?mode=ssh` 能直连远端并执行 `pwd`
- `mode=agent` 兜底终端仍可正常执行命令

- 一键部署
- `POST /api/agents/:id/install-command` 能返回 `service / docker` 两种命令
- `GET /install/agent.sh?bundle=...` 能返回完整安装脚本
- 生成脚本应通过 `sh -n`

- API Token
- Header 模式通过
- Query 模式通过
- Token 能透传到 API、SSE、终端 WebSocket

- 节点协议
- `VMess + WS`
- `VLESS + Reality`
- `Trojan + TLS`
- `Hysteria2`
- `Shadowsocks`
- `Mixed`

- 转发引擎
- `sing-box` 的 `tcp / udp / tcp_udp`
- `Realm` 的 `tcp / udp / tcp_udp`
- `GOST` 的 `tcp / udp / tcp_udp`

- 探针
- `/api/dashboard` 能返回 `averageCpu / totalRxRate / totalTxRate`
- `/api/agents/:id` 能返回 `metrics` 和 `metricsHistory`

推荐测试方法：

- 节点协议：从另一台服务器或真实客户端经该节点访问公网，确认拿到正常响应，而不是只看端口已监听。
- TCP 转发：可把目标设为 `example.com:80`，访问转发端口后确认能拿到 `Example Domain`。
- UDP 转发：可把目标设为 `1.1.1.1:53`，发送真实 DNS 查询并确认有响应。

## 16. 安全注意事项

- 生产环境必须放在 HTTPS 反代后。
- API Token 等价于主控管理权限，必须按需撤销和轮换。
- SSH 凭据保存在主控 `state.json`，必须限制主控访问范围和磁盘权限。
- `GET /install/agent.sh?bundle=...` 使用的是短时效 bundle，仍然应避免泄露给无关方。
- `Mixed` 协议不适合长期暴露在公网。
- Agent 挂载 Docker Socket 时，等价于拥有宿主机级别的容器控制能力。
