# chiken-easy

一个面向 sing-box 多小鸡管理的轻量面板：一台中控提供 Web 面板，任意多台小鸡安装 Agent 后通过长连接上线，像转发面板一样集中管理配置、服务和日志。

## 功能

- 中控 Web 面板：仪表盘、服务器列表、详情页、审计日志、接入 Token。
- Agent 长连接：默认 WebSocket，可放在 Nginx/Caddy 后面启用 TLS/mTLS。
- sing-box 配置：读取、编辑、下发、校验、备份、回滚、应用后重启。
- 服务控制：启动、停止、重启、查询 sing-box 状态。
- 日志查看：SSE 实时推流，支持读取最近 N 行。
- 预设命令：状态、重启、日志、配置校验，可在服务端扩展。
- 协议模板：覆盖 shadowsocks、vmess、vless、trojan、hysteria2、tuic、naive、wireguard、socks、http、mixed。
- 节点向导：支持 VMess+WS、VLESS+Reality、Trojan、Hysteria2、Shadowsocks、Mixed 和 TCP/UDP 端口转发。
- SSH / 远程命令：通过 Agent 在目标小鸡执行一次性命令。
- API Token：支持生成自动化令牌，生产环境可强制 Bearer Token。
- 卸载 Agent：在服务器详情页可移除目标节点 Agent。

节点配置教程见 [docs/node-config-guide.md](docs/node-config-guide.md)。

## 快速开始

```bash
npm install
npm run build
PORT=7788 npm start
```

Docker 部署中控和本机 Agent：

```bash
sh scripts/install-docker.sh
sh scripts/prepare-docker.sh
docker compose -f docker-compose.server.yml up -d --build
```

仅部署 Agent 到其他小鸡：

```bash
sh scripts/install-docker.sh
sh scripts/prepare-docker.sh
printf "CHIKEN_SERVER=ws://中控IP:7788/agent\nCHIKEN_TOKEN=中控.env里的Token\n" > .env
docker compose -f docker-compose.agent.yml up -d --build
```

开发模式：

```bash
npm install
npm run dev
```

中控默认监听 `http://127.0.0.1:7788`。

## 接入 Agent

先在面板的“服务器”页面生成接入 Token，然后在小鸡上运行：

```bash
export CHIKEN_SERVER=ws://你的中控IP:7788/agent
export CHIKEN_TOKEN=面板生成的Token
export SINGBOX_CONFIG=/etc/sing-box/config.json
npm install --omit=dev
npm run dev:agent
```

生产环境建议用 systemd 托管 Agent，参考 `scripts/chiken-agent.service`。

## mTLS 部署建议

Agent 代码已支持 `CHIKEN_CERT`、`CHIKEN_KEY`、`CHIKEN_CA`。实际部署时建议：

1. Caddy/Nginx 负责 HTTPS 和客户端证书校验。
2. `/agent` 反代到中控 `127.0.0.1:7788/agent`。
3. Agent 使用 `wss://你的域名/agent` 并配置客户端证书。

这样中控应用层仍保持简单，证书生命周期交给成熟网关处理。

## 项目结构

```text
server/       中控 API、WebSocket Agent 通道、审计、SSE
agent/        小鸡端 Agent，负责 sing-box 操作
web/          React Web 面板
templates/    sing-box 常用协议模板
scripts/      安装与 systemd 示例
docs/         架构说明
```

## 注意

这个仓库的第一版目标是把“集中管理 sing-box 小鸡”的主路径跑通。真实公网生产使用前，请务必开启 HTTPS/mTLS、限制面板访问源、定期轮换接入 Token，并确认预设命令范围符合你的安全预期。
