# chiken-easy

一个面向 `sing-box` 多服务器场景的轻量主控面板。

当前仓库已经把下面这些能力正式落地，不再是待办想法：

- 服务器列表、详情、在线状态和实时探针
- 类似 Komari 的 WebSSH 终端
  - 服务器列表右侧直接点 `SSH` 即可进入终端
  - 同时保留密码和私钥两种认证方式
- 一键部署 Agent
  - 支持 `systemd / Node` 模式
  - 支持 `Docker Compose` 模式
  - 支持直接复用当前保存的 SSH 凭据远程执行部署
- 节点配置向导
  - `VMess + WebSocket`
  - `VLESS + Reality`
  - `Trojan + TLS`
  - `Hysteria2`
  - `Shadowsocks`
  - `Mixed HTTP/SOCKS`
- 订阅聚合
  - 已下发过的本地节点可直接聚合成订阅链接
  - 支持手动粘贴外部原始订阅内容，不要求提供订阅链接
  - 支持 3 个内置 Clash 模板切换
- 独立端口转发
  - `sing-box`
  - `Realm`
  - `GOST`
  - `TCP / UDP / TCP+UDP`
- API Token
  - 支持 `Authorization: Bearer ck_xxx`
  - 支持 `?token=ck_xxx` 直接进入主控
  - 方便脚本或 AI 代理直接接管主控

## 关键说明

- `Trojan` 和 `Hysteria2` 首次下发时，如果目标证书文件不存在，Agent 会自动生成自签名证书。
- 切换节点协议时，表单会自动替换成该协议自己的字段和默认值，不再保留上一种协议的残留参数。
- `VLESS + Reality` 如果希望后续能直接导出为可用订阅，除了私钥，还需要把对应 `public key` 一起填入面板。
- `Shadowsocks` 默认算法已固定为更通用的 `aes-256-gcm`。
- Docker 模式下，Agent 会额外挂载宿主机根目录只读视图，用于探针读取更接近真实宿主机的数据。

## 本地开发

```bash
npm install
npm run dev
```

单独启动主控：

```bash
npm run dev:server
```

单独启动 Web：

```bash
npm run dev:web
```

单独启动 Agent：

```bash
CHIKEN_SERVER=ws://127.0.0.1:7788/agent \
CHIKEN_TOKEN=ce_xxx \
CHIKEN_AGENT_NAME=local-agent \
npm run dev:agent
```

构建：

```bash
npm run build
```

检查：

```bash
npm run lint
```

Windows PowerShell 如果执行策略拦截：

```powershell
npm.cmd run build
npm.cmd run lint
```

## Docker 部署

主控机：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

Agent 机：

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

默认关键挂载：

- `./data/sing-box:/etc/sing-box`
- `./data/forwarders:/app/forwarders`
- `/:/hostfs:ro`

关键环境变量：

- `CHIKEN_PUBLIC_BASE_URL`
- `CHIKEN_PUBLIC_WS_URL`
- `CHIKEN_PROBE_INTERVAL`
- `CHIKEN_HOST_ROOT`
- `CHIKEN_FORWARDER_DIR`
- `CHIKEN_FORWARDER_HOST_DIR`
- `CHIKEN_REALM_IMAGE`
- `CHIKEN_GOST_IMAGE`

## 一键部署

SSH 页面现在同时支持两条路径：

1. 生成可直接复制执行的一键部署命令
2. 直接通过当前保存的 SSH 凭据从面板远程执行部署

`systemd / Node` 模式更适合目标机已经有 sing-box 服务的场景。

`Docker Compose` 模式更适合从零接入，会同时准备 `sing-box`、`agent`、探针挂载和转发目录。

## 订阅聚合

订阅页支持三种来源混合：

- 已经通过面板下发过的本地节点
- 直接粘贴的 URI 列表
- 直接粘贴的 Clash YAML 原始内容

当前内置模板：

- `Clash Rule Basic`
- `Clash Global`
- `Clash Fallback`

公开订阅链接格式：

```text
http://panel:7788/sub/<public-token>
```

## 文档

- 开发文档：`docs/development.md`
- 架构说明：`docs/architecture.md`
- 节点、SSH、订阅与转发操作指南：`docs/node-config-guide.md`
