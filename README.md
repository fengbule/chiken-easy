# chiken-easy

一个面向 `sing-box` 多服务器场景的轻量主控面板。

它由三部分组成：

- `server/`：主控 API、Web 面板、Agent WebSocket、SSH/WebSocket 终端、审计日志
- `agent/`：部署在每台服务器上的 Agent，负责配置下发、服务控制、日志读取、独立转发容器管理
- `web/`：React + Vite 面板

## 当前能力

- 服务器列表、详情、实时状态
- 节点配置向导
  - `VMess + WebSocket`
  - `VLESS + Reality`
  - `Trojan + TLS`
  - `Hysteria2`
  - `Shadowsocks`
  - `Mixed HTTP/SOCKS`
- 配置版本记录与回滚
- 真实 SSH 终端
  - 服务器列表右侧直接有 `SSH` 入口
  - 先保存目标服务器的 `host / port / username / password` 或私钥
  - 之后点击即可进入对应机器的 SSH 会话
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
- `VLESS + Reality` 客户端测试时需要 `public key + short_id + uTLS`。
- `Shadowsocks` 默认方法已改成更通用的 `aes-256-gcm`，避免 2022 系列密码格式问题。
- `Realm` 默认镜像使用 `4points/realm:latest`，因为测试环境对 `ghcr.io` 拉取不稳定。

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

仅 Agent：

```bash
docker compose -f docker-compose.agent.yml up -d --build
```

现在默认会额外挂载：

- `./data/sing-box`：主 `sing-box` 配置
- `./data/forwarders`：独立转发器运行数据

## 文档

- 开发文档：`docs/development.md`
- 节点配置与转发说明：`docs/node-config-guide.md`
