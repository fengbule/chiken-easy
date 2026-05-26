import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AtSign,
  Bell,
  BookOpen,
  ClipboardList,
  Code2,
  Clock3,
  Cpu,
  Download,
  FolderClosed,
  FolderSync,
  Gauge,
  HardDriveDownload,
  HardDrive,
  Home,
  House,
  KeyRound,
  Link2,
  Monitor,
  MoreHorizontal,
  Palette,
  RadioTower,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings,
  Shield,
  Shuffle,
  Trash2,
  Unplug,
  Upload,
  UserCircle,
  Users,
  Wifi
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

async function copyText(text) {
  await navigator.clipboard?.writeText(String(text || ""));
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

function Card({ label, value, accent = "", icon: Icon = null, hint = "" }) {
  return (
    <div className="stat">
      <span>{Icon ? <Icon size={17} /> : null}{label}</span>
      <b className={accent}>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", rows = 4, options = [], random = null, hint = "", inputMode = undefined, min = undefined, max = undefined, step = undefined, disabled = false }) {
  let control = null;
  if (type === "select") {
    control = (
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    );
  } else if (type === "textarea") {
    control = <textarea className="inline-textarea" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />;
  } else {
    control = <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} min={min} max={max} step={step} disabled={disabled} />;
  }
  return (
    <label>
      <span className="field-label">{label}</span>
      <div className="input-row">
        {control}
        {random ? (
          <button type="button" className="icon-btn" onClick={random} title="随机生成" disabled={disabled}>
            <Shuffle size={15} />
          </button>
        ) : null}
      </div>
      {hint ? <small className="field-hint">{hint}</small> : null}
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
          <Trash2 size={15} />
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
      setMessage("");
      const response = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLogin(response);
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="login-page">
      <div className="login-panel">
        <div className="login-brand">Chiken Monitor</div>
        <label>
          账号
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          密码
          <input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} type="password" autoComplete="current-password" />
        </label>
        <button className="primary" onClick={submit}>登录</button>
        {message ? <p className="panel-message">{message}</p> : null}
        <a className="probe-link" href="/">返回公开探针</a>
      </div>
    </main>
  );
}

function HeaderAccount({ user, logout }) {
  return (
    <div className="header-account">
      <a className="button-link" href="/" target="_blank" rel="noreferrer">公开探针</a>
      <span className="muted">{user || "admin"}</span>
      <button onClick={logout}>退出</button>
    </div>
  );
}

function Layout({ page, setPage, headerExtra, children }) {
  const navPage = ["detail", "ssh", "config", "logs", "desktop", "files-agent"].includes(page) ? "servers" : page;
  const activeNav = nav.find(([id]) => id === navPage);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Menu size={18} />Chiken Monitor</div>
        {navGroups.map((group, groupIndex) => {
          const HeaderIcon = group.icon;
          return (
            <div className="nav-section" key={group.title || groupIndex}>
              {group.title ? (
                <div className="nav-heading">
                  {HeaderIcon ? <HeaderIcon size={16} /> : null}
                  <span>{group.title}</span>
                </div>
              ) : null}
              {group.items.map(([id, Icon, label]) => (
                <button key={id} className={navPage === id ? "active" : ""} onClick={() => setPage(id)}>
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>{activeNav?.[2] || "控制台"}</strong>
          <div className="header-tools">{headerExtra}</div>
        </header>
        {children}
      </main>
    </div>
  );
}

function AgentTable({ agents, openAgent, openSsh, openDesktop, openFiles }) {
  return (
    <div className="agent-grid">
      {agents.map((agent) => {
        const probe = agent.probe || {};
        const cpu = probe.cpu || {};
        const memory = probe.memory || {};
        const disk = probe.disk || {};
        const network = probe.network || {};
        const hasProbe = Boolean(probe.updatedAt);
        return (
          <article className="agent-card" key={agent.id}>
            <div className="agent-card-head">
              <div>
                <h3>{agent.name}</h3>
                <p>{agent.ip || agent.host} · {agent.os}/{agent.arch}</p>
              </div>
              <div className="agent-status-stack">
                <span className={`status-pill ${agent.connected ? "online" : ""}`}><StatusDot on={agent.connected} />{agent.connected ? "online" : "offline"}</span>
                <span className="status-pill"><StatusDot on={agent.singboxStatus === "active"} />{agent.singboxStatus}</span>
              </div>
            </div>

            <div className="agent-metrics">
              <div className="agent-metric">
                <span>CPU</span>
                <b>{formatPercent(cpu.usage)}</b>
                <MiniMeter value={cpu.usage} />
              </div>
              <div className="agent-metric">
                <span>内存</span>
                <b>{formatPercent(memory.usage)}</b>
                <MiniMeter value={memory.usage} tone="green" />
              </div>
              <div className="agent-metric">
                <span>硬盘</span>
                <b>{formatPercent(disk.usage)}</b>
                <MiniMeter value={disk.usage} tone="amber" />
              </div>
              <div className="agent-metric network">
                <span>网络</span>
                <b>↓ {formatSpeed(network.rxSpeed)}</b>
                <small>↑ {formatSpeed(network.txSpeed)}</small>
              </div>
            </div>

            <div className="agent-card-foot">
              <span className={hasProbe ? "live-stamp" : "live-stamp stale"}>{hasProbe ? `探针 ${formatTimeAgo(probe.updatedAt)}` : "等待新版探针"}</span>
              <div className="agent-actions">
                <button className="link" onClick={() => openAgent(agent.id)}>详情</button>
                <button className="link" onClick={() => openSsh(agent.id)}>SSH</button>
                <button className="link" onClick={() => openDesktop(agent.id)}>桌面</button>
                <button className="link" onClick={() => openFiles(agent.id)}>文件</button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Dashboard({ liveTick, openAgent, openSsh, openDesktop, openFiles }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api("/api/dashboard").then(setData).catch(() => {});
  }, [liveTick]);
  if (!data) return null;
  const summary = data.summary || {};
  return (
    <section>
      <div className="stats">
        <Card icon={Monitor} label="节点" value={`${data.online}/${data.total}`} hint={`${data.offline} 台离线`} accent="green" />
        <Card icon={Cpu} label="CPU" value={formatPercent(summary.avgCpu)} />
        <Card icon={MemoryStick} label="内存" value={formatPercent(summary.avgMemory)} />
        <Card icon={Wifi} label="实时流量" value={`↓ ${formatSpeed(summary.rxSpeed)}`} hint={`↑ ${formatSpeed(summary.txSpeed)}`} accent="blue" />
      </div>
      <Panel title="最近活跃">
        <AgentTable agents={data.recent} openAgent={openAgent} openSsh={openSsh} openDesktop={openDesktop} openFiles={openFiles} />
      </Panel>
    </section>
  );
}

function PublicProbePage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("全部");
  const [mode, setMode] = useState("grid");
  const [now, setNow] = useState(new Date());

  const load = () => fetch("/api/public/probes").then((response) => response.json()).then(setData).catch(() => {});

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    const clock = window.setInterval(() => setNow(new Date()), 1000);
    const source = new EventSource("/api/public/events");
    source.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.payload) setData(message.payload);
      } catch {}
    };
    source.onerror = () => {};
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      source.close();
    };
  }, []);

  const sourceRows = data?.agents || [];
  const groups = ["全部", ...Array.from(new Set(sourceRows.map((agent) => agent.profile?.group || agent.profile?.region).filter(Boolean)))];
  const rows = sourceRows.filter((agent) => {
    const profile = agent.profile || {};
    const system = systemInfo(agent);
    const text = [profile.displayName, profile.region, profile.group, profile.flag, system.distro, system.kernel, agent.os, agent.arch, ...(profile.tags || [])].join(" ").toLowerCase();
    const groupOk = group === "全部" || profile.group === group || profile.region === group;
    return groupOk && text.includes(query.toLowerCase());
  });
  const summary = data?.summary || {};
  const monitorSettings = data?.settings || {};
  const site = monitorSettings.site || {};
  const theme = monitorSettings.theme || {};
  const totalTraffic = (Number(summary.rxBytes) || 0) + (Number(summary.txBytes) || 0);
  const avgSpeed = (Number(summary.rxSpeed) || 0) + (Number(summary.txSpeed) || 0);
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

function Servers({ agents, openAgent, openSsh, openDesktop, openFiles }) {
  const [query, setQuery] = useState("");
  const filtered = agents.filter((agent) => [agent.name, agent.host, agent.ip, agent.os, ...(agent.tags || [])].join(" ").toLowerCase().includes(query.toLowerCase()));
  return (
    <section>
      <div className="toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称 / 主机 / IP 搜索" />
      </div>
      <Panel title="服务器">
        <AgentTable agents={filtered} openAgent={openAgent} openSsh={openSsh} openDesktop={openDesktop} openFiles={openFiles} />
      </Panel>
    </section>
  );
}

function AgentDetail({ id, back, openConfig, openLogs, openSsh, openDesktop, openFiles, liveTick }) {
  const [agent, setAgent] = useState(null);
  const [nameDraft, setNameDraft] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [id]);

  const service = async (action) => {
    const response = await api(`/api/agents/${id}/service/${action}`, { method: "POST" });
    setResult(JSON.stringify(response, null, 2));
  };

  const uninstall = async () => {
    if (!window.confirm("确认卸载当前 Agent 吗？")) return;
    const response = await api(`/api/agents/${id}/uninstall`, { method: "POST", body: JSON.stringify({ removeSingbox: false }) });
    setResult(JSON.stringify(response, null, 2));
  };

  const rename = async () => {
    const response = await api(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify({ name: nameDraft }) });
    setAgent(response);
    setResult("服务器名称已更新。");
  };

  if (!agent) return null;
  const infoEntries = Object.entries(agent).filter(([key]) => !["metrics", "metricsHistory", "lastConfig"].includes(key));

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <input className="title-input" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
        <button onClick={rename}>保存名称</button>
        <button onClick={() => service("status")}>刷新状态</button>
        <button onClick={openSsh}>SSH</button>
        <button onClick={openDesktop}>远程桌面</button>
        <button onClick={openFiles}>文件</button>
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
        <Panel title="Chiken Monitor 探针">
          <ProbePanel probe={agent.probe} />
        </Panel>
        <Panel title="服务控制">
          <div className="actions">
            <button className="green-bg" onClick={() => service("start")}>启动</button>
            <button className="blue-bg" onClick={() => service("restart")}>重启</button>
            <button className="red-bg" onClick={() => service("stop")}>停止</button>
          </div>
          <pre>{result || "这里会展示最近一次启动、停止、重启或卸载操作的返回结果。"}</pre>
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

function sendKey(eventKey, ctrlKey) {
  if (ctrlKey && eventKey.length === 1) return String.fromCharCode(eventKey.toUpperCase().charCodeAt(0) - 64);
  if (eventKey === "Enter") return "\r";
  if (eventKey === "Backspace") return "\x7f";
  if (eventKey === "Tab") return "\t";
  if (eventKey === "Escape") return "\x1b";
  if (eventKey === "ArrowUp") return "\x1b[A";
  if (eventKey === "ArrowDown") return "\x1b[B";
  if (eventKey === "ArrowRight") return "\x1b[C";
  if (eventKey === "ArrowLeft") return "\x1b[D";
  if (eventKey === "Delete") return "\x1b[3~";
  if (eventKey === "Home") return "\x1b[H";
  if (eventKey === "End") return "\x1b[F";
  if (eventKey === "PageUp") return "\x1b[5~";
  if (eventKey === "PageDown") return "\x1b[6~";
  if (eventKey.length === 1) return eventKey;
  return "";
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
      right={<div className="terminal-tools"><span><StatusDot on={connected} />{connected ? "connected" : "closed"}</span><button onClick={copyTerminal}>复制</button><button onClick={() => setOutput("")}>清屏</button></div>}
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

function SshPage({ id, back, liveTick }) {
  const [agent, setAgent] = useState(null);
  const [profile, setProfile] = useState({ host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", credentialId: "" });
  const [credentials, setCredentials] = useState([]);
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
          privateKey: profile.privateKey,
          credentialId: profile.credentialId
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
      setMessage(response.output || "SSH 测试通过。");
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
        <button onClick={() => setConnectNonce((value) => value + 1)}><RefreshCw size={16} />重连</button>
      </div>

      <TerminalPanel agentId={id} agentName={agent.name} mode={mode} connectNonce={connectNonce} />

      <div className="grid2 ssh-grid">
        <Panel title="SSH 配置" right={<span className="muted">列表里的 SSH 现在会直接进入这个终端</span>}>
          <div className="form-grid">
            <Field label="主机" value={profile.host} onChange={(value) => patch("host", value)} />
            <Field label="端口" type="number" value={profile.port} onChange={(value) => patch("port", value)} />
            <Field label="用户名" value={profile.username} onChange={(value) => patch("username", value)} />
            <Field label="凭据" type="select" value={profile.credentialId || ""} onChange={(value) => patch("credentialId", value)} options={[["", "不使用凭据库"], ...credentials.map((item) => [item.id, item.name])]} />
            <Field label="认证方式" type="select" value={profile.mode} onChange={(value) => patch("mode", value)} options={[["password", "密码"], ["privateKey", "私钥"]]} />
            {profile.mode === "password" ? <Field label="密码" type="password" value={profile.password} onChange={(value) => patch("password", value)} /> : null}
            {profile.mode === "privateKey" ? <Field label="私钥" type="textarea" rows={6} value={profile.privateKey} onChange={(value) => patch("privateKey", value)} /> : null}
          </div>
          <div className="actions">
            <button className="primary" onClick={save}>保存 SSH</button>
            <button onClick={test}>测试连接</button>
            <button onClick={() => setMode("ssh")}>SSH 模式</button>
            <button onClick={() => setMode("agent")}>Agent 模式</button>
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

function DesktopPage({ id, back, liveTick }) {
  const [agent, setAgent] = useState(null);
  const [profile, setProfile] = useState({ host: "", port: 3389, username: "Administrator", password: "", domain: "", width: 1600, height: 900, colorDepth: 32, credentialId: "" });
  const [credentials, setCredentials] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api(`/api/agents/${id}`), api(`/api/agents/${id}/rdp-profile`), api("/api/credentials?type=rdp")])
      .then(([agentData, rdpData, credentialRows]) => {
        setAgent(agentData);
        setProfile((current) => ({ ...current, ...rdpData, password: "" }));
        setCredentials(credentialRows);
      })
      .catch((error) => setMessage(error.message));
  }, [id, liveTick]);

  const patch = (key, value) => setProfile((current) => ({ ...current, [key]: value }));

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
      const response = await api(`/api/agents/${id}/rdp-profile`, {
        method: "PUT",
        body: JSON.stringify({
          host: profile.host,
          port: Number(profile.port || 3389),
          username: profile.username,
          password: profile.password,
          domain: profile.domain,
          width: Number(profile.width || 1600),
          height: Number(profile.height || 900),
          colorDepth: Number(profile.colorDepth || 32),
          credentialId: profile.credentialId
        })
      });
      setProfile((current) => ({ ...current, ...response, password: "" }));
      setMessage("远程桌面配置已保存。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const test = async () => {
    try {
      const response = await api(`/api/agents/${id}/rdp-profile/test`, { method: "POST", body: JSON.stringify(profile) });
      setMessage(response.output || "RDP 端口测试通过。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const powerShell = useMemo(() => {
    const user = profile.domain ? `${profile.domain}\\${profile.username}` : profile.username;
    return `cmdkey /generic:TERMSRV/${profile.host} /user:${user} /pass:你的密码\nmstsc "${profile.host}:${profile.port}"`;
  }, [profile]);

  if (!agent) return null;

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>远程桌面 - {agent.name}</h1>
      </div>
      <div className="grid2">
        <Panel title="RDP 配置" right={<span className="muted">支持生成可直接导入的 .rdp 文件</span>}>
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
            <button className="primary" onClick={save}>保存 RDP</button>
            <button onClick={test}>测试 3389</button>
            <a className="button-link" href={fileDownloadUrl(`/api/agents/${id}/rdp-file`)}>下载 .rdp</a>
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>
        <Panel title="本机启动参考">
          <pre>{powerShell}</pre>
          <div className="panel-tip">浏览器端已支持凭据保存和 .rdp 文件生成；真正的桌面渲染交给系统原生远程桌面客户端，稳定性更高。</div>
        </Panel>
      </div>
    </section>
  );
}

function FilePane({ title, agentId, setAgentId, agents, data, selected, setSelected, refresh, openPath, uploadFile, makeDir, removeItem, side }) {
  const fileInputRef = useRef(null);
  return (
    <Panel
      title={title}
      right={
        <div className="toolbar-inline">
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name} - {agent.ip}</option>
            ))}
          </select>
          <button onClick={refresh}><RefreshCw size={15} />刷新</button>
        </div>
      }
    >
      <div className="file-toolbar">
        <button onClick={() => openPath(data.parent || "/")} disabled={!data.parent}>上一级</button>
        <button onClick={() => {
          const name = window.prompt("请输入新目录名");
          if (name) makeDir(name);
        }}>新建目录</button>
        <button onClick={() => fileInputRef.current?.click()}><Upload size={15} />上传</button>
        <button onClick={() => selected && removeItem(selected)} disabled={!selected}>删除</button>
      </div>
      <div className="path-bar">{data.path || "/"}</div>
      <input
        ref={fileInputRef}
        type="file"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) await uploadFile(file);
          event.target.value = "";
        }}
      />
      <div className="file-list">
        {data.items?.map((item) => (
          <button
            type="button"
            key={`${side}-${item.path}`}
            className={`file-row ${selected?.path === item.path ? "selected" : ""}`}
            onClick={() => setSelected(item)}
            onDoubleClick={() => item.type === "dir" && openPath(item.path)}
          >
            <span>{item.type === "dir" ? "📁" : "📄"} {item.name}</span>
            <span>{item.type === "dir" ? "dir" : `${item.size} B`}</span>
          </button>
        ))}
        {!data.items?.length ? <EmptyState title="当前目录为空" detail="可以先上传文件、创建目录，或返回上一级继续浏览。" /> : null}
      </div>
    </Panel>
  );
}

function FilesPage({ agents, initialAgentId = "" }) {
  const defaultLeft = initialAgentId || agents[0]?.id || "";
  const defaultRight = agents.find((item) => item.id !== defaultLeft)?.id || defaultLeft;
  const [leftAgentId, setLeftAgentId] = useState(defaultLeft);
  const [rightAgentId, setRightAgentId] = useState(defaultRight);
  const [leftData, setLeftData] = useState({ path: "/", parent: null, items: [] });
  const [rightData, setRightData] = useState({ path: "/", parent: null, items: [] });
  const [leftSelected, setLeftSelected] = useState(null);
  const [rightSelected, setRightSelected] = useState(null);
  const [message, setMessage] = useState("");

  const loadPane = async (agentId, currentPath, setter) => {
    if (!agentId) return;
    const data = await api(buildAuthUrl(`/api/files/agents/${agentId}/list`, { path: currentPath || "/" }));
    setter(data);
  };

  useEffect(() => {
    if (leftAgentId) loadPane(leftAgentId, leftData.path, setLeftData).catch((error) => setMessage(error.message));
  }, [leftAgentId]);
  useEffect(() => {
    if (rightAgentId) loadPane(rightAgentId, rightData.path, setRightData).catch((error) => setMessage(error.message));
  }, [rightAgentId]);

  const uploadTo = async (agentId, paneData, refreshSetter, file) => {
    const contentBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    await api(`/api/files/agents/${agentId}/upload`, {
      method: "POST",
      body: JSON.stringify({ path: paneData.path, name: file.name, contentBase64 })
    });
    await loadPane(agentId, paneData.path, refreshSetter);
    setMessage(`已上传 ${file.name}`);
  };

  const mkdirIn = async (agentId, paneData, refreshSetter, name) => {
    await api(`/api/files/agents/${agentId}/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path: `${paneData.path === "/" ? "" : paneData.path}/${name}` })
    });
    await loadPane(agentId, paneData.path, refreshSetter);
  };

  const removeFrom = async (agentId, paneData, refreshSetter, item) => {
    if (!window.confirm(`确认删除 ${item.name} 吗？`)) return;
    await api(buildAuthUrl(`/api/files/agents/${agentId}/item`, { path: item.path, type: item.type }), { method: "DELETE" });
    await loadPane(agentId, paneData.path, refreshSetter);
  };

  const transfer = async (sourceAgentId, sourceItem, targetAgentId, targetDir, reloadSource, reloadTarget) => {
    if (!sourceItem || sourceItem.type !== "file") {
      setMessage("当前只支持文件对传，请先选中一个文件。");
      return;
    }
    const targetPath = `${targetDir === "/" ? "" : targetDir}/${sourceItem.name}`;
    await api("/api/files/transfer", {
      method: "POST",
      body: JSON.stringify({ sourceAgentId, sourcePath: sourceItem.path, targetAgentId, targetPath })
    });
    await reloadSource();
    await reloadTarget();
    setMessage(`已传输 ${sourceItem.name}`);
  };

  return (
    <section>
      <div className="grid-files">
        <FilePane
          title="左侧服务器"
          side="left"
          agentId={leftAgentId}
          setAgentId={setLeftAgentId}
          agents={agents}
          data={leftData}
          selected={leftSelected}
          setSelected={setLeftSelected}
          refresh={() => loadPane(leftAgentId, leftData.path, setLeftData).catch((error) => setMessage(error.message))}
          openPath={(nextPath) => loadPane(leftAgentId, nextPath, setLeftData).catch((error) => setMessage(error.message))}
          uploadFile={(file) => uploadTo(leftAgentId, leftData, setLeftData, file).catch((error) => setMessage(error.message))}
          makeDir={(name) => mkdirIn(leftAgentId, leftData, setLeftData, name).catch((error) => setMessage(error.message))}
          removeItem={(item) => removeFrom(leftAgentId, leftData, setLeftData, item).catch((error) => setMessage(error.message))}
        />
        <div className="transfer-actions">
          <button className="primary" onClick={() => transfer(leftAgentId, leftSelected, rightAgentId, rightData.path, () => loadPane(leftAgentId, leftData.path, setLeftData), () => loadPane(rightAgentId, rightData.path, setRightData)).catch((error) => setMessage(error.message))}>传输 →</button>
          <button className="primary" onClick={() => transfer(rightAgentId, rightSelected, leftAgentId, leftData.path, () => loadPane(rightAgentId, rightData.path, setRightData), () => loadPane(leftAgentId, leftData.path, setLeftData)).catch((error) => setMessage(error.message))}>← 传输</button>
          {leftSelected?.type === "file" ? <a className="button-link" href={fileDownloadUrl(`/api/files/agents/${leftAgentId}/download`, { path: leftSelected.path })}><Download size={15} />下载左侧</a> : null}
          {rightSelected?.type === "file" ? <a className="button-link" href={fileDownloadUrl(`/api/files/agents/${rightAgentId}/download`, { path: rightSelected.path })}><Download size={15} />下载右侧</a> : null}
        </div>
        <FilePane
          title="右侧服务器"
          side="right"
          agentId={rightAgentId}
          setAgentId={setRightAgentId}
          agents={agents}
          data={rightData}
          selected={rightSelected}
          setSelected={setRightSelected}
          refresh={() => loadPane(rightAgentId, rightData.path, setRightData).catch((error) => setMessage(error.message))}
          openPath={(nextPath) => loadPane(rightAgentId, nextPath, setRightData).catch((error) => setMessage(error.message))}
          uploadFile={(file) => uploadTo(rightAgentId, rightData, setRightData, file).catch((error) => setMessage(error.message))}
          makeDir={(name) => mkdirIn(rightAgentId, rightData, setRightData, name).catch((error) => setMessage(error.message))}
          removeItem={(item) => removeFrom(rightAgentId, rightData, setRightData, item).catch((error) => setMessage(error.message))}
        />
      </div>
      {message ? <pre>{message}</pre> : null}
    </section>
  );
}

function CredentialsPage({ liveTick }) {
  const empty = { id: "", name: "", type: "ssh", host: "", port: 22, username: "root", password: "", privateKey: "", domain: "", note: "" };
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");

  const load = () => api("/api/credentials").then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      if (form.id) {
        await api(`/api/credentials/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
        setMessage("凭据已更新。");
      } else {
        await api("/api/credentials", { method: "POST", body: JSON.stringify(form) });
        setMessage("凭据已创建。");
      }
      setForm({ ...empty, port: form.type === "rdp" ? 3389 : 22, username: form.type === "rdp" ? "Administrator" : "root", type: form.type });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const remove = async (id) => {
    try {
      await api(`/api/credentials/${id}`, { method: "DELETE" });
      setMessage("凭据已删除。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="凭据编辑">
          <div className="form-grid">
            <Field label="名称" value={form.name} onChange={(value) => patch("name", value)} />
            <Field label="类型" type="select" value={form.type} onChange={(value) => patch("type", value)} options={[["ssh", "SSH"], ["rdp", "RDP"]]} />
            <Field label="主机" value={form.host} onChange={(value) => patch("host", value)} />
            <Field label="端口" type="number" value={form.port} onChange={(value) => patch("port", value)} />
            <Field label="用户名" value={form.username} onChange={(value) => patch("username", value)} />
            {form.type === "rdp" ? <Field label="域" value={form.domain} onChange={(value) => patch("domain", value)} /> : null}
            <Field label="密码" type="password" value={form.password} onChange={(value) => patch("password", value)} />
            {form.type === "ssh" ? <Field label="私钥" type="textarea" rows={5} value={form.privateKey} onChange={(value) => patch("privateKey", value)} /> : null}
            <Field label="备注" type="textarea" rows={4} value={form.note} onChange={(value) => patch("note", value)} />
          </div>
          <div className="actions">
            <button className="primary" onClick={submit}>保存</button>
            <button onClick={() => setForm(empty)}>清空</button>
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>
        <Panel title="凭据列表">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>主机</th>
                <th>用户</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.type}</td>
                  <td>{row.host || "-"}</td>
                  <td>{row.username || "-"}</td>
                  <td>{row.updatedAt || "-"}</td>
                  <td className="actions-cell">
                    <button className="link" onClick={() => setForm({ ...row, password: "", privateKey: "" })}>编辑</button>
                    <button className="link" onClick={() => remove(row.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

function CommandsPage({ agents, liveTick }) {
  const empty = { id: "", label: "", type: "shell", command: "uname -a", action: "status", lines: 200 };
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [message, setMessage] = useState("");

  const load = () => api("/api/commands").then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);
  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      if (form.id) await api(`/api/commands/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
      else await api("/api/commands", { method: "POST", body: JSON.stringify(form) });
      setForm(empty);
      setMessage("命令库已保存。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const run = async (commandId) => {
    try {
      const response = await api(`/api/agents/${agentId}/commands/${commandId}`, { method: "POST" });
      setMessage(JSON.stringify(response, null, 2));
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="命令编辑">
          <div className="form-grid">
            <Field label="名称" value={form.label} onChange={(value) => patch("label", value)} />
            <Field label="类型" type="select" value={form.type} onChange={(value) => patch("type", value)} options={[["shell", "Shell"], ["service", "Service"], ["logs", "Logs"], ["config", "Config"]]} />
            {form.type === "shell" ? <Field label="命令内容" type="textarea" rows={6} value={form.command} onChange={(value) => patch("command", value)} /> : null}
            {form.type === "service" ? <Field label="动作" type="select" value={form.action} onChange={(value) => patch("action", value)} options={[["status", "status"], ["start", "start"], ["stop", "stop"], ["restart", "restart"]]} /> : null}
            {form.type === "logs" ? <Field label="日志行数" type="number" value={form.lines} onChange={(value) => patch("lines", value)} /> : null}
          </div>
          <div className="actions">
            <button className="primary" onClick={save}>保存命令</button>
            <button onClick={() => setForm(empty)}>清空</button>
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>
        <Panel title="命令列表" right={<select value={agentId} onChange={(event) => setAgentId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>}>
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>类型</th>
                <th>内置</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.type}</td>
                  <td>{row.builtin ? "是" : "否"}</td>
                  <td className="actions-cell">
                    <button className="link" onClick={() => run(row.id)}>执行</button>
                    {!row.builtin ? <button className="link" onClick={() => setForm(row)}>编辑</button> : null}
                    {!row.builtin ? <button className="link" onClick={async () => {
                      await api(`/api/commands/${row.id}`, { method: "DELETE" });
                      load().catch(() => {});
                    }}>删除</button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

function NodeWizard({ agents }) {
  const [form, setForm] = useState(() => ({ agentId: "", ...protocolDefinitions["vmess-ws"].defaults() }));
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const definition = protocolDefinitions[form.protocol];

  useEffect(() => {
    if (!form.agentId && agents[0]) setForm((current) => ({ ...current, agentId: agents[0].id }));
  }, [agents, form.agentId]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const switchProtocol = (nextProtocol) =>
    setForm((current) => ({
      agentId: current.agentId,
      nodeName: current.nodeName || "",
      publicHost: current.publicHost || "",
      ...protocolDefinitions[nextProtocol].defaults()
    }));

  return (
    <section>
      <div className="grid2">
        <Panel title="节点配置" right={<button onClick={async () => {
          try {
            const response = await api("/api/config/render", { method: "POST", body: JSON.stringify(form) });
            setPreview(JSON.stringify(response.config, null, 2));
          } catch (error) {
            setPreview(error.message);
          }
        }}>预览 JSON</button>}>
          <div className="form-grid">
            <Field label="服务器" type="select" value={form.agentId} onChange={(value) => patch("agentId", value)} options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])} />
            <Field label="节点名称" value={form.nodeName || ""} onChange={(value) => patch("nodeName", value)} placeholder="留空使用服务器名" />
            <Field label="订阅外部地址" value={form.publicHost || ""} onChange={(value) => patch("publicHost", value)} placeholder="域名或公网 IP，留空用服务器地址" />
            <Field label="协议" type="select" value={form.protocol} onChange={switchProtocol} options={Object.entries(protocolDefinitions).map(([key, value]) => [key, value.name])} />
            {definition.fields.map((field) => (
              <Field key={field.key} label={field.label} type={field.type || "text"} value={form[field.key] ?? ""} onChange={(value) => patch(field.key, value)} random={field.random ? () => patch(field.key, field.random()) : null} placeholder={field.placeholder || ""} options={field.options || []} rows={field.rows || 4} />
            ))}
          </div>
          <div className="panel-tip">{definition.note}</div>
          <div className="actions">
            <button className="primary" onClick={async () => {
              try {
                const response = await api(`/api/agents/${form.agentId}/config/wizard`, { method: "POST", body: JSON.stringify(form) });
                setResult(JSON.stringify(response, null, 2));
              } catch (error) {
                setResult(error.message);
              }
            }}>下发并重启</button>
          </div>
          <pre>{result || "这里显示下发结果。"}</pre>
        </Panel>
        <Panel title="配置预览"><pre className="preview">{preview || "点击预览 JSON 查看结果。"}</pre></Panel>
      </div>
    </section>
  );
}

function SubscriptionPage({ liveTick }) {
  const [nodes, setNodes] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [sources, setSources] = useState([]);
  const [groups, setGroups] = useState([]);
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [accessLog, setAccessLog] = useState([]);
  const [summary, setSummary] = useState({});
  const [preview, setPreview] = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", text: "", tags: "", intervalHours: 24, replaceExisting: true });
  const [groupForm, setGroupForm] = useState({ name: "", protocols: "", tags: "", sources: "", keyword: "", sort: "name" });
  const [shareForm, setShareForm] = useState({ name: "默认订阅", format: "v2rayn", protocols: "", tags: "", sources: "", groupIds: "", keyword: "", limit: "", sort: "name", routeTemplate: "mainland", prependRules: "", customRules: "", expiresAt: "", maxAccess: "" });
  const [message, setMessage] = useState("");

  const load = () =>
    api("/api/node-pool").then((data) => {
      setNodes(data.nodes || []);
      setSubscriptions(data.subscriptions || []);
      setSources(data.sources || []);
      setGroups(data.groups || []);
      setRouteTemplates(data.routeTemplates || []);
      setAccessLog(data.accessLog || []);
      setSummary(data.summary || {});
    });

  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);

  const importNodes = async () => {
    try {
      setMessage("");
      const response = await api("/api/node-pool/import", {
        method: "POST",
        body: JSON.stringify({ text: importText, url: importUrl, sourceName })
      });
      setImportText("");
      setMessage(`已导入 ${response.imported} 个节点。`);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const updateNode = async (node, patch) => {
    await api(`/api/node-pool/${node.id}`, { method: "PUT", body: JSON.stringify(patch) });
    await load();
  };

  const deleteNode = async (node) => {
    if (!window.confirm(`删除节点 ${node.name} 吗？`)) return;
    await api(`/api/node-pool/${node.id}`, { method: "DELETE" });
    await load();
  };

  const createSource = async () => {
    try {
      setMessage("");
      const response = await api("/api/subscription-sources", { method: "POST", body: JSON.stringify({ ...sourceForm, tags: sourceForm.tags, syncNow: true }) });
      setMessage(`订阅源已保存，导入 ${response.imported} 个节点，移除 ${response.removed || 0} 个旧节点。`);
      setSourceForm({ name: "", url: "", text: "", tags: "", intervalHours: 24, replaceExisting: true });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createGroup = async () => {
    try {
      setMessage("");
      await api("/api/subscription-groups", { method: "POST", body: JSON.stringify(groupForm) });
      setGroupForm({ name: "", protocols: "", tags: "", sources: "", keyword: "", sort: "name" });
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createShare = async () => {
    try {
      setMessage("");
      await api("/api/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          name: shareForm.name,
          format: shareForm.format,
          expiresAt: shareForm.expiresAt,
          maxAccess: shareForm.maxAccess,
          profile: { protocols: shareForm.protocols, tags: shareForm.tags, sources: shareForm.sources, groupIds: shareForm.groupIds, keyword: shareForm.keyword, limit: shareForm.limit, sort: shareForm.sort, routeTemplate: shareForm.routeTemplate, prependRules: shareForm.prependRules, customRules: shareForm.customRules }
        })
      });
      setMessage("分享链接已创建。");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const previewSubscription = async (subscription, format = subscription.format || "raw") => {
    const data = await api(`/api/subscriptions/${subscription.id}/preview?format=${encodeURIComponent(format)}`);
    setPreview(data);
  };

  const diagnoseSubscription = async (subscription) => {
    const data = await api(`/api/subscriptions/${subscription.id}/diagnostics`);
    setDiagnostics({ subscription, data });
  };

  const updateSubscription = async (subscription, patch) => {
    await api(`/api/subscriptions/${subscription.id}`, { method: "PUT", body: JSON.stringify(patch) });
    await load();
  };

  const deleteSubscription = async (subscription) => {
    if (!window.confirm(`删除分享链接 ${subscription.name} 吗？`)) return;
    await api(`/api/subscriptions/${subscription.id}`, { method: "DELETE" });
    setPreview((current) => current?.subscription?.id === subscription.id ? null : current);
    await load();
  };

  const fillShareForm = (subscription) => {
    const profile = subscription.profile || {};
    setShareForm({
      name: `${subscription.name} copy`,
      format: subscription.format || "base64",
      protocols: (profile.protocols || []).join(","),
      tags: (profile.tags || []).join(","),
      sources: (profile.sources || []).join(","),
      groupIds: (profile.groupIds || []).join(","),
      keyword: profile.keyword || "",
      limit: profile.limit || "",
      sort: profile.sort || "name",
      routeTemplate: profile.routeTemplate || "mainland",
      prependRules: (profile.prependRules || []).join("\n"),
      customRules: (profile.customRules || []).join("\n"),
      expiresAt: subscription.expiresAt || "",
      maxAccess: subscription.maxAccess || ""
    });
  };

  const deleteGroup = async (group) => {
    if (!window.confirm(`删除分组 ${group.name} 吗？`)) return;
    await api(`/api/subscription-groups/${group.id}`, { method: "DELETE" });
    await load();
  };

  const protocolSummary = Object.entries(summary.protocols || {}).map(([key, value]) => `${key}:${value}`).join("  ");

  return (
    <section>
      <div className="stats">
        <Card icon={Code2} label="节点池" value={nodes.length} hint={`${nodes.filter((node) => node.enabled).length} 个启用`} />
        <Card icon={Upload} label="订阅源" value={sources.length} />
        <Card icon={FolderClosed} label="分组" value={groups.length} />
        <Card icon={Link2} label="分享链接" value={subscriptions.length} hint={protocolSummary || "等待导入节点"} />
      </div>

      <div className="grid2">
        <Panel title="分享链接">
          <div className="subscription-links">
            {subscriptions.map((subscription) => (
              <div className="subscription-card" key={subscription.id}>
                <div>
                  <h3>{subscription.name}</h3>
                  <p>{subscription.format || "base64"} · {subscription.nodeCount || 0} 个节点 · 访问 {subscription.accessCount || 0} 次 · {subscription.lastAccessAt || "尚未访问"}</p>
                </div>
                {Object.entries(subscription.links || {}).map(([format, link]) => (
                  <div className="copy-row" key={format}>
                    <span>{format}</span>
                    <code>{link}</code>
                    <button onClick={async () => { await copyText(link); setMessage(`${format} 链接已复制。`); }}>复制</button>
                  </div>
                ))}
                <div className="subscription-tools">
                  <button onClick={() => previewSubscription(subscription, subscription.format)}>预览</button>
                  <button onClick={() => diagnoseSubscription(subscription)}>自检</button>
                  <button onClick={() => fillShareForm(subscription)}>复制配置</button>
                  <button onClick={() => updateSubscription(subscription, { enabled: !subscription.enabled })}>{subscription.enabled ? "停用" : "启用"}</button>
                  <button className="link danger" onClick={() => deleteSubscription(subscription)}>删除</button>
                </div>
              </div>
            ))}
          </div>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
        <Panel title="新建分享">
          <div className="form-grid single">
            <Field label="名称" value={shareForm.name} onChange={(value) => setShareForm((current) => ({ ...current, name: value }))} />
            <Field label="默认格式" type="select" value={shareForm.format} onChange={(value) => setShareForm((current) => ({ ...current, format: value }))} options={[["v2rayn", "v2rayN/Base64"], ["raw", "Raw"], ["clash", "Clash"], ["mihomo", "Mihomo"], ["sing-box", "sing-box"]]} />
            <Field label="协议过滤" value={shareForm.protocols} onChange={(value) => setShareForm((current) => ({ ...current, protocols: value }))} placeholder="ss,vmess,trojan,vless" />
            <Field label="标签过滤" value={shareForm.tags} onChange={(value) => setShareForm((current) => ({ ...current, tags: value }))} />
            <Field label="来源过滤" value={shareForm.sources} onChange={(value) => setShareForm((current) => ({ ...current, sources: value }))} placeholder="订阅源名称，逗号分隔" />
            <Field label="分组过滤" value={shareForm.groupIds} onChange={(value) => setShareForm((current) => ({ ...current, groupIds: value }))} placeholder={groups.map((group) => group.id).join(", ")} />
            <Field label="关键词" value={shareForm.keyword} onChange={(value) => setShareForm((current) => ({ ...current, keyword: value }))} placeholder="节点名/来源/标签关键词" />
            <Field label="节点上限" type="number" value={shareForm.limit} onChange={(value) => setShareForm((current) => ({ ...current, limit: value }))} placeholder="0 表示不限" />
            <Field label="排序" type="select" value={shareForm.sort} onChange={(value) => setShareForm((current) => ({ ...current, sort: value }))} options={[["name", "名称"], ["protocol", "协议"], ["source", "来源"], ["updated", "最近更新"]]} />
            <Field label="分流模板" type="select" value={shareForm.routeTemplate} onChange={(value) => setShareForm((current) => ({ ...current, routeTemplate: value }))} options={(routeTemplates.length ? routeTemplates : [{ id: "mainland", name: "Mainland Smart" }]).map((item) => [item.id, item.name])} />
            <Field label="前置规则" type="textarea" rows={3} value={shareForm.prependRules} onChange={(value) => setShareForm((current) => ({ ...current, prependRules: value }))} placeholder="每行一条 Clash/Mihomo rule，会放在模板规则前" />
            <Field label="追加规则" type="textarea" rows={3} value={shareForm.customRules} onChange={(value) => setShareForm((current) => ({ ...current, customRules: value }))} placeholder="例如 DOMAIN-SUFFIX,example.com,Auto" />
            <Field label="过期时间" value={shareForm.expiresAt} onChange={(value) => setShareForm((current) => ({ ...current, expiresAt: value }))} placeholder="2026-12-31T23:59:59.000Z" />
            <Field label="访问上限" type="number" value={shareForm.maxAccess} onChange={(value) => setShareForm((current) => ({ ...current, maxAccess: value }))} placeholder="0 表示不限" />
          </div>
          <div className="actions"><button className="primary" onClick={createShare}>创建分享链接</button></div>
        </Panel>
      </div>

      {preview ? (
        <Panel title={`输出预览：${preview.subscription?.name || ""}`} right={<button onClick={() => setPreview(null)}>关闭</button>}>
          <div className="subscription-preview-meta">
            <span>{preview.format}</span>
            <span>{preview.summary?.enabled || 0} 个节点</span>
            <span>{preview.contentType}</span>
            {preview.truncated ? <span>内容已截断</span> : null}
          </div>
          <pre className="preview subscription-preview">{preview.body || "当前筛选没有节点。"}</pre>
        </Panel>
      ) : null}

      {diagnostics ? (
        <Panel title={`订阅自检：${diagnostics.subscription?.name || ""}`} right={<button onClick={() => setDiagnostics(null)}>关闭</button>}>
          <div className="diagnostic-grid">
            {Object.entries(diagnostics.data?.formats || {}).map(([format, row]) => (
              <div className={`diagnostic-card ${row.ok ? "ok" : "bad"}`} key={format}>
                <b>{format}</b>
                <span>{row.ok ? "通过" : "失败"} · {formatBytes(row.bytes || 0)}</span>
                {(row.checks || []).map((check) => <small key={check.name}>{check.ok ? "OK" : "FAIL"} {check.name}</small>)}
                {row.error ? <small>{row.error}</small> : null}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      <div className="grid2">
        <Panel title="订阅源导入">
          <div className="form-grid single">
            <Field label="来源名称" value={sourceForm.name} onChange={(value) => setSourceForm((current) => ({ ...current, name: value }))} />
            <Field label="订阅 URL" value={sourceForm.url} onChange={(value) => setSourceForm((current) => ({ ...current, url: value }))} />
            <Field label="标签" value={sourceForm.tags} onChange={(value) => setSourceForm((current) => ({ ...current, tags: value }))} placeholder="逗号分隔" />
            <Field label="更新间隔小时" type="number" value={sourceForm.intervalHours} onChange={(value) => setSourceForm((current) => ({ ...current, intervalHours: value }))} />
            <Field label="订阅内容" type="textarea" rows={6} value={sourceForm.text} onChange={(value) => setSourceForm((current) => ({ ...current, text: value }))} placeholder="也可以直接粘贴节点或 base64 订阅" />
            <label className="check-row"><input type="checkbox" checked={sourceForm.replaceExisting} onChange={(event) => setSourceForm((current) => ({ ...current, replaceExisting: event.target.checked }))} />同步时替换这个来源的旧节点</label>
          </div>
          <div className="actions"><button className="primary" onClick={createSource}>保存并同步</button></div>
        </Panel>
        <Panel title="手动导入">
          <div className="form-grid single">
            <Field label="来源名称" value={sourceName} onChange={setSourceName} placeholder="例如机场 A / 手动导入" />
            <Field label="订阅 URL" value={importUrl} onChange={setImportUrl} placeholder="支持 base64 订阅或纯文本节点链接" />
            <Field label="节点内容" type="textarea" rows={8} value={importText} onChange={setImportText} placeholder="粘贴 vmess://、vless://、trojan://、ss://、hysteria2://，也可以粘贴整段 base64 订阅" />
          </div>
          <div className="actions">
            <button className="primary" onClick={importNodes}>
              <Upload size={16} />
              导入到节点池
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="分组编排">
          <div className="form-grid single">
            <Field label="分组名称" value={groupForm.name} onChange={(value) => setGroupForm((current) => ({ ...current, name: value }))} />
            <Field label="协议" value={groupForm.protocols} onChange={(value) => setGroupForm((current) => ({ ...current, protocols: value }))} placeholder="ss,vmess,trojan" />
            <Field label="标签" value={groupForm.tags} onChange={(value) => setGroupForm((current) => ({ ...current, tags: value }))} />
            <Field label="来源" value={groupForm.sources} onChange={(value) => setGroupForm((current) => ({ ...current, sources: value }))} />
            <Field label="关键词" value={groupForm.keyword} onChange={(value) => setGroupForm((current) => ({ ...current, keyword: value }))} />
            <Field label="排序" type="select" value={groupForm.sort} onChange={(value) => setGroupForm((current) => ({ ...current, sort: value }))} options={[["name", "名称"], ["protocol", "协议"], ["source", "来源"]]} />
          </div>
          <div className="actions"><button className="primary" onClick={createGroup}>创建分组</button></div>
          <div className="tag-list">
            {groups.map((group) => (
              <span key={group.id}>
                {group.name}
                <code>{group.id}</code>
                <button className="link" onClick={() => deleteGroup(group)}>删除</button>
              </span>
            ))}
          </div>
        </Panel>
        <Panel title="订阅源列表">
          <table>
            <thead><tr><th>名称</th><th>标签</th><th>最近同步</th><th>数量</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{source.name}<div className="muted">{source.url || "手动内容"}</div></td>
                  <td>{(source.tags || []).join(", ") || "-"}</td>
                  <td>{source.lastSyncAt || "-"}</td>
                  <td>{source.lastImportCount || 0} / -{source.lastRemoveCount || 0}</td>
                  <td>{source.lastError || "正常"}</td>
                  <td className="actions-cell">
                    <button className="link" onClick={async () => { await api(`/api/subscription-sources/${source.id}/sync`, { method: "POST" }); await load(); }}>同步</button>
                    <button className="link" onClick={async () => { await api(`/api/subscription-sources/${source.id}`, { method: "DELETE" }); await load(); }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="统一节点池" right={<button onClick={load}><RefreshCw size={15} />刷新</button>}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>名称</th>
                <th>来源</th>
                <th>协议</th>
                <th>服务器</th>
                <th>标签</th>
                <th>分组</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td>
                    <input className="table-input" value={node.name} onChange={(event) => setNodes((current) => current.map((item) => item.id === node.id ? { ...item, name: event.target.value } : item))} onBlur={(event) => updateNode(node, { name: event.target.value }).catch(() => {})} />
                  </td>
                  <td>{node.source === "panel" ? "面板" : node.sourceName || "导入"}</td>
                  <td>{node.protocol}</td>
                  <td>{node.server ? `${node.server}:${node.port || ""}` : "-"}</td>
                  <td><input className="table-input" value={(node.tags || []).join(",")} onChange={(event) => setNodes((current) => current.map((item) => item.id === node.id ? { ...item, tags: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) } : item))} onBlur={(event) => updateNode(node, { tags: event.target.value }).catch(() => {})} /></td>
                  <td><input className="table-input" value={(node.groupIds || []).join(",")} onChange={(event) => setNodes((current) => current.map((item) => item.id === node.id ? { ...item, groupIds: event.target.value.split(",").map((part) => part.trim()).filter(Boolean) } : item))} onBlur={(event) => updateNode(node, { groupIds: event.target.value }).catch(() => {})} placeholder={groups.map((group) => group.id).join(",")} /></td>
                  <td><span className={`status-pill ${node.enabled ? "online" : ""}`}><StatusDot on={node.enabled} />{node.enabled ? "启用" : "停用"}</span></td>
                  <td>{node.updatedAt || "-"}</td>
                  <td className="actions-cell">
                    <button className="link" onClick={() => updateNode(node, { enabled: !node.enabled })}>{node.enabled ? "停用" : "启用"}</button>
                    <button className="link" onClick={async () => { await copyText(node.raw); setMessage("节点链接已复制。"); }}>复制</button>
                    <button className="link" onClick={() => deleteNode(node)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!nodes.length ? <div className="empty">还没有节点。用节点配置下发一次，或从订阅链接导入。</div> : null}
      </Panel>

      <Panel title="访问统计">
        <table>
          <thead><tr><th>订阅</th><th>格式</th><th>节点数</th><th>时间</th><th>User-Agent</th></tr></thead>
          <tbody>
            {accessLog.map((row) => (
              <tr key={row.id}>
                <td>{row.tokenName}</td>
                <td>{row.format}</td>
                <td>{row.nodeCount}</td>
                <td>{row.at}</td>
                <td>{row.userAgent || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function ProtocolLabPage({ agents, liveTick }) {
  const [selected, setSelected] = useState("");
  const [reports, setReports] = useState([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!selected && agents[0]) setSelected(agents[0].id);
  }, [agents, selected, liveTick]);

  const runSmoke = async (agentId = selected) => {
    if (!agentId) return;
    setRunning(true);
    try {
      const report = await api(`/api/agents/${agentId}/protocol-smoke`, { method: "POST", body: JSON.stringify({}) });
      setReports((current) => [report, ...current].slice(0, 8));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section>
      <div className="stats">
        <Card icon={Shield} label="测试对象" value={agents.length} hint="在线 agent 可执行真实下发" />
        <Card icon={Code2} label="协议覆盖" value="6" hint="VMess / VLESS / Trojan / HY2 / SS / Mixed" />
        <Card icon={Link2} label="订阅自检" value="5" hint="v2rayN / raw / Clash / Mihomo / sing-box" />
        <Card icon={RotateCcw} label="恢复机制" value="ON" hint="测试后恢复原配置" />
      </div>
      <Panel title="协议实验室" right={<button className="primary" disabled={running || !selected} onClick={() => runSmoke()}><PlugZap size={16} />{running ? "测试中" : "开始测试"}</button>}>
        <div className="form-grid">
          <Field label="选择服务器" type="select" value={selected} onChange={setSelected} options={agents.map((agent) => [agent.id, `${agent.name} · ${agent.connected ? "在线" : "离线"}`])} />
        </div>
        <p className="panel-tip">测试会依次下发协议配置、检查 sing-box 状态，然后恢复原配置。VLESS Reality 会尝试在目标机生成 keypair。</p>
      </Panel>
      <Panel title="测试报告">
        <div className="diagnostic-grid">
          {reports.flatMap((report) => (report.rows || []).map((row) => (
            <div className={`diagnostic-card ${row.ok ? "ok" : "bad"}`} key={`${report.at}-${report.agentId}-${row.protocol}`}>
              <b>{report.agentName} · {row.protocol}</b>
              <span>{row.ok ? "通过" : "失败"}{row.port ? ` · :${row.port}` : ""}</span>
              <small>{row.status || row.output || "-"}</small>
            </div>
          )))}
          {!reports.length ? <div className="empty">还没有测试报告。</div> : null}
        </div>
      </Panel>
    </section>
  );
}

function MemoText({ content = "" }) {
  const lines = String(content || "").split(/\r?\n/);
  return (
    <div className="memo-text">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={index} />;
        if (/^#{1,3}\s+/.test(trimmed)) return <h3 key={index}>{trimmed.replace(/^#{1,3}\s+/, "")}</h3>;
        if (/^[-*]\s+/.test(trimmed)) return <p key={index} className="memo-bullet">{trimmed.replace(/^[-*]\s+/, "")}</p>;
        return (
          <p key={index}>
            {line.split(/(#[\p{L}\p{N}_-]{1,48}|https?:\/\/[^\s]+)/gu).map((part, partIndex) => {
              if (/^https?:\/\//.test(part)) return <a key={partIndex} href={part} target="_blank" rel="noreferrer">{part}</a>;
              if (/^#/.test(part)) return <span className="memo-tag-inline" key={partIndex}>{part}</span>;
              return <React.Fragment key={partIndex}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

function MemoAttachment({ file }) {
  const url = fileDownloadUrl(`/api/memos/files/${file.id}/download`);
  const type = String(file.type || "");
  if (type.startsWith("image/")) return <a className="memo-attachment image" href={url} target="_blank" rel="noreferrer"><img src={url} alt={file.name} /><span>{file.name}</span></a>;
  if (type.startsWith("audio/")) return <div className="memo-attachment"><span>{file.name}</span><audio controls src={url} /></div>;
  if (type.startsWith("video/")) return <div className="memo-attachment"><video controls src={url} /><span>{file.name}</span></div>;
  if (type === "application/pdf") return <a className="memo-attachment" href={url} target="_blank" rel="noreferrer"><BookOpen size={16} />{file.name}</a>;
  return <a className="memo-attachment" href={url} target="_blank" rel="noreferrer"><Download size={16} />{file.name}<small>{formatBytes(file.size)}</small></a>;
}

function MemosPage({ liveTick }) {
  const [memos, setMemos] = useState([]);
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({});
  const [draft, setDraft] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [attached, setAttached] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [archived, setArchived] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef(null);

  const load = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tag) params.set("tag", tag);
    if (archived) params.set("archived", "1");
    return api(`/api/memos${params.toString() ? `?${params}` : ""}`).then((data) => {
      setMemos(data.memos || []);
      setFiles(data.files || []);
      setStats(data.stats || {});
    });
  };

  useEffect(() => {
    load().catch(() => {});
  }, [liveTick, query, tag, archived]);

  const uploadFiles = async (selected) => {
    const uploaded = [];
    for (const file of Array.from(selected || [])) {
      const result = await api(`/api/memos/files?name=${encodeURIComponent(file.name)}&type=${encodeURIComponent(file.type || "application/octet-stream")}`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: await file.arrayBuffer()
      });
      uploaded.push(result);
    }
    setAttached((current) => [...current, ...uploaded]);
    setMessage(`已上传 ${uploaded.length} 个文件。`);
    await load();
  };

  const createMemo = async () => {
    try {
      setMessage("");
      const memo = await api("/api/memos", {
        method: "POST",
        body: JSON.stringify({ content: draft, visibility, fileIds: attached.map((file) => file.id) })
      });
      setDraft("");
      setAttached([]);
      setVisibility("private");
      setMessage(`已保存笔记：${memo.tags.length ? memo.tags.map((item) => `#${item}`).join(" ") : "无标签"}`);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };

  const patchMemo = async (memo, patch) => {
    await api(`/api/memos/${memo.id}`, { method: "PUT", body: JSON.stringify(patch) });
    await load();
  };

  const deleteMemo = async (memo) => {
    if (!window.confirm(`删除这条笔记吗？`)) return;
    await api(`/api/memos/${memo.id}`, { method: "DELETE" });
    await load();
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`删除附件 ${file.name} 吗？`)) return;
    await api(`/api/memos/files/${file.id}?force=1`, { method: "DELETE" });
    setAttached((current) => current.filter((item) => item.id !== file.id));
    await load();
  };

  const tags = Object.entries(stats.tags || {}).sort((a, b) => b[1] - a[1]);

  return (
    <section>
      <div className="stats">
        <Card icon={BookOpen} label="笔记" value={stats.active || 0} hint={`${stats.total || 0} 条总记录`} />
        <Card icon={Upload} label="附件" value={stats.files || 0} hint={formatBytes(stats.bytes || 0)} />
        <Card icon={Shield} label="私有优先" value="Memos" hint="登录后台可见" />
        <Card icon={Search} label="标签" value={tags.length} hint={tags.slice(0, 3).map(([name]) => `#${name}`).join(" ") || "输入 #tag 自动生成"} />
      </div>

      <div className="memo-shell">
        <Panel title="快速记录" right={<button onClick={() => fileInput.current?.click()}><Upload size={16} />上传附件</button>}>
          <div className="memo-composer">
            <textarea rows={8} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="写点什么，支持 #标签、链接、列表和标题。附件可以一起保存。" />
            <input ref={fileInput} type="file" multiple onChange={(event) => uploadFiles(event.target.files).catch((error) => setMessage(error.message))} hidden />
            {attached.length ? (
              <div className="memo-attachments">
                {attached.map((file) => (
                  <span key={file.id}>{file.name}<button className="link" onClick={() => setAttached((current) => current.filter((item) => item.id !== file.id))}>移除</button></span>
                ))}
              </div>
            ) : null}
            <div className="actions">
              <Field label="可见性" type="select" value={visibility} onChange={setVisibility} options={[["private", "私有"], ["workspace", "工作区"], ["public", "公开"]]} />
              <button className="primary" onClick={createMemo}><Save size={16} />保存笔记</button>
              {message ? <span className="panel-message inline">{message}</span> : null}
            </div>
          </div>
        </Panel>

        <div className="memo-side">
          <Panel title="筛选">
            <div className="memo-filter">
              <Field label="搜索" value={query} onChange={setQuery} placeholder="内容 / 标签" />
              <label className="check-row"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />包含归档</label>
              <div className="tag-list">
                <button className={!tag ? "primary" : ""} onClick={() => setTag("")}>全部</button>
                {tags.map(([name, count]) => (
                  <button key={name} onClick={() => setTag(name)} className={tag === name ? "primary" : ""}>#{name}<small>{count}</small></button>
                ))}
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="memo-layout">
        <div className="memo-list">
          {memos.map((memo) => (
            <article className={`memo-card ${memo.pinned ? "pinned" : ""}`} key={memo.id}>
              <div className="memo-card-head">
                <span>{memo.visibility}</span>
                <time>{formatTimeAgo(memo.updatedAt || memo.createdAt)}</time>
              </div>
              <MemoText content={memo.content} />
              {memo.files?.length ? <div className="memo-attachments grid">{memo.files.map((file) => <MemoAttachment key={file.id} file={file} />)}</div> : null}
              <div className="memo-card-foot">
                <div>{(memo.tags || []).map((item) => <button key={item} className="memo-tag" onClick={() => setTag(item)}>#{item}</button>)}</div>
                <div className="actions-cell">
                  <button className="link" onClick={() => patchMemo(memo, { pinned: !memo.pinned })}>{memo.pinned ? "取消置顶" : "置顶"}</button>
                  <button className="link" onClick={() => patchMemo(memo, { archived: !memo.archived })}>{memo.archived ? "恢复" : "归档"}</button>
                  <button className="link danger" onClick={() => deleteMemo(memo)}>删除</button>
                </div>
              </div>
            </article>
          ))}
          {!memos.length ? <div className="empty">还没有笔记。写下第一条，或者先上传附件。</div> : null}
        </div>

        <Panel title="附件库">
          <div className="memo-file-list">
            {files.map((file) => (
              <div key={file.id} className="memo-file-row">
                <MemoAttachment file={file} />
                <button className="link danger" onClick={() => deleteFile(file)}><Trash2 size={15} />删除</button>
              </div>
            ))}
            {!files.length ? <EmptyState title="暂无附件" detail="上传图片、音频、PDF 或其他文件后，这里会自动汇总。" /> : null}
          </div>
        </Panel>
      </div>
    </section>
  );
}

function ProbeManagePage({ liveTick, agents }) {
  const empty = { displayName: "", region: "", group: "默认", flag: "", osLabel: "", price: "", billing: "", expireText: "", trafficLimitGb: "", displayOrder: 0, note: "", tags: "", hidden: false };
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(empty);
  const [message, setMessage] = useState("");
  const [module, setModule] = useState("profiles");
  const [bulk, setBulk] = useState({ region: "", group: "", hidden: "", sortStart: 10, sortStep: 10 });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");

  const load = async () => {
    const data = await api("/api/probe-settings");
    setRows(data);
    const next = data.find((row) => row.agent.id === selectedId) || data[0];
    if (next) {
      setSelectedId(next.agent.id);
      setForm({
        ...empty,
        ...next.profile,
        tags: (next.profile.tags || []).join(", "),
        trafficLimitGb: next.profile.trafficLimitGb || "",
        displayName: next.profile.displayName || next.agent.name
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);

  const selectRow = (row) => {
    setSelectedId(row.agent.id);
    setDirty(false);
    setMessage("");
    setForm({
      ...empty,
      ...row.profile,
      tags: (row.profile.tags || []).join(", "),
      trafficLimitGb: row.profile.trafficLimitGb || "",
      displayName: row.profile.displayName || row.agent.name
    });
  };

  const patch = (key, value) => {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!selectedId) return;
    try {
      setSaving(true);
      setMessage("");
      await api(`/api/probe-settings/${selectedId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...form,
          tags: String(form.tags || "").split(",").map((item) => item.trim()).filter(Boolean),
          trafficLimitGb: form.trafficLimitGb === "" ? null : Number(form.trafficLimitGb),
          displayOrder: Number(form.displayOrder || 0),
          hidden: Boolean(form.hidden)
        })
      });
      setDirty(false);
      setLastSavedAt(formatClock(new Date()));
      setMessage("探针展示信息已保存，公开页会实时刷新。");
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  const selected = rows.find((row) => row.agent.id === selectedId);
  const selectedAgent = selected?.agent || {};
  const selectedProfile = selected?.profile || {};
  const selectedProbe = selectedAgent.probe || {};
  const selectedSystem = selectedProbe.system || {};
  const selectedNetwork = selectedProbe.network || {};
  const quickRegions = [
    ["香港", "HK", "亚洲"],
    ["日本", "JP", "亚洲"],
    ["新加坡", "SG", "亚洲"],
    ["美国", "US", "美洲"],
    ["德国", "DE", "欧洲"],
    ["英国", "GB", "欧洲"]
  ];
  const applyQuickRegion = ([region, flag, groupName]) => {
    setForm((current) => ({
      ...current,
      region,
      flag: countryCodeToFlag(flag),
      group: current.group && current.group !== "默认" ? current.group : groupName
    }));
  };
  const fillAgentDefaults = () => {
    if (!selected) return;
    const preset = inferProbePreset(selectedAgent, selectedProfile);
    setForm((current) => ({
      ...current,
      displayName: current.displayName || selectedAgent.name || "",
      osLabel: current.osLabel || preset.osLabel || osLabel({ ...selectedAgent, profile: selectedProfile }, current),
      flag: current.flag || (preset.code ? countryCodeToFlag(preset.code) : inferFlag(current, selectedAgent)),
      region: current.region || preset.region || "",
      group: current.group && current.group !== "默认" ? current.group : (preset.group || "默认"),
      note: current.note || preset.note || ""
    }));
  };
  const fillAllByGuess = async () => {
    try {
      setMessage("");
      for (const row of rows) {
        const preset = inferProbePreset(row.agent, row.profile);
        await api(`/api/probe-settings/${row.agent.id}`, {
          method: "PUT",
          body: JSON.stringify({
            displayName: row.profile.displayName || row.agent.name || row.agent.id,
            flag: row.profile.flag || (preset.code ? countryCodeToFlag(preset.code) : ""),
            region: row.profile.region || preset.region || "",
            group: row.profile.group && row.profile.group !== "默认" ? row.profile.group : (preset.group || "默认"),
            osLabel: row.profile.osLabel || preset.osLabel || "",
            note: row.profile.note || preset.note || ""
          })
        });
      }
      setMessage("已按节点信息批量猜测并填充地区、国旗、系统与备注。请检查后再微调。");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const clearOptionalLabels = () => {
    setForm((current) => ({
      ...current,
      price: "",
      billing: "",
      expireText: "",
      trafficLimitGb: "",
      note: ""
    }));
  };
  const patchBulk = (key, value) => setBulk((current) => ({ ...current, [key]: value }));
  const applyBulk = async () => {
    try {
      setMessage("");
      let index = 0;
      for (const row of rows) {
        const payload = {
          ...row.profile,
          displayName: row.profile.displayName || row.agent.name || row.agent.id,
          region: bulk.region || row.profile.region || "",
          group: bulk.group || row.profile.group || "默认",
          hidden: bulk.hidden === "" ? Boolean(row.profile.hidden) : bulk.hidden === "hidden",
          displayOrder: Number(bulk.sortStart || 0) + index * Number(bulk.sortStep || 10)
        };
        await api(`/api/probe-settings/${row.agent.id}`, { method: "PUT", body: JSON.stringify(payload) });
        index += 1;
      }
      setMessage("已批量更新地区、分组、显隐和排序。公开页会实时刷新。");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const moduleCards = [
    ["profiles", Monitor, "服务器", "编辑公开探针卡片、分组、账单与展示排序"],
    ["site", House, "站点", "设置 Chiken Monitor 名称、公开标题与页脚"],
    ["theme", Palette, "主题管理", "主题模式、卡片密度、强调色和顶部按钮"],
    ["login", LogIn, "登录", "登录标题、会话有效期与密码登录开关"],
    ["notifications", Bell, "通知", "配置通知通道、Webhook 和基础规则"],
    ["general", MoreHorizontal, "通用", "刷新频率、默认分组和公开隐私策略"],
    ["offlineNotify", Unplug, "离线通知", "服务器离线告警规则"],
    ["loadNotify", TrendingUp, "负载通知", "CPU、内存、磁盘阈值告警"],
    ["remoteExec", Code2, "远程执行", "复用命令库向在线 Agent 分发命令"],
    ["latency", RadioTower, "延迟监测", "ICMP/TCP/HTTP 探测任务"],
    ["sessions", Users, "会话管理", "查看和撤销后台登录会话"],
    ["account", UserCircle, "账户", "修改管理员密码"],
    ["logs", ClipboardList, "日志", "审计日志与操作记录"],
    ["about", AtSign, "关于", "Chiken Monitor 与 chiken-easy 信息"],
    ["docs", BookOpen, "文档", "常用入口和项目文档"],
    ["home", Home, "主页", "打开公开监控主页"],
    ["defaultTheme", Palette, "默认主题设置", "设置默认公开主题"]
  ];

  const renderModule = () => {
    if (module === "profiles") {
      return (
        <div className="grid2 probe-manage-layout">
          <Panel title="探针节点" right={<div className="actions"><button onClick={fillAllByGuess}>一键智能填充</button><button onClick={load}><RefreshCw size={15} />刷新</button></div>}>
            <div className="settings-helper compact">
              <div><b>{rows.length}</b><span>已注册节点</span></div>
              <div><b>{rows.filter((row) => !row.profile.hidden).length}</b><span>当前公开显示</span></div>
              <div><b>{rows.filter((row) => row.agent.connected).length}</b><span>在线节点</span></div>
            </div>
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <Field label="批量地区" value={bulk.region} onChange={(value) => patchBulk("region", value)} placeholder="如 香港 / 日本 / 美国" hint="留空则保留原有地区" />
              <Field label="批量分组" value={bulk.group} onChange={(value) => patchBulk("group", value)} placeholder="如 亚洲 / 香港 / 欧洲" hint="适合先粗分区，再手动微调" />
              <Field label="批量公开" type="select" value={bulk.hidden} onChange={(value) => patchBulk("hidden", value)} options={[["", "保持不变"], ["visible", "全部显示"], ["hidden", "全部隐藏"]]} hint="不会影响探针本身，只影响公开页是否展示" />
              <Field label="排序起点" type="number" value={bulk.sortStart} onChange={(value) => patchBulk("sortStart", value)} hint="例如从 10 开始，便于后续插队" inputMode="numeric" />
              <Field label="排序步长" type="number" value={bulk.sortStep} onChange={(value) => patchBulk("sortStep", value)} hint="建议 10，后面插入节点更灵活" inputMode="numeric" min={1} />
            </div>
            <div className="actions" style={{ marginBottom: 12 }}>
              <button onClick={applyBulk}>批量应用到全部节点</button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>公开名称</th>
                    <th>分组</th>
                    <th>地区</th>
                    <th>账单</th>
                    <th>公开</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.agent.id} className={selectedId === row.agent.id ? "selected-row" : ""} onClick={() => selectRow(row)}>
                      <td><b>{inferFlag(row.profile, row.agent)} {row.profile.displayName || row.agent.name}</b><div className="muted">{row.agent.os}/{row.agent.arch}</div></td>
                      <td>{row.profile.group || "默认"}</td>
                      <td>{row.profile.region || "-"}</td>
                      <td>{[row.profile.price, row.profile.expireText].filter(Boolean).join(" · ") || "-"}</td>
                      <td>{row.profile.hidden ? "隐藏" : "显示"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="编辑公开探针" right={selected ? <div className="editor-status-inline"><span className={dirty ? "status-chip warn" : "status-chip ok"}>{dirty ? "有未保存修改" : "已同步"}</span>{lastSavedAt ? <small>上次保存 {lastSavedAt}</small> : null}</div> : null}>
            {selected ? (
              <>
                <div className="probe-editor-preview">
                  <div className="preview-node-head">
                    <span className="flag">{inferFlag(form, selectedAgent)}</span>
                    <div>
                      <b>{form.displayName || selectedAgent.name}</b>
                      <small>{form.region || "未设置地区"} · {form.group || "默认"}</small>
                    </div>
                    <span className={`status-pill ${selectedAgent.connected ? "online" : ""}`}><StatusDot on={selectedAgent.connected} />{selectedAgent.connected ? "在线" : "离线"}</span>
                  </div>
                  <div className="preview-node-metrics">
                    <span>系统 <b>{form.osLabel || osLabel(selectedAgent, selectedProfile)}</b></span>
                    <span>流量 <b>{formatTrafficPair(selectedNetwork)}</b></span>
                    <span>速率 <b>↑ {formatSpeed(selectedNetwork.txSpeed)} ↓ {formatSpeed(selectedNetwork.rxSpeed)}</b></span>
                    <span>采样 <b>{selectedNetwork.sampleInterval ? `${Number(selectedNetwork.sampleInterval).toFixed(1)}s` : "等待"}</b></span>
                  </div>
                </div>
                <div className="quick-picks">
                  <span>常用地区</span>
                  {quickRegions.map((item) => <button key={item[1]} onClick={() => applyQuickRegion(item)}>{countryCodeToFlag(item[1])} {item[0]}</button>)}
                  <button onClick={fillAgentDefaults}>填入 Agent 信息</button>
                  <button onClick={clearOptionalLabels}>清空账单标签</button>
                </div>
                <div className="form-grid">
                  <Field label="公开名称" value={form.displayName} onChange={(value) => patch("displayName", value)} hint="公开页主标题；留短一点更好看" />
                  <Field label="旗标" value={form.flag} onChange={(value) => patch("flag", normalizeFlagInput(value))} placeholder="如 🇭🇰 / US / JP" hint="支持国旗 emoji，或输入国家代码自动转换" />
                  <Field label="分组" value={form.group} onChange={(value) => patch("group", value)} placeholder="亚洲 / 欧洲 / 美洲" hint="用于公开页顶部筛选" />
                  <Field label="地区" value={form.region} onChange={(value) => patch("region", value)} placeholder="香港 / 日本 / SFO" hint="建议填用户更熟悉的地区名" />
                  <Field label="系统显示" value={form.osLabel} onChange={(value) => patch("osLabel", value)} placeholder={selectedSystem.distro || "留空使用 Agent 上报系统"} hint="可手动统一成 Ubuntu 22.04 / Debian 12 这种格式" />
                  <Field label="排序" type="number" value={form.displayOrder} onChange={(value) => patch("displayOrder", value)} hint="数值越小越靠前" inputMode="numeric" />
                  <Field label="价格标签" value={form.price} onChange={(value) => patch("price", value)} placeholder="$60/三年" hint="会显示成蓝色价格 badge" />
                  <Field label="到期/余量标签" value={form.expireText} onChange={(value) => patch("expireText", value)} placeholder="余1075天" hint="包含“余”时会优先用绿色样式" />
                  <Field label="账单备注" value={form.billing} onChange={(value) => patch("billing", value)} placeholder="年付 / 月付 / 一次性" hint="仅后台记录，方便自己管理" />
                  <Field label="总流量 GB" type="number" value={form.trafficLimitGb} onChange={(value) => patch("trafficLimitGb", value)} placeholder="留空不显示百分比" hint="填写后公开页会自动计算流量使用百分比" inputMode="decimal" min={0} step={1} />
                  <Field label="标签" value={form.tags} onChange={(value) => patch("tags", value)} placeholder="CN2, premium, 流媒体" hint="逗号分隔，便于后续扩展筛选/标记" />
                  <Field label="公开显示" type="select" value={form.hidden ? "hidden" : "visible"} onChange={(value) => patch("hidden", value === "hidden")} options={[["visible", "显示"], ["hidden", "隐藏"]]} hint="隐藏后不会出现在公开页" />
                  <Field label="卡片备注" type="textarea" rows={3} value={form.note} onChange={(value) => patch("note", value)} hint="适合写“香港云服务器 / 流媒体友好 / 备用节点”等简短说明" />
                </div>
                <div className="panel-tip">
                  公开页不会输出服务器 IP 或主机地址。系统发行版来自 Agent 上报，国旗优先使用这里填写的旗标，留空时会按地区/名称自动推断。
                </div>
                <div className="actions">
                  <button className="primary" onClick={save} disabled={saving || !dirty}><Save size={16} />{saving ? "保存中..." : "保存探针"}</button>
                  <button onClick={() => selected && selectRow(selected)} disabled={saving || !dirty}><RotateCcw size={16} />撤销未保存修改</button>
                  <a className="button-link" href="/" target="_blank" rel="noreferrer">查看公开页</a>
                </div>
                {message ? <p className="panel-message">{message}</p> : null}
              </>
            ) : <div className="empty">还没有在线或已注册 Agent。</div>}
          </Panel>
        </div>
      );
    }
    if (module === "site") return <MonitorSettingsPage section="site" title="站点设置" embedded />;
    if (module === "theme" || module === "defaultTheme") return <MonitorSettingsPage section="theme" title={module === "defaultTheme" ? "默认主题设置" : "主题管理"} embedded />;
    if (module === "login") return <MonitorSettingsPage section="login" title="登录设置" embedded />;
    if (module === "notifications" || module === "offlineNotify" || module === "loadNotify") return <MonitorSettingsPage section="notifications" title={moduleCards.find(([id]) => id === module)?.[2] || "通知设置"} embedded />;
    if (module === "general") return <MonitorSettingsPage section="general" title="通用设置" embedded />;
    if (module === "remoteExec") return <CommandsPage agents={agents} liveTick={liveTick} embedded />;
    if (module === "latency") return <ProbeTasksPage agents={agents} liveTick={liveTick} embedded />;
    if (module === "sessions") return <SessionsPage liveTick={liveTick} embedded />;
    if (module === "account") return <AccountPage embedded />;
    if (module === "logs") return <Audit liveTick={liveTick} embedded />;
    if (module === "about") return <StaticAdminPage title="关于" body="Chiken Monitor 是 chiken-easy 内置的公开探针与后台控制面板，用来统一查看节点状态、整理展示文案、执行运维动作并分发订阅。" highlights={["公开探针", "后台控制", "订阅分发"]} tips={[{ title: "适合做什么", body: "快速检查节点健康、统一调整展示信息、集中管理订阅与通知。" }, { title: "不会影响什么", body: "这里只是说明页，不会触发探针、重启服务或修改节点配置。" }, { title: "版本关系", body: "Chiken Monitor 随 chiken-easy 一起提供，适合作为轻量的一体化管理后台。" }]} embedded />;
    if (module === "docs") return <StaticAdminPage title="文档" body="这里集中放置 Chiken Monitor 常用入口与外部资料，适合新接手时快速找功能，不必再逐个翻模块。" highlights={["快速上手", "常用入口", "外部资料"]} tips={[{ title: "建议先看", body: "先从站点设置、主题管理、探针管理开始，最容易立刻看到变化。" }, { title: "运维相关", body: "远程执行、延迟监测、会话管理和日志更适合排障与日常巡检。" }, { title: "文档策略", body: "如果某块功能还没写成长文档，先用这里的入口页和内联提示即可。" }]} empty={{ title: "还没有内置长文档", detail: "当前以模块内提示和 GitHub 项目页为主；后续可以把部署、告警、订阅策略再补成独立文档。" }} actions={<><a className="button-link" href="https://github.com/fengbule/chiken-easy" target="_blank" rel="noreferrer">打开 GitHub 项目</a><a className="button-link" href="/" target="_blank" rel="noreferrer">查看公开探针页</a></>} embedded />;
    if (module === "home") return <StaticAdminPage title="主页" body="公开主页默认无需登录，适合对外展示在线状态、负载、速率与累计流量；卡片文案与分组可在探针管理里实时调整。" highlights={["默认公开", "实时刷新", "支持分组筛选"]} tips={[{ title: "推荐搭配", body: "先在站点设置里改标题和描述，再去主题管理调密度与强调色，主页观感会更完整。" }, { title: "内容来源", body: "节点卡片数据来自 Agent 探针，展示名称、地区、国旗和备注来自探针管理。" }, { title: "隐私提示", body: "若已开启公开隐藏 IP，主页不会暴露主机地址。" }]} actions={<><a className="button-link" href="/" target="_blank" rel="noreferrer">打开公开主页</a><button onClick={() => setModule("site")}>前往站点设置</button><button onClick={() => setModule("theme")}>前往主题管理</button></>} embedded />;
    return null;
  };

  return (
    <section>
      <Panel title="Chiken Monitor 功能卡片" right={<span className="muted">已收纳 {moduleCards.length} 个边角模块入口</span>}>
        <div className="monitor-module-grid">
          {moduleCards.map(([id, Icon, title, body]) => (
            <button key={id} className={module === id ? "monitor-module-card active" : "monitor-module-card"} onClick={() => setModule(id)}>
              <Icon size={19} />
              <span>{title}</span>
              <small>{body}</small>
            </button>
          ))}
        </div>
      </Panel>
      <div className="monitor-module-body">{renderModule()}</div>
    </section>
  );
}

function MonitorSettingsPage({ section, title, embedded = false }) {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState("");
  const [testing, setTesting] = useState(false);
  const [summary, setSummary] = useState(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const notificationSummaryKey = section === "notifications"
    ? JSON.stringify({
      channel: current.channel || "",
      webhookUrl: current.webhookUrl || "",
      telegramBotToken: current.telegramBotToken || "",
      telegramChatId: current.telegramChatId || "",
      telegramApiBase: current.telegramApiBase || ""
    })
    : "";
  const load = () => api("/api/admin/settings").then((data) => {
    setSettings(data);
    setDirty(false);
  });
  useEffect(() => {
    load().catch(() => {});
  }, [section]);
  const current = settings?.[section] || {};
  const patch = (key, value) => {
    setDirty(true);
    setSettings((data) => ({ ...data, [section]: { ...(data?.[section] || {}), [key]: value } }));
  };
  const save = async () => {
    try {
      setSaving(true);
      setMessage("");
      const response = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ [section]: current }) });
      setSettings(response);
      setDirty(false);
      setLastSavedAt(formatClock(new Date()));
      setMessage("设置已保存。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };
  const testNotification = async () => {
    try {
      setTesting(true);
      setMessage("");
      const response = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ [section]: current }) });
      setSettings(response);
      const result = await api("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({}) });
      const okChannels = (result.results || []).map((row) => row.channel).join(", ");
      const errors = (result.errors || []).join("；");
      setMessage(`测试通知完成：成功通道 ${okChannels || "无"}${errors ? `；失败原因：${errors}` : ""}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setTesting(false);
    }
  };
  if (!settings) return null;

  const channel = String(current.channel || "webhook");
  const needsWebhook = channel === "webhook" || channel === "both";
  const needsTelegram = channel === "telegram" || channel === "both";

  useEffect(() => {
    if (section !== "notifications") {
      setSummary(null);
      return;
    }
    api("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({ dryRun: true }) })
      .then((result) => setSummary(result))
      .catch(() => setSummary(null));
  }, [section, notificationSummaryKey]);

  const fields = {
    site: [
      ["name", "站点名称", "text", "Chiken Monitor", null, "公开页品牌名，建议 2-20 个字"],
      ["subtitle", "公开页标题", "text", "Chiken Monitor", null, "显示在顶部品牌区，可与站点名称不同"],
      ["description", "站点描述", "text", "", null, "会出现在首页 hero 区，适合一句话说明用途"],
      ["footer", "页脚文字", "text", "", null, "可放版权、联系信息或简单备注"]
    ],
    theme: [
      ["mode", "主题模式", "select", "", [["light", "浅色"], ["dark", "深色"], ["system", "跟随系统"]], "默认外观模式"],
      ["cardDensity", "卡片密度", "select", "", [["compact", "紧凑"], ["standard", "标准"], ["relaxed", "宽松"]], "影响公开页卡片信息疏密"],
      ["accent", "强调色", "text", "green", null, "先填语义色名（green/blue/violet）最稳妥"],
      ["showHeaderActions", "顶部按钮", "select", "", [[true, "显示"], [false, "隐藏"]], "控制 GitHub / 刷新 / 管理入口按钮"]
    ],
    login: [
      ["title", "登录标题", "text", "Chiken Monitor", null, "管理员登录页显示名称"],
      ["sessionDays", "会话有效天数", "number", "7", null, "建议 1-30 天；过长会增加风险"],
      ["allowPasswordLogin", "密码登录", "select", "", [[true, "允许"], [false, "禁用"]], "禁用后只能走已有 Token / 会话"]
    ],
    notifications: [
      ["offlineEnabled", "离线通知", "select", "", [[true, "启用"], [false, "关闭"]], "节点离线时发告警"],
      ["loadEnabled", "负载通知", "select", "", [[true, "启用"], [false, "关闭"]], "CPU / 内存 / 磁盘超阈值时告警"],
      ["cpuThreshold", "CPU 阈值", "number", "90", null, "超过该百分比触发"],
      ["memoryThreshold", "内存阈值", "number", "90", null, "超过该百分比触发"],
      ["diskThreshold", "磁盘阈值", "number", "90", null, "超过该百分比触发"],
      ["cooldownMinutes", "冷却分钟", "number", "10", null, "同一节点重复告警的最短间隔"],
      ["channel", "通知通道", "select", "", [["webhook", "Webhook"], ["telegram", "Telegram"], ["both", "Webhook + Telegram"]], "建议先配单通道测试，再改双通道"],
      ["webhookUrl", "Webhook URL", "text", "", null, "企业微信 / 飞书 / 自定义 webhook 地址"],
      ["telegramBotToken", "Telegram Bot Token", "password", "", null, "来自 @BotFather"],
      ["telegramChatId", "Telegram Chat ID", "text", "", null, "个人 / 群组 chat_id"],
      ["telegramApiBase", "Telegram API Base", "text", "https://api.telegram.org", null, "默认不用改；自建网关时再填"]
    ],
    general: [
      ["publicRefreshSeconds", "公开页刷新秒数", "number", "5", null, "建议 3-15 秒；太低会增加刷新压力"],
      ["adminRefreshSeconds", "后台刷新秒数", "number", "5", null, "后台轮询频率，建议与公开页接近"],
      ["publicHideIp", "公开隐藏 IP", "select", "", [[true, "隐藏"], [false, "显示"]], "建议保持隐藏，降低暴露风险"],
      ["publicDefaultGroup", "默认分组", "text", "全部", null, "公开页首次进入时选中的分组"]
    ]
  }[section] || [];

  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title={title} right={<div className="editor-status-inline"><span className={dirty ? "status-chip warn" : "status-chip ok"}>{dirty ? "有未保存修改" : "已同步"}</span>{lastSavedAt ? <small>上次保存 {lastSavedAt}</small> : null}</div>}>
        {section === "site" ? (
          <div className="settings-helper">
            <div><b>公开标题</b><span>先改站点名称和描述，首页观感提升最明显。</span></div>
            <div><b>文案建议</b><span>描述控制在 1 句话，避免太长把 hero 区撑乱。</span></div>
            <div><b>低风险</b><span>这页只改展示文案，不影响探针采集与后台登录。</span></div>
          </div>
        ) : null}
        {section === "theme" ? (
          <>
            <div className="settings-helper">
              <div><b>优先推荐</b><span>先从模式、卡片密度、顶部按钮开始调，最稳。</span></div>
              <div><b>强调色</b><span>如果不确定，继续用 green；可读性和现有样式最匹配。</span></div>
              <div><b>预期影响</b><span>仅影响公开页外观，不会改后台功能。</span></div>
            </div>
            <div className="theme-presets">
              <button onClick={() => { setDirty(true); setSettings((data) => ({ ...data, [section]: { ...(data?.[section] || {}), mode: "light", cardDensity: "standard", accent: "green", showHeaderActions: true } })); }}>默认推荐</button>
              <button onClick={() => { setDirty(true); setSettings((data) => ({ ...data, [section]: { ...(data?.[section] || {}), mode: "dark", cardDensity: "compact", accent: "violet", showHeaderActions: true } })); }}>深色紧凑</button>
              <button onClick={() => { setDirty(true); setSettings((data) => ({ ...data, [section]: { ...(data?.[section] || {}), mode: "light", cardDensity: "relaxed", accent: "blue", showHeaderActions: false } })); }}>极简展示</button>
            </div>
          </>
        ) : null}
        {section === "general" ? (
          <div className="settings-helper">
            <div><b>刷新频率</b><span>公开页和后台都不建议低于 3 秒。</span></div>
            <div><b>隐私策略</b><span>公开隐藏 IP 建议保持开启，除非你明确要展示。</span></div>
            <div><b>默认分组</b><span>填“全部”最稳；也可以填常用区域提升首屏命中。</span></div>
          </div>
        ) : null}
        {section === "notifications" ? (
          <>
            <div className="settings-helper">
              <div><b>通知通道</b><span>Webhook、Telegram 或两者同时发送，保存后可以立即点测试。</span></div>
              <div><b>告警规则</b><span>离线与负载告警共用冷却时间，避免短时间重复轰炸。</span></div>
              <div><b>隐私</b><span>测试与告警只发送节点名称和指标，不包含公开页隐藏的 IP。</span></div>
            </div>
            <div className="guide-card flat">
              <h3>当前通道检查</h3>
              <div className="settings-check-grid">
                <div className={`settings-check-card ${needsWebhook && !current.webhookUrl ? "bad" : ""}`}>
                  <b>Webhook</b>
                  <span>{needsWebhook ? (current.webhookUrl ? "已启用并填写 URL" : "已选择但未填写 URL") : "当前未启用"}</span>
                </div>
                <div className={`settings-check-card ${needsTelegram && !(current.telegramBotToken && current.telegramChatId) ? "bad" : ""}`}>
                  <b>Telegram</b>
                  <span>{needsTelegram ? (current.telegramBotToken && current.telegramChatId ? "Bot Token / Chat ID 已填写" : "Bot Token 或 Chat ID 未填写") : "当前未启用"}</span>
                </div>
                <div className="settings-check-card">
                  <b>发送策略</b>
                  <span>{notificationChannelLabel(channel)} · 冷却 {Number(current.cooldownMinutes || 0)} 分钟</span>
                </div>
              </div>
              {summary ? (
                <div className="settings-summary-inline">
                  <span className={`status-pill ${summary.results?.length ? "online" : ""}`}>
                    <StatusDot on={summary.results?.length > 0} />
                    可用通道 {summary.results?.length || 0}
                  </span>
                  {summary.results?.map((row) => <span key={row.channel} className="mini-tag">{notificationChannelLabel(row.channel)}</span>)}
                  {summary.errors?.length ? <span className="mini-tag danger">缺失：{summary.errors.join("；")}</span> : <span className="mini-tag ok">配置项完整</span>}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="form-grid">
          {fields.map(([key, label, type, placeholder, options, hint]) => (
            <Field
              key={key}
              label={label}
              type={type}
              value={current[key] ?? ""}
              onChange={(value) => patch(key, value === "true" ? true : value === "false" ? false : value)}
              placeholder={placeholder}
              options={(options || []).map(([value, text]) => [String(value), text])}
              hint={hint}
              inputMode={type === "number" ? "numeric" : undefined}
            />
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={save} disabled={saving || !dirty}><Save size={16} />{saving ? "保存中..." : "保存"}</button>
          {section === "notifications" ? <button onClick={testNotification} disabled={testing || saving}><Bell size={16} />{testing ? "发送中..." : "发送测试通知"}</button> : null}
          <button onClick={load} disabled={saving}><RefreshCw size={16} />重载</button>
        </div>
        {message ? <p className="panel-message">{message}</p> : null}
      </Panel>
    </section>
  );
}

function SessionsPage({ liveTick, embedded = false }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = () => api("/api/admin/sessions").then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);
  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title="会话管理" right={<button onClick={load}><RefreshCw size={15} />刷新</button>}>
        <table>
          <thead><tr><th>用户</th><th>创建时间</th><th>过期时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.username}</td>
                <td>{row.createdAt}</td>
                <td>{row.expiresAt}</td>
                <td>{row.revoked ? "已撤销" : "有效"}</td>
                <td>{row.revoked ? null : <button className="link" disabled={busyId === row.id} onClick={async () => {
                  try {
                    setBusyId(row.id);
                    await api(`/api/admin/sessions/${row.id}`, { method: "DELETE" });
                    setMessage(`已撤销会话：${row.username}`);
                    await load();
                  } catch (error) {
                    setMessage(error.message);
                  } finally {
                    setBusyId("");
                  }
                }}>{busyId === row.id ? "撤销中..." : "撤销"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {message ? <p className="panel-message">{message}</p> : null}
      </Panel>
    </section>
  );
}

function AccountPage({ embedded = false }) {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title="账户">
        <div className="form-grid">
          <Field label="旧密码" type="password" value={form.oldPassword} onChange={(value) => patch("oldPassword", value)} disabled={saving} />
          <Field label="新密码" type="password" value={form.newPassword} onChange={(value) => patch("newPassword", value)} hint="至少 8 位" disabled={saving} />
          <Field label="确认新密码" type="password" value={form.confirmPassword} onChange={(value) => patch("confirmPassword", value)} disabled={saving} />
        </div>
        <div className="actions">
          <button className="primary" disabled={saving} onClick={async () => {
            try {
              setSaving(true);
              setMessage("");
              if (!form.oldPassword || !form.newPassword || !form.confirmPassword) throw new Error("请填写完整后再提交");
              if (form.newPassword !== form.confirmPassword) throw new Error("两次输入的新密码不一致");
              await api("/api/auth/password", { method: "PUT", body: JSON.stringify(form) });
              setMessage("密码已更新。其他登录会话已失效，请妥善保管新密码。");
              setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
            } catch (error) {
              setMessage(error.message);
            } finally {
              setSaving(false);
            }
          }}>{saving ? "提交中..." : "修改密码"}</button>
        </div>
        {message ? <p className="panel-message">{message}</p> : null}
      </Panel>
    </section>
  );
}

function StaticAdminPage({ title, body, actions = null, embedded = false, highlights = [], tips = [], empty = null }) {
  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title={title}>
        <div className="static-admin-shell">
          <div className="guide-card flat static-admin-hero">
            <h3>{title}</h3>
            <p>{body}</p>
            {highlights.length ? (
              <div className="static-admin-badges">
                {highlights.map((item) => <span key={item} className="mini-tag">{item}</span>)}
              </div>
            ) : null}
          </div>
          {tips.length ? (
            <div className="settings-helper static-admin-helper">
              {tips.map((item) => (
                <div key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.body}</span>
                </div>
              ))}
            </div>
          ) : null}
          {empty ? <EmptyState title={empty.title} detail={empty.detail} /> : null}
          {actions ? <div className="actions">{actions}</div> : null}
        </div>
      </Panel>
    </section>
  );
}

function ForwardWizard({ agents }) {
  const [form, setForm] = useState({ agentId: "", engine: "sing-box", network: "tcp", listen: "0.0.0.0", port: 31080, targetHost: "example.com", targetPort: 80, name: "" });
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

  return (
    <section>
      <div className="grid2">
        <Panel title="端口转发" right={<button onClick={async () => {
          try {
            const response = await api("/api/forward/render", { method: "POST", body: JSON.stringify(form) });
            setPreview(JSON.stringify(response.config, null, 2));
          } catch (error) {
            setPreview(error.message);
          }
        }}>预览 JSON</button>}>
          <div className="form-grid">
            <Field label="服务器" type="select" value={form.agentId} onChange={(value) => setForm((current) => ({ ...current, agentId: value }))} options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])} />
            <Field label="名称" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <Field label="引擎" type="select" value={form.engine} onChange={(value) => setForm((current) => ({ ...current, engine: value }))} options={[["sing-box", "sing-box"], ["realm", "Realm"], ["gost", "GOST"]]} />
            <Field label="网络" type="select" value={form.network} onChange={(value) => setForm((current) => ({ ...current, network: value }))} options={[["tcp", "TCP"], ["udp", "UDP"], ["tcp_udp", "TCP + UDP"]]} />
            <Field label="监听地址" value={form.listen} onChange={(value) => setForm((current) => ({ ...current, listen: value }))} />
            <Field label="监听端口" type="number" value={form.port} onChange={(value) => setForm((current) => ({ ...current, port: value }))} />
            <Field label="目标地址" value={form.targetHost} onChange={(value) => setForm((current) => ({ ...current, targetHost: value }))} />
            <Field label="目标端口" type="number" value={form.targetPort} onChange={(value) => setForm((current) => ({ ...current, targetPort: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={async () => {
              try {
                const response = await api(`/api/agents/${form.agentId}/forward/wizard`, { method: "POST", body: JSON.stringify(form) });
                setResult(JSON.stringify(response, null, 2));
                await loadRules(form.agentId);
              } catch (error) {
                setResult(error.message);
              }
            }}>下发并启动</button>
          </div>
          <pre>{result || "这里显示转发结果。"}</pre>
        </Panel>
        <Panel title="转发预览"><pre className="preview">{preview || "点击预览 JSON 查看结果。"}</pre></Panel>
      </div>
      <Panel title="当前规则">
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
                <td>{rule.listen}:{rule.port}</td>
                <td>{rule.targetHost}:{rule.targetPort}</td>
                <td>{rule.status || "-"}</td>
                <td><button className="link" onClick={async () => {
                  await api(`/api/agents/${form.agentId}/forwards/${rule.id}`, { method: "DELETE" });
                  await loadRules(form.agentId);
                }}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function ProbeTasksPage({ agents, liveTick }) {
  const [tasks, setTasks] = useState([]);
  const [form, setForm] = useState({ name: "", type: "tcp", target: "1.1.1.1", port: 443, interval: 60, timeout: 5000, agentId: "" });
  const [editingId, setEditingId] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [savingTask, setSavingTask] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState("");
  const [deletingTaskId, setDeletingTaskId] = useState("");

  const load = () => api("/api/probe-tasks").then(setTasks);
  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const filteredTasks = tasks.filter((task) => {
    const resultState = task.lastResult ? (task.lastResult.ok ? "ok" : "fail") : "pending";
    const text = [task.name, task.type, describeTaskTarget(task), taskScopeLabel(task, agents), task.lastResult?.agentName, task.lastResult?.status, task.lastResult?.output]
      .join(" ")
      .toLowerCase();
    const matchesFilter = filter === "all" || filter === resultState;
    return matchesFilter && text.includes(query.toLowerCase());
  });

  const taskStats = {
    total: tasks.length,
    ok: tasks.filter((task) => task.lastResult?.ok).length,
    fail: tasks.filter((task) => task.lastResult && !task.lastResult.ok).length,
    pending: tasks.filter((task) => !task.lastResult).length
  };

  const saveTask = async () => {
    try {
      setSavingTask(true);
      setMessage("");
      if (editingId) {
        await api(`/api/probe-tasks/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        setMessage("任务已更新。");
      } else {
        const result = await api("/api/probe-tasks", { method: "POST", body: JSON.stringify(form) });
        setMessage(`任务已创建，已下发 ${result.sent?.length || 0} 个在线节点。`);
      }
      setEditingId("");
      setForm((current) => ({ ...current, name: "" }));
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingTask(false);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="新建探测任务">
          <div className="probe-task-presets">
            <button onClick={() => setForm({ name: "Cloudflare TCP", type: "tcp", target: "1.1.1.1", port: 443, interval: 60, timeout: 3000, agentId: "" })}>TCP 443</button>
            <button onClick={() => setForm({ name: "Google HTTP", type: "http", target: "https://www.google.com/generate_204", port: 443, interval: 60, timeout: 5000, agentId: "" })}>HTTP 204</button>
            <button onClick={() => setForm({ name: "DNS ICMP", type: "icmp", target: "1.1.1.1", port: 443, interval: 60, timeout: 3000, agentId: "" })}>ICMP</button>
          </div>
          <div className="form-grid">
            <Field label="名称" value={form.name} onChange={(value) => patch("name", value)} placeholder="可留空自动生成" />
            <Field label="类型" type="select" value={form.type} onChange={(value) => patch("type", value)} options={[["tcp", "TCP Ping"], ["http", "HTTP Ping"], ["icmp", "ICMP Ping"]]} />
            <Field label={form.type === "http" ? "URL" : "目标"} value={form.target} onChange={(value) => patch("target", value)} placeholder={form.type === "http" ? "https://example.com" : "example.com / 1.1.1.1"} />
            {form.type === "tcp" ? <Field label="端口" type="number" value={form.port} onChange={(value) => patch("port", value)} /> : null}
            <Field label="执行节点" type="select" value={form.agentId} onChange={(value) => patch("agentId", value)} options={[["", "全部在线节点"], ...agents.map((agent) => [agent.id, agent.name])]} />
            <Field label="间隔秒" type="number" value={form.interval} onChange={(value) => patch("interval", value)} />
            <Field label="超时 ms" type="number" value={form.timeout} onChange={(value) => patch("timeout", value)} />
          </div>
          <div className="actions">
            <button className="primary" onClick={saveTask} disabled={savingTask}>{savingTask ? (editingId ? "保存中..." : "创建中...") : (editingId ? "保存任务" : "创建并运行")}</button>
            {editingId ? <button onClick={() => { setEditingId(""); setForm({ name: "", type: "tcp", target: "1.1.1.1", port: 443, interval: 60, timeout: 5000, agentId: "" }); }} disabled={savingTask}>取消编辑</button> : null}
          </div>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
        <Panel title="机制说明">
          <div className="guide-card flat">
            <h3>Phase 1 探测总线</h3>
            <p>任务保存在 server，按间隔下发给在线 agent；agent 执行 ICMP、TCP 或 HTTP 探测后回传延迟、状态和输出。Proxy 探测会复用这条通道继续扩展。</p>
          </div>
        </Panel>
      </div>
      <Panel title="任务列表" right={<div className="toolbar-inline"><span className="muted">共 {taskStats.total} 条 · 成功 {taskStats.ok} · 失败 {taskStats.fail} · 等待 {taskStats.pending}</span><button onClick={load}><RefreshCw size={15} />刷新</button></div>}>
        <div className="task-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、目标、节点、状态输出" />
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">全部状态</option>
            <option value="ok">仅成功</option>
            <option value="fail">仅失败</option>
            <option value="pending">仅等待结果</option>
          </select>
        </div>
        {filteredTasks.length ? <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>目标</th>
              <th>执行节点</th>
              <th>最近结果</th>
              <th>延迟</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => (
              <React.Fragment key={task.id}>
                <tr>
                  <td>
                    <b>{task.name || "未命名任务"}</b>
                    <div className="muted">每 {task.interval || 0}s 执行一次 · 超时 {task.timeout || 0} ms</div>
                  </td>
                  <td>{String(task.type || "-").toUpperCase()}</td>
                  <td><code>{describeTaskTarget(task)}</code></td>
                  <td>{taskScopeLabel(task, agents)}</td>
                  <td><span className={`status-pill ${task.lastResult?.ok ? "online" : ""}`}><StatusDot on={task.lastResult?.ok} />{task.lastResult ? (task.lastResult.ok ? "ok" : "fail") : "pending"}</span>{task.lastResult?.status ? <div className="muted task-subline">{summarizeText(task.lastResult.status, 48)}</div> : null}</td>
                  <td><span className={`latency-badge ${latencyTone(task.lastResult?.latency)}`}>{formatLatency(task.lastResult?.latency)}</span>{task.lastResult?.agentName ? <div className="muted task-subline">{task.lastResult.agentName}</div> : null}</td>
                  <td><span>{formatTimeAgo(task.lastResult?.at)}</span><div className="muted task-subline">{formatDateTime(task.lastResult?.at)}</div></td>
                  <td className="actions-cell">
                    <button className="link" onClick={() => { setEditingId(task.id); setForm({ name: task.name || "", type: task.type || "tcp", target: task.target || "", port: task.port || 443, interval: task.interval || 60, timeout: task.timeout || 5000, agentId: task.agentId || "" }); }}>编辑</button>
                    <button className="link" onClick={() => setExpandedId((current) => current === task.id ? "" : task.id)}>{expandedId === task.id ? "收起" : "详情"}</button>
                    <button className="link" disabled={runningTaskId === task.id || deletingTaskId === task.id} onClick={async () => {
                      try {
                        setRunningTaskId(task.id);
                        const result = await api(`/api/probe-tasks/${task.id}/run`, { method: "POST" });
                        setMessage(`已重新下发 ${result.sent?.length || 0} 个在线节点。`);
                        await load();
                      } catch (error) {
                        setMessage(error.message);
                      } finally {
                        setRunningTaskId("");
                      }
                    }}>{runningTaskId === task.id ? "运行中..." : "运行"}</button>
                    <button className="link" disabled={runningTaskId === task.id || deletingTaskId === task.id} onClick={async () => {
                      try {
                        if (!window.confirm(`删除探测任务 ${task.name || "未命名任务"}？`)) return;
                        setDeletingTaskId(task.id);
                        await api(`/api/probe-tasks/${task.id}`, { method: "DELETE" });
                        setMessage("任务已删除。");
                        if (expandedId === task.id) setExpandedId("");
                        if (editingId === task.id) {
                          setEditingId("");
                          setForm({ name: "", type: "tcp", target: "1.1.1.1", port: 443, interval: 60, timeout: 5000, agentId: "" });
                        }
                        await load();
                      } catch (error) {
                        setMessage(error.message);
                      } finally {
                        setDeletingTaskId("");
                      }
                    }}>{deletingTaskId === task.id ? "删除中..." : "删除"}</button>
                  </td>
                </tr>
                {expandedId === task.id ? <tr><td colSpan={8}><div className="guide-card flat"><h3>最近结果</h3>{task.lastResults?.length ? <div className="task-result-list">{task.lastResults.slice(0, 8).map((row, index) => <div key={index} className={`task-result-card ${row.ok ? "ok" : "bad"}`}><div className="task-result-head"><b>{row.agentName || row.agentId || "-"}</b><span className={`status-pill ${row.ok ? "online" : ""}`}><StatusDot on={row.ok} />{row.ok ? "ok" : "fail"}</span></div><div className="task-result-meta"><span>延迟：{formatLatency(row.latency)}</span><span>时间：{formatDateTime(row.at)}</span></div>{row.status ? <div className="task-result-text"><b>状态</b><span>{row.status}</span></div> : null}{row.output ? <div className="task-result-text"><b>输出</b><code>{summarizeText(row.output, 240)}</code></div> : null}</div>)}</div> : <EmptyState title="暂无明细结果" detail="任务运行后会在这里展示最近各节点的探测结果。" />}</div></td></tr> : null}
              </React.Fragment>
            ))}
          </tbody>
        </table> : <EmptyState title="没有匹配的探测任务" detail="试试调整筛选条件，或者先创建一个 TCP / HTTP / ICMP 任务。" />}
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
  }, [id, liveTick]);

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>sing-box 配置</h1>
        <button onClick={async () => {
          try {
            const current = await api(`/api/agents/${id}/config`);
            if (current.config) setText(JSON.stringify(current.config, null, 2));
            setMessage("已读取缓存中的当前配置。");
          } catch (error) {
            setMessage(error.message);
          }
        }}>读取当前</button>
        <button onClick={() => setText(JSON.stringify(JSON.parse(text), null, 2))}>格式化</button>
        <button className="primary" onClick={async () => {
          try {
            const response = await api(`/api/agents/${id}/config`, { method: "POST", body: JSON.stringify({ config: JSON.parse(text), restart: true }) });
            setMessage(JSON.stringify(response));
            loadVersions().catch(() => {});
          } catch (error) {
            setMessage(error.message);
          }
        }}>应用并重启</button>
      </div>
      <div className="grid-config">
        <Panel title="JSON 编辑器" right={<span>{new Blob([text]).size} bytes</span>}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
        <Panel title="历史版本" right={<button onClick={loadVersions}>刷新</button>}>
          {versions.length ? versions.map((version) => (
            <div className="version" key={version.id}>
              <div>
                <div>{version.at}</div>
                <div className="muted">{version.status || "pending"}</div>
              </div>
              <button onClick={async () => {
                await api(`/api/agents/${id}/config/rollback/${version.id}`, { method: "POST" });
                setMessage("已发起回滚。");
              }}>
                <RotateCcw size={15} />
                回滚
              </button>
            </div>
          )) : <EmptyState title="暂无版本记录" detail="应用过 sing-box 配置后，这里会显示历史版本，方便回滚。" />}
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
        <h1>实时日志</h1>
        <input className="small" value={count} onChange={(event) => setCount(Number(event.target.value) || 200)} />
        <button className="red-bg" onClick={() => setLines([])}><Trash2 size={16} />清屏</button>
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

  return (
    <section>
      <div className="toolbar">
        <select value={currentAgentId} onChange={(event) => setAgentId(event.target.value)}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
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
  const [name, setName] = useState("automation");
  const [created, setCreated] = useState("");
  const [message, setMessage] = useState("");

  const load = () => api("/api/api-tokens").then(setRows);
  useEffect(() => {
    load().catch(() => {});
  }, []);

  return (
    <section>
      <div className="grid2">
        <Panel title="创建与注入令牌">
          <div className="form-grid">
            <Field label="令牌名称" value={name} onChange={setName} />
            <Field label="当前面板令牌" value={tokenDraft} onChange={setTokenDraft} placeholder="ck_xxx" />
          </div>
          <div className="actions">
            <button className="primary" onClick={async () => {
              try {
                const response = await api("/api/api-tokens", { method: "POST", body: JSON.stringify({ name }) });
                setCreated(response.token);
                setTokenDraft(response.token);
                setMessage("新令牌已生成，可以直接写入当前面板。");
                load().catch(() => {});
              } catch (error) {
                setMessage(error.message);
              }
            }}>生成 API Token</button>
            <button onClick={saveToken}>使用令牌</button>
            <button onClick={clearToken}>清除本地令牌</button>
          </div>
          <pre>{created || activeToken || "保存后的令牌会自动附带到 API、日志和终端请求。"}</pre>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
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
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td><code>{row.token}</code></td>
                  <td>{row.createdAt}</td>
                  <td>{row.revoked ? "revoked" : "active"}</td>
                  <td>{row.revoked ? null : <button className="link" onClick={async () => {
                    await api(`/api/api-tokens/${row.id}`, { method: "DELETE" });
                    load().catch(() => {});
                  }}>撤销</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </section>
  );
}

function Audit({ liveTick }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  useEffect(() => {
    api("/api/audit").then(setRows).catch(() => {});
  }, [liveTick]);

  const actors = Array.from(new Set(rows.map((row) => row.actor).filter(Boolean)));
  const actions = Array.from(new Set(rows.map((row) => row.action).filter(Boolean)));
  const filteredRows = rows.filter((row) => {
    const text = [row.actor, row.action, row.target, JSON.stringify(row.detail || {})].join(" ").toLowerCase();
    const actorOk = actorFilter === "all" || row.actor === actorFilter;
    const actionOk = actionFilter === "all" || row.action === actionFilter;
    return actorOk && actionOk && text.includes(query.toLowerCase());
  });

  return (
    <section>
      <Panel title="审计日志" right={<div className="toolbar-inline"><span className="muted">共 {filteredRows.length} / {rows.length} 条</span></div>}>
        <div className="task-toolbar">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索操作者、动作、目标或详情" />
          <select value={actorFilter} onChange={(event) => setActorFilter(event.target.value)}>
            <option value="all">全部操作者</option>
            {actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
          </select>
          <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            <option value="all">全部动作</option>
            {actions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </div>
        {filteredRows.length ? <table>
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
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td><span>{formatTimeAgo(row.at)}</span><div className="muted task-subline">{formatDateTime(row.at)}</div></td>
                <td>{row.actor || "-"}</td>
                <td><span className="mini-tag">{row.action || "-"}</span></td>
                <td>{row.target || "-"}</td>
                <td><pre className="inline-pre">{JSON.stringify(row.detail, null, 2)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table> : <EmptyState title="没有匹配的审计日志" detail="可以调整关键字、操作者或动作筛选条件。" />}
      </Panel>
    </section>
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
    const nextToken = urlToken || storedToken;
    if (urlToken) {
      url.searchParams.delete(URL_TOKEN_PARAM);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      persistToken(urlToken);
    }
    setActiveApiToken(nextToken);
    setTokenDraft(nextToken);
    setTokenReady(true);
    if (nextToken) api("/api/auth/me").then((row) => setCurrentUser(row.username)).catch(() => {});
  }, [isAdminPath]);

  if (!isAdminPath) return <PublicProbePage />;

  const loadAgents = () => api("/api/agents").then((rows) => {
    setAgents(rows);
    if (!agentId && rows[0]) setAgentId(rows[0].id);
  }).catch((error) => {
    if (error.status === 401) clearToken();
    throw error;
  });

  useEffect(() => {
    if (!tokenReady) return;
    loadAgents().catch(() => {});
  }, [tokenReady]);

  useEffect(() => {
    if (!tokenReady) return;
    const timer = window.setInterval(() => {
      setLiveTick((value) => value + 1);
      loadAgents().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tokenReady]);

  useEffect(() => {
    if (!tokenReady) return;
    const source = new EventSource(buildAuthUrl("/api/events"));
    source.onmessage = () => {
      setLiveTick((value) => value + 1);
      loadAgents().catch(() => {});
    };
    source.onerror = () => {};
    return () => source.close();
  }, [tokenReady]);

  const saveToken = () => {
    const token = tokenDraft.trim();
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

  const login = (response) => {
    setActiveApiToken(response.token);
    setTokenDraft(response.token);
    setCurrentUser(response.username);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setTokenReady(true);
    loadAgents().catch(() => {});
  };

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    clearToken();
  };

  const openAgent = (id) => {
    setAgentId(id);
    setPage("detail");
  };
  const openSsh = (id) => {
    setAgentId(id);
    setPage("ssh");
  };
  const openDesktop = (id) => {
    setAgentId(id);
    setPage("desktop");
  };
  const openFiles = (id) => {
    setAgentId(id);
    setPage("files-agent");
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

  return (
    <Layout page={page} setPage={setPage} headerExtra={<HeaderAccount user={currentUser} logout={logout} />}>
      {content}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
