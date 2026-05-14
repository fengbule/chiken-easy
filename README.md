# chiken-easy

一个面向 `sing-box` 多服务器场景的轻量主控面板。

它由三部分组成：

- `server/`：主控 API、Web 面板、Agent WebSocket、WebSSH 终端、安装脚本下发与审计日志
- `agent/`：部署在每台服务器上的 Agent，负责配置下发、服务控制、日志读取、探针采集与独立转发容器管理
- `web/`：React + Vite 面板

## 当前能力

- 服务器列表、详情、实时状态
- WebSSH
  - 服务器列表右侧直接点 `SSH` 就能进入终端
  - 保留密码和私钥两种认证方式
  - 终端支持原始按键、粘贴和窗口自动 resize
- 一键部署 Agent
  - SSH 页面可以生成 `systemd / Node` 一键部署命令
  - 也可以生成 `Docker Compose` 一键部署命令
  - 保存好 SSH 配置后，可以直接通过面板走 SSH 执行部署
- 实时探针
  - 持续上报 `CPU / 内存 / 磁盘 / 网络速率 / 累计流量 / 负载 / 运行时长`
  - 面板展示实时卡片和趋势图，体验更接近 Komari / 哪吒监控
- 节点配置向导
  - `VMess + WebSocket`
  - `VLESS + Reality`
  - `Trojan + TLS`
  - `Hysteria2`
  - `Shadowsocks`
  - `Mixed HTTP/SOCKS`
- 配置版本记录与回滚
- 端口转发
  - 使用独立容器运行，不再覆盖当前节点配置
  - 支持 `sing-box`、`Realm`、`GOST`
  - 支持 `TCP`、`UDP`、`TCP + UDP`
- API Token
  - 支持 `Authorization: Bearer ck_xxx`
  - 也支持通过 `?token=ck_xxx` 直接进入主控
  - 前端会自动把 token 注入 API、SSE 和终端 WebSocket，方便脚本或 AI 接管

## 重要实现说明

- `Trojan` 和 `Hysteria2` 首次下发时，如果配置里引用的证书文件不存在，Agent 会自动生成自签名证书。
- 切换节点协议时，表单会自动替换成该协议自己的字段和默认值，不再沿用上一种协议的残留参数。
- `VLESS + Reality` 客户端测试时需要 `public key + short_id + uTLS`。
- `Shadowsocks` 默认方法已改成更通用的 `aes-256-gcm`。
- 探针数据通过 Agent 心跳持续上报，不需要额外部署监控服务端。
- Docker 模式下 Agent 会额外挂载只读宿主机根目录，用于读取更接近真实机器的磁盘与系统指标。

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

## Docker 部署

主控机：

```bash
docker compose -f docker-compose.server.yml up -d --build
```

Agent 机：

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

现在默认会额外挂载：

- `./data/sing-box`：主 `sing-box` 配置
- `./data/forwarders`：独立转发器运行数据
- `/:/hostfs:ro`：只读宿主机根目录，供探针读取宿主机磁盘与系统信息

相关环境变量：

- `CHIKEN_PUBLIC_BASE_URL`：手动指定安装命令里返回的 HTTP 基地址
- `CHIKEN_PUBLIC_WS_URL`：手动指定 Agent 一键部署后的 WebSocket 接入地址
- `CHIKEN_PROBE_INTERVAL`：探针心跳间隔，单位秒，默认 `5`
- `CHIKEN_HOST_ROOT`：探针读取宿主机指标时使用的根路径，Docker 模式默认为 `/hostfs`

## 一键部署命令

SSH 页面现在支持两种形式：

1. 生成可复制的一键部署命令
2. 直接复用当前保存的 SSH 凭据，通过面板远程执行部署

`systemd / Node` 模式：

- 适合机器上已经有 sing-box 服务的场景
- 会安装最小化 Agent 运行时、写入 systemd 服务并启动

`Docker Compose` 模式：

- 适合从零接入的机器
- 会准备 `sing-box` 容器、`agent` 容器、探针挂载和转发目录

## 文档

- 开发文档：`docs/development.md`
- 架构说明：`docs/architecture.md`
- 节点配置与转发说明：`docs/node-config-guide.md`
