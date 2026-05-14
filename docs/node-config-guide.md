# 节点配置教程

## 基本流程

1. 打开面板，进入“服务器”，确认目标小鸡在线。
2. 进入“节点配置”。
3. 选择服务器、协议和端口。
4. 点击“预览 JSON”检查 sing-box 配置。
5. 点击“下发并重启”，Agent 会写入配置、执行 `sing-box check`，通过后重启 sing-box。
6. 如配置有问题，可进入服务器详情的“配置”页面回滚历史版本。

## VMess + WebSocket

面板选择 `VMess + WebSocket`，常用字段：

- 监听端口：例如 `443` 或 `8080`
- UUID：客户端也要使用同一个 UUID
- WS 路径：例如 `/ws`

生成的是 sing-box `vmess` inbound，并带 `transport.type=ws`。

## VLESS + Reality

面板选择 `VLESS + Reality`，常用字段：

- 监听端口：常用 `443`
- UUID：客户端使用同一个 UUID
- SNI：例如 `www.cloudflare.com`
- Reality 私钥和 short_id

Reality 密钥可以在小鸡上执行：

```bash
docker exec chiken-singbox sing-box generate reality-keypair
```

把 private key 填进面板，public key 给客户端使用。

## 端口转发

面板选择 `端口转发`：

- 监听端口：公网入口端口
- 转发目标地址：目标 IP 或域名
- 转发目标端口：目标服务端口
- 网络：`tcp` 或 `udp`

实现方式是 sing-box `direct` inbound，适合简单 TCP/UDP 端口转发。

## SSH / 远程命令

进入服务器详情页，在“SSH / 远程命令”里输入一次性命令并执行。  
命令由 Agent 在目标小鸡上执行，结果会写入审计日志。当前不是完整交互式终端，适合安装、排错、查看状态等一次性命令。

## API Token

进入“API 令牌”页面生成 Token。自动化请求可以带：

```bash
curl -H "Authorization: Bearer ck_xxx" http://panel:7788/api/agents
```

默认面板不强制 API Token，生产环境可设置：

```bash
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_API_TOKEN=ck_your_bootstrap_token
```

这样除 `/api/health` 外，API 都需要 Token。

## Docker 端口说明

Docker 部署中 sing-box 使用 `network_mode: host`。因此通过面板新增的监听端口会直接在宿主机开放，不需要每次改 Compose 的 `ports`。
