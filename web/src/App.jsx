import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ClipboardList,
  Code2,
  KeyRound,
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

const TOKEN_KEY = "chiken_api_token";
const URL_TOKEN_PARAM = "token";

let activeApiToken = "";

function setActiveApiToken(token) {
  activeApiToken = String(token || "").trim();
}

function getActiveApiToken() {
  return activeApiToken;
}

function buildAuthUrl(url, extraParams = {}) {
  const target = new URL(url, window.location.origin);
  const token = getActiveApiToken();
  if (token && !target.searchParams.has(URL_TOKEN_PARAM)) target.searchParams.set(URL_TOKEN_PARAM, token);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }
  return `${target.pathname}${target.search}`;
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (getActiveApiToken()) headers.set("Authorization", `Bearer ${getActiveApiToken()}`);

  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((item) => item.toString(16).padStart(2, "0")).join("");
const randPassword = () => randHex(12);
const randShortId = () => randHex(8);
const randPort = (base = 20000, size = 30000) => base + Math.floor(Math.random() * size);
const randPath = () => `/${randHex(3)}`;
const newUuid = () => crypto.randomUUID?.() || `${randHex(4)}-${randHex(2)}-${randHex(2)}-${randHex(2)}-${randHex(6)}`;

const nav = [
  ["dashboard", Activity, "仪表盘"],
  ["servers", Monitor, "服务器"],
  ["nodes", Code2, "节点配置"],
  ["forward", PlugZap, "端口转发"],
  ["tokens", KeyRound, "API 令牌"],
  ["audit", ClipboardList, "审计日志"],
  ["settings", Settings, "教程"]
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
      shortId: randShortId(),
      flow: "xtls-rprx-vision"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => 443 },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "serverName", label: "SNI / 握手域名", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "serverPort", label: "握手端口", type: "number" },
      { key: "privateKey", label: "Reality 私钥" },
      { key: "shortId", label: "Reality short_id", random: () => randShortId() },
      { key: "flow", label: "Flow" },
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
  return protocolDefinitions[protocol]?.defaults() || protocolDefinitions["vmess-ws"].defaults();
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

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 100 || index === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[index]}`;
}

function formatSpeed(value) {
  return `${formatBytes(value)}/s`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
}

function Layout({ page, setPage, children, headerExtra }) {
  const navPage = ["detail", "config", "logs", "ssh"].includes(page) ? "servers" : page;
  return (
    <div className="app">
      <aside>
        <div className="brand">ChikenEasy</div>
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={navPage === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </aside>
      <main>
        <header>
          <strong>{nav.find(([id]) => id === navPage)?.[2] || "服务器"}</strong>
          <div className="header-tools">
            {headerExtra}
            <span>admin</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
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

function AgentDetail({ id, back, openConfig, openLogs, openSsh }) {
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
      ...defaultProtocolForm(nextProtocol)
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
    const source = new EventSource(buildAuthUrl(`/api/agents/${id}/logs/stream`, { lines: count }));
    source.onmessage = (event) => setLines((current) => [...current, JSON.parse(event.data).line].slice(-1000));
    return () => source.close();
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
  const [page, setPage] = useState("dashboard");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const urlToken = String(url.searchParams.get(URL_TOKEN_PARAM) || "").trim();
    const storedToken = String(window.localStorage.getItem(TOKEN_KEY) || "").trim();
    const nextToken = urlToken || storedToken;

    if (urlToken) {
      url.searchParams.delete(URL_TOKEN_PARAM);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      window.localStorage.setItem(TOKEN_KEY, urlToken);
    }

    setActiveApiToken(nextToken);
    setTokenDraft(nextToken);
    setTokenReady(true);
  }, []);

  const loadAgents = () => api("/api/agents").then(setAgents);

  useEffect(() => {
    if (!tokenReady) return;
    loadAgents().catch(() => {});
    const timer = setInterval(() => loadAgents().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [tokenReady]);

  const saveToken = () => {
    const token = tokenDraft.trim();
    setActiveApiToken(token);
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    loadAgents().catch(() => {});
  };

  const clearToken = () => {
    setTokenDraft("");
    setActiveApiToken("");
    window.localStorage.removeItem(TOKEN_KEY);
  };

  const openAgent = (id) => {
    setAgentId(id);
    setPage("detail");
  };

  const openSsh = (id) => {
    setAgentId(id);
    setPage("ssh");
  };

  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard openAgent={openAgent} openSsh={openSsh} />;
    if (page === "servers") return <Servers openAgent={openAgent} openSsh={openSsh} />;
    if (page === "nodes") return <NodeWizard agents={agents} />;
    if (page === "forward") return <ForwardWizard agents={agents} />;
    if (page === "detail") {
      return (
        <AgentDetail
          id={agentId}
          back={() => setPage("servers")}
          openConfig={() => setPage("config")}
          openLogs={() => setPage("logs")}
          openSsh={() => setPage("ssh")}
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
    return <Tutorial />;
  }, [page, agentId, agents, tokenDraft]);

  return (
    <Layout
      page={page}
      setPage={setPage}
      headerExtra={<AccessTokenBar tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} clearToken={clearToken} hasToken={Boolean(getActiveApiToken())} />}
    >
      {content}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
