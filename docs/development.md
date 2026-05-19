# chiken-easy 开发文档

本文档面向继续开发、二次部署和线上排障。

## 1. 项目定位

`chiken-easy` 是一个以 `sing-box` 为核心的多服务器控制面板：

- 主控 `server` 提供 Web 面板、HTTP API、Agent WebSocket、SSH/WebSocket 终端与审计日志
- 每台目标服务器部署一个 `agent`
- `agent` 负责：
  - 下发并回滚 `sing-box` 配置
  - 控制 `sing-box` 服务
  - 读取日志
  - 创建与删除独立转发容器
  - 上报 Komari 风格系统探针指标
  - 通过主控保存的 SSH 凭据建立真实 SSH 会话

## 2. 技术栈

- Server: Node.js, Express, ws, ssh2
- Agent: Node.js, ws, Docker CLI
- Web: React 19, Vite, lucide-react
- Runtime: Docker Compose
- 状态文件: `data/state.json`
- 审计日志: `data/audit.jsonl`

## 3. 目录结构

```text
server/
  index.js
  configFactory.js

agent/
  index.js

web/src/
  App.jsx
  style.css

docs/
  development.md
  node-config-guide.md

docker-compose.server.yml
docker-compose.agent.yml
Dockerfile
```

## 4. 本地开发

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
npm.cmd run lint
npm.cmd run build
```

## 5. Docker 部署

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

关键环境变量：

- `CHIKEN_FORWARDER_DIR=/app/forwarders`
- `CHIKEN_FORWARDER_HOST_DIR=${PWD}/data/forwarders`
- `SINGBOX_CONFIG=/etc/sing-box/config.json`
- `SINGBOX_CONFIG_VOLUME=${PWD}/data/sing-box`

## 6. API 概览

所有接口默认在 `http://host:7788/api` 下。

### 基础

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/audit`

### Agent

- `GET /api/agents`
- `GET /api/agents/:id`
- `POST /api/tokens`
- `POST /api/agents/:id/service/:action`
- `GET /api/agents/:id/config`
- `POST /api/agents/:id/config`
- `GET /api/agents/:id/config/versions`
- `POST /api/agents/:id/config/rollback/:versionId`
- `GET /api/agents/:id/logs/stream`

`GET /api/agents` 与 `GET /api/agents/:id` 会返回 `probe` 字段，包含：

- `cpu.usage / cpu.cores`
- `memory.total / memory.used / memory.usage`
- `swap.total / swap.used / swap.usage`
- `disk.total / disk.used / disk.usage`
- `network.rxSpeed / network.txSpeed / network.rxBytes / network.txBytes`
- `load / uptime / process.count / updatedAt`

### SSH

- `GET /api/agents/:id/ssh-profile`
- `PUT /api/agents/:id/ssh-profile`
- `POST /api/agents/:id/ssh-profile/test`
- `POST /api/agents/:id/ssh`
- `WebSocket /terminal?agentId=...&mode=ssh`

说明：

- `mode=ssh`：真实 SSH shell
- `mode=agent`：通过 Agent 执行单条命令的兼容模式

### 节点配置

- `GET /api/protocols`
- `POST /api/config/render`
- `POST /api/agents/:id/config/wizard`

### 端口转发

- `GET /api/forwards`
- `POST /api/forward/render`
- `GET /api/agents/:id/forwards`
- `POST /api/agents/:id/forward/wizard`
- `DELETE /api/agents/:id/forwards/:ruleId`

### API Token

- `GET /api/api-tokens`
- `POST /api/api-tokens`
- `DELETE /api/api-tokens/:id`

## 7. API Token 设计

API Token 的定位就是：

> 有这个 token，就可以直接进入主控并修改配置。

当前支持两种使用方式：

- Header

```http
Authorization: Bearer ck_xxx
```

- Query

```text
http://panel:7788/?token=ck_xxx
```

前端拿到 token 后会自动注入：

- 普通 API 请求
- 日志 SSE
- SSH / Agent 终端 WebSocket

如果开启强制校验：

```bash
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_API_TOKEN=ck_bootstrap_token
```

则除了 `/api/health` 外，其余 API 与终端入口都需要合法 token。

## 8. 节点协议

当前面板向导支持：

- `vmess-ws`
- `vless-reality`
- `trojan`
- `hysteria2`
- `shadowsocks`
- `mixed`

注意点：

- 切换协议时，前端会自动替换为该协议的字段和默认值
- `Trojan` / `Hysteria2` 会自动补齐自签名证书
- `VLESS + Reality` 客户端必须带 `public key + short_id + uTLS`
- `Shadowsocks` 默认方法为 `aes-256-gcm`

## 9. 端口转发实现

端口转发不再覆盖主 `sing-box` 配置，而是使用独立容器：

- `sing-box`
- `Realm`
- `GOST`

每条规则都会以独立容器运行，容器名格式：

```text
chiken-forward-<rule-id>
```

对应关系：

- `sing-box`: 使用单独配置文件和 `sing-box run -c`
- `Realm`: 使用 `4points/realm:latest`
- `GOST`: 使用 `gogost/gost:latest`

## 10. Agent 关键行为

### 配置下发

- 写入前先备份旧配置
- 校验失败时自动恢复旧配置
- 成功后按需重启 `sing-box`

### TLS 自动生成

当 inbound 启用了 TLS 且指定的证书文件不存在时：

- Agent 会调用 `openssl`
- 自动生成一对自签名证书
- 写入到配置指定路径

### 转发器生命周期

- `apply_forward_rule`
- `remove_forward_rule`

仅 Docker 模式支持独立转发器。

## 11. 测试清单

2026-05-14 已完成的真实联调：

- SSH：
  - 3 台测试机都能通过 `ssh-profile/test`
  - WebSocket 终端可直连并执行 `pwd`
- API Token：
  - Header 模式通过
  - Query 模式通过
  - Token 透传到终端 WebSocket 通过
- 节点协议：
  - `VMess + WS`
  - `VLESS + Reality`
  - `Trojan + TLS`
  - `Hysteria2`
  - `Shadowsocks`
  - `Mixed`
- 转发引擎：
  - `sing-box` TCP/UDP
  - `Realm` TCP/UDP
  - `GOST` TCP/UDP

测试方式不是只看端口监听，而是：

- 节点协议：另一台服务器作为客户端，通过该节点访问公网并拿到 HTTP 200 级别响应
- UDP 转发：向转发端口发送真实 DNS 查询并验证有响应

## 12. 安全注意事项

- 生产环境必须放在 HTTPS 反代后
- SSH 凭据保存在主控 `state.json`，请限制主控访问范围
- `Mixed` 协议不适合长时间暴露在公网
- API Token 支持直接接管主控，务必按需撤销和轮换
- Agent 挂载了 Docker Socket，等于拥有宿主机级别的容器控制能力
