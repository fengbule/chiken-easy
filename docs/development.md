# chiken-easy 开发文档

本文档面向继续开发、二次部署和排查线上问题。用户使用教程见 `docs/node-config-guide.md`。

## 1. 项目定位

`chiken-easy` 是一个 sing-box 多服务器中控面板：

- 中控 Server 部署在主控机，提供 Web 面板、HTTP API、Agent WebSocket 通道、终端 WebSocket 通道和审计日志。
- 每台小鸡部署 Agent，Agent 通过长连接上线，接收中控命令并操作本机 sing-box。
- sing-box 负责真正的节点协议和端口转发，Docker 部署时使用 `network_mode: host`，因此面板下发的监听端口会直接出现在宿主机。

核心目标是把“每台机器手动改 sing-box 配置”的工作收敛到一个面板里。

## 2. 技术栈

- Server: Node.js, Express, ws
- Agent: Node.js, ws, Docker CLI 或本机 systemd/sing-box
- Web: React, Vite, lucide-react
- Runtime: Docker Compose, sing-box
- 状态文件: `data/state.json`
- 审计日志: `data/audit.log`

## 3. 目录结构

```text
server/
  index.js           HTTP API、WebSocket、审计、状态管理
  configFactory.js   节点协议和端口转发配置生成器

agent/
  index.js           Agent 长连接、sing-box 操作、命令执行

web/src/
  App.jsx            面板页面、表单、终端组件
  style.css          面板样式

docs/
  architecture.md
  node-config-guide.md
  development.md

scripts/
  install-docker.sh
  prepare-docker.sh

docker-compose.server.yml
docker-compose.agent.yml
Dockerfile
```

## 4. 本地开发

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

单独启动服务端：

```bash
npm run dev:server
```

单独启动 Agent：

```bash
CHIKEN_SERVER=ws://127.0.0.1:7788/agent \
CHIKEN_TOKEN=ce_xxx \
CHIKEN_AGENT_NAME=local-agent \
npm run dev:agent
```

构建生产前端：

```bash
npm run build
```

基础检查：

```bash
npm run lint
```

Windows PowerShell 里如果 `npm` 被执行策略拦截，用 `npm.cmd`：

```powershell
npm.cmd run lint
npm.cmd run build
```

## 5. Docker 部署

主控机部署中控和本机 Agent：

```bash
sh scripts/install-docker.sh
sh scripts/prepare-docker.sh
docker compose -f docker-compose.server.yml up -d --build
```

其他小鸡只部署 Agent：

```bash
sh scripts/install-docker.sh
sh scripts/prepare-docker.sh
cat > .env <<'EOF'
CHIKEN_SERVER=ws://主控IP:7788/agent
CHIKEN_TOKEN=面板或服务端生成的接入Token
CHIKEN_AGENT_NAME=agent-1
CHIKEN_AGENT_HOST=agent-1
CHIKEN_AGENT_IP=公网IP
EOF
docker compose -f docker-compose.agent.yml up -d --build
```

常用运维命令：

```bash
docker compose -f docker-compose.server.yml logs -f chiken-server
docker compose -f docker-compose.agent.yml logs -f chiken-agent
docker logs -f chiken-singbox
docker exec chiken-singbox sing-box version
docker exec chiken-singbox sing-box check -c /etc/sing-box/config.json
```

## 6. Server 主要接口

所有 API 默认在 `http://host:7788/api` 下。

### 健康和面板

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/dashboard` | 仪表盘摘要 |
| GET | `/api/audit` | 审计日志 |

### Agent 管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agents` | Agent 列表 |
| GET | `/api/agents/:id` | 单个 Agent |
| POST | `/api/tokens` | 生成 Agent 接入 Token |
| POST | `/api/agents/:id/service/:action` | `start`、`stop`、`restart`、`status` |
| POST | `/api/agents/:id/ssh` | 执行一次远程命令 |
| POST | `/api/agents/:id/uninstall` | 卸载目标 Agent |
| GET | `/api/agents/:id/logs/stream` | SSE 推送 sing-box 日志 |

### 配置管理

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/protocols` | 支持的节点协议 |
| POST | `/api/config/render` | 只渲染节点配置，不下发 |
| POST | `/api/agents/:id/config/wizard` | 通过向导参数生成配置并下发 |
| GET | `/api/agents/:id/config` | 读取 Agent 当前配置缓存 |
| POST | `/api/agents/:id/config` | 直接下发完整 sing-box JSON |
| GET | `/api/agents/:id/config/versions` | 配置版本列表 |
| POST | `/api/agents/:id/config/rollback/:versionId` | 回滚配置 |

### 端口转发

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/forwards` | 支持的转发类型 |
| POST | `/api/forward/render` | 只渲染转发配置 |
| POST | `/api/agents/:id/forward/wizard` | 生成转发配置并下发 |

### API Token

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/api-tokens` | Token 列表，返回值会脱敏 |
| POST | `/api/api-tokens` | 创建自动化 API Token |
| DELETE | `/api/api-tokens/:id` | 撤销 Token |

请求可以带：

```http
Authorization: Bearer ck_xxx
```

如果请求带了错误 Token，服务端会直接返回 `401`。生产环境可以设置：

```bash
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_API_TOKEN=ck_bootstrap_token
```

开启后除 `/api/health` 外，API 都需要合法 Bearer Token。

## 7. WebSocket 通道

### Agent 通道

路径：

```text
/agent
```

Agent 上线第一条消息：

```json
{
  "type": "hello",
  "token": "ce_xxx",
  "agent": {
    "id": "stable-agent-id",
    "name": "agent-1",
    "host": "agent-1",
    "ip": "1.2.3.4",
    "os": "linux",
    "arch": "x64"
  }
}
```

Server 下发命令：

```json
{
  "id": "command-id",
  "command": "apply_config",
  "payload": {
    "config": {},
    "restart": true
  }
}
```

Agent 返回结果：

```json
{
  "type": "command_result",
  "commandId": "command-id",
  "ok": true,
  "output": "done"
}
```

### 终端通道

路径：

```text
/terminal?agentId=xxx
```

面板可以发送裸命令：

```text
docker ps
```

也可以发送 JSON：

```json
{ "type": "input", "data": "docker ps" }
```

服务端会通过 Agent 的 `exec` 命令执行并返回：

```json
{ "type": "output", "output": "..." }
```

`exit`、`quit`、`logout` 会关闭当前终端连接。

## 8. Agent 命令

Agent 当前支持：

| 命令 | 说明 |
| --- | --- |
| `service` | 管理 sing-box 服务，支持 `start`、`stop`、`restart`、`status` |
| `read_config` | 读取当前 sing-box 配置 |
| `apply_config` | 写入配置、校验、可选重启 |
| `exec` | 执行 shell 命令 |
| `uninstall_agent` | 卸载 Agent，自身容器会被移除 |
| `tail_logs` | 读取 sing-box 最近日志 |

Docker 模式下 Agent 通过 Docker socket 操作 `chiken-singbox`，并把配置写入挂载目录。

## 9. 节点协议

配置生成器在 `server/configFactory.js`。

当前节点向导支持：

- `vmess-ws`: VMess + WebSocket
- `vless-reality`: VLESS + Reality
- `trojan`: Trojan + TLS
- `hysteria2`: Hysteria2
- `shadowsocks`: Shadowsocks
- `mixed`: HTTP/SOCKS mixed inbound

新增协议时通常需要改三处：

1. `server/configFactory.js` 的 `protocolCatalog`
2. `buildInbound(input)` 生成 sing-box inbound
3. `web/src/App.jsx` 的节点配置表单字段和随机按钮

改完后必须至少做：

```bash
npm run lint
npm run build
docker exec chiken-singbox sing-box check -c /etc/sing-box/config.json
```

协议可用性建议用临时 sing-box 客户端真实代理访问 `http://example.com` 或自建 HTTP 服务，不能只看端口是否监听。

## 10. 端口转发

端口转发生成器同样在 `server/configFactory.js`。

当前支持：

- `tcp`
- `udp`
- `tcp_udp`

实现方式是 sing-box `direct` inbound，使用：

```json
{
  "type": "direct",
  "listen_port": 32181,
  "network": "tcp",
  "override_address": "目标IP或域名",
  "override_port": 80
}
```

多规则通过 `rules` 数组下发：

```json
{
  "rules": [
    {
      "network": "tcp",
      "port": 32181,
      "targetHost": "1.2.3.4",
      "targetPort": 80
    },
    {
      "network": "udp",
      "port": 32182,
      "targetHost": "1.2.3.4",
      "targetPort": 53
    }
  ]
}
```

测试 TCP 转发：

```bash
curl -m 10 http://转发机IP:监听端口/
```

测试 UDP 转发可以用一个临时 UDP echo 服务，或用 DNS 目标做请求验证。

## 11. 随机字段

Web 面板里随机按钮主要用于：

- UUID
- 密码
- short_id
- WS path
- 端口
- SNI / 伪装域名
- Reality 私钥占位输入

注意 Reality 客户端还需要 public key。服务端私钥可以在目标机器上生成：

```bash
docker exec chiken-singbox sing-box generate reality-keypair
```

面板里填 private key，客户端使用 public key。

## 12. 测试清单

每次改核心逻辑后建议跑：

```bash
npm run lint
npm run build
```

线上冒烟测试：

1. `/api/agents` 能看到所有 Agent 在线。
2. 终端 WebSocket 能执行 `docker exec chiken-singbox sing-box version | head -1`。
3. API Token：错误 Token 返回 `401`，正确 Token 可调用 `/api/agents`。
4. 下发 VMess+WS，sing-box 校验通过并监听端口。
5. 下发 VLESS+Reality，sing-box 校验通过并监听端口。
6. 用 sing-box 客户端通过节点访问公网，确认返回 HTTP 200。
7. 下发 TCP 转发，用 curl 访问转发端口确认拿到目标服务响应。
8. 下发 UDP 转发，用 UDP echo 或 DNS 请求确认有返回。
9. 卸载 Agent 后面板显示离线，再重新部署确认能恢复上线。

## 13. 安全注意事项

- 生产环境必须放在 HTTPS 后面，建议用 Caddy/Nginx 做 TLS 或 mTLS。
- 面板端口不要直接裸奔给公网，至少限制来源 IP 或加反代鉴权。
- `CHIKEN_REQUIRE_API_TOKEN=1` 会要求 API Token；如果开启，前端也需要配套 Token 注入或通过反代统一处理。
- Agent 容器挂载了 `/var/run/docker.sock`，等同拥有宿主机 Docker 管理权限，务必保护好 `/agent` 通道和接入 Token。
- 终端功能会执行远程 shell 命令，应只给可信管理员使用。
- 审计日志会记录操作类型和部分命令摘要，不要把敏感密码直接写进命令。

## 14. 常见问题

### Agent 在线但下发配置失败

先看 Agent 日志：

```bash
docker logs --tail 100 chiken-agent
```

再看 sing-box 校验：

```bash
docker exec chiken-singbox sing-box check -c /etc/sing-box/config.json
```

### 端口没有监听

确认 sing-box 容器使用 host 网络：

```bash
docker inspect chiken-singbox --format '{{.HostConfig.NetworkMode}}'
```

确认端口监听：

```bash
ss -lntup | grep 端口
```

### WebSocket 连接异常

确认反代保留 Upgrade 头：

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

服务端已经把 `/agent` 和 `/terminal` 分开路由到不同 WebSocketServer，新增 WS 入口时也要走 `server.on("upgrade")` 显式分流。

### 下发端口转发后原节点消失

当前设计是“一次下发一份完整 sing-box 配置”。节点配置和端口转发已经在 UI 上分开，但都会覆盖目标机器当前配置。后续如果要混合多个节点和转发规则，需要在配置生成器里做“配置合并/编排”而不是直接替换。
