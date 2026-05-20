# chiken-easy 开发报告（2026-05-20）

本文记录本轮对 `chiken-easy` 的集中开发、测试与部署情况。报告面向后续维护者和继续开发者，重点说明已经落地的能力、关键实现、验证结果和后续路线。

## 1. 开发目标

本轮开发的核心目标是把 `chiken-easy` 从单纯的 sing-box 多服务器控制面板，推进为集：

- 服务器控制
- Chiken Monitor 公开探针
- Agent 监控上报
- 探测任务分发
- 节点池与订阅分发
- Memos 风格笔记与文件管理
- 后台账号、通知和管理模块

于一体的综合面板。

整体思路不是把 Komari 或 sublinkPro 原样塞进项目，而是吸收它们的关键机制：

- 借鉴 Komari 的监控上报、公开探针、探测任务与长连接任务分发思路。
- 借鉴 sublinkPro 的节点导入、订阅链接输出、格式转换、模板化分流与分享链接思路。
- 保留 chiken-easy 原有的多服务器管理、sing-box 配置下发、Agent 控制、SSH、转发、回滚能力。

## 2. 当前架构概览

项目仍保持三层结构：

```text
server/
  index.js             主控 API、状态聚合、认证、订阅、Memos、通知、探测任务
  subscriptions.js     节点池、导入解析、订阅渲染、分流模板
  configFactory.js     sing-box 与转发配置生成

agent/
  index.js             Agent 心跳、探针采集、服务控制、配置应用、探测任务执行

web/src/
  App.jsx              React 单页后台、公开探针、订阅、Memos、探针管理
  style.css            后台与公开探针样式

docs/
  development.md
  node-config-guide.md
  development-report-2026-05-20.md
```

数据仍采用轻量文件存储：

- 主状态：`data/state.json`
- 审计日志：`data/audit.jsonl`
- Memos 附件：`data/memos/files/`

## 3. Chiken Monitor 公开探针

### 3.1 公开页定位

访问根路径 `/` 时默认进入公开探针，不需要登录。管理员入口放在右上角，点击后进入 `/admin` 登录后台。

公开探针保持隐私约束：

- 不输出服务器 `host`
- 不输出服务器 `ip`
- 不展示 SSH/RDP 连接信息
- 只展示面向公开访问安全的状态字段

公开 API：

```http
GET /api/public/probes
GET /api/public/events
```

### 3.2 已实现展示字段

公开探针卡片现在包含：

- 在线状态
- 节点公开名称
- 国旗
- 地区
- 系统发行版
- 内核
- CPU 使用率
- CPU 核心数
- 内存使用率
- 磁盘使用率
- 实时上下行速率
- 累计上下行流量
- 采样间隔
- 网卡数量
- 运行时间
- 最近更新时间
- 账单、价格、到期、备注等可选展示字段

### 3.3 UI 调整

公开探针已经从早期灰色卡片风格调整为更清爽的 Chiken Monitor 风格：

- 顶部品牌栏与管理员入口固定对齐。
- 卡片尺寸收紧，避免占屏过大。
- 卡片宽度、内边距、标题、标签、进度条均缩小。
- 摘要栏展示在线数量、地区数、累计流量、实时速率。
- 管理员入口、刷新、GitHub 按钮统一尺寸。

### 3.4 国旗处理

此前后台保存 `HK`、`JP`、`US` 等代号时，公开页可能直接显示代号。本轮修复为：

- 后端保存探针配置时会将两位国家/地区代码转换为国旗 emoji。
- 前端展示旧数据时也会实时将 `HK` 等代号转换为国旗。
- 不再把代号直接显示在公开探针卡片。

相关逻辑：

- `server/index.js`
  - `countryCodeToFlag`
  - `normalizeFlag`
- `web/src/App.jsx`
  - `countryCodeToFlag`
  - `isFlagEmoji`
  - `inferFlag`
  - `normalizeFlagInput`

## 4. Agent 监控上报

### 4.1 上报字段

Agent 心跳现在会持续上报：

- `updatedAt`
- `uptime`
- `system`
  - `platform`
  - `arch`
  - `distro`
  - `distroId`
  - `distroVersion`
  - `kernel`
- `load`
- `cpu`
  - `usage`
  - `cores`
  - `model`
- `memory`
  - `total`
  - `used`
  - `free`
  - `usage`
- `swap`
- `disk`
- `network`
  - `rawRxBytes`
  - `rawTxBytes`
  - `rxBytes`
  - `txBytes`
  - `totalRxBytes`
  - `totalTxBytes`
  - `rxSpeed`
  - `txSpeed`
  - `rxDelta`
  - `txDelta`
  - `sampleInterval`
  - `interfaces`
- `process.count`

### 4.2 统计口径优化

为了避免 Docker 容器内统计误差，Agent 支持读取宿主机路径：

- `CHIKEN_HOST_PROC=/host/proc`
- `CHIKEN_HOST_ETC=/host/etc`
- `CHIKEN_DISK_PATH=/host/proc/1/root`

Compose 已挂载：

```yaml
- /proc:/host/proc:ro
- /etc:/host/etc:ro
```

优化点：

- 内存和 Swap 从宿主机 `/host/proc/meminfo` 读取。
- uptime 从宿主机 `/host/proc/uptime` 读取。
- load 从宿主机 `/host/proc/loadavg` 读取。
- 网络从宿主机 `/host/proc/net/dev` 读取。
- 系统发行版从 `/host/etc/os-release` 读取。
- 网络统计默认排除 `lo`、Docker bridge、veth、tun/tap 等虚拟接口，可通过 `CHIKEN_NET_INTERFACES` 指定接口。

### 4.3 累计流量与实时速率

Server 端新增了流量会计逻辑：

- 使用 Agent 上报的 raw counter 作为原始来源。
- Server 端保存 `trafficCounters`。
- 处理网卡计数器回绕或重启后的累计逻辑。
- 使用真实心跳间隔计算速率。
- 公开页展示累计流量和实时速率。

## 5. 探针管理后台

### 5.1 入口

后台左侧导航有 `探针管理`，内部用模块卡片承载多个 Chiken Monitor 管理能力。

模块包括：

- 服务器
- 站点
- 主题管理
- 登录
- 通知
- 通用
- 离线通知
- 负载通知
- 远程执行
- 延迟监测
- 会话管理
- 账户
- 日志
- 关于
- 文档
- 主页
- 默认主题设置

### 5.2 探针卡片编辑

后台可以编辑公开探针卡片：

- 公开名称
- 国旗
- 分组
- 地区
- 系统显示
- 排序
- 价格标签
- 到期/余量标签
- 账单备注
- 总流量 GB
- 标签
- 是否公开显示
- 卡片备注

人机交互优化：

- 增加卡片预览。
- 增加常用地区快捷按钮。
- 支持填入 Agent 信息。
- 支持清空账单标签。
- 明确提示公开页不会输出服务器 IP 或主机地址。

## 6. 探测任务机制

### 6.1 支持类型

当前实现：

- ICMP Ping
- TCP Ping
- HTTP Ping

Server 保存任务，按间隔向在线 Agent 下发；Agent 执行后回传：

- 是否成功
- 延迟
- 状态码
- 输出摘要
- 执行 Agent
- 更新时间

相关接口：

```http
GET    /api/probe-tasks
POST   /api/probe-tasks
PUT    /api/probe-tasks/:id
POST   /api/probe-tasks/:id/run
DELETE /api/probe-tasks/:id
```

### 6.2 前端优化

探测任务页已加入快捷预设：

- TCP 443
- HTTP 204
- ICMP

运行任务后会提示已下发节点数量；删除任务前会确认，避免误删。

### 6.3 后续 Proxy 探测

Proxy 探测仍是下一阶段重点。建议在现有任务总线上继续扩展：

- 指定节点或转发链
- 通过代理请求目标 URL
- 检测出口 IP
- 检测出口地区
- 验证预期路由
- 输出延迟、可用性、出口信息和评分

## 7. 通知系统

### 7.1 已实现通道

支持：

- Webhook
- Telegram
- Webhook + Telegram

配置字段：

- 离线通知开关
- 负载通知开关
- CPU 阈值
- 内存阈值
- 磁盘阈值
- 冷却分钟
- Webhook URL
- Telegram Bot Token
- Telegram Chat ID
- Telegram API Base

### 7.2 告警策略

当前触发条件：

- Agent 离线
- CPU 超阈值
- 内存超阈值
- 磁盘超阈值

通过冷却时间避免短时间重复告警。

### 7.3 测试按钮

后台通知页提供“发送测试通知”按钮。按钮会先保存当前配置，再发送测试通知。

## 8. 订阅模块

### 8.1 节点池

新增统一节点池，用来承载：

- 面板自建节点
- 外部导入节点
- 转发/中转节点

节点统一字段包括：

- 名称
- 协议
- 地址
- 端口
- 来源
- 标签
- 地区
- 健康状态
- 元数据

### 8.2 节点导入

支持导入常见代理节点文本或订阅内容，解析后进入统一节点池。

已覆盖方向：

- vmess
- vless
- trojan
- shadowsocks
- hysteria2
- mixed/http/socks 相关结构
- Clash YAML 中常见 proxy 字段

### 8.3 订阅输出

订阅模块支持生成分享链接：

```text
/sub/:token
```

输出能力包括：

- base64 / v2rayN 风格输出
- Clash 风格输出
- sing-box 风格输出
- 分流模板
- 节点筛选
- 去重
- 排序
- 访问次数统计
- 过期控制
- 最大访问次数控制

### 8.4 内置分流模板

`server/subscriptions.js` 内置 `routeTemplates`，作为后续分流策略的基础。

## 9. Memos 风格笔记模块

新增 `Memos 笔记` 分区，实现轻量笔记与文件保存。

能力包括：

- 创建笔记
- 编辑笔记
- 删除笔记
- 归档
- 置顶
- 标签
- 搜索
- 上传附件
- 下载附件
- 删除附件
- 常见文件类型保存

附件接口：

```http
POST   /api/memos/files
GET    /api/memos/files/:id/download
DELETE /api/memos/files/:id
```

当前上传限制为 200 MB，文件存放于：

```text
data/memos/files/
```

## 10. 后台账号与权限

当前后台支持：

- 登录页
- 会话管理
- 修改管理员密码
- API Token
- 退出登录

API Token 可通过：

```http
Authorization: Bearer ck_xxx
```

或：

```text
?token=ck_xxx
```

进入面板和调用接口。

## 11. 隐私与安全处理

本轮特别注意：

- 公开探针不暴露服务器 IP。
- 公开探针不暴露服务器 host。
- 公开探针不输出 SSH/RDP 凭据。
- 文档不写入任何真实密码、密钥或凭据内容。
- 测试服务器凭据仅用于部署连接，不进入 Git 仓库。
- 本地测试产生的 `data/`、`node_modules/`、`dist/`、`.tools/` 均已清理。

## 12. 测试记录

### 12.1 本地构建

已多次执行：

```bash
npm run lint
npm run build
```

结果：

- `scripts/check.mjs` 通过。
- Vite production build 通过。

### 12.2 本地 smoke test

使用 mock Agent 覆盖：

- Agent 注册
- 心跳上报
- 公开探针数据
- 不泄露 host/ip
- 系统发行版字段
- 网络速率字段
- 探针配置保存
- 国旗 `HK` 归一为 `🇭🇰`
- Telegram 通知设置保存
- 探测任务下发与结果回传

### 12.3 远端部署测试

已部署到测试入口：

```text
http://38.76.178.252:7788/
```

远端验证结果：

- `/api/health` 正常。
- 公开页资源已更新。
- 3 台 Agent 在线。
- 3 台 Agent 均上报系统字段。
- 公开 API 不包含 `host` / `ip` 字段。
- 公开页包含新 Chiken Monitor 样式资源。
- 后台探针管理资源包含新功能入口。

## 13. 最近提交摘要

本轮相关提交包括：

```text
a39a3c8 fix: polish monitor cards and flags
40bae0b feat: refresh monitor probe experience
da567e0 feat: implement monitor notifications
9278f81 feat: improve probe accuracy and subscription routing
a8489f7 feat: add memos-style notes workspace
d624c9e feat: enrich subscription workspace
b9b82cc feat: add cumulative traffic and subscription manager
dda6982 fix: move monitor modules into probe management
```

## 14. 已知限制

目前仍建议继续完善：

- Proxy 探测尚未完全落地。
- 订阅导入对复杂 Clash Provider、规则集和插件字段仍可继续增强。
- 节点质量评分还只是基础数据准备阶段。
- 公开探针的图表历史数据还未做长期存储。
- Memos 附件目前是本地文件存储，还没有对象存储适配。
- 当前状态存储仍是 JSON 文件，节点规模变大后建议迁移 SQLite 或 Postgres。
- Telegram/Webhook 告警只覆盖基础负载和离线，后续可扩展为规则引擎。

## 15. 推荐后续路线

### Phase 1：Proxy 探测

- 增加代理探测任务类型。
- 输出出口 IP、出口地区、延迟、可用性。
- 将结果写回节点池。

### Phase 2：节点质量评分

- 基于延迟、成功率、最近失败、地区匹配进行评分。
- 在订阅输出中按评分排序。

### Phase 3：历史数据

- 增加探针历史采样。
- 绘制 CPU、内存、磁盘、速率、流量趋势。

### Phase 4：订阅模板增强

- 增加更多 Clash / sing-box / v2rayN 输出模板。
- 支持远程规则集。
- 支持按用户、设备、地区生成 profile。

### Phase 5：存储升级

- 将 `state.json` 拆分为 SQLite。
- 审计日志和探针历史独立表。
- 附件元数据和订阅访问日志结构化。

## 16. 结论

本轮开发后，`chiken-easy` 已经从 sing-box 多服务器面板，扩展为包含 Chiken Monitor 探针、监控上报、探测任务、通知、订阅分发、Memos 笔记与文件保存的一体化平台。

当前最值得继续推进的方向是 Proxy 探测与节点质量评分。完成后，订阅分发可以从“手动节点池输出”升级为“基于真实网络质量的智能分发”。
