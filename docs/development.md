# chiken-easy 开发文档

本文档以 `main` 分支在 **2026-05-14** 的实现为准。

如果仓库里出现重复描述，以本文档记录的最新行为为准。

## 1. 当前范围

当前版本已经正式包含：

- WebSSH 终端
- 一键部署 Agent
- 实时探针
- 独立端口转发
- API Token 直接进入主控
- 订阅聚合与模板切换

这些能力都已经是现有实现，不再是计划项。

## 2. 项目定位

`chiken-easy` 是一个以 `sing-box` 为核心的多服务器控制面板：

- `server` 提供 Web 面板、HTTP API、Agent WebSocket、WebSSH、订阅链接和审计日志
- 每台目标服务器部署一个 `agent`
- `agent` 负责配置下发、服务控制、日志读取、转发容器管理和实时探针
- 面板既可以通过 Agent 执行命令，也可以直接通过保存的 SSH 凭据进入真实终端或远程执行部署

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
  subscriptions.js

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

Windows PowerShell：

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

- `CHIKEN_PUBLIC_BASE_URL=https://panel.example.com`
- `CHIKEN_PUBLIC_WS_URL=wss://panel.example.com/agent`
- `CHIKEN_PROBE_INTERVAL=5`
- `CHIKEN_HOST_ROOT=/hostfs`
- `CHIKEN_FORWARDER_DIR=/app/forwarders`
- `CHIKEN_FORWARDER_HOST_DIR=${PWD}/data/forwarders`
- `CHIKEN_REALM_IMAGE=4points/realm:latest`
- `CHIKEN_GOST_IMAGE=gogost/gost:latest`

说明：

- 端口转发依赖 Agent 的 Docker 模式
- Docker 模式下探针通过只读挂载宿主机根目录获取更接近真实宿主机的数据
- 一键部署命令依赖 `CHIKEN_PUBLIC_BASE_URL / CHIKEN_PUBLIC_WS_URL` 正确可达

## 7. API 总览

所有 API 默认在 `http://host:7788/api` 下。

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

订阅聚合：

- `GET /api/subscriptions/meta`
- `GET /api/subscriptions`
- `GET /api/subscriptions/:id`
- `POST /api/subscriptions/render`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`
- `GET /sub/:publicToken`

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

## 9. WebSSH

当前版本已经支持从服务器列表一键进入真实 WebSSH：

1. 在“服务器”页或服务器详情页点击 `SSH`
2. 首次进入后填写 `host / port / username / password` 或私钥
3. 点击“保存 SSH”，再点击“测试连接”
4. 之后从服务器列表点击 `SSH` 会直接进入该机器的交互式终端

实现细节：

- `mode=ssh` 通过 `ssh2` 建立真实 SSH shell，会话走 `/terminal` WebSocket
- 前端使用 `xterm.js` 渲染终端，支持原始按键、粘贴和窗口 resize
- `mode=agent` 是兼容模式，底层仍通过 Agent 执行命令
- 如果 SSH 凭据不可用，终端会自动回退到 `agent` 模式

## 10. 一键部署 Agent

SSH 页面同时提供：

- 可复制的一键部署命令
- 通过当前保存的 SSH 凭据直接远程执行部署

支持两种部署模式：

### `service`

- 目标是 `systemd + Node.js`
- 适合目标机已经有 sing-box 服务的场景

### `docker`

- 目标是 `Docker Compose`
- 适合从零接入的机器
- 会准备 `sing-box`、`agent`、探针挂载和转发目录

实现方式：

- 主控为每次部署生成短时效安装 bundle
- 面板可复制 `curl -fsSL .../install/agent.sh?bundle=... | bash`
- 也可以直接把同一份脚本通过 SSH `sh -s` 推送到远端执行

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
- Docker 模式下通过 `CHIKEN_HOST_ROOT=/hostfs` 读取宿主机视角
- 主控保留最近一段 `metricsHistory` 供前端显示趋势图

## 12. 节点协议与测试口径

当前面板向导支持：

- `vmess-ws`
- `vless-reality`
- `trojan`
- `hysteria2`
- `shadowsocks`
- `mixed`

最新实现重点：

- 切换协议时，前端会自动重置为该协议自己的字段和默认值
- `Trojan / Hysteria2` 首次下发时会自动补齐自签名证书
- `VLESS + Reality` 订阅导出额外要求填写 `public key`
- 节点向导额外提供“订阅节点名称”和“订阅出口地址”

**2026-05-14 验证结果**

在一台远端测试服务器上，使用 Docker 中的 `sing-box` 服务端 / 客户端回环联调，已经逐个验证通过：

- `VMess + WebSocket`
- `VLESS + Reality`
- `Trojan + TLS`
- `Hysteria2`
- `Shadowsocks`
- `Mixed HTTP/SOCKS`

验证口径不是只看端口监听，而是实际经由该协议访问公网 `https://www.gstatic.com/generate_204` 并拿到 `204`。

## 13. 订阅聚合

订阅聚合的目标是做成类似 `sublinkpro` 的“本地节点 + 外部内容聚合器”，但不依赖外部订阅链接。

当前支持：

- 把已经通过面板下发过的本地节点直接加入订阅
- 手动粘贴外部原始订阅内容
- 自动识别以下输入
  - Clash YAML 中的 `proxies:` 段
  - 纯 URI 列表
  - Base64 编码后的订阅正文
- 切换内置 Clash 模板
  - `Clash Rule Basic`
  - `Clash Global`
  - `Clash Fallback`

实现方式：

- 节点下发成功时，主控同时保存一份 `nodeProfiles`
- 订阅页保存 `subscriptionProfiles`
- 渲染时聚合本地节点与外部原始内容
- 对外暴露 `GET /sub/:publicToken`

注意：

- `VLESS + Reality` 如果缺少 `public key` 或 `short_id`，会被标记为不可直接导出
- 外部 Clash YAML 导入目前只抽取 `proxies:` 节点本身，不复用对方的 `proxy-groups` 和 `rules`

## 14. 端口转发

端口转发已经从“覆盖主配置”改为“独立容器”模型。

支持引擎：

- `sing-box`
- `Realm`
- `GOST`

工作方式：

- Server 根据规则生成标准化转发计划
- Agent 把计划写入 `forwarders/<rule-id>/...`
- Agent 通过 `docker run -d` 启动独立容器
- 容器命名格式为 `chiken-forward-<rule-id>`

这意味着：

- 主 `sing-box` 和转发容器彼此独立
- 每条转发规则都可以独立创建、更新和删除
- 不会再覆盖节点配置

## 15. 数据持久化

主控侧：

- `data/state.json`
  - `tokens`
  - `apiTokens`
  - `agents`
  - `configVersions`
  - `forwardRules`
  - `nodeProfiles`
  - `subscriptionProfiles`
  - `sshProfiles`
  - `installBundles`

- `data/audit.jsonl`
  - 记录配置、SSH、部署、订阅、转发和接入相关事件

Agent 侧：

- `agent-state/agent.json`
- `/etc/sing-box/config.json`
- `/etc/sing-box/chiken-backups`
- `forwarders/<rule-id>/...`
