# 节点配置、SSH 与转发指引

## 1. 服务器接入

1. 打开面板的“服务器”页。
2. 点击“生成接入 Token”或进入 SSH 页生成一键部署命令。
3. 在目标机上部署 Agent。
4. 确认服务器状态为 `online`。

## 2. WebSSH

现在服务器列表右侧直接有 `SSH` 入口。

首次使用：

1. 进入目标服务器的 `SSH` 页面。
2. 填写 `host / port / username / password` 或私钥。
3. 点击“保存 SSH”。
4. 点击“测试连接”。
5. 之后从服务器列表点 `SSH` 即可直接进入交互式终端。

说明：

- 默认优先走真实 SSH。
- 如果 SSH 凭据还没配好，也可以切换到 `Agent 执行` 兼容模式。

## 3. 一键部署 Agent

SSH 页面支持两种方式：

### 生成命令

点击“生成命令”后，会得到可直接执行的一键部署命令：

```bash
curl -fsSL http://panel:7788/install/agent.sh?bundle=xxxx | bash
```

### 直接通过 SSH 部署

保存好 SSH 凭据后，点击“通过 SSH 立即部署”，主控会把同一份安装脚本直接推到目标机执行。

### 部署模式

`systemd / Node`

- 适合目标机已经有 sing-box 服务的情况
- 会写入最小化 Agent 运行时并启动 systemd 服务

`Docker Compose`

- 适合从零接入的机器
- 会准备 sing-box 容器、Agent 容器、探针挂载和转发目录

## 4. 节点配置

进入“节点配置”页面：

1. 选择服务器。
2. 选择协议。
3. 表单会自动切换为该协议的字段。
4. 点击“预览 JSON”确认生成结果。
5. 点击“下发并重启”。

## 5. 各协议要点

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
- 同样会自动生成自签名证书

### Shadowsocks

- 默认使用 `aes-256-gcm`
- 适合快速做基础可用性验证

### Mixed

- 会开放一个 HTTP/SOCKS 混合代理端口
- 不适合长期暴露在公网

## 6. 端口转发

进入“端口转发”页面：

1. 选择服务器
2. 选择转发引擎
3. 选择网络类型
4. 填写监听地址、监听端口、目标地址、目标端口
5. 预览 JSON
6. 下发并启动

支持的引擎：

- `sing-box Direct`
- `Realm`
- `GOST`

特点：

- 每条规则都会以独立容器运行
- 不再覆盖当前节点配置
- 页面下方可以查看当前规则并删除

## 7. 实时探针

服务器详情页现在会实时展示：

- CPU
- 内存
- 磁盘
- 网络上下行速率
- 累计流量
- 趋势图

如果是 Docker 模式，请确保 Agent 容器保留：

- `/:/hostfs:ro`
- `CHIKEN_HOST_ROOT=/hostfs`

否则磁盘等指标会更偏向容器视角。

## 8. 建议测试方法

### 节点协议

不要只看端口有没有监听，最好：

1. 下发协议
2. 用另一台服务器或临时客户端连上
3. 通过该节点访问公网
4. 确认拿到正常 HTTP 响应

### TCP 转发

可把目标设成 `example.com:80`，然后请求转发端口并检查是否返回 `Example Domain`。

### UDP 转发

可把目标设成 `1.1.1.1:53`，然后发送真实 DNS 查询确认有回包。

### WebSSH

建议至少验证：

1. 能成功进入终端
2. `pwd`
3. `uname -a`
4. `exit`

### 一键部署

建议至少验证：

1. `systemd` 命令可生成
2. `Docker` 命令可生成
3. 安装脚本可通过 `sh -n`
4. 通过 SSH 直推时，目标机能正常写入服务或 Compose 文件
