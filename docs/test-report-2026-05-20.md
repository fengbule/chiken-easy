# chiken-easy 测试记录（2026-05-20）

本记录补充本轮真实部署与联调结果，便于后续继续开发和排障。

## 测试范围

- 本地依赖安装
- 本地 lint / build
- 两台远程 Ubuntu 22.04 服务器 Docker Compose 部署
- 主控 + Agent 跨机联通
- 健康检查
- Agent 在线状态与公开探针接口验证

## 仓库信息

- 仓库：`https://github.com/fengbule/chiken-easy`
- 分支：`main`
- 测试时间：2026-05-20

## 本地验证

在工作区执行：

```bash
npm install
npm run lint
npm run build
```

结果：

- `npm install` 成功
- `npm run lint` 成功（`check ok`）
- `npm run build` 成功

说明当前仓库至少在本地构建链路上是通的。

## 测试服务器连通性

收到 3 台测试服务器，其中 2 台成功 SSH 登录，1 台 SSH 握手超时。

### 1. 38.76.178.252

- 结果：失败
- 现象：SSH handshake timeout
- 结论：本轮未用于部署验证

### 2. 38.76.208.199

- 结果：成功
- 系统：Ubuntu 22.04 LTS
- Docker：29.1.3
- Docker Compose：v5.1.3
- 用途：主控机（server + local agent）

### 3. 103.52.154.193

- 结果：成功
- 系统：Ubuntu 22.04 LTS
- Docker：29.1.3
- Docker Compose：v5.1.3
- 用途：远程 Agent 机

## 部署方式

### 主控机（38.76.208.199）

使用：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

实际启动容器：

- `chiken-server`
- `chiken-singbox`
- `chiken-agent`

结果：启动成功。

健康检查：

```http
GET /api/health
```

返回：

```json
{"ok":true,"name":"chiken-easy"}
```

### Agent 机（103.52.154.193）

使用：

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

实际启动容器：

- `chiken-singbox`
- `chiken-agent`

结果：启动成功。

## 联调结果

主控机 API 鉴权后验证：

- `/api/agents` 可正常返回 Agent 列表
- 主控侧识别到 **2 个在线 Agent**
- 两台 Agent 都显示 `connected: true`
- CPU / 内存探针数据正常上报

验证摘要：

```json
{
  "agentCount": 2,
  "online": true,
  "publicProbeCount": 6
}
```

说明：

- 主控与远端 Agent 的 WebSocket 联通成功
- 探针数据采集链路有效
- 公开探针接口可返回数据

## 运行中看到的现象

### 1. Docker Compose 警告

部署时出现：

```text
Docker Compose requires buildx plugin to be installed
```

影响：

- 不阻塞当前部署
- 镜像仍然成功构建并启动

建议：

- 后续可在部署文档里注明该警告可忽略，或补装 buildx 插件

### 2. API 默认需要 Token

访问 `/api/agents` 时未带 token 会返回 `401 Unauthorized`。

这说明：

- 当前鉴权链路生效
- 测试和自动化脚本需要明确携带 `Authorization: Bearer <token>`

### 3. 第三台测试机暂未验证

`38.76.178.252` 当前 SSH 握手超时，可能是：

- 22 端口被拦截
- SSH 服务未正常响应
- 网络质量或防火墙问题

建议优先检查：

- 安全组 / 防火墙
- `sshd` 状态
- 是否限制了 root 密码登录

## 本轮结论

本轮可确认：

1. 仓库当前版本可以本地安装、检查、构建
2. 项目可以在 Ubuntu 22.04 + Docker 29 环境下成功部署
3. 主控 + 跨机 Agent 模式可正常工作
4. Agent 在线状态、探针、公开接口链路已经打通
5. 至少两台测试机可作为后续继续开发和回归测试环境

## 后续建议

下一轮优先建议做这几件事：

1. 增加一份更明确的 `.env.example`
   - 把 `CHIKEN_BOOTSTRAP_TOKEN`
   - `CHIKEN_API_TOKEN`
   - `CHIKEN_SERVER`
   - `CHIKEN_AGENT_NAME`
   - `CHIKEN_AGENT_HOST`
   - `CHIKEN_AGENT_IP`
   明确列出来，减少部署试错

2. 增加一份“单机主控 / 多机 Agent”部署文档
   - 哪台做主控
   - 哪台做 Agent
   - token 如何配
   - 哪些端口要放行

3. 为 API 增加更清晰的鉴权说明
   - 哪些接口公开
   - 哪些接口必须带 token
   - WebSocket / SSE 如何传 token

4. 排查第三台测试机 SSH 超时问题
   - 修好后可扩成 1 主控 + 2 远端 Agent 的完整测试拓扑
