# 节点配置与转发指南

## 1. 服务器接入

1. 打开面板的“服务器”页。
1. 点击“生成接入 Token”。
1. 在目标机部署 Agent，并让它连到主控。
1. 确认服务器状态为 `online`。

## 2. 真实 SSH

现在服务器列表右侧直接有 `SSH` 入口。

首次使用：

1. 进入目标服务器的 `SSH` 页面。
1. 填写 `host / port / username / password` 或私钥。
1. 点击“保存 SSH”。
1. 点击“测试连接”。
1. 之后从服务器列表点 `SSH` 即可直接进入该机器的 shell。

如果只是临时执行命令，也可以切到 `Agent 执行` 模式。

## 3. 节点配置

进入“节点配置”页面：

1. 选择服务器。
1. 选择协议。
1. 表单会自动切换为该协议的字段。
1. 点击“预览 JSON”确认生成结果。
1. 点击“下发并重启”。

## 4. 各协议要点

### VMess + WebSocket

- 常用字段：端口、UUID、WS 路径
- 适合标准 WS 入站

### VLESS + Reality

- 常用字段：端口、UUID、SNI、私钥、short_id
- 客户端需要：
  - `public key`
  - `short_id`
  - `uTLS`

生成 Reality 密钥：

```bash
docker exec chiken-singbox sing-box generate reality-keypair
```

### Trojan + TLS

- 只要填密码和域名即可
- 如果证书文件不存在，Agent 会自动生成自签名证书

### Hysteria2

- 填密码、域名、上下行速率
- 也会自动生成自签名证书

### Shadowsocks

- 默认使用 `aes-256-gcm`
- 适合快速做基础可用性验证

### Mixed

- 会开放一个 HTTP/SOCKS 混合代理端口
- 不适合长期暴露在公网

## 5. 端口转发

进入“端口转发”页面：

1. 选择服务器
1. 选择转发引擎
1. 选择网络类型
1. 填写监听地址、监听端口、目标地址、目标端口
1. 预览 JSON
1. 下发并启动

支持的引擎：

- `sing-box Direct`
- `Realm`
- `GOST`

特点：

- 每条规则都会以独立容器运行
- 不再覆盖当前节点配置
- 页面下方可以查看当前规则并删除

## 6. API Token

“API 令牌”页面可以生成主控访问 token。

使用方式：

```bash
curl -H "Authorization: Bearer ck_xxx" http://panel:7788/api/agents
```

也可以直接带到浏览器：

```text
http://panel:7788/?token=ck_xxx
```

这样前端会自动带着 token 调 API、日志和终端。

## 7. 建议测试方法

### 节点协议

不要只看端口有没有监听，最好：

1. 下发协议
1. 用另一台服务器或临时客户端连上
1. 通过该节点访问公网
1. 确认拿到正常 HTTP 响应

### TCP 转发

可把目标设成 `example.com:80`，然后请求转发端口并检查是否返回 `Example Domain`。

### UDP 转发

可把目标设成 `1.1.1.1:53`，然后发送真实 DNS 查询确认有回包。
