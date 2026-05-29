import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ClipboardList,
  Code2,
  KeyRound,
  Link2,
  Monitor,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Shuffle,
  Trash2,
  Unplug
} from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import "./style.css";
import {
  TOKEN_KEY,
  api,
  downloadBinary,
  ensureTokenSession,
  fetchText,
  getActiveApiToken,
  loadStoredToken,
  persistToken,
  setActiveApiToken,
  uploadForm
} from "./api";
import {
  buildAuthUrl,
  copyText,
  formatBytes,
  formatDateTime,
  formatPercent,
  formatSpeed,
  formatUptime,
  joinTags,
  newUuid,
  parseCommaList,
  randPassword,
  randPath,
  randPort,
  randShortId,
  renderMarkdownHtml
} from "./utils";
import Layout from "./components/Layout";
import StatusBadge, { StatusDot } from "./components/StatusBadge";

const URL_TOKEN_PARAM = "token";

function isPanelApiToken(token) {
  return String(token || "").trim().startsWith("ck_");
}

const nav = [
  ["dashboard", Activity, "仪表盘"],
  ["servers", Monitor, "服务器"],
  ["console", PlugZap, "终端 / SFTP"],
  ["nodes", Code2, "节点配置"],
  ["node-pool", Code2, "节点池"],
  ["subscriptions", Link2, "订阅聚合"],
  ["forward", PlugZap, "端口转发"],
  ["monitor", Activity, "监控告警"],
  ["workspace", KeyRound, "资产 / 凭据 / 脚本"],
  ["memos", ClipboardList, "Memos / 文件"],
  ["tokens", KeyRound, "API 令牌"],
  ["audit", ClipboardList, "审计日志"],
  ["settings", Settings, "设置"]
];

const protocolDefinitions = {
  "vmess-ws": {
    name: "VMess + WebSocket",
    note: "适合走 WebSocket 场景，切换到这个协议时会自动生成新的 UUID 和路径。",
    defaults: () => ({
      protocol: "vmess-ws",
      port: 20080,
      listen: "::",
      uuid: newUuid(),
      path: randPath()
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "path", label: "WS 路径", random: () => randPath() },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  "vless-reality": {
    name: "VLESS + Reality",
    note: "Reality 需要服务端私钥和 short_id。切换协议时会自动刷新这些默认字段，但请替换成你实际可用的密钥。",
    defaults: () => ({
      protocol: "vless-reality",
      port: 443,
      listen: "::",
      uuid: newUuid(),
      serverName: "www.cloudflare.com",
      serverPort: 443,
      privateKey: "CHANGE_ME_REALITY_PRIVATE_KEY",
      publicKey: "",
      shortId: randShortId(),
      flow: "xtls-rprx-vision",
      clientFingerprint: "chrome"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => 443 },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "serverName", label: "SNI / 握手域名", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "serverPort", label: "握手端口", type: "number" },
      { key: "privateKey", label: "Reality 私钥" },
      { key: "publicKey", label: "Reality 公钥" },
      { key: "shortId", label: "Reality short_id", random: () => randShortId() },
      { key: "flow", label: "Flow" },
      { key: "clientFingerprint", label: "客户端指纹" },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  trojan: {
    name: "Trojan + TLS",
    note: "面板下发时会自动为当前 inbound 生成自签名证书。测试客户端可先用 insecure 模式验证联通性。",
    defaults: () => ({
      protocol: "trojan",
      port: 443,
      listen: "::",
      password: randPassword(),
      serverName: "www.cloudflare.com"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => 443 },
      { key: "password", label: "密码", random: () => randPassword() },
      { key: "serverName", label: "TLS 域名", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  hysteria2: {
    name: "Hysteria2",
    note: "同样会自动补齐自签名证书，并提供上下行速率字段，便于直接从面板完成可用配置。",
    defaults: () => ({
      protocol: "hysteria2",
      port: 8443,
      listen: "::",
      password: randPassword(),
      serverName: "www.cloudflare.com",
      upMbps: 100,
      downMbps: 100
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      { key: "password", label: "密码", random: () => randPassword() },
      { key: "serverName", label: "TLS 域名", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "upMbps", label: "上行 Mbps", type: "number" },
      { key: "downMbps", label: "下行 Mbps", type: "number" },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  shadowsocks: {
    name: "Shadowsocks",
    note: "默认方法改成了更通用的 aes-256-gcm，避免 2022 系列密码长度不匹配导致的直接不可用。",
    defaults: () => ({
      protocol: "shadowsocks",
      port: 8388,
      listen: "::",
      method: "aes-256-gcm",
      password: randPassword()
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      {
        key: "method",
        label: "加密方法",
        type: "select",
        options: [
          ["aes-256-gcm", "aes-256-gcm"],
          ["chacha20-ietf-poly1305", "chacha20-ietf-poly1305"],
          ["2022-blake3-aes-128-gcm", "2022-blake3-aes-128-gcm"]
        ]
      },
      { key: "password", label: "密码", random: () => randPassword() },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  mixed: {
    name: "Mixed HTTP/SOCKS",
    note: "这是最简单的本地代理入口，适合先做基础联通测试。",
    defaults: () => ({
      protocol: "mixed",
      port: 2080,
      listen: "::"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  }
};

const forwardEngineOptions = [
  ["sing-box", "sing-box Direct"],
  ["realm", "Realm"],
  ["gost", "GOST"]
];

const forwardNetworkOptions = [
  ["tcp", "TCP"],
  ["udp", "UDP"],
  ["tcp_udp", "TCP + UDP"]
];

function defaultProtocolForm(protocol = "vmess-ws") {
  return {
    exportName: "",
    exportHost: "",
    ...(protocolDefinitions[protocol]?.defaults() || protocolDefinitions["vmess-ws"].defaults())
  };
}

function defaultForwardForm() {
  return {
    engine: "sing-box",
    network: "tcp",
    listen: "0.0.0.0",
    port: 31080,
    targetHost: "example.com",
    targetPort: 80,
    name: ""
  };
}

const subscriptionTemplateFallback = [
  ["clash-basic", "Clash Rule Basic"],
  ["clash-global", "Clash Global"],
  ["clash-fallback", "Clash Fallback"]
];

function defaultSubscriptionForm() {
  return {
    id: "",
    name: "",
    template: "clash-basic",
    publicToken: "",
    localNodes: [],
    imports: [],
    format: "clash",
    enabled: true,
    expiresAt: "",
    maxAccessCount: 0,
    onlyHealthy: false,
    hideTags: false,
    sortBy: "name",
    filterTags: [],
    filterRegions: [],
    nodeIds: []
  };
}

function defaultSubscriptionImport() {
  return {
    id: newUuid(),
    name: "外部原始内容",
    content: ""
  };
}

function Panel({ title, right, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Card({ label, value, green, blue }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className={green ? "green" : blue ? "blue" : ""}>{value}</b>
    </div>
  );
}

function Field({ label, value, onChange, random, type = "text", placeholder = "", options = [], rows = 4 }) {
  let control = null;
  if (type === "select") {
    control = (
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea className="inline-textarea" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
  } else {
    control = <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
  }

  return (
    <label>
      {label}
      <div className="input-row">
        {control}
        {random ? (
          <button type="button" className="icon-btn" onClick={random} title="随机生成">
            <Shuffle size={15} />
          </button>
        ) : null}
      </div>
    </label>
  );
}

function AccessTokenBar({ tokenDraft, setTokenDraft, saveToken, clearToken, hasToken }) {
  return (
    <div className="token-access">
      <input value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="API Token (ck_xxx)" />
      <button className="primary" onClick={saveToken}>
        <Save size={15} />
        使用令牌
      </button>
      {hasToken ? (
        <button onClick={clearToken}>
          <Unplug size={15} />
          清除
        </button>
      ) : null}
    </div>
  );
}

function MetricPill({ label, value, accent }) {
  return (
    <div className={`metric-pill ${accent || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TrendChart({ points, color = "#348dff" }) {
  const values = (points || []).map((item) => Number(item || 0));
  const width = 220;
  const height = 54;
  if (!values.length || values.every((value) => value === 0)) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart">
        <line x1="0" y1={height - 10} x2={width} y2={height - 10} stroke="rgba(52,141,255,0.18)" strokeWidth="2" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const coordinates = values.map((value, index) => {
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((height - 8 - ((value - min) / range) * (height - 18)) * 100) / 100;
    return [x, y];
  });
  const linePath = coordinates.map(([x, y], index) => `${index ? "L" : "M"} ${x} ${y}`).join(" ");
  const areaPath = `${linePath} L ${coordinates[coordinates.length - 1][0]} ${height} L ${coordinates[0][0]} ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart">
      <path d={areaPath} fill="rgba(52,141,255,0.14)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProbeOverview({ metrics }) {
  if (!metrics) return <p className="panel-message">探针正在等待首个心跳，通常几秒内会刷新。</p>;

  return (
    <div className="probe-grid">
      <MetricPill label="CPU" value={formatPercent(metrics.cpu?.usage)} accent="cpu" />
      <MetricPill label="内存" value={`${formatPercent(metrics.memory?.usage)} / ${formatBytes(metrics.memory?.used)} / ${formatBytes(metrics.memory?.total)}`} accent="memory" />
      <MetricPill label="磁盘" value={`${formatPercent(metrics.disk?.usage)} / ${formatBytes(metrics.disk?.used)} / ${formatBytes(metrics.disk?.total)}`} accent="disk" />
      <MetricPill label="网络" value={`↓ ${formatSpeed(metrics.network?.rxRate)}  ↑ ${formatSpeed(metrics.network?.txRate)}`} accent="network" />
      <MetricPill label="累计流量" value={`↓ ${formatBytes(metrics.network?.rxTotal)}  ↑ ${formatBytes(metrics.network?.txTotal)}`} />
      <MetricPill label="运行时长" value={formatUptime(metrics.uptimeSec)} />
      <MetricPill label="负载" value={`${metrics.cpu?.load1 || 0} / ${metrics.cpu?.load5 || 0} / ${metrics.cpu?.load15 || 0}`} />
      <MetricPill label="接口" value={(metrics.network?.interfaces || []).join(", ") || "-"} />
    </div>
  );
}

function ProbeTrends({ history }) {
  const rows = [
    ["CPU", (history || []).map((item) => item.cpu), `${formatPercent(history?.at(-1)?.cpu || 0)}`],
    ["内存", (history || []).map((item) => item.memory), `${formatPercent(history?.at(-1)?.memory || 0)}`],
    ["下行", (history || []).map((item) => item.rxRate), formatSpeed(history?.at(-1)?.rxRate || 0)],
    ["上行", (history || []).map((item) => item.txRate), formatSpeed(history?.at(-1)?.txRate || 0)]
  ];

  if (!history?.length) return <p className="panel-message">暂时还没有足够的实时样本用于绘图。</p>;

  return (
    <div className="trend-grid">
      {rows.map(([label, values, current]) => (
        <div className="trend-card" key={label}>
          <div className="trend-head">
            <strong>{label}</strong>
            <span>{current}</span>
          </div>
          <TrendChart points={values} />
        </div>
      ))}
    </div>
  );
}

function AgentMetricSummary({ metrics }) {
  if (!metrics) return <span className="muted">等待探针</span>;
  return (
    <div className="metric-inline">
      <span>CPU {formatPercent(metrics.cpu?.usage)}</span>
      <span>MEM {formatPercent(metrics.memory?.usage)}</span>
      <span>DISK {formatPercent(metrics.disk?.usage)}</span>
    </div>
  );
}

function AgentTrafficSummary({ metrics }) {
  if (!metrics) return <span className="muted">等待探针</span>;
  return (
    <div className="metric-inline">
      <span>↓ {formatSpeed(metrics.network?.rxRate)}</span>
      <span>↑ {formatSpeed(metrics.network?.txRate)}</span>
    </div>
  );
}

function PublicStatusPage() {
  const [summary, setSummary] = useState(null);
  const [probes, setProbes] = useState([]);
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [probesData, eventRows] = await Promise.all([
        fetch("/api/public/probes").then((response) => response.json()),
        fetch("/api/public/events").then((response) => response.json())
      ]);
      const publicProbes = Array.isArray(probesData) ? probesData : [];
      setSummary({
        total: publicProbes.length,
        online: publicProbes.filter((probe) => probe.online).length,
        offline: publicProbes.filter((probe) => !probe.online).length,
        regions: new Set(publicProbes.map((probe) => probe.region).filter(Boolean)).size,
        totalTraffic: publicProbes.reduce((sum, probe) => sum + Number(probe.metrics?.rxBytes || 0) + Number(probe.metrics?.txBytes || 0), 0),
        totalRxSpeed: publicProbes.reduce((sum, probe) => sum + Number(probe.metrics?.rxSpeed || 0), 0),
        totalTxSpeed: publicProbes.reduce((sum, probe) => sum + Number(probe.metrics?.txSpeed || 0), 0)
      });
      setProbes(publicProbes);
      setEvents(Array.isArray(eventRows) ? eventRows : []);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);

  const online = probes.filter((probe) => probe.online).length;

  return (
    <div className="public-status">
      <div className="public-hero">
        <div>
          <p className="eyebrow">ChikenEasy Public Probe</p>
          <h1>Komari 风格探针状态页</h1>
          <p>实时展示 Agent 在线状态、CPU、内存、磁盘、网络速率和最近事件。公开接口只返回展示字段，不包含 SSH、RDP、密码、私钥或 Token。</p>
        </div>
        <a className="admin-link" href="/admin">进入后台</a>
      </div>

      <div className="public-stats">
        <Card label="探针总数" value={summary?.total ?? probes.length} />
        <Card label="在线" value={summary?.online ?? online} green />
        <Card label="离线" value={summary?.offline ?? probes.length - online} />
        <Card label="地区" value={summary?.regions ?? 0} blue />
        <Card label="总流量" value={formatBytes(summary?.totalTraffic || 0)} />
        <Card label="实时下行" value={formatSpeed(summary?.totalRxSpeed || 0)} />
        <Card label="实时上行" value={formatSpeed(summary?.totalTxSpeed || 0)} />
      </div>

      <div className="public-probe-grid">
        {probes.map((probe) => (
          <article className="public-probe-card" key={probe.id}>
            <div className="public-probe-head">
              <div>
                <strong>{probe.flag ? `${probe.flag} ` : ""}{probe.name}</strong>
                <span>{probe.group || "默认分组"} / {probe.region || "未标注地区"}</span>
              </div>
              <StatusBadge ok={probe.online} text={probe.online ? "online" : "offline"} />
            </div>
            <div className="public-metrics">
              <MetricPill label="CPU" value={formatPercent(probe.metrics?.cpuUsage)} accent="cpu" />
              <MetricPill label="内存" value={`${formatPercent(probe.metrics?.memoryUsage)} / ${formatBytes(probe.metrics?.memoryUsed)} / ${formatBytes(probe.metrics?.memoryTotal)}`} accent="memory" />
              <MetricPill label="磁盘" value={`${formatPercent(probe.metrics?.diskUsage)} / ${formatBytes(probe.metrics?.diskUsed)} / ${formatBytes(probe.metrics?.diskTotal)}`} accent="disk" />
              <MetricPill label="网络" value={`↓ ${formatSpeed(probe.metrics?.rxSpeed)}  ↑ ${formatSpeed(probe.metrics?.txSpeed)}`} accent="network" />
            </div>
            <div className="public-card-foot">
              <span>运行 {formatUptime(probe.metrics?.uptime)}</span>
              <span>更新 {formatDateTime(probe.metrics?.updatedAt)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="public-events">
        <h2>最近事件</h2>
        {events.length ? (
          events.slice(0, 8).map((event) => (
            <div className="public-event" key={event.id || `${event.agentId}-${event.updatedAt}`}>
              <span>{formatDateTime(event.updatedAt)}</span>
              <strong>{event.type}</strong>
              <em>{event.message || event.agentId}</em>
            </div>
          ))
        ) : (
          <div className="empty">暂无公开事件。</div>
        )}
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </div>
  );
}

function Dashboard({ openAgent, openSsh }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api("/api/dashboard").then(setData).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!data) return null;

  return (
    <section>
      <div className="stats">
        <Card label="服务器总数" value={data.total} />
        <Card label="在线" value={data.online} green />
        <Card label="离线" value={data.offline} />
        <Card label="sing-box 活跃" value={data.activeSingbox} blue />
        <Card label="平均 CPU" value={formatPercent(data.averageCpu)} />
        <Card label="总下行" value={formatSpeed(data.totalRxRate)} />
        <Card label="总上行" value={formatSpeed(data.totalTxRate)} />
      </div>
      <Panel title="最近接入">
        <AgentTable agents={data.recent} openAgent={openAgent} openSsh={openSsh} />
      </Panel>
    </section>
  );
}

function TokenButton() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  const create = async () => {
    try {
      setError("");
      const result = await api("/api/tokens", { method: "POST" });
      setToken(result.token);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div className="toolbar-inline">
      <button className="primary" onClick={create}>
        <Save size={16} />
        生成接入 Token
      </button>
      {token ? <code>{token}</code> : null}
      {error ? <span className="error-text">{error}</span> : null}
    </div>
  );
}

function Servers({ openAgent, openSsh }) {
  const [agents, setAgents] = useState([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = () => api("/api/agents").then(setAgents).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  const filtered = agents.filter((agent) =>
    [agent.name, agent.host, agent.ip, agent.sshHost, ...(agent.tags || [])].join(" ").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section>
      <div className="toolbar">
        <input placeholder="按名称 / 主机 / IP / 标签筛选" value={query} onChange={(event) => setQuery(event.target.value)} />
        <TokenButton />
      </div>
      <Panel title="服务器">
        <AgentTable agents={filtered} openAgent={openAgent} openSsh={openSsh} />
      </Panel>
    </section>
  );
}

function AgentTable({ agents, openAgent, openSsh }) {
  return (
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>主机</th>
          <th>IP</th>
          <th>架构</th>
          <th>在线</th>
          <th>sing-box</th>
          <th>版本</th>
          <th>SSH</th>
          <th>监控</th>
          <th>网络</th>
          <th>最近心跳</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {agents.map((agent) => (
          <tr key={agent.id}>
            <td>{agent.name}</td>
            <td>{agent.host}</td>
            <td>{agent.ip}</td>
            <td>{agent.arch}</td>
            <td>
              <StatusDot on={agent.connected} />
              {agent.connected ? "online" : "offline"}
            </td>
            <td>
              <StatusDot on={agent.singboxStatus === "active"} />
              {agent.singboxStatus}
            </td>
            <td>{agent.singboxVersion}</td>
            <td>{agent.sshConfigured ? `${agent.sshMode}@${agent.sshPort}` : "未配置"}</td>
            <td>
              <AgentMetricSummary metrics={agent.metrics} />
            </td>
            <td>
              <AgentTrafficSummary metrics={agent.metrics} />
            </td>
            <td>{agent.lastSeen || "-"}</td>
            <td className="actions-cell">
              <button className="link" onClick={() => openAgent(agent.id)}>
                详情
              </button>
              {openSsh ? (
                <button className="link" onClick={() => openSsh(agent.id)}>
                  SSH
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AgentDetail({ id, back, openConfig, openLogs, openSsh, openConsole, openMemos }) {
  const [agent, setAgent] = useState(null);
  const [result, setResult] = useState("-");

  const load = () => api(`/api/agents/${id}`).then(setAgent);

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [id]);

  const service = async (action) => {
    const response = await api(`/api/agents/${id}/service/${action}`, { method: "POST" });
    setResult(JSON.stringify(response, null, 2));
    load().catch(() => {});
  };

  const uninstall = async () => {
    if (!window.confirm("确认卸载这台机器上的 Agent 吗？卸载后它会离线，需要重新安装后才能接入。")) return;
    const response = await api(`/api/agents/${id}/uninstall`, { method: "POST", body: JSON.stringify({ removeSingbox: false }) });
    setResult(JSON.stringify(response, null, 2));
  };

  if (!agent) return null;
  const infoEntries = Object.entries(agent).filter(([key]) => !["metrics", "metricsHistory", "lastConfig"].includes(key));

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>
          {agent.name} <StatusDot on={agent.connected} />
          {agent.connected ? "online" : "offline"}
        </h1>
        <button onClick={() => service("status")}>查询状态</button>
        <button onClick={openConfig}>配置</button>
        <button onClick={openLogs}>日志</button>
        <button onClick={openSsh}>SSH</button>
        <button onClick={openConsole}>SFTP</button>
        <button onClick={openMemos}>关联笔记</button>
        <button className="red-bg" onClick={uninstall}>
          卸载 Agent
        </button>
      </div>

      <div className="grid2">
        <Panel title="实时探针">
          <ProbeOverview metrics={agent.metrics} />
        </Panel>

        <Panel title="服务控制">
          <div className="actions">
            <button className="green-bg" onClick={() => service("start")}>
              启动
            </button>
            <button className="blue-bg" onClick={() => service("restart")}>
              重启
            </button>
            <button className="red-bg" onClick={() => service("stop")}>
              停止
            </button>
            <button onClick={() => service("status")}>刷新状态</button>
          </div>
          <pre>{result}</pre>
        </Panel>
      </div>

      <Panel title="监控趋势">
        <ProbeTrends history={agent.metricsHistory} />
      </Panel>

      <div className="grid2">
        <Panel title="基本信息">
          <dl>
            {infoEntries.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Panel>

        <Panel title="探针摘要">
          <div className="panel-stack">
            <p className="muted">CPU: {formatPercent(agent.metrics?.cpu?.usage)}</p>
            <p className="muted">内存: {formatBytes(agent.metrics?.memory?.used)} / {formatBytes(agent.metrics?.memory?.total)}</p>
            <p className="muted">磁盘: {formatBytes(agent.metrics?.disk?.used)} / {formatBytes(agent.metrics?.disk?.total)}</p>
            <p className="muted">下行: {formatSpeed(agent.metrics?.network?.rxRate)}</p>
            <p className="muted">上行: {formatSpeed(agent.metrics?.network?.txRate)}</p>
            <p className="muted">累计流量: ↓ {formatBytes(agent.metrics?.network?.rxTotal)} / ↑ {formatBytes(agent.metrics?.network?.txTotal)}</p>
          </div>
        </Panel>
      </div>

      <Panel title="关联笔记">
        {agent.memos?.length ? (
          <table>
            <thead>
              <tr>
                <th>标题</th>
                <th>标签</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {agent.memos.map((memo) => (
                <tr key={memo.id}>
                  <td>{memo.title}</td>
                  <td>{joinTags(memo.tags) || "-"}</td>
                  <td>{formatDateTime(memo.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">这台服务器还没有关联备忘录。</div>
        )}
      </Panel>
    </section>
  );
}

function TerminalPanel({ agentId, agentName, mode, connectNonce }) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const wsRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    setConnected(false);
    setError("");
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        await ensureTokenSession();
      } catch (sessionError) {
        setError(sessionError.message);
        return;
      }
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed) return;

      const term = new XTerm({
        cursorBlink: true,
        convertEol: true,
        fontFamily: 'Consolas, "SFMono-Regular", monospace',
        fontSize: 13,
        lineHeight: 1.3,
        scrollback: 4000,
        theme: {
          background: "#09111b",
          foreground: "#d6e2f0",
          cursor: "#7cc5ff",
          selectionBackground: "rgba(124, 197, 255, 0.28)"
        }
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(boxRef.current);
      fit.fit();
      term.writeln(`Connecting to ${agentName} (${mode === "ssh" ? "SSH" : "Agent"})...`);
      term.focus();

      const resizeObserver = new ResizeObserver(() => {
        fit.fit();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      });
      resizeObserver.observe(boxRef.current);

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}${buildAuthUrl("/terminal", { agentId, mode })}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        fit.fit();
        ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
      };
      ws.onclose = () => {
        setConnected(false);
        term.writeln("\r\n[connection closed]");
      };
      ws.onerror = () => {
        setError("终端连接失败，请检查 SSH 配置或 API Token。");
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.output) term.write(message.output);
      };

      const disposable = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
      });

      cleanup = () => {
        disposable.dispose();
        resizeObserver.disconnect();
        ws.close();
        term.dispose();
      };
    })().catch(() => {
      if (!disposed) setError("终端初始化失败。");
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [agentId, mode, connectNonce]);

  const sendControl = (data) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "input", data }));
  };

  return (
    <Panel
      title={`${mode === "ssh" ? "SSH 终端" : "Agent 执行"} - ${agentName}`}
      right={
        <span>
          <StatusDot on={connected} />
          {connected ? "connected" : "closed"}
        </span>
      }
    >
      <div className="terminal-toolbar">
        <button onClick={() => sendControl("\u0003")} disabled={!connected}>
          Ctrl+C
        </button>
        <button onClick={() => sendControl("\u000c")} disabled={!connected}>
          Clear
        </button>
        <span className="muted">支持原始按键、粘贴和窗口自动调整大小。</span>
      </div>
      <div className="terminal-shell" ref={boxRef} />
      {error ? <p className="panel-message">{error}</p> : null}
    </Panel>
  );
}

function SshPage({ id, back }) {
  const [agent, setAgent] = useState(null);
  const [profile, setProfile] = useState({ host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", ready: false });
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState("ssh");
  const [connectNonce, setConnectNonce] = useState(0);
  const [deployMode, setDeployMode] = useState("service");
  const [deployAppDir, setDeployAppDir] = useState("/opt/chiken-easy");
  const [deployPreview, setDeployPreview] = useState("");
  const [deployResult, setDeployResult] = useState("");
  const [deployBusy, setDeployBusy] = useState(false);

  useEffect(() => {
    const load = () =>
      Promise.all([api(`/api/agents/${id}`), api(`/api/agents/${id}/ssh-profile`)])
        .then(([agentData, sshData]) => {
          setAgent(agentData);
          setProfile((current) => ({ ...current, ...sshData, password: "", privateKey: "" }));
          if (!sshData.ready) setMode("agent");
        })
        .catch((error) => setMessage(error.message));

    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [id]);

  useEffect(() => {
    setDeployAppDir(deployMode === "docker" ? "/opt/chiken-easy-docker" : "/opt/chiken-easy");
  }, [deployMode]);

  const patch = (key, value) => setProfile((current) => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      const response = await api(`/api/agents/${id}/ssh-profile`, {
        method: "PUT",
        body: JSON.stringify({
          host: profile.host,
          port: Number(profile.port || 22),
          username: profile.username,
          mode: profile.mode,
          password: profile.password,
          privateKey: profile.privateKey
        })
      });
      setProfile((current) => ({ ...current, ...response, password: "", privateKey: "" }));
      setMessage("SSH 配置已保存。");
      setMode("ssh");
      setConnectNonce((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const clearSecret = async (type) => {
    try {
      const response = await api(`/api/agents/${id}/ssh-profile`, {
        method: "PUT",
        body: JSON.stringify(type === "password" ? { clearPassword: true, mode: profile.mode } : { clearPrivateKey: true, mode: profile.mode })
      });
      setProfile((current) => ({ ...current, ...response, password: "", privateKey: "" }));
      setMessage(type === "password" ? "SSH 密码已清除。" : "SSH 私钥已清除。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const test = async () => {
    try {
      const response = await api(`/api/agents/${id}/ssh-profile/test`, {
        method: "POST",
        body: JSON.stringify({
          host: profile.host,
          port: Number(profile.port || 22),
          username: profile.username,
          mode: profile.mode,
          password: profile.password,
          privateKey: profile.privateKey
        })
      });
      setMessage(response.output || "SSH 连接测试通过。");
      setMode("ssh");
      setConnectNonce((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const previewDeploy = async () => {
    try {
      const response = await api(`/api/agents/${id}/install-command`, {
        method: "POST",
        body: JSON.stringify({ mode: deployMode, appDir: deployAppDir })
      });
      setDeployPreview(response.command);
      setDeployResult(`脚本地址：${response.scriptUrl}\n过期时间：${response.expiresAt}\n连接地址：${response.wsUrl}`);
    } catch (error) {
      setDeployResult(error.message);
    }
  };

  const copyDeploy = async () => {
    if (!deployPreview) {
      await previewDeploy();
      return;
    }
    await navigator.clipboard.writeText(deployPreview);
    setDeployResult("部署命令已复制到剪贴板。");
  };

  const deploy = async () => {
    try {
      setDeployBusy(true);
      const response = await api(`/api/agents/${id}/deploy`, {
        method: "POST",
        body: JSON.stringify({ mode: deployMode, appDir: deployAppDir })
      });
      setDeployPreview(response.command || "");
      setDeployResult(response.output || "部署命令执行完成。");
    } catch (error) {
      setDeployResult(error.message);
    } finally {
      setDeployBusy(false);
    }
  };

  if (!agent) return null;

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>SSH - {agent.name}</h1>
        <button onClick={() => setConnectNonce((value) => value + 1)}>
          <RefreshCw size={16} />
          重连
        </button>
      </div>

      <TerminalPanel agentId={id} agentName={agent.name} mode={mode} connectNonce={connectNonce} />

      <div className="grid2 ssh-grid">
        <Panel title="SSH 配置" right={<span className="muted">列表里的 SSH 现在会直接进入这个终端</span>}>
          <div className="form-grid">
            <Field label="主机" value={profile.host} onChange={(value) => patch("host", value)} />
            <Field label="端口" type="number" value={profile.port} onChange={(value) => patch("port", value)} />
            <Field label="用户名" value={profile.username} onChange={(value) => patch("username", value)} />
            <Field
              label="认证方式"
              type="select"
              value={profile.mode}
              onChange={(value) => patch("mode", value)}
              options={[
                ["password", "密码"],
                ["privateKey", "私钥"]
              ]}
            />
            {profile.mode === "password" ? <Field label="密码" type="password" value={profile.password} onChange={(value) => patch("password", value)} /> : null}
            {profile.mode === "privateKey" ? <Field label="私钥" type="textarea" rows={6} value={profile.privateKey} onChange={(value) => patch("privateKey", value)} /> : null}
          </div>

          <div className="actions">
            <button className="primary" onClick={save}>
              保存 SSH
            </button>
            <button onClick={test}>测试连接</button>
            <button onClick={() => setMode("ssh")} disabled={!profile.ready && !profile.password && !profile.privateKey}>
              用 SSH 连接
            </button>
            <button onClick={() => setMode("agent")}>改用 Agent 执行</button>
            {profile.mode === "password" && profile.hasPassword ? <button onClick={() => clearSecret("password")}>清除已存密码</button> : null}
            {profile.mode === "privateKey" && profile.hasPrivateKey ? <button onClick={() => clearSecret("privateKey")}>清除已存私钥</button> : null}
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>

        <Panel title="一键部署 Agent" right={<span className="muted">支持 systemd 和 Docker，两种方式都会复用当前 SSH 凭据</span>}>
          <div className="form-grid">
            <Field
              label="部署方式"
              type="select"
              value={deployMode}
              onChange={(value) => setDeployMode(value)}
              options={[
                ["service", "systemd / Node"],
                ["docker", "Docker Compose"]
              ]}
            />
            <Field label="安装目录" value={deployAppDir} onChange={setDeployAppDir} />
          </div>
          <p className="panel-tip">`systemd` 更适合机器上已经有 sing-box 服务的场景；`Docker` 会同时准备 agent 容器、sing-box 容器和探针挂载。</p>
          <div className="actions">
            <button onClick={previewDeploy}>生成命令</button>
            <button onClick={copyDeploy}>复制命令</button>
            <button className="primary" onClick={deploy} disabled={deployBusy || !profile.ready}>
              {deployBusy ? "部署中..." : "通过 SSH 立即部署"}
            </button>
          </div>
          <pre>{deployPreview || "先点击“生成命令”，可以拿到可直接粘贴执行的一键部署命令。"}</pre>
          {deployResult ? <pre>{deployResult}</pre> : null}
        </Panel>
      </div>
    </section>
  );
}

function NodeWizard({ agents }) {
  const [form, setForm] = useState(() => ({ agentId: "", ...defaultProtocolForm("vmess-ws") }));
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!form.agentId && agents[0]) setForm((current) => ({ ...current, agentId: agents[0].id }));
  }, [agents, form.agentId]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const definition = protocolDefinitions[form.protocol];

  const switchProtocol = (nextProtocol) => {
    setForm((current) => ({
      agentId: current.agentId,
      ...defaultProtocolForm(nextProtocol),
      exportName: current.exportName || "",
      exportHost: current.exportHost || ""
    }));
    setPreview("");
    setResult("");
  };

  const renderPreview = async () => {
    try {
      const response = await api("/api/config/render", { method: "POST", body: JSON.stringify(form) });
      setPreview(JSON.stringify(response.config, null, 2));
    } catch (error) {
      setPreview(error.message);
    }
  };

  const apply = async () => {
    try {
      const response = await api(`/api/agents/${form.agentId}/config/wizard`, { method: "POST", body: JSON.stringify(form) });
      setResult(JSON.stringify(response, null, 2));
    } catch (error) {
      setResult(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="节点配置" right={<button onClick={renderPreview}>预览 JSON</button>}>
          <div className="form-grid">
            <Field
              label="服务器"
              type="select"
              value={form.agentId}
              onChange={(value) => patch("agentId", value)}
              options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])}
            />
            <Field
              label="协议"
              type="select"
              value={form.protocol}
              onChange={switchProtocol}
              options={Object.entries(protocolDefinitions).map(([id, item]) => [id, item.name])}
            />
            <Field label="订阅节点名称" value={form.exportName || ""} onChange={(value) => patch("exportName", value)} placeholder="默认用服务器名 + 协议名" />
            <Field label="订阅出口地址" value={form.exportHost || ""} onChange={(value) => patch("exportHost", value)} placeholder="默认使用该服务器 IP" />
            {definition.fields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                type={field.type || "text"}
                value={form[field.key] ?? ""}
                onChange={(value) => patch(field.key, value)}
                random={field.random ? () => patch(field.key, field.random()) : null}
                placeholder={field.placeholder || ""}
                options={field.options || []}
                rows={field.rows || 4}
              />
            ))}
          </div>
          <div className="panel-tip">{definition.note}</div>
          <div className="panel-tip">这里填写的“订阅出口地址”会用于订阅聚合导出；`VLESS + Reality` 想让订阅可直接用，还要把对应公钥一起填进去。</div>
          <div className="actions">
            <button className="primary" onClick={apply}>
              下发并重启
            </button>
          </div>
          <pre>{result}</pre>
        </Panel>

        <Panel title="生成预览">
          <pre className="preview">{preview || "点击预览 JSON 查看 sing-box 配置"}</pre>
        </Panel>
      </div>
    </section>
  );
}

function ForwardRuleTable({ rules, removeRule }) {
  if (!rules.length) return <div className="empty">当前没有独立转发规则</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>引擎</th>
          <th>网络</th>
          <th>监听</th>
          <th>目标</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule) => (
          <tr key={rule.id}>
            <td>{rule.name}</td>
            <td>{rule.engine}</td>
            <td>{rule.network}</td>
            <td>
              {rule.listen}:{rule.port}
            </td>
            <td>
              {rule.targetHost}:{rule.targetPort}
            </td>
            <td>{rule.status || "-"}</td>
            <td>
              <button className="link" onClick={() => removeRule(rule)}>
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ForwardWizard({ agents }) {
  const [form, setForm] = useState(() => ({ agentId: "", ...defaultForwardForm() }));
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const [rules, setRules] = useState([]);

  const loadRules = async (agentId) => {
    if (!agentId) return;
    const data = await api(`/api/agents/${agentId}/forwards`);
    setRules(data);
  };

  useEffect(() => {
    if (!form.agentId && agents[0]) setForm((current) => ({ ...current, agentId: agents[0].id }));
  }, [agents, form.agentId]);

  useEffect(() => {
    if (form.agentId) loadRules(form.agentId).catch(() => {});
  }, [form.agentId]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const renderPreview = async () => {
    try {
      const response = await api("/api/forward/render", { method: "POST", body: JSON.stringify(form) });
      setPreview(JSON.stringify(response.config, null, 2));
    } catch (error) {
      setPreview(error.message);
    }
  };

  const apply = async () => {
    try {
      const response = await api(`/api/agents/${form.agentId}/forward/wizard`, { method: "POST", body: JSON.stringify(form) });
      setResult(JSON.stringify(response, null, 2));
      setForm((current) => ({ ...current, id: response.rule.id }));
      await loadRules(form.agentId);
    } catch (error) {
      setResult(error.message);
    }
  };

  const removeRule = async (rule) => {
    if (!window.confirm(`确认删除转发规则 ${rule.name} 吗？`)) return;
    try {
      const response = await api(`/api/agents/${form.agentId}/forwards/${rule.id}`, { method: "DELETE" });
      setResult(JSON.stringify(response, null, 2));
      await loadRules(form.agentId);
    } catch (error) {
      setResult(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="端口转发" right={<button onClick={renderPreview}>预览 JSON</button>}>
          <div className="form-grid">
            <Field
              label="服务器"
              type="select"
              value={form.agentId}
              onChange={(value) => patch("agentId", value)}
              options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])}
            />
            <Field label="规则名称" value={form.name} onChange={(value) => patch("name", value)} placeholder="留空会自动生成" />
            <Field label="转发引擎" type="select" value={form.engine} onChange={(value) => patch("engine", value)} options={forwardEngineOptions} />
            <Field label="网络" type="select" value={form.network} onChange={(value) => patch("network", value)} options={forwardNetworkOptions} />
            <Field label="监听地址" value={form.listen} onChange={(value) => patch("listen", value)} placeholder="0.0.0.0" />
            <Field label="公网监听端口" type="number" value={form.port} onChange={(value) => patch("port", value)} random={() => patch("port", randPort())} />
            <Field label="目标地址" value={form.targetHost} onChange={(value) => patch("targetHost", value)} />
            <Field label="目标端口" type="number" value={form.targetPort} onChange={(value) => patch("targetPort", value)} />
          </div>
          <div className="panel-tip">转发现在会以独立容器运行，不再覆盖当前节点配置。你可以按需在 sing-box、Realm、GOST 之间切换。</div>
          <div className="actions">
            <button className="primary" onClick={apply}>
              下发并启动
            </button>
          </div>
          <pre>{result}</pre>
        </Panel>

        <Panel title="生成预览">
          <pre className="preview">{preview || "点击预览 JSON 查看转发计划"}</pre>
        </Panel>
      </div>

      <Panel title="当前转发规则" right={<button onClick={() => loadRules(form.agentId)}>刷新</button>}>
        <ForwardRuleTable rules={rules} removeRule={removeRule} />
      </Panel>
    </section>
  );
}

function SubscriptionsPage() {
  const [meta, setMeta] = useState({ templates: [], nodes: [] });
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(() => defaultSubscriptionForm());
  const [draftImport, setDraftImport] = useState(() => defaultSubscriptionImport());
  const [preview, setPreview] = useState("");
  const [uriPreview, setUriPreview] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");

  const templateOptions = meta.templates.length ? meta.templates.map((item) => [item.id, item.name]) : subscriptionTemplateFallback;

  const loadMeta = () => api("/api/subscriptions/meta").then(setMeta);
  const loadProfiles = () => api("/api/subscriptions").then(setProfiles);

  useEffect(() => {
    loadMeta().catch(() => {});
    loadProfiles().catch(() => {});
  }, []);

  useEffect(() => {
    if (form.localNodes.length || !meta.nodes.length) return;
    const firstReady = meta.nodes.find((node) => node.ready);
    if (!firstReady) return;
    setForm((current) => ({ ...current, localNodes: [firstReady.agentId] }));
  }, [meta.nodes, form.localNodes.length]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const resetComposer = () => {
    const firstReady = meta.nodes.find((node) => node.ready);
    setForm({ ...defaultSubscriptionForm(), localNodes: firstReady ? [firstReady.agentId] : [] });
    setDraftImport(defaultSubscriptionImport());
    setPreview("");
    setUriPreview("");
    setWarnings([]);
    setLink("");
    setMessage("");
  };

  const toggleLocalNode = (agentId) => {
    setForm((current) => ({
      ...current,
      localNodes: current.localNodes.includes(agentId) ? current.localNodes.filter((item) => item !== agentId) : [...current.localNodes, agentId]
    }));
  };

  const addImport = () => {
    if (!draftImport.content.trim()) {
      setMessage("请先粘贴外部原始订阅内容。");
      return;
    }
    setForm((current) => ({
      ...current,
      imports: [
        ...current.imports,
        {
          ...draftImport,
          name: draftImport.name.trim() || `导入 ${current.imports.length + 1}`
        }
      ]
    }));
    setDraftImport(defaultSubscriptionImport());
    setMessage("外部原始内容已加入当前订阅草稿。");
  };

  const removeImport = (id) => {
    setForm((current) => ({
      ...current,
      imports: current.imports.filter((item) => item.id !== id)
    }));
  };

  const openProfile = async (id) => {
    try {
      const profile = await api(`/api/subscriptions/${id}`);
      setForm(profile);
      setDraftImport(defaultSubscriptionImport());
      setPreview("");
      setUriPreview("");
      setWarnings([]);
      setLink(profile.url || "");
      setMessage(`已载入订阅：${profile.name}`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveProfile = async (regenerateToken = false) => {
    try {
      const target = form.id ? `/api/subscriptions/${form.id}` : "/api/subscriptions";
      const method = form.id ? "PUT" : "POST";
      const response = await api(target, {
        method,
        body: JSON.stringify({ ...form, regenerateToken })
      });
      setForm(response);
      setLink(response.url || "");
      setMessage(regenerateToken ? "订阅已保存，并重新生成了新的订阅链接。" : "订阅已保存。");
      loadProfiles().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteProfile = async () => {
    if (!form.id) {
      resetComposer();
      return;
    }
    if (!window.confirm(`确认删除订阅 ${form.name} 吗？`)) return;
    try {
      await api(`/api/subscriptions/${form.id}`, { method: "DELETE" });
      resetComposer();
      setMessage("订阅已删除。");
      loadProfiles().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const renderPreview = async () => {
    try {
      const response = await api("/api/subscriptions/render", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setPreview(response.body || "");
      setUriPreview(response.uriContent || "");
      setWarnings(response.warnings || []);
      setLink(form.id ? response.profile?.url || "" : "");
      setMessage(form.id ? `已生成 ${response.proxyCount} 个节点的订阅预览。` : `已生成 ${response.proxyCount} 个节点的订阅预览。保存后订阅链接才会正式生效。`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const copyLink = async () => {
    if (!form.id) {
      setMessage("先保存订阅，公开订阅链接才会真正生效。");
      return;
    }
    const nextLink = link || profiles.find((item) => item.id === form.id)?.url || "";
    if (!nextLink) {
      setMessage("先预览或保存一次，拿到订阅链接后再复制。");
      return;
    }
    await navigator.clipboard.writeText(nextLink);
    setMessage("订阅链接已复制。");
  };

  const copyUri = async () => {
    if (!uriPreview) {
      await renderPreview();
      return;
    }
    await navigator.clipboard.writeText(uriPreview);
    setMessage("原始 URI 列表已复制。");
  };

  return (
    <section>
      <div className="grid2 subscription-grid">
        <Panel title="订阅列表" right={<button onClick={resetComposer}>新建订阅</button>}>
          <div className="subscription-list">
            {profiles.length ? (
              profiles.map((profile) => (
                <button key={profile.id} className={`subscription-card ${form.id === profile.id ? "active" : ""}`} onClick={() => openProfile(profile.id)}>
                  <strong>{profile.name}</strong>
                  <span>{profile.template}</span>
                  <span>
                    {profile.localNodeCount} 个本地节点 / {profile.importCount} 份外部导入
                  </span>
                </button>
              ))
            ) : (
              <div className="empty">还没有订阅聚合配置。</div>
            )}
          </div>
        </Panel>

        <div className="panel-stack">
          <Panel title="订阅编排" right={<span className="muted">支持本地节点、外部原始内容和模板切换</span>}>
            <div className="form-grid">
              <Field label="订阅名称" value={form.name || ""} onChange={(value) => patch("name", value)} placeholder="例如：办公机房聚合" />
              <Field label="订阅模板" type="select" value={form.template || "clash-basic"} onChange={(value) => patch("template", value)} options={templateOptions} />
            </div>
            <div className="panel-tip">本地节点来自你已经在“节点配置”里下发过的服务器；外部内容可以直接粘贴 Clash YAML、URI 列表，或者 Base64 订阅正文。</div>
            <div className="subscription-node-grid">
              {meta.nodes.length ? (
                meta.nodes.map((node) => {
                  const checked = form.localNodes.includes(node.agentId);
                  return (
                    <label key={node.agentId} className={`subscription-node ${checked ? "active" : ""} ${node.ready ? "" : "disabled"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleLocalNode(node.agentId)} />
                      <div>
                        <strong>{node.name}</strong>
                        <span>
                          {node.protocolLabel} · {node.server}:{node.port || "-"}
                        </span>
                        <span>{node.ready ? "可直接导出到订阅" : node.reason}</span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="empty">先去“节点配置”页面至少下发一次节点，订阅聚合这里才会出现可选项。</div>
              )}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => saveProfile(false)}>
                保存订阅
              </button>
              <button onClick={renderPreview}>生成预览</button>
              <button onClick={copyLink}>复制订阅链接</button>
              <button onClick={copyUri}>复制原始 URI</button>
              <button onClick={() => saveProfile(true)} disabled={!form.id}>
                重置订阅链接
              </button>
              <button className="red-bg" onClick={deleteProfile}>
                {form.id ? "删除订阅" : "清空草稿"}
              </button>
            </div>
            {message ? <p className="panel-message">{message}</p> : null}
          </Panel>

          <Panel title="外部原始内容导入" right={<span className="muted">不是订阅链接，而是直接粘贴订阅正文</span>}>
            <div className="form-grid">
              <Field label="导入名称" value={draftImport.name} onChange={(value) => setDraftImport((current) => ({ ...current, name: value }))} />
            </div>
            <div className="subscription-editor">
              <label>
                原始内容
                <textarea
                  className="inline-textarea"
                  rows={10}
                  value={draftImport.content}
                  onChange={(event) => setDraftImport((current) => ({ ...current, content: event.target.value }))}
                  placeholder="支持三种格式：1. Clash YAML（至少含 proxies:）；2. 纯 URI 列表；3. Base64 编码后的订阅正文。"
                />
              </label>
            </div>
            <div className="actions">
              <button onClick={addImport}>加入当前订阅</button>
            </div>
            <div className="subscription-import-list">
              {form.imports.length ? (
                form.imports.map((item) => (
                  <div className="subscription-import-item" key={item.id}>
                    <div className="subscription-import-head">
                      <strong>{item.name}</strong>
                      <button className="link" onClick={() => removeImport(item.id)}>
                        移除
                      </button>
                    </div>
                    <pre>{item.content.slice(0, 420)}{item.content.length > 420 ? "\n..." : ""}</pre>
                  </div>
                ))
              ) : (
                <div className="empty">暂时还没有外部原始内容导入。</div>
              )}
            </div>
          </Panel>

          <Panel title="订阅预览" right={form.id && link ? <span className="muted">{link}</span> : <span className="muted">保存后会生成可访问的订阅链接</span>}>
            {warnings.length ? (
              <div className="subscription-warnings">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <pre className="preview subscription-preview">{preview || "点击“生成预览”后，这里会显示渲染后的 Clash 模板内容。"}</pre>
          </Panel>
        </div>
      </div>
    </section>
  );
}

function ConfigPage({ id, back }) {
  const [text, setText] = useState(JSON.stringify(sampleConfig(), null, 2));
  const [versions, setVersions] = useState([]);
  const [message, setMessage] = useState("");

  const loadVersions = () => api(`/api/agents/${id}/config/versions`).then(setVersions);

  useEffect(() => {
    loadVersions().catch(() => {});
  }, [id]);

  const readCurrent = async () => {
    try {
      const first = await api(`/api/agents/${id}/config`);
      if (first.config) setText(JSON.stringify(first.config, null, 2));
      setMessage(first.config ? "已读取当前缓存配置。" : "已请求 Agent 读取配置，稍后再点一次可拿到最新结果。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const format = () => setText(JSON.stringify(JSON.parse(text), null, 2));

  const apply = async () => {
    try {
      const response = await api(`/api/agents/${id}/config`, {
        method: "POST",
        body: JSON.stringify({ config: JSON.parse(text), restart: true })
      });
      setMessage(JSON.stringify(response));
      loadVersions().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>sing-box 配置</h1>
        <button onClick={readCurrent}>读取当前</button>
        <button onClick={format}>格式化</button>
        <button
          onClick={() => {
            JSON.parse(text);
            setMessage("JSON 校验通过");
          }}
        >
          校验
        </button>
        <button className="primary" onClick={apply}>
          应用并重启
        </button>
      </div>

      <div className="grid-config">
        <Panel title="JSON 编辑器" right={<span>{new Blob([text]).size} bytes</span>}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          <p className="panel-message">{message}</p>
        </Panel>

        <Panel title="历史版本" right={<button onClick={loadVersions}>刷新</button>}>
          {versions.length ? (
            versions.map((version) => (
              <div className="version" key={version.id}>
                <div>
                  <div>{version.at}</div>
                  <div className="muted">{version.status || "pending"}</div>
                </div>
                <button
                  onClick={async () => {
                    await api(`/api/agents/${id}/config/rollback/${version.id}`, { method: "POST" });
                    setMessage("已请求回滚。");
                  }}
                >
                  <RotateCcw size={15} />
                  回滚
                </button>
              </div>
            ))
          ) : (
            <div className="empty">暂无数据</div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function LogsPage({ id, back }) {
  const [lines, setLines] = useState([]);
  const [count, setCount] = useState(200);

  useEffect(() => {
    let source;
    let closed = false;
    ensureTokenSession()
      .then(() => {
        if (closed) return;
        source = new EventSource(buildAuthUrl(`/api/agents/${id}/logs/stream`, { lines: count }));
        source.onmessage = (event) => setLines((current) => [...current, JSON.parse(event.data).line].slice(-1000));
      })
      .catch((error) => setLines([`[auth] ${error.message}`]));
    return () => {
      closed = true;
      if (source) source.close();
    };
  }, [id, count]);

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>sing-box 日志</h1>
        <button onClick={() => setCount(Math.max(50, count - 50))}>-</button>
        <input className="small" value={count} onChange={(event) => setCount(Number(event.target.value) || 200)} />
        <button onClick={() => setCount(count + 50)}>+</button>
        <button className="red-bg" onClick={() => setLines([])}>
          <Trash2 size={16} />
          清屏
        </button>
      </div>

      <Panel title={<><StatusDot on />实时日志</>} right={<span>{lines.length} 行</span>}>
        <pre className="logs">{lines.join("\n")}</pre>
      </Panel>
    </section>
  );
}

function MonitorPage({ openAgent }) {
  const [summary, setSummary] = useState(null);
  const [probes, setProbes] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [history, setHistory] = useState({ raw: [], aggregated: [] });
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [summaryData, probesData, eventData] = await Promise.all([api("/api/monitor/summary"), api("/api/public/probes"), api("/api/public/events")]);
      setSummary(summaryData);
      setProbes(probesData);
      setEvents(eventData);
      const fallbackId = selectedAgentId || probesData[0]?.id || "";
      if (fallbackId && fallbackId !== selectedAgentId) setSelectedAgentId(fallbackId);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    api(`/api/public/probes/history?agentId=${encodeURIComponent(selectedAgentId)}`)
      .then(setHistory)
      .catch((error) => setMessage(error.message));
  }, [selectedAgentId]);

  return (
    <section>
      <div className="stats">
        <Card label="公开探针" value={summary?.total || 0} />
        <Card label="在线" value={summary?.online || 0} green />
        <Card label="离线" value={summary?.offline || 0} />
        <Card label="地区数" value={summary?.regions || 0} blue />
        <Card label="总流量" value={formatBytes(summary?.totalTraffic || 0)} />
        <Card label="实时下行" value={formatSpeed(summary?.totalRxSpeed || 0)} />
        <Card label="实时上行" value={formatSpeed(summary?.totalTxSpeed || 0)} />
      </div>

      <Panel title="公开探针卡片" right={<button onClick={() => load().catch(() => {})}>刷新</button>}>
        {probes.length ? (
          <div className="card-grid">
            {probes.map((probe) => (
              <div className="data-card" key={probe.id}>
                <div className="data-card-head">
                  <strong>{probe.flag ? `${probe.flag} ` : ""}{probe.name}</strong>
                  <span>{probe.online ? "online" : "offline"}</span>
                </div>
                <p className="muted">{probe.group || "未分组"} / {probe.region || "未标注地区"}</p>
                <p className="muted">CPU {formatPercent(probe.metrics?.cpuUsage)} / MEM {formatPercent(probe.metrics?.memoryUsage)} / DISK {formatPercent(probe.metrics?.diskUsage)}</p>
                <p className="muted">↓ {formatSpeed(probe.metrics?.rxSpeed)} / ↑ {formatSpeed(probe.metrics?.txSpeed)}</p>
                <div className="actions">
                  <button onClick={() => setSelectedAgentId(probe.id)}>看历史</button>
                  <button onClick={() => openAgent(probe.id)}>详情</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">暂时没有公开探针数据。</div>
        )}
      </Panel>

      <div className="grid2">
        <Panel
          title="历史趋势"
          right={
            probes.length ? (
              <select value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
                {probes.map((probe) => (
                  <option key={probe.id} value={probe.id}>
                    {probe.name}
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          <ProbeTrends history={history} />
        </Panel>

        <Panel title="最近事件">
          {events.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>节点</th>
                  <th>消息</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 20).map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.updatedAt)}</td>
                    <td>{event.type}</td>
                    <td>{event.agentId}</td>
                    <td>{event.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有公开事件。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

function NodePoolPage() {
  const [nodes, setNodes] = useState([]);
  const [sources, setSources] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [importName, setImportName] = useState("manual-import");
  const [importContent, setImportContent] = useState("");
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", username: "", password: "", removeMissing: false });
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState([]);

  const load = async () => {
    try {
      const [nodeRows, sourceRows, accessLogRows] = await Promise.all([api("/api/node-pool"), api("/api/subscription-sources"), api("/api/subscription-access")]);
      setNodes(nodeRows);
      setSources(sourceRows);
      setAccessRows(accessLogRows);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const toggleSelected = (id) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const importNodes = async () => {
    try {
      const response = await api("/api/node-pool/import", {
        method: "POST",
        body: JSON.stringify({ source: importName || "manual", content: importContent })
      });
      setMessage(`导入完成，节点池当前 ${response.nodes.length} 条，变更 ${response.changed} 条。`);
      setImportContent("");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createSource = async () => {
    try {
      await api("/api/subscription-sources", {
        method: "POST",
        body: JSON.stringify(sourceForm)
      });
      setSourceForm({ name: "", url: "", username: "", password: "", removeMissing: false });
      setMessage("订阅源已保存。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const syncSource = async (id) => {
    try {
      const response = await api(`/api/subscription-sources/${id}/sync`, { method: "POST" });
      setMessage(`同步完成，导入 ${response.count} 条，变更 ${response.changed} 条。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const runChecks = async () => {
    try {
      const response = await api("/api/node-pool/check", {
        method: "POST",
        body: JSON.stringify({ nodeIds: selectedIds, checkedBy: "server", timeoutMs: 5000 })
      });
      setChecks(response.results || []);
      setMessage(`探测完成，共 ${response.results?.length || 0} 个节点。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const exportNodes = async (format) => {
    try {
      const body = await fetchText(`/api/node-pool/export?format=${encodeURIComponent(format)}`);
      await copyText(body);
      setMessage(`${format} 导出结果已复制到剪贴板。`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeNode = async (id) => {
    if (!window.confirm("确认删除这个节点吗？")) return;
    try {
      await api(`/api/node-pool/${id}`, { method: "DELETE" });
      setMessage("节点已删除。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="节点导入">
          <div className="form-grid">
            <Field label="来源名称" value={importName} onChange={setImportName} />
            <Field label="原始内容" type="textarea" rows={10} value={importContent} onChange={setImportContent} placeholder="支持 vmess/vless/trojan/ss/hysteria2 URI、Clash/Mihomo YAML、sing-box outbound JSON、base64 订阅。" />
          </div>
          <div className="actions">
            <button className="primary" onClick={importNodes}>导入节点</button>
            <button onClick={() => exportNodes("base64")}>复制 Base64</button>
            <button onClick={() => exportNodes("clash")}>复制 Clash</button>
            <button onClick={() => exportNodes("sing-box")}>复制 sing-box</button>
          </div>
        </Panel>

        <Panel title="订阅源同步">
          <div className="form-grid">
            <Field label="名称" value={sourceForm.name} onChange={(value) => setSourceForm((current) => ({ ...current, name: value }))} />
            <Field label="URL" value={sourceForm.url} onChange={(value) => setSourceForm((current) => ({ ...current, url: value }))} />
            <Field label="用户名" value={sourceForm.username} onChange={(value) => setSourceForm((current) => ({ ...current, username: value }))} />
            <Field label="密码" type="password" value={sourceForm.password} onChange={(value) => setSourceForm((current) => ({ ...current, password: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={createSource}>保存订阅源</button>
          </div>
          {sources.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>URL</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>{source.url || "-"}</td>
                    <td>{formatDateTime(source.updatedAt)}</td>
                    <td><button className="link" onClick={() => syncSource(source.id)}>立即同步</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有订阅源。</div>
          )}
        </Panel>
      </div>

      <Panel title="节点池" right={<button onClick={runChecks} disabled={!nodes.length}>批量 Proxy Check</button>}>
        {nodes.length ? (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>名称</th>
                <th>协议</th>
                <th>地址</th>
                <th>标签</th>
                <th>地区</th>
                <th>健康</th>
                <th>分数</th>
                <th>最近检查</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(node.id)} onChange={() => toggleSelected(node.id)} /></td>
                  <td>{node.name}</td>
                  <td>{node.protocol}</td>
                  <td>{node.address}:{node.port}</td>
                  <td>{joinTags(node.tags) || "-"}</td>
                  <td>{node.region || "-"}</td>
                  <td>{node.health}</td>
                  <td>{node.score}</td>
                  <td>{formatDateTime(node.lastCheckAt)}</td>
                  <td><button className="link" onClick={() => removeNode(node.id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">还没有节点。</div>
        )}
      </Panel>

      <div className="grid2">
        <Panel title="最近检查结果">
          {checks.length ? (
            <table>
              <thead>
                <tr>
                  <th>节点</th>
                  <th>结果</th>
                  <th>延迟</th>
                  <th>检查者</th>
                  <th>错误</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nodeId}</td>
                    <td>{row.ok ? "ok" : "fail"}</td>
                    <td>{row.latency} ms</td>
                    <td>{row.checkedBy}</td>
                    <td>{row.error || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有探测结果。</div>
          )}
        </Panel>

        <Panel title="订阅访问日志">
          {accessRows.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>订阅</th>
                  <th>来源 IP</th>
                  <th>User-Agent</th>
                </tr>
              </thead>
              <tbody>
                {accessRows.slice(0, 30).map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.at)}</td>
                    <td>{row.profileId}</td>
                    <td>{row.ip}</td>
                    <td>{row.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有访问记录。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

function MemoPreview({ content }) {
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(content) }} />;
}

function MemosPage({ agents, agentFilter = "", onClearAgentFilter }) {
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [form, setForm] = useState({
    id: "",
    title: "",
    content: "",
    tags: "",
    visibility: "private",
    pinned: false,
    archived: false,
    agentId: agentFilter || "",
    nodeId: "",
    forwardRuleId: ""
  });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (query) queryParams.set("q", query);
      if (tag) queryParams.set("tag", tag);
      if (agentFilter) queryParams.set("agentId", agentFilter);
      const memoUrl = queryParams.size ? `/api/memos?${queryParams}` : "/api/memos";
      const [memoRows, fileRows] = await Promise.all([api(memoUrl), api("/api/files")]);
      setRows(memoRows);
      setFiles(fileRows);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [query, tag, agentFilter]);

  useEffect(() => {
    if (agentFilter) setForm((current) => ({ ...current, agentId: agentFilter }));
  }, [agentFilter]);

  const resetForm = () => {
    setForm({
      id: "",
      title: "",
      content: "",
      tags: "",
      visibility: "private",
      pinned: false,
      archived: false,
      agentId: agentFilter || "",
      nodeId: "",
      forwardRuleId: ""
    });
  };

  const openMemo = (memo) => {
    setForm({
      id: memo.id,
      title: memo.title,
      content: memo.content,
      tags: joinTags(memo.tags),
      visibility: memo.visibility || "private",
      pinned: Boolean(memo.pinned),
      archived: Boolean(memo.archived),
      agentId: memo.agentId || agentFilter || "",
      nodeId: memo.nodeId || "",
      forwardRuleId: memo.forwardRuleId || ""
    });
  };

  const saveMemo = async () => {
    try {
      const payload = {
        ...form,
        tags: parseCommaList(form.tags)
      };
      const url = form.id ? `/api/memos/${form.id}` : "/api/memos";
      const method = form.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage(form.id ? "备忘录已更新。" : "备忘录已创建。");
      resetForm();
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteMemo = async () => {
    if (!form.id) return;
    if (!window.confirm("确认删除这条备忘录吗？")) return;
    try {
      await api(`/api/memos/${form.id}`, { method: "DELETE" });
      setMessage("备忘录已删除。");
      resetForm();
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !form.id) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("memoId", form.id);
    formData.append("visibility", form.visibility);
    formData.append("tags", form.tags);
    try {
      setUploading(true);
      await uploadForm("/api/files/upload", formData);
      setMessage("附件已上传。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const downloadAttachment = async (file) => {
    try {
      await ensureTokenSession();
      await downloadBinary(`/api/files/${file.id}/download`, file.name);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeAttachment = async (fileId) => {
    if (!window.confirm("确认删除附件吗？")) return;
    try {
      await api(`/api/files/${fileId}`, { method: "DELETE" });
      setMessage("附件已删除。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <input placeholder="搜索标题 / 正文 / 标签" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input placeholder="按标签筛选" value={tag} onChange={(event) => setTag(event.target.value)} />
        {agentFilter ? <button onClick={onClearAgentFilter}>清除服务器筛选</button> : null}
        <button onClick={resetForm}>新建备忘录</button>
      </div>

      <div className="grid2">
        <Panel title="备忘录列表">
          {rows.length ? (
            <div className="list-stack">
              {rows.map((memo) => (
                <button className={`list-card ${form.id === memo.id ? "active" : ""}`} key={memo.id} onClick={() => openMemo(memo)}>
                  <strong>{memo.pinned ? "置顶 · " : ""}{memo.title}</strong>
                  <span>{joinTags(memo.tags) || "无标签"} / {memo.visibility}</span>
                  <span>{formatDateTime(memo.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">还没有备忘录。</div>
          )}
        </Panel>

        <Panel title="编辑备忘录">
          <div className="form-grid">
            <Field label="标题" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
            <Field label="标签" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} placeholder="ops, server, renewal" />
            <Field label="可见性" type="select" value={form.visibility} onChange={(value) => setForm((current) => ({ ...current, visibility: value }))} options={[["private", "私有"], ["public", "公开"], ["link", "仅链接可见"]]} />
            <Field label="关联服务器" type="select" value={form.agentId} onChange={(value) => setForm((current) => ({ ...current, agentId: value }))} options={[["", "未关联"], ...agents.map((agent) => [agent.id, agent.name])]} />
            <label>
              <span>置顶</span>
              <input type="checkbox" checked={form.pinned} onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))} />
            </label>
            <label>
              <span>归档</span>
              <input type="checkbox" checked={form.archived} onChange={(event) => setForm((current) => ({ ...current, archived: event.target.checked }))} />
            </label>
          </div>
          <div className="subscription-editor">
            <label>
              Markdown
              <textarea className="inline-textarea" rows={14} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
            </label>
          </div>
          <div className="actions">
            <button className="primary" onClick={saveMemo}>保存</button>
            <button className="red-bg" onClick={deleteMemo} disabled={!form.id}>删除</button>
            <label className="upload-label">
              <input type="file" onChange={uploadAttachment} disabled={!form.id || uploading} />
              {uploading ? "上传中..." : "上传附件"}
            </label>
          </div>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="Markdown 预览">
          <MemoPreview content={form.content} />
        </Panel>

        <Panel title="附件与文件">
          {form.id ? (
            form.id && rows.find((memo) => memo.id === form.id)?.attachments?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.find((memo) => memo.id === form.id)?.attachments?.map((file) => (
                    <tr key={file.id}>
                      <td>{file.name}</td>
                      <td>{file.mimeType}</td>
                      <td>{formatBytes(file.size)}</td>
                      <td>{formatDateTime(file.uploadedAt)}</td>
                      <td className="actions-cell">
                        <button className="link" onClick={() => downloadAttachment(file)}>下载</button>
                        <button className="link" onClick={() => removeAttachment(file.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">当前备忘录还没有附件。</div>
            )
          ) : (
            <div className="empty">先保存一条备忘录，才能上传附件。</div>
          )}

          <div className="sub-panel">
            <h3>全部文件</h3>
            {files.length ? (
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>关联 Memo</th>
                    <th>标签</th>
                    <th>引用</th>
                  </tr>
                </thead>
                <tbody>
                  {files.slice(0, 20).map((file) => (
                    <tr key={file.id}>
                      <td>{file.name}</td>
                      <td>{file.memoId || "-"}</td>
                      <td>{joinTags(file.tags) || "-"}</td>
                      <td>{file.refCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">还没有文件。</div>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function WorkspacePage({ agents, openSsh, openConsole }) {
  const [assets, setAssets] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [assetForm, setAssetForm] = useState({ id: "", agentId: "", displayName: "", host: "", ip: "", port: 22, username: "root", group: "", tags: "", provider: "", region: "", note: "", public: true, publicName: "", publicGroup: "", publicRegion: "", publicFlag: "" });
  const [credentialForm, setCredentialForm] = useState({ name: "", host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", note: "" });
  const [scriptForm, setScriptForm] = useState({ id: "", name: "uptime", content: "uptime", category: "ops", tags: "uptime", timeoutMs: 30000 });
  const [batchAgentIds, setBatchAgentIds] = useState([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [assetRows, credentialRows, scriptRows, runRows] = await Promise.all([api("/api/assets"), api("/api/credentials"), api("/api/scripts"), api("/api/command-runs")]);
      setAssets(assetRows);
      setCredentials(credentialRows);
      setScripts(scriptRows);
      setRuns(runRows);
      if (!batchAgentIds.length) setBatchAgentIds(agents.map((agent) => agent.id));
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [agents.length]);

  const saveAsset = async () => {
    try {
      const payload = { ...assetForm, tags: parseCommaList(assetForm.tags) };
      const url = assetForm.id ? `/api/assets/${assetForm.id}` : "/api/assets";
      const method = assetForm.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage("服务器资产已保存。");
      setAssetForm({ id: "", agentId: "", displayName: "", host: "", ip: "", port: 22, username: "root", group: "", tags: "", provider: "", region: "", note: "", public: true, publicName: "", publicGroup: "", publicRegion: "", publicFlag: "" });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveCredential = async () => {
    try {
      await api("/api/credentials", { method: "POST", body: JSON.stringify(credentialForm) });
      setMessage("凭据已保存。");
      setCredentialForm({ name: "", host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", note: "" });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const testCredential = async (id) => {
    try {
      const response = await api(`/api/credentials/${id}/test`, { method: "POST" });
      setMessage(response.output || "凭据测试通过。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const revokeCredential = async (id) => {
    if (!window.confirm("确认撤销这份凭据吗？")) return;
    try {
      await api(`/api/credentials/${id}`, { method: "DELETE" });
      setMessage("凭据已撤销。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveScript = async () => {
    try {
      const payload = { ...scriptForm, tags: parseCommaList(scriptForm.tags) };
      const url = scriptForm.id ? `/api/scripts/${scriptForm.id}` : "/api/scripts";
      const method = scriptForm.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage("脚本已保存。");
      setScriptForm({ id: "", name: "uptime", content: "uptime", category: "ops", tags: "uptime", timeoutMs: 30000 });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const runBatch = async () => {
    try {
      const script = scripts.find((item) => item.name === scriptForm.name) || scripts.find((item) => item.id === scriptForm.id);
      const response = await api("/api/scripts/run-batch", {
        method: "POST",
        body: JSON.stringify({
          scriptId: script?.id || "",
          command: script ? "" : scriptForm.content,
          agentIds: batchAgentIds,
          concurrency: 2,
          timeoutMs: Number(scriptForm.timeoutMs || 30000)
        })
      });
      setMessage(`批量命令已执行，共 ${response.results?.length || 0} 台。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="服务器资产">
          <div className="form-grid">
            <Field label="关联 Agent" type="select" value={assetForm.agentId} onChange={(value) => setAssetForm((current) => ({ ...current, agentId: value }))} options={[["", "不关联"], ...agents.map((agent) => [agent.id, agent.name])]} />
            <Field label="显示名称" value={assetForm.displayName} onChange={(value) => setAssetForm((current) => ({ ...current, displayName: value }))} />
            <Field label="Host" value={assetForm.host} onChange={(value) => setAssetForm((current) => ({ ...current, host: value }))} />
            <Field label="IP" value={assetForm.ip} onChange={(value) => setAssetForm((current) => ({ ...current, ip: value }))} />
            <Field label="用户名" value={assetForm.username} onChange={(value) => setAssetForm((current) => ({ ...current, username: value }))} />
            <Field label="标签" value={assetForm.tags} onChange={(value) => setAssetForm((current) => ({ ...current, tags: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={saveAsset}>保存资产</button>
          </div>
          {assets.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Agent</th>
                  <th>地址</th>
                  <th>标签</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.displayName}</td>
                    <td>{asset.agentId || "-"}</td>
                    <td>{asset.host || asset.ip || "-"}</td>
                    <td>{joinTags(asset.tags) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有服务器资产。</div>
          )}
        </Panel>

        <Panel title="凭据托管">
          <div className="form-grid">
            <Field label="名称" value={credentialForm.name} onChange={(value) => setCredentialForm((current) => ({ ...current, name: value }))} />
            <Field label="Host" value={credentialForm.host} onChange={(value) => setCredentialForm((current) => ({ ...current, host: value }))} />
            <Field label="用户名" value={credentialForm.username} onChange={(value) => setCredentialForm((current) => ({ ...current, username: value }))} />
            <Field label="认证方式" type="select" value={credentialForm.mode} onChange={(value) => setCredentialForm((current) => ({ ...current, mode: value }))} options={[["password", "密码"], ["privateKey", "私钥"]]} />
            {credentialForm.mode === "password" ? <Field label="密码" type="password" value={credentialForm.password} onChange={(value) => setCredentialForm((current) => ({ ...current, password: value }))} /> : null}
            {credentialForm.mode === "privateKey" ? <Field label="私钥" type="textarea" rows={6} value={credentialForm.privateKey} onChange={(value) => setCredentialForm((current) => ({ ...current, privateKey: value }))} /> : null}
          </div>
          <div className="actions">
            <button className="primary" onClick={saveCredential}>保存凭据</button>
          </div>
          {credentials.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Host</th>
                  <th>认证</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td>{credential.name}</td>
                    <td>{credential.host}:{credential.port}</td>
                    <td>{credential.mode}</td>
                    <td>{credential.revokedAt ? "revoked" : "active"}</td>
                    <td className="actions-cell">
                      <button className="link" onClick={() => testCredential(credential.id)}>测试</button>
                      <button className="link" onClick={() => revokeCredential(credential.id)}>撤销</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有凭据。</div>
          )}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="脚本库与批量命令">
          <div className="form-grid">
            <Field label="脚本名称" value={scriptForm.name} onChange={(value) => setScriptForm((current) => ({ ...current, name: value }))} />
            <Field label="分类" value={scriptForm.category} onChange={(value) => setScriptForm((current) => ({ ...current, category: value }))} />
            <Field label="标签" value={scriptForm.tags} onChange={(value) => setScriptForm((current) => ({ ...current, tags: value }))} />
            <Field label="超时毫秒" type="number" value={scriptForm.timeoutMs} onChange={(value) => setScriptForm((current) => ({ ...current, timeoutMs: value }))} />
            <Field label="命令内容" type="textarea" rows={10} value={scriptForm.content} onChange={(value) => setScriptForm((current) => ({ ...current, content: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={saveScript}>保存脚本</button>
            <button onClick={runBatch}>对选中服务器批量执行</button>
          </div>
          <div className="choice-grid">
            {agents.map((agent) => (
              <label key={agent.id} className="subscription-node">
                <input type="checkbox" checked={batchAgentIds.includes(agent.id)} onChange={() => setBatchAgentIds((current) => (current.includes(agent.id) ? current.filter((item) => item !== agent.id) : [...current, agent.id]))} />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.host || agent.ip}</span>
                </div>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="脚本结果与快捷入口">
          <div className="actions">
            {agents.map((agent) => (
              <React.Fragment key={agent.id}>
                <button onClick={() => openSsh(agent.id)}>SSH {agent.name}</button>
                <button onClick={() => openConsole(agent.id)}>SFTP {agent.name}</button>
              </React.Fragment>
            ))}
          </div>
          {runs.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>脚本 / 命令</th>
                  <th>目标</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.createdAt || run.at)}</td>
                    <td>{run.scriptId || run.command}</td>
                    <td>{joinTags(run.agentIds || (run.agentId ? [run.agentId] : []))}</td>
                    <td><code>{JSON.stringify(run.results || run.output).slice(0, 240)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有执行记录。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

function ConsolePage({ agents, agentId, setAgentId }) {
  const [pathValue, setPathValue] = useState("/");
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [renameForm, setRenameForm] = useState({ oldPath: "", newPath: "" });
  const [transferForm, setTransferForm] = useState({ sourceAgentId: "", sourcePath: "/tmp/a.txt", targetAgentId: "", targetPath: "/tmp/a.txt" });
  const [transferring, setTransferring] = useState(false);

  const currentAgentId = agentId || agents[0]?.id || "";

  const load = async (nextPath = pathValue) => {
    if (!currentAgentId) return;
    try {
      const response = await api(`/api/agents/${currentAgentId}/sftp?path=${encodeURIComponent(nextPath)}`);
      setRows(response.entries || []);
      setPathValue(response.path || nextPath);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agentId, agents]);

  useEffect(() => {
    if (!agents.length) return;
    setTransferForm((current) => {
      const sourceAgentId = current.sourceAgentId || currentAgentId || agents[0].id;
      const targetAgentId = current.targetAgentId || agents.find((agent) => agent.id !== sourceAgentId)?.id || agents[0].id;
      return { ...current, sourceAgentId, targetAgentId };
    });
  }, [agents, currentAgentId]);

  useEffect(() => {
    if (currentAgentId) load("/").catch(() => {});
  }, [currentAgentId]);

  const goTo = (entry) => {
    if (!entry.isDirectory) return;
    const next = pathValue === "/" ? `/${entry.name}` : `${pathValue}/${entry.name}`;
    load(next).catch(() => {});
  };

  const uploadRemote = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !currentAgentId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("directory", pathValue);
    try {
      await uploadForm(`/api/agents/${currentAgentId}/sftp/upload`, formData);
      setMessage("远程上传完成。");
      load(pathValue).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = "";
    }
  };

  const downloadRemote = async (entry) => {
    try {
      await ensureTokenSession();
      const fullPath = pathValue === "/" ? `/${entry.name}` : `${pathValue}/${entry.name}`;
      await downloadBinary(`/api/agents/${currentAgentId}/sftp/download?path=${encodeURIComponent(fullPath)}`, entry.name);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteRemote = async (entry) => {
    if (!window.confirm(`确认删除 ${entry.name} 吗？`)) return;
    try {
      const fullPath = pathValue === "/" ? `/${entry.name}` : `${pathValue}/${entry.name}`;
      await api(`/api/agents/${currentAgentId}/sftp?path=${encodeURIComponent(fullPath)}`, { method: "DELETE" });
      setMessage("远程文件已删除。");
      load(pathValue).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const mkdirRemote = async () => {
    const name = window.prompt("请输入目录名");
    if (!name) return;
    try {
      const nextPath = pathValue === "/" ? `/${name}` : `${pathValue}/${name}`;
      await api(`/api/agents/${currentAgentId}/sftp/mkdir`, { method: "POST", body: JSON.stringify({ path: nextPath }) });
      setMessage("目录已创建。");
      load(pathValue).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const renameRemote = async () => {
    if (!renameForm.oldPath || !renameForm.newPath) return;
    try {
      await api(`/api/agents/${currentAgentId}/sftp/rename`, { method: "POST", body: JSON.stringify(renameForm) });
      setMessage("重命名完成。");
      setRenameForm({ oldPath: "", newPath: "" });
      load(pathValue).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const transferRemote = async () => {
    if (!transferForm.sourceAgentId || !transferForm.targetAgentId || !transferForm.sourcePath || !transferForm.targetPath) {
      setMessage("请选择源服务器、目标服务器，并填写源路径和目标路径。");
      return;
    }
    if (transferForm.sourceAgentId === transferForm.targetAgentId && transferForm.sourcePath === transferForm.targetPath) {
      setMessage("源和目标完全相同，未执行传输。");
      return;
    }
    setTransferring(true);
    try {
      const response = await api("/api/sftp/transfer", { method: "POST", body: JSON.stringify(transferForm) });
      setMessage(`跨服务器传输完成：${formatBytes(response.size)}，${response.sourcePath} -> ${response.targetPath}`);
      if (response.targetAgentId === currentAgentId) load(pathValue).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setTransferring(false);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <select value={currentAgentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.connected ? "online" : "offline"}
            </option>
          ))}
        </select>
        <input value={pathValue} onChange={(event) => setPathValue(event.target.value)} />
        <button onClick={() => load(pathValue).catch(() => {})}>列目录</button>
        <button onClick={mkdirRemote}>新建目录</button>
        <label className="upload-label">
          <input type="file" onChange={uploadRemote} />
          上传文件
        </label>
      </div>

      {!agents.length ? (
        <Panel title="Agent 状态">
          <div className="empty">当前后台会话没有拿到 Agent 列表。请确认已登录后台，或在右上角使用 ck_ 开头的 API Token；sess_ 是浏览器会话，不需要手动填入。</div>
        </Panel>
      ) : null}

      <div className="grid2">
        <Panel title="SFTP 文件管理">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th>类型</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={`${entry.name}-${entry.modifiedAt}`}>
                    <td>{entry.name}</td>
                    <td>{entry.isDirectory ? "-" : formatBytes(entry.size)}</td>
                    <td>{formatDateTime(entry.modifiedAt)}</td>
                    <td>{entry.isDirectory ? "dir" : "file"}</td>
                    <td className="actions-cell">
                      {entry.isDirectory ? <button className="link" onClick={() => goTo(entry)}>进入</button> : <button className="link" onClick={() => downloadRemote(entry)}>下载</button>}
                      {!entry.isDirectory ? <button className="link" onClick={() => deleteRemote(entry)}>删除</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">目录为空或尚未读取。</div>
          )}
        </Panel>

        <Panel title="重命名与快捷命令">
          <div className="form-grid">
            <Field label="旧路径" value={renameForm.oldPath} onChange={(value) => setRenameForm((current) => ({ ...current, oldPath: value }))} placeholder="/tmp/a.txt" />
            <Field label="新路径" value={renameForm.newPath} onChange={(value) => setRenameForm((current) => ({ ...current, newPath: value }))} placeholder="/tmp/b.txt" />
          </div>
          <div className="actions">
            <button className="primary" onClick={renameRemote}>执行重命名</button>
          </div>
          <div className="panel-tip">远程文件操作全部写入审计日志，路径会经过标准化处理，避免目录穿越。</div>
          {message ? <pre>{message}</pre> : null}
        </Panel>
      </div>

      <Panel title="跨服务器 SFTP 对传">
        <div className="form-grid">
          <label>
            源服务器
            <select value={transferForm.sourceAgentId} onChange={(event) => setTransferForm((current) => ({ ...current, sourceAgentId: event.target.value }))}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name} · {agent.connected ? "online" : "offline"}</option>
              ))}
            </select>
          </label>
          <label>
            目标服务器
            <select value={transferForm.targetAgentId} onChange={(event) => setTransferForm((current) => ({ ...current, targetAgentId: event.target.value }))}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name} · {agent.connected ? "online" : "offline"}</option>
              ))}
            </select>
          </label>
          <Field label="源文件路径" value={transferForm.sourcePath} onChange={(value) => setTransferForm((current) => ({ ...current, sourcePath: value }))} placeholder="/tmp/a.txt" />
          <Field label="目标文件路径" value={transferForm.targetPath} onChange={(value) => setTransferForm((current) => ({ ...current, targetPath: value }))} placeholder="/tmp/a.txt" />
        </div>
        <div className="actions">
          <button className="primary" onClick={transferRemote} disabled={transferring || agents.length < 2}>
            {transferring ? "传输中..." : "开始对传"}
          </button>
        </div>
        <div className="panel-tip">对传通过主控临时流转文件内容，默认限制 64 MB，可用 CHIKEN_SFTP_TRANSFER_MAX_MB 调整；路径会标准化处理，操作写入审计日志。</div>
      </Panel>
    </section>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => api("/api/settings").then(setSettings).catch((error) => setMessage(error.message));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const save = async () => {
    try {
      const response = await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(response);
      setMessage("设置已保存。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const testNotification = async () => {
    try {
      await api("/api/settings/notifications/test", { method: "POST" });
      setMessage("测试通知已发送。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  if (!settings) return null;

  return (
    <section>
      <div className="grid2">
        <Panel title="监控与告警设置">
          <div className="form-grid">
            <Field label="公开页刷新秒数" type="number" value={settings.publicProbeRefreshSec} onChange={(value) => setSettings((current) => ({ ...current, publicProbeRefreshSec: Number(value || 10) }))} />
            <Field label="CPU 阈值" type="number" value={settings.alerts?.cpuThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, cpuThreshold: Number(value || 90) } }))} />
            <Field label="内存阈值" type="number" value={settings.alerts?.memoryThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, memoryThreshold: Number(value || 90) } }))} />
            <Field label="磁盘阈值" type="number" value={settings.alerts?.diskThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, diskThreshold: Number(value || 90) } }))} />
            <Field label="冷却分钟" type="number" value={settings.alerts?.cooldownMinutes || 30} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, cooldownMinutes: Number(value || 30) } }))} />
            <Field label="Telegram Chat ID" value={settings.telegramChatId || ""} onChange={(value) => setSettings((current) => ({ ...current, telegramChatId: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={save}>保存设置</button>
            <button onClick={testNotification}>测试通知</button>
          </div>
        </Panel>

        <Panel title="安全状态">
          <div className="panel-stack">
            <p className="muted">Query token: {settings.queryTokenEnabled ? "enabled" : "disabled"}</p>
            <p className="muted">Master key: {settings.masterKeySet ? "set" : "missing"}</p>
            <p className="muted">Storage mode: {settings.storageMode}</p>
            {settings.hasTelegramToken ? <p className="muted">Telegram token 已配置</p> : <p className="muted">Telegram token 未配置</p>}
            {settings.hasWebhookUrl ? <p className="muted">Webhook 已配置</p> : <p className="muted">Webhook 未配置</p>}
          </div>
          {settings.warnings?.length ? (
            <div className="warning-list">
              {settings.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : (
            <div className="empty">当前没有额外警告。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

function ApiTokens({ tokenDraft, setTokenDraft, saveToken, clearToken, activeToken }) {
  const [rows, setRows] = useState([]);
  const [created, setCreated] = useState("");
  const [name, setName] = useState("automation");
  const [message, setMessage] = useState("");

  const load = () => api("/api/api-tokens").then(setRows);

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const create = async () => {
    try {
      const response = await api("/api/api-tokens", { method: "POST", body: JSON.stringify({ name }) });
      setCreated(response.token);
      setTokenDraft(response.token);
      setMessage("新令牌已生成，可以直接点“使用令牌”写入当前面板。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const revoke = async (id) => {
    try {
      await api(`/api/api-tokens/${id}`, { method: "DELETE" });
      setMessage("令牌已撤销。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="创建与注入令牌">
          <div className="form-grid">
            <Field label="令牌名称" value={name} onChange={setName} />
            <Field label="当前面板令牌" value={tokenDraft} onChange={setTokenDraft} placeholder="ck_xxx" />
          </div>
          <div className="actions">
            <button className="primary" onClick={create}>
              生成 API Token
            </button>
            <button onClick={saveToken}>使用令牌</button>
            <button onClick={clearToken}>清除本地令牌</button>
          </div>
          <pre>{created || activeToken || "保存后的令牌会自动附带到 API、日志 SSE 和终端 WebSocket，方便 AI 直接接管主控。"} </pre>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>

        <Panel title="令牌说明">
          <div className="panel-tip">
            API Token 的定位就是“拿到令牌即可进入主控并修改配置”。你可以把它给自动化脚本、浏览器收藏链接或 AI 代理使用。
          </div>
          <div className="panel-tip">浏览器地址支持带上 `?token=ck_xxx`，页面会自动保存并用于后续请求。</div>
        </Panel>
      </div>

      <Panel title="令牌列表">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>Token</th>
              <th>创建时间</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id || row.name}>
                <td>{row.name}</td>
                <td>
                  <code>{row.token}</code>
                </td>
                <td>{row.createdAt}</td>
                <td>{row.revoked ? "revoked" : "active"}</td>
                <td>{row.revoked ? null : <button className="link" onClick={() => revoke(row.id)}>撤销</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api("/api/audit").then(setRows).catch(() => {});
  }, []);

  return (
    <Panel title="审计日志">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>操作者</th>
            <th>动作</th>
            <th>目标</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.at}</td>
              <td>{row.actor}</td>
              <td>{row.action}</td>
              <td>{row.target}</td>
              <td>
                <code>{JSON.stringify(row.detail)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function Tutorial() {
  const cards = [
    ["节点配置", "切换协议时表单会自动更新为该协议的字段与默认值，不再保留上一种协议的残留参数。"],
    ["订阅聚合", "可以把已经下发过的本地节点聚合成订阅链接，也能直接导入外部原始内容，并切换内置 Clash 模板。"],
    ["真实 SSH", "服务器列表右侧现在有 SSH 入口。保存好该机器的 SSH 配置后，点一下就会直接进入交互式 WebSSH 终端。"],
    ["一键部署", "SSH 页面可以直接生成 systemd 或 Docker 的一键部署命令，也可以复用当前 SSH 凭据直接执行部署。"],
    ["实时探针", "Agent 会持续上报 CPU、内存、磁盘、网络速率和累计流量，效果更接近 Komari / 哪吒这类监控面板。"],
    ["独立转发", "端口转发支持 sing-box、Realm、GOST 三种引擎，并且通过独立容器运行，不再覆盖节点配置。"],
    ["TLS 自动补齐", "Trojan 和 Hysteria2 首次下发时会自动生成自签名证书，先把服务端跑起来，再做客户端验证。"],
    ["API Token", "把 token 放进地址栏 `?token=ck_xxx` 或面板顶部，即可让 API、日志和终端请求都自动带认证。"]
  ];

  return (
    <section>
      <div className="guide-grid">
        {cards.map(([title, body]) => (
          <div className="guide-card" key={title}>
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function sampleConfig() {
  return {
    log: { level: "info" },
    dns: { servers: [{ tag: "cloudflare", type: "udp", server: "1.1.1.1" }], final: "cloudflare" },
    inbounds: [],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { final: "direct" }
  };
}

function App() {
  const isAdminPath = window.location.pathname.startsWith("/admin");
  const [page, setPage] = useState("dashboard");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [memoAgentFilter, setMemoAgentFilter] = useState("");

  useEffect(() => {
    if (!isAdminPath) return;
    const url = new URL(window.location.href);
    const urlToken = String(url.searchParams.get(URL_TOKEN_PARAM) || "").trim();
    const storedToken = String(loadStoredToken() || "").trim();
    const nextToken = isPanelApiToken(urlToken) ? urlToken : isPanelApiToken(storedToken) ? storedToken : "";

    if (urlToken) {
      url.searchParams.delete(URL_TOKEN_PARAM);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      if (isPanelApiToken(urlToken)) persistToken(urlToken);
    }

    setActiveApiToken(nextToken);
    setTokenDraft(nextToken);
    setTokenReady(true);
  }, [isAdminPath]);

  const loadAgents = () => api("/api/agents").then(setAgents);

  useEffect(() => {
    if (!isAdminPath) return;
    if (!tokenReady) return;
    loadAgents().catch(() => {});
    const timer = setInterval(() => loadAgents().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [isAdminPath, tokenReady]);

  const saveToken = () => {
    const token = tokenDraft.trim();
    if (token && !isPanelApiToken(token)) {
      setTokenDraft("");
      setActiveApiToken("");
      persistToken("");
      return;
    }
    setActiveApiToken(token);
    persistToken(token);
    ensureTokenSession(token).catch(() => {});
    loadAgents().catch(() => {});
  };

  const clearToken = () => {
    setTokenDraft("");
    setActiveApiToken("");
    persistToken("");
  };

  const openAgent = (id) => {
    setAgentId(id);
    setPage("detail");
  };

  const openSsh = (id) => {
    setAgentId(id);
    setPage("ssh");
  };

  const openConsole = (id) => {
    setAgentId(id);
    setPage("console");
  };

  const openAgentMemos = (id) => {
    setAgentId(id);
    setMemoAgentFilter(id);
    setPage("memos");
  };

  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard openAgent={openAgent} openSsh={openSsh} />;
    if (page === "servers") return <Servers openAgent={openAgent} openSsh={openSsh} />;
    if (page === "console") return <ConsolePage agents={agents} agentId={agentId} setAgentId={setAgentId} />;
    if (page === "nodes") return <NodeWizard agents={agents} />;
    if (page === "node-pool") return <NodePoolPage />;
    if (page === "subscriptions") return <SubscriptionsPage />;
    if (page === "forward") return <ForwardWizard agents={agents} />;
    if (page === "monitor") return <MonitorPage openAgent={openAgent} />;
    if (page === "workspace") return <WorkspacePage agents={agents} openSsh={openSsh} openConsole={openConsole} />;
    if (page === "memos") return <MemosPage agents={agents} agentFilter={memoAgentFilter} onClearAgentFilter={() => setMemoAgentFilter("")} />;
    if (page === "detail") {
      return (
        <AgentDetail
          id={agentId}
          back={() => setPage("servers")}
          openConfig={() => setPage("config")}
          openLogs={() => setPage("logs")}
          openSsh={() => setPage("ssh")}
          openConsole={() => openConsole(agentId)}
          openMemos={() => openAgentMemos(agentId)}
        />
      );
    }
    if (page === "ssh") return <SshPage id={agentId} back={() => setPage("servers")} />;
    if (page === "config") return <ConfigPage id={agentId} back={() => setPage("detail")} />;
    if (page === "logs") return <LogsPage id={agentId} back={() => setPage("detail")} />;
    if (page === "tokens") {
      return <ApiTokens tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} clearToken={clearToken} activeToken={getActiveApiToken()} />;
    }
    if (page === "audit") return <Audit />;
    if (page === "settings") return <SettingsPage />;
    return <Tutorial />;
  }, [page, agentId, agents, tokenDraft, memoAgentFilter]);

  if (!isAdminPath) return <PublicStatusPage />;

  return (
    <Layout
      nav={nav}
      page={page}
      setPage={setPage}
      headerExtra={<AccessTokenBar tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} clearToken={clearToken} hasToken={Boolean(getActiveApiToken())} />}
    >
      {content}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
