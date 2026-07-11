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
  randShortId
} from "./utils";
import Layout from "./components/Layout";
import StatusBadge, { StatusDot } from "./components/StatusBadge";
import ConsolePage from "./pages/ConsolePage";
import Dashboard from "./pages/Dashboard";
import MonitorPage from "./pages/MonitorPage";
import NodePoolPage from "./pages/NodePoolPage";
import MemosPage from "./pages/MemosPage";
import WorkspacePage from "./pages/WorkspacePage";
import SettingsPage from "./pages/SettingsPage";
import Audit from "./pages/Audit";
import Tutorial from "./pages/Tutorial";

const URL_TOKEN_PARAM = "token";

function isPanelApiToken(token) {
  return String(token || "").trim().startsWith("ck_");
}

const nav = [
  ["dashboard", Activity, "浠〃鐩?],
  ["servers", Monitor, "鏈嶅姟鍣?],
  ["console", PlugZap, "缁堢 / SFTP"],
  ["nodes", Code2, "鑺傜偣閰嶇疆"],
  ["node-pool", Code2, "鑺傜偣姹?],
  ["subscriptions", Link2, "璁㈤槄鑱氬悎"],
  ["forward", PlugZap, "绔彛杞彂"],
  ["monitor", Activity, "鐩戞帶鍛婅"],
  ["workspace", KeyRound, "璧勪骇 / 鍑嵁 / 鑴氭湰"],
  ["memos", ClipboardList, "Memos / 鏂囦欢"],
  ["tokens", KeyRound, "API 浠ょ墝"],
  ["audit", ClipboardList, "瀹¤鏃ュ織"],
  ["settings", Settings, "璁剧疆"]
];

const protocolDefinitions = {
  "vmess-ws": {
    name: "VMess + WebSocket",
    note: "閫傚悎璧?WebSocket 鍦烘櫙锛屽垏鎹㈠埌杩欎釜鍗忚鏃朵細鑷姩鐢熸垚鏂扮殑 UUID 鍜岃矾寰勩€?,
    defaults: () => ({
      protocol: "vmess-ws",
      port: 20080,
      listen: "::",
      uuid: newUuid(),
      path: randPath()
    }),
    fields: [
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => randPort() },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "path", label: "WS 璺緞", random: () => randPath() },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
    ]
  },
  "vless-reality": {
    name: "VLESS + Reality",
    note: "Reality 闇€瑕佹湇鍔＄绉侀挜鍜?short_id銆傚垏鎹㈠崗璁椂浼氳嚜鍔ㄥ埛鏂拌繖浜涢粯璁ゅ瓧娈碉紝浣嗚鏇挎崲鎴愪綘瀹為檯鍙敤鐨勫瘑閽ャ€?,
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
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => 443 },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "serverName", label: "SNI / 鎻℃墜鍩熷悕", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "serverPort", label: "鎻℃墜绔彛", type: "number" },
      { key: "privateKey", label: "Reality 绉侀挜" },
      { key: "publicKey", label: "Reality 鍏挜" },
      { key: "shortId", label: "Reality short_id", random: () => randShortId() },
      { key: "flow", label: "Flow" },
      { key: "clientFingerprint", label: "瀹㈡埛绔寚绾? },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
    ]
  },
  trojan: {
    name: "Trojan + TLS",
    note: "闈㈡澘涓嬪彂鏃朵細鑷姩涓哄綋鍓?inbound 鐢熸垚鑷鍚嶈瘉涔︺€傛祴璇曞鎴风鍙厛鐢?insecure 妯″紡楠岃瘉鑱旈€氭€с€?,
    defaults: () => ({
      protocol: "trojan",
      port: 443,
      listen: "::",
      password: randPassword(),
      serverName: "www.cloudflare.com"
    }),
    fields: [
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => 443 },
      { key: "password", label: "瀵嗙爜", random: () => randPassword() },
      { key: "serverName", label: "TLS 鍩熷悕", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
    ]
  },
  hysteria2: {
    name: "Hysteria2",
    note: "鍚屾牱浼氳嚜鍔ㄨˉ榻愯嚜绛惧悕璇佷功锛屽苟鎻愪緵涓婁笅琛岄€熺巼瀛楁锛屼究浜庣洿鎺ヤ粠闈㈡澘瀹屾垚鍙敤閰嶇疆銆?,
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
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => randPort() },
      { key: "password", label: "瀵嗙爜", random: () => randPassword() },
      { key: "serverName", label: "TLS 鍩熷悕", random: () => ["www.cloudflare.com", "www.microsoft.com", "www.apple.com", "www.yahoo.com"][Math.floor(Math.random() * 4)] },
      { key: "upMbps", label: "涓婅 Mbps", type: "number" },
      { key: "downMbps", label: "涓嬭 Mbps", type: "number" },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
    ]
  },
  shadowsocks: {
    name: "Shadowsocks",
    note: "榛樿鏂规硶鏀规垚浜嗘洿閫氱敤鐨?aes-256-gcm锛岄伩鍏?2022 绯诲垪瀵嗙爜闀垮害涓嶅尮閰嶅鑷寸殑鐩存帴涓嶅彲鐢ㄣ€?,
    defaults: () => ({
      protocol: "shadowsocks",
      port: 8388,
      listen: "::",
      method: "aes-256-gcm",
      password: randPassword()
    }),
    fields: [
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => randPort() },
      {
        key: "method",
        label: "鍔犲瘑鏂规硶",
        type: "select",
        options: [
          ["aes-256-gcm", "aes-256-gcm"],
          ["chacha20-ietf-poly1305", "chacha20-ietf-poly1305"],
          ["2022-blake3-aes-128-gcm", "2022-blake3-aes-128-gcm"]
        ]
      },
      { key: "password", label: "瀵嗙爜", random: () => randPassword() },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
    ]
  },
  mixed: {
    name: "Mixed HTTP/SOCKS",
    note: "杩欐槸鏈€绠€鍗曠殑鏈湴浠ｇ悊鍏ュ彛锛岄€傚悎鍏堝仛鍩虹鑱旈€氭祴璇曘€?,
    defaults: () => ({
      protocol: "mixed",
      port: 2080,
      listen: "::"
    }),
    fields: [
      { key: "port", label: "鐩戝惉绔彛", type: "number", random: () => randPort() },
      { key: "listen", label: "鐩戝惉鍦板潃", placeholder: "::" }
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
    name: "澶栭儴鍘熷鍐呭",
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
          <button type="button" className="icon-btn" onClick={random} title="闅忔満鐢熸垚">
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
        浣跨敤浠ょ墝
      </button>
      {hasToken ? (
        <button onClick={clearToken}>
          <Unplug size={15} />
          娓呴櫎
        </button>
      ) : null}
    </div>
  );
}

function AdminAuthGate({ tokenDraft, setTokenDraft, saveToken, loginDraft, setLoginDraft, loginAdmin, message }) {
  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="eyebrow">ChikenEasy Admin</p>
        <h1>鍚庡彴闇€瑕佺櫥褰?/h1>
        <p className="muted">璇蜂娇鐢ㄧ鐞嗗憳璐﹀彿鐧诲綍锛屾垨杈撳叆 ck_ 寮€澶寸殑 API Token銆俿ess_ 鏄祻瑙堝櫒浼氳瘽 ID锛屼笉闇€瑕佹墜鍔ㄥ～鍏ャ€?/p>
        <div className="form-grid">
          <Field label="鐢ㄦ埛鍚? value={loginDraft.username} onChange={(value) => setLoginDraft((current) => ({ ...current, username: value }))} placeholder="admin" />
          <Field label="瀵嗙爜" type="password" value={loginDraft.password} onChange={(value) => setLoginDraft((current) => ({ ...current, password: value }))} placeholder="绠＄悊鍛樺瘑鐮? />
        </div>
        <div className="actions">
          <button className="primary" onClick={loginAdmin}>鐧诲綍鍚庡彴</button>
        </div>
        <div className="login-divider">or API Token</div>
        <div className="form-grid">
          <Field label="API Token" value={tokenDraft} onChange={setTokenDraft} placeholder="ck_xxx" />
        </div>
        <div className="actions">
          <button className="primary" onClick={saveToken}>浣跨敤浠ょ墝</button>
        </div>
        {message ? <p className="panel-message">{message}</p> : null}
      </div>
    </div>
  );
}

function AgentEmptyState({ title = "娌℃湁鍙€?Agent" }) {
  return (
    <Panel title={title}>
      <div className="empty">娌℃湁鎷垮埌 Agent 鍒楄〃銆傝纭鍚庡彴宸茬櫥褰曘€佸彸涓婅涓嶈濉啓 sess_锛涘浣跨敤 API Token锛岃濉?ck_ 寮€澶寸殑浠ょ墝銆?/div>
    </Panel>
  );
}

function CompactEvents({ events = [] }) {
  if (!events.length) return <div className="empty">No recent monitor events.</div>;
  return (
    <div className="compact-events">
      {events.slice(0, 12).map((event, index) => (
        <div className="compact-event" key={event.id || `${event.agentId || "event"}-${event.updatedAt || index}`}>
          <span>{formatDateTime(event.updatedAt || event.at)}</span>
          <strong>{event.type || event.action || "event"}</strong>
          <em>{event.message || event.agentId || event.target || "-"}</em>
        </div>
      ))}
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
  if (!metrics) return <p className="panel-message">鎺㈤拡姝ｅ湪绛夊緟棣栦釜蹇冭烦锛岄€氬父鍑犵鍐呬細鍒锋柊銆?/p>;

  return (
    <div className="probe-grid">
      <MetricPill label="CPU" value={formatPercent(metrics.cpu?.usage)} accent="cpu" />
      <MetricPill label="鍐呭瓨" value={`${formatPercent(metrics.memory?.usage)} / ${formatBytes(metrics.memory?.used)} / ${formatBytes(metrics.memory?.total)}`} accent="memory" />
      <MetricPill label="纾佺洏" value={`${formatPercent(metrics.disk?.usage)} / ${formatBytes(metrics.disk?.used)} / ${formatBytes(metrics.disk?.total)}`} accent="disk" />
      <MetricPill label="缃戠粶" value={`鈫?${formatSpeed(metrics.network?.rxRate)}  鈫?${formatSpeed(metrics.network?.txRate)}`} accent="network" />
      <MetricPill label="绱娴侀噺" value={`鈫?${formatBytes(metrics.network?.rxTotal)}  鈫?${formatBytes(metrics.network?.txTotal)}`} />
      <MetricPill label="杩愯鏃堕暱" value={formatUptime(metrics.uptimeSec)} />
      <MetricPill label="璐熻浇" value={`${metrics.cpu?.load1 || 0} / ${metrics.cpu?.load5 || 0} / ${metrics.cpu?.load15 || 0}`} />
      <MetricPill label="鎺ュ彛" value={(metrics.network?.interfaces || []).join(", ") || "-"} />
    </div>
  );
}

function normalizeProbeHistory(history) {
  if (Array.isArray(history)) return history;
  if (Array.isArray(history?.raw)) return history.raw;
  if (Array.isArray(history?.samples)) return history.samples;
  return [];
}

function ProbeTrends({ history }) {
  const samples = normalizeProbeHistory(history);
  const latest = samples.at(-1) || {};
  const rows = [
    ["CPU", samples.map((item) => item.cpu ?? item.cpuUsage), `${formatPercent(latest.cpu ?? latest.cpuUsage ?? 0)}`],
    ["鍐呭瓨", samples.map((item) => item.memory ?? item.memoryUsage), `${formatPercent(latest.memory ?? latest.memoryUsage ?? 0)}`],
    ["涓嬭", samples.map((item) => item.rxRate ?? item.rxSpeed), formatSpeed(latest.rxRate ?? latest.rxSpeed ?? 0)],
    ["涓婅", samples.map((item) => item.txRate ?? item.txSpeed), formatSpeed(latest.txRate ?? latest.txSpeed ?? 0)]
  ];

  if (!samples.length) return <p className="panel-message">鏆傛椂杩樻病鏈夎冻澶熺殑瀹炴椂鏍锋湰鐢ㄤ簬缁樺浘銆?/p>;

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
  if (!metrics) return <span className="muted">绛夊緟鎺㈤拡</span>;
  return (
    <div className="metric-inline">
      <span>CPU {formatPercent(metrics.cpu?.usage)}</span>
      <span>MEM {formatPercent(metrics.memory?.usage)}</span>
      <span>DISK {formatPercent(metrics.disk?.usage)}</span>
    </div>
  );
}

function AgentTrafficSummary({ metrics }) {
  if (!metrics) return <span className="muted">绛夊緟鎺㈤拡</span>;
  return (
    <div className="metric-inline">
      <span>鈫?{formatSpeed(metrics.network?.rxRate)}</span>
      <span>鈫?{formatSpeed(metrics.network?.txRate)}</span>
    </div>
  );
}

function formatPublicUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (!total) return "-";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (days) return `${days} 澶?${hours} 鏃?${minutes} 鍒?${sec} 绉抈;
  if (hours) return `${hours} 鏃?${minutes} 鍒?${sec} 绉抈;
  return `${minutes} 鍒?${sec} 绉抈;
}

function usageTone(value) {
  const percent = Number(value || 0);
  if (percent >= 85) return "danger";
  if (percent >= 65) return "warn";
  return "ok";
}

function UsageLine({ label, percent, detail }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  return (
    <div className="komari-meter-row">
      <div className="komari-row-head">
        <span>{label}</span>
        <strong>{formatPercent(safePercent)}</strong>
      </div>
      <div className="komari-meter">
        <span className={usageTone(safePercent)} style={{ width: `${safePercent}%` }} />
      </div>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function PublicProbeCard({ probe }) {
  const metrics = probe.metrics || {};
  const osText = [probe.osPretty || probe.osName || probe.os || "Linux", probe.arch || ""].filter(Boolean).join(" / ");
  return (
    <article className="public-probe-card">
      <div className="public-probe-head">
        <div className="public-probe-title">
          <strong><span className="probe-flag">{probe.flag || "馃寪"}</span>{probe.name}</strong>
          <span>{probe.price ? <em>{probe.price}</em> : null}{probe.expireAt ? <em>{probe.expireAt}</em> : null}</span>
        </div>
        <StatusBadge ok={probe.online} text={probe.online ? "鍦ㄧ嚎" : "绂荤嚎"} />
      </div>
      <div className="komari-os-row">
        <span>OS</span>
        <strong>{osText}</strong>
      </div>
      <UsageLine label="CPU" percent={metrics.cpuUsage} detail={`${metrics.cpuCores || 0} cores / load ${metrics.load1 ?? 0}`} />
      <UsageLine label="鍐呭瓨" percent={metrics.memoryUsage} detail={`${formatBytes(metrics.memoryUsed)} / ${formatBytes(metrics.memoryTotal)}`} />
      <UsageLine label="纾佺洏" percent={metrics.diskUsage} detail={`${formatBytes(metrics.diskUsed)} / ${formatBytes(metrics.diskTotal)}`} />
      <div className="komari-kv-row">
        <span>鎬绘祦閲?/span>
        <strong>鈫?{formatBytes(metrics.txBytes)} 鈫?{formatBytes(metrics.rxBytes)}</strong>
      </div>
      <div className="komari-kv-row">
        <span>缃戠粶</span>
        <strong>鈫?{formatSpeed(metrics.txSpeed)} 鈫?{formatSpeed(metrics.rxSpeed)}</strong>
      </div>
      <div className="komari-kv-row">
        <span>杩愯鏃堕棿</span>
        <strong>{formatPublicUptime(metrics.uptime)}</strong>
      </div>
    </article>
  );
}

function PublicStatusPage() {
  const [summary, setSummary] = useState(null);
  const [probes, setProbes] = useState([]);
  const [events, setEvents] = useState([]);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

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
  const groups = ["鎵€鏈?, ...Array.from(new Set(probes.map((probe) => probe.group).filter(Boolean)))];
  const filteredProbes = probes.filter((probe) =>
    [probe.name, probe.group, probe.region, probe.os, probe.arch, ...(probe.tags || [])].join(" ").toLowerCase().includes(query.toLowerCase())
  );
  const nowText = new Date().toLocaleTimeString("zh-CN", { hour12: false });

  return (
    <div className="public-status">
      <div className="public-hero">
        <div className="public-brand">
          <span className="public-brand-mark">CE</span>
          <div>
            <h1>Chiken Easy</h1>
            <p>鑺傜偣瑙傛祴鍙?路 Agent Fleet Status</p>
          </div>
        </div>
        <div className="public-actions">
          <a className="admin-link" href="/admin">鍚庡彴</a>
        </div>
      </div>

      <div className="public-stats">
        <Card label="褰撳墠鏃堕棿" value={nowText} />
        <Card label="褰撳墠鍦ㄧ嚎" value={`${summary?.online ?? online} / ${summary?.total ?? probes.length}`} green />
        <Card label="鐐逛寒鍦板尯" value={summary?.regions ?? 0} blue />
        <Card label="娴侀噺姒傝" value={`鈫?${formatBytes(summary?.totalTraffic || 0)}`} />
        <Card label="缃戠粶閫熺巼" value={`鈫?${formatSpeed(summary?.totalTxSpeed || 0)} / 鈫?${formatSpeed(summary?.totalRxSpeed || 0)}`} />
      </div>

      <div className="public-filter">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="鎼滅储鑺傜偣鍚嶇О銆佸湴鍖恒€佺郴缁?.." />
        <div className="public-groups">
          <span>鍒嗙粍</span>
          {groups.slice(0, 6).map((group) => <button key={group}>{group}</button>)}
        </div>
        <p>鍏?{probes.length} 涓湇鍔″櫒锛寋online} 涓湪绾?/p>
      </div>

      <div className="public-probe-grid">
        {filteredProbes.map((probe) => <PublicProbeCard key={probe.id} probe={probe} />)}
      </div>

      <div className="public-events">
        <h2>鏈€杩戜簨浠?/h2>
        {events.length ? (
          events.slice(0, 8).map((event) => (
            <div className="public-event" key={event.id || `${event.agentId}-${event.updatedAt}`}>
              <span>{formatDateTime(event.updatedAt)}</span>
              <strong>{event.type}</strong>
              <em>{event.message || event.agentId}</em>
            </div>
          ))
        ) : (
          <div className="empty">鏆傛棤鍏紑浜嬩欢銆?/div>
        )}
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </div>
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
        鐢熸垚鎺ュ叆 Token
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
        <input placeholder="鎸夊悕绉?/ 涓绘満 / IP / 鏍囩绛涢€? value={query} onChange={(event) => setQuery(event.target.value)} />
        <TokenButton />
      </div>
      <Panel title="鏈嶅姟鍣?>
        <AgentTable agents={filtered} openAgent={openAgent} openSsh={openSsh} />
      </Panel>
    </section>
  );
}

function AgentTable({ agents, openAgent, openSsh }) {
  if (!agents.length) {
    return <div className="empty">No Agent data yet. Please confirm the admin session is valid and wait for Agent heartbeat.</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>鍚嶇О</th>
          <th>涓绘満</th>
          <th>IP</th>
          <th>鏋舵瀯</th>
          <th>鍦ㄧ嚎</th>
          <th>sing-box</th>
          <th>鐗堟湰</th>
          <th>SSH</th>
          <th>鐩戞帶</th>
          <th>缃戠粶</th>
          <th>鏈€杩戝績璺?/th>
          <th>鎿嶄綔</th>
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
            <td>{agent.sshConfigured ? `${agent.sshMode}@${agent.sshPort}` : "鏈厤缃?}</td>
            <td>
              <AgentMetricSummary metrics={agent.metrics} />
            </td>
            <td>
              <AgentTrafficSummary metrics={agent.metrics} />
            </td>
            <td>{agent.lastSeen || "-"}</td>
            <td className="actions-cell">
              <button className="link" onClick={() => openAgent(agent.id)}>
                璇︽儏
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
    if (!window.confirm("纭鍗歌浇杩欏彴鏈哄櫒涓婄殑 Agent 鍚楋紵鍗歌浇鍚庡畠浼氱绾匡紝闇€瑕侀噸鏂板畨瑁呭悗鎵嶈兘鎺ュ叆銆?)) return;
    const response = await api(`/api/agents/${id}/uninstall`, { method: "POST", body: JSON.stringify({ removeSingbox: false }) });
    setResult(JSON.stringify(response, null, 2));
  };

  if (!agent) return null;
  const infoEntries = Object.entries(agent).filter(([key]) => !["metrics", "metricsHistory", "lastConfig"].includes(key));

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>杩斿洖</button>
        <h1>
          {agent.name} <StatusDot on={agent.connected} />
          {agent.connected ? "online" : "offline"}
        </h1>
        <button onClick={() => service("status")}>鏌ヨ鐘舵€?/button>
        <button onClick={openConfig}>閰嶇疆</button>
        <button onClick={openLogs}>鏃ュ織</button>
        <button onClick={openSsh}>SSH</button>
        <button onClick={openConsole}>SFTP</button>
        <button onClick={openMemos}>鍏宠仈绗旇</button>
        <button className="red-bg" onClick={uninstall}>
          鍗歌浇 Agent
        </button>
      </div>

      <div className="grid2">
        <Panel title="瀹炴椂鎺㈤拡">
          <ProbeOverview metrics={agent.metrics} />
        </Panel>

        <Panel title="鏈嶅姟鎺у埗">
          <div className="actions">
            <button className="green-bg" onClick={() => service("start")}>
              鍚姩
            </button>
            <button className="blue-bg" onClick={() => service("restart")}>
              閲嶅惎
            </button>
            <button className="red-bg" onClick={() => service("stop")}>
              鍋滄
            </button>
            <button onClick={() => service("status")}>鍒锋柊鐘舵€?/button>
          </div>
          <pre>{result}</pre>
        </Panel>
      </div>

      <Panel title="鐩戞帶瓒嬪娍">
        <ProbeTrends history={agent.metricsHistory} />
      </Panel>

      <div className="grid2">
        <Panel title="鍩烘湰淇℃伅">
          <dl>
            {infoEntries.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </Panel>

        <Panel title="鎺㈤拡鎽樿">
          <div className="panel-stack">
            <p className="muted">CPU: {formatPercent(agent.metrics?.cpu?.usage)}</p>
            <p className="muted">鍐呭瓨: {formatBytes(agent.metrics?.memory?.used)} / {formatBytes(agent.metrics?.memory?.total)}</p>
            <p className="muted">纾佺洏: {formatBytes(agent.metrics?.disk?.used)} / {formatBytes(agent.metrics?.disk?.total)}</p>
            <p className="muted">涓嬭: {formatSpeed(agent.metrics?.network?.rxRate)}</p>
            <p className="muted">涓婅: {formatSpeed(agent.metrics?.network?.txRate)}</p>
            <p className="muted">绱娴侀噺: 鈫?{formatBytes(agent.metrics?.network?.rxTotal)} / 鈫?{formatBytes(agent.metrics?.network?.txTotal)}</p>
          </div>
        </Panel>
      </div>

      <Panel title="鍏宠仈绗旇">
        {agent.memos?.length ? (
          <table>
            <thead>
              <tr>
                <th>鏍囬</th>
                <th>鏍囩</th>
                <th>鏇存柊鏃堕棿</th>
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
          <div className="empty">杩欏彴鏈嶅姟鍣ㄨ繕娌℃湁鍏宠仈澶囧繕褰曘€?/div>
        )}
      </Panel>
    </section>
  );
}

function TerminalPanel({ agentId, agentName, mode, connectNonce, fallbackToAgent }) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const wsRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    setConnected(false);
    setError("");
    setCloseReason("");
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
        setError("缁堢 WebSocket 杩炴帴澶辫触锛岃妫€鏌ヤ細璇濄€佸弽鍚戜唬鐞嗘垨鍒锋柊鍚庨噸璇曘€?);
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.output) term.write(message.output);
        if (message.type === "status" && message.status === "connected") setConnected(true);
        if (message.type === "error") {
          setCloseReason(message.reason || "terminal_error");
          setError(message.output || message.reason || "缁堢杩炴帴澶辫触");
        }
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
      if (!disposed) setError("缁堢鍒濆鍖栧け璐ャ€?);
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
      title={`${mode === "ssh" ? "SSH 缁堢" : "Agent 鎵ц"} - ${agentName}`}
      right={
        <span>
          <StatusDot on={connected} />
          {connected ? "connected" : "closed"}
        </span>
      }
    >
      <div className="terminal-toolbar">
        {mode === "ssh" ? <button onClick={fallbackToAgent}>鏀圭敤 Agent 鎵ц</button> : null}
        <button onClick={() => sendControl("\u0003")} disabled={!connected}>
          Ctrl+C
        </button>
        <button onClick={() => sendControl("\u000c")} disabled={!connected}>
          Clear
        </button>
        <span className="muted">鏀寔鍘熷鎸夐敭銆佺矘璐村拰绐楀彛鑷姩璋冩暣澶у皬銆?/span>
      </div>
      <div className="terminal-shell" ref={boxRef} />
      {closeReason ? <p className="panel-message">鍏抽棴鍘熷洜锛歿closeReason}</p> : null}
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
      setMessage("SSH 閰嶇疆宸蹭繚瀛樸€?);
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
      setMessage(type === "password" ? "SSH 瀵嗙爜宸叉竻闄ゃ€? : "SSH 绉侀挜宸叉竻闄ゃ€?);
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
      setMessage(response.output || "SSH 杩炴帴娴嬭瘯閫氳繃銆?);
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
      setDeployResult(`鑴氭湰鍦板潃锛?{response.scriptUrl}\n杩囨湡鏃堕棿锛?{response.expiresAt}\n杩炴帴鍦板潃锛?{response.wsUrl}`);
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
    setDeployResult("閮ㄧ讲鍛戒护宸插鍒跺埌鍓创鏉裤€?);
  };

  const deploy = async () => {
    try {
      setDeployBusy(true);
      const response = await api(`/api/agents/${id}/deploy`, {
        method: "POST",
        body: JSON.stringify({ mode: deployMode, appDir: deployAppDir })
      });
      setDeployPreview(response.command || "");
      setDeployResult(response.output || "閮ㄧ讲鍛戒护鎵ц瀹屾垚銆?);
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
        <button onClick={back}>杩斿洖</button>
        <h1>SSH - {agent.name}</h1>
        <button onClick={() => setConnectNonce((value) => value + 1)}>
          <RefreshCw size={16} />
          閲嶈繛
        </button>
      </div>

      <TerminalPanel agentId={id} agentName={agent.name} mode={mode} connectNonce={connectNonce} fallbackToAgent={() => { setMode("agent"); setConnectNonce((value) => value + 1); }} />

      <div className="grid2 ssh-grid">
        <Panel title="SSH 閰嶇疆" right={<span className="muted">鍒楄〃閲岀殑 SSH 鐜板湪浼氱洿鎺ヨ繘鍏ヨ繖涓粓绔?/span>}>
          <div className="form-grid">
            <Field label="涓绘満" value={profile.host} onChange={(value) => patch("host", value)} />
            <Field label="绔彛" type="number" value={profile.port} onChange={(value) => patch("port", value)} />
            <Field label="鐢ㄦ埛鍚? value={profile.username} onChange={(value) => patch("username", value)} />
            <Field
              label="璁よ瘉鏂瑰紡"
              type="select"
              value={profile.mode}
              onChange={(value) => patch("mode", value)}
              options={[
                ["password", "瀵嗙爜"],
                ["privateKey", "绉侀挜"]
              ]}
            />
            {profile.mode === "password" ? <Field label="瀵嗙爜" type="password" value={profile.password} onChange={(value) => patch("password", value)} /> : null}
            {profile.mode === "privateKey" ? <Field label="绉侀挜" type="textarea" rows={6} value={profile.privateKey} onChange={(value) => patch("privateKey", value)} /> : null}
          </div>

          <div className="actions">
            <button className="primary" onClick={save}>
              淇濆瓨 SSH
            </button>
            <button onClick={test}>娴嬭瘯杩炴帴</button>
            <button onClick={() => setMode("ssh")} disabled={!profile.ready && !profile.password && !profile.privateKey}>
              鐢?SSH 杩炴帴
            </button>
            <button onClick={() => setMode("agent")}>鏀圭敤 Agent 鎵ц</button>
            {profile.mode === "password" && profile.hasPassword ? <button onClick={() => clearSecret("password")}>娓呴櫎宸插瓨瀵嗙爜</button> : null}
            {profile.mode === "privateKey" && profile.hasPrivateKey ? <button onClick={() => clearSecret("privateKey")}>娓呴櫎宸插瓨绉侀挜</button> : null}
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>

        <Panel title="涓€閿儴缃?Agent" right={<span className="muted">鏀寔 systemd 鍜?Docker锛屼袱绉嶆柟寮忛兘浼氬鐢ㄥ綋鍓?SSH 鍑嵁</span>}>
          <div className="form-grid">
            <Field
              label="閮ㄧ讲鏂瑰紡"
              type="select"
              value={deployMode}
              onChange={(value) => setDeployMode(value)}
              options={[
                ["service", "systemd / Node"],
                ["docker", "Docker Compose"]
              ]}
            />
            <Field label="瀹夎鐩綍" value={deployAppDir} onChange={setDeployAppDir} />
          </div>
          <p className="panel-tip">`systemd` 鏇撮€傚悎鏈哄櫒涓婂凡缁忔湁 sing-box 鏈嶅姟鐨勫満鏅紱`Docker` 浼氬悓鏃跺噯澶?agent 瀹瑰櫒銆乻ing-box 瀹瑰櫒鍜屾帰閽堟寕杞姐€?/p>
          <div className="actions">
            <button onClick={previewDeploy}>鐢熸垚鍛戒护</button>
            <button onClick={copyDeploy}>澶嶅埗鍛戒护</button>
            <button className="primary" onClick={deploy} disabled={deployBusy || !profile.ready}>
              {deployBusy ? "閮ㄧ讲涓?.." : "閫氳繃 SSH 绔嬪嵆閮ㄧ讲"}
            </button>
          </div>
          <pre>{deployPreview || "鍏堢偣鍑烩€滅敓鎴愬懡浠も€濓紝鍙互鎷垮埌鍙洿鎺ョ矘璐存墽琛岀殑涓€閿儴缃插懡浠ゃ€?}</pre>
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

  if (!agents.length) return <AgentEmptyState title="鑺傜偣閰嶇疆闇€瑕佸厛閫夋嫨 Agent" />;

  return (
    <section>
      <div className="grid2">
        <Panel title="鑺傜偣閰嶇疆" right={<button onClick={renderPreview}>棰勮 JSON</button>}>
          <div className="form-grid">
            <Field
              label="鏈嶅姟鍣?
              type="select"
              value={form.agentId}
              onChange={(value) => patch("agentId", value)}
              options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])}
            />
            <Field
              label="鍗忚"
              type="select"
              value={form.protocol}
              onChange={switchProtocol}
              options={Object.entries(protocolDefinitions).map(([id, item]) => [id, item.name])}
            />
            <Field label="璁㈤槄鑺傜偣鍚嶇О" value={form.exportName || ""} onChange={(value) => patch("exportName", value)} placeholder="榛樿鐢ㄦ湇鍔″櫒鍚?+ 鍗忚鍚? />
            <Field label="璁㈤槄鍑哄彛鍦板潃" value={form.exportHost || ""} onChange={(value) => patch("exportHost", value)} placeholder="榛樿浣跨敤璇ユ湇鍔″櫒 IP" />
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
          <div className="panel-tip">杩欓噷濉啓鐨勨€滆闃呭嚭鍙ｅ湴鍧€鈥濅細鐢ㄤ簬璁㈤槄鑱氬悎瀵煎嚭锛沗VLESS + Reality` 鎯宠璁㈤槄鍙洿鎺ョ敤锛岃繕瑕佹妸瀵瑰簲鍏挜涓€璧峰～杩涘幓銆?/div>
          <div className="actions">
            <button className="primary" onClick={apply}>
              涓嬪彂骞堕噸鍚?
            </button>
          </div>
          <pre>{result}</pre>
        </Panel>

        <Panel title="鐢熸垚棰勮">
          <pre className="preview">{preview || "鐐瑰嚮棰勮 JSON 鏌ョ湅 sing-box 閰嶇疆"}</pre>
        </Panel>
      </div>
    </section>
  );
}

function ForwardRuleTable({ rules, removeRule }) {
  if (!rules.length) return <div className="empty">褰撳墠娌℃湁鐙珛杞彂瑙勫垯</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>鍚嶇О</th>
          <th>寮曟搸</th>
          <th>缃戠粶</th>
          <th>鐩戝惉</th>
          <th>鐩爣</th>
          <th>鐘舵€?/th>
          <th>鎿嶄綔</th>
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
                鍒犻櫎
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
    if (!window.confirm(`纭鍒犻櫎杞彂瑙勫垯 ${rule.name} 鍚楋紵`)) return;
    try {
      const response = await api(`/api/agents/${form.agentId}/forwards/${rule.id}`, { method: "DELETE" });
      setResult(JSON.stringify(response, null, 2));
      await loadRules(form.agentId);
    } catch (error) {
      setResult(error.message);
    }
  };

  if (!agents.length) return <AgentEmptyState title="绔彛杞彂闇€瑕佸厛閫夋嫨 Agent" />;

  return (
    <section>
      <div className="grid2">
        <Panel title="绔彛杞彂" right={<button onClick={renderPreview}>棰勮 JSON</button>}>
          <div className="form-grid">
            <Field
              label="鏈嶅姟鍣?
              type="select"
              value={form.agentId}
              onChange={(value) => patch("agentId", value)}
              options={agents.map((agent) => [agent.id, `${agent.name} - ${agent.ip}`])}
            />
            <Field label="瑙勫垯鍚嶇О" value={form.name} onChange={(value) => patch("name", value)} placeholder="鐣欑┖浼氳嚜鍔ㄧ敓鎴? />
            <Field label="杞彂寮曟搸" type="select" value={form.engine} onChange={(value) => patch("engine", value)} options={forwardEngineOptions} />
            <Field label="缃戠粶" type="select" value={form.network} onChange={(value) => patch("network", value)} options={forwardNetworkOptions} />
            <Field label="鐩戝惉鍦板潃" value={form.listen} onChange={(value) => patch("listen", value)} placeholder="0.0.0.0" />
            <Field label="鍏綉鐩戝惉绔彛" type="number" value={form.port} onChange={(value) => patch("port", value)} random={() => patch("port", randPort())} />
            <Field label="鐩爣鍦板潃" value={form.targetHost} onChange={(value) => patch("targetHost", value)} />
            <Field label="鐩爣绔彛" type="number" value={form.targetPort} onChange={(value) => patch("targetPort", value)} />
          </div>
          <div className="panel-tip">杞彂鐜板湪浼氫互鐙珛瀹瑰櫒杩愯锛屼笉鍐嶈鐩栧綋鍓嶈妭鐐归厤缃€備綘鍙互鎸夐渶鍦?sing-box銆丷ealm銆丟OST 涔嬮棿鍒囨崲銆?/div>
          <div className="actions">
            <button className="primary" onClick={apply}>
              涓嬪彂骞跺惎鍔?
            </button>
          </div>
          <pre>{result}</pre>
        </Panel>

        <Panel title="鐢熸垚棰勮">
          <pre className="preview">{preview || "鐐瑰嚮棰勮 JSON 鏌ョ湅杞彂璁″垝"}</pre>
        </Panel>
      </div>

      <Panel title="褰撳墠杞彂瑙勫垯" right={<button onClick={() => loadRules(form.agentId)}>鍒锋柊</button>}>
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
      setMessage("璇峰厛绮樿创澶栭儴鍘熷璁㈤槄鍐呭銆?);
      return;
    }
    setForm((current) => ({
      ...current,
      imports: [
        ...current.imports,
        {
          ...draftImport,
          name: draftImport.name.trim() || `瀵煎叆 ${current.imports.length + 1}`
        }
      ]
    }));
    setDraftImport(defaultSubscriptionImport());
    setMessage("澶栭儴鍘熷鍐呭宸插姞鍏ュ綋鍓嶈闃呰崏绋裤€?);
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
      setMessage(`宸茶浇鍏ヨ闃咃細${profile.name}`);
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
      setMessage(regenerateToken ? "璁㈤槄宸蹭繚瀛橈紝骞堕噸鏂扮敓鎴愪簡鏂扮殑璁㈤槄閾炬帴銆? : "璁㈤槄宸蹭繚瀛樸€?);
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
    if (!window.confirm(`纭鍒犻櫎璁㈤槄 ${form.name} 鍚楋紵`)) return;
    try {
      await api(`/api/subscriptions/${form.id}`, { method: "DELETE" });
      resetComposer();
      setMessage("璁㈤槄宸插垹闄ゃ€?);
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
      setMessage(form.id ? `宸茬敓鎴?${response.proxyCount} 涓妭鐐圭殑璁㈤槄棰勮銆俙 : `宸茬敓鎴?${response.proxyCount} 涓妭鐐圭殑璁㈤槄棰勮銆備繚瀛樺悗璁㈤槄閾炬帴鎵嶄細姝ｅ紡鐢熸晥銆俙);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const copyLink = async () => {
    if (!form.id) {
      setMessage("鍏堜繚瀛樿闃咃紝鍏紑璁㈤槄閾炬帴鎵嶄細鐪熸鐢熸晥銆?);
      return;
    }
    const nextLink = link || profiles.find((item) => item.id === form.id)?.url || "";
    if (!nextLink) {
      setMessage("鍏堥瑙堟垨淇濆瓨涓€娆★紝鎷垮埌璁㈤槄閾炬帴鍚庡啀澶嶅埗銆?);
      return;
    }
    await navigator.clipboard.writeText(nextLink);
    setMessage("璁㈤槄閾炬帴宸插鍒躲€?);
  };

  const copyUri = async () => {
    if (!uriPreview) {
      await renderPreview();
      return;
    }
    await navigator.clipboard.writeText(uriPreview);
    setMessage("鍘熷 URI 鍒楄〃宸插鍒躲€?);
  };

  return (
    <section>
      <div className="grid2 subscription-grid">
        <Panel title="璁㈤槄鍒楄〃" right={<button onClick={resetComposer}>鏂板缓璁㈤槄</button>}>
          <div className="subscription-list">
            {profiles.length ? (
              profiles.map((profile) => (
                <button key={profile.id} className={`subscription-card ${form.id === profile.id ? "active" : ""}`} onClick={() => openProfile(profile.id)}>
                  <strong>{profile.name}</strong>
                  <span>{profile.template}</span>
                  <span>
                    {profile.localNodeCount} 涓湰鍦拌妭鐐?/ {profile.importCount} 浠藉閮ㄥ鍏?
                  </span>
                </button>
              ))
            ) : (
              <div className="empty">杩樻病鏈夎闃呰仛鍚堥厤缃€?/div>
            )}
          </div>
        </Panel>

        <div className="panel-stack">
          <Panel title="璁㈤槄缂栨帓" right={<span className="muted">鏀寔鏈湴鑺傜偣銆佸閮ㄥ師濮嬪唴瀹瑰拰妯℃澘鍒囨崲</span>}>
            <div className="form-grid">
              <Field label="璁㈤槄鍚嶇О" value={form.name || ""} onChange={(value) => patch("name", value)} placeholder="渚嬪锛氬姙鍏満鎴胯仛鍚? />
              <Field label="璁㈤槄妯℃澘" type="select" value={form.template || "clash-basic"} onChange={(value) => patch("template", value)} options={templateOptions} />
            </div>
            <div className="panel-tip">鏈湴鑺傜偣鏉ヨ嚜浣犲凡缁忓湪鈥滆妭鐐归厤缃€濋噷涓嬪彂杩囩殑鏈嶅姟鍣紱澶栭儴鍐呭鍙互鐩存帴绮樿创 Clash YAML銆乁RI 鍒楄〃锛屾垨鑰?Base64 璁㈤槄姝ｆ枃銆?/div>
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
                          {node.protocolLabel} 路 {node.server}:{node.port || "-"}
                        </span>
                        <span>{node.ready ? "鍙洿鎺ュ鍑哄埌璁㈤槄" : node.reason}</span>
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="empty">鍏堝幓鈥滆妭鐐归厤缃€濋〉闈㈣嚦灏戜笅鍙戜竴娆¤妭鐐癸紝璁㈤槄鑱氬悎杩欓噷鎵嶄細鍑虹幇鍙€夐」銆?/div>
              )}
            </div>
            <div className="actions">
              <button className="primary" onClick={() => saveProfile(false)}>
                淇濆瓨璁㈤槄
              </button>
              <button onClick={renderPreview}>鐢熸垚棰勮</button>
              <button onClick={copyLink}>澶嶅埗璁㈤槄閾炬帴</button>
              <button onClick={copyUri}>澶嶅埗鍘熷 URI</button>
              <button onClick={() => saveProfile(true)} disabled={!form.id}>
                閲嶇疆璁㈤槄閾炬帴
              </button>
              <button className="red-bg" onClick={deleteProfile}>
                {form.id ? "鍒犻櫎璁㈤槄" : "娓呯┖鑽夌"}
              </button>
            </div>
            {message ? <p className="panel-message">{message}</p> : null}
          </Panel>

          <Panel title="澶栭儴鍘熷鍐呭瀵煎叆" right={<span className="muted">涓嶆槸璁㈤槄閾炬帴锛岃€屾槸鐩存帴绮樿创璁㈤槄姝ｆ枃</span>}>
            <div className="form-grid">
              <Field label="瀵煎叆鍚嶇О" value={draftImport.name} onChange={(value) => setDraftImport((current) => ({ ...current, name: value }))} />
            </div>
            <div className="subscription-editor">
              <label>
                鍘熷鍐呭
                <textarea
                  className="inline-textarea"
                  rows={10}
                  value={draftImport.content}
                  onChange={(event) => setDraftImport((current) => ({ ...current, content: event.target.value }))}
                  placeholder="鏀寔涓夌鏍煎紡锛?. Clash YAML锛堣嚦灏戝惈 proxies:锛夛紱2. 绾?URI 鍒楄〃锛?. Base64 缂栫爜鍚庣殑璁㈤槄姝ｆ枃銆?
                />
              </label>
            </div>
            <div className="actions">
              <button onClick={addImport}>鍔犲叆褰撳墠璁㈤槄</button>
            </div>
            <div className="subscription-import-list">
              {form.imports.length ? (
                form.imports.map((item) => (
                  <div className="subscription-import-item" key={item.id}>
                    <div className="subscription-import-head">
                      <strong>{item.name}</strong>
                      <button className="link" onClick={() => removeImport(item.id)}>
                        绉婚櫎
                      </button>
                    </div>
                    <pre>{item.content.slice(0, 420)}{item.content.length > 420 ? "\n..." : ""}</pre>
                  </div>
                ))
              ) : (
                <div className="empty">鏆傛椂杩樻病鏈夊閮ㄥ師濮嬪唴瀹瑰鍏ャ€?/div>
              )}
            </div>
          </Panel>

          <Panel title="璁㈤槄棰勮" right={form.id && link ? <span className="muted">{link}</span> : <span className="muted">淇濆瓨鍚庝細鐢熸垚鍙闂殑璁㈤槄閾炬帴</span>}>
            {warnings.length ? (
              <div className="subscription-warnings">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <pre className="preview subscription-preview">{preview || "鐐瑰嚮鈥滅敓鎴愰瑙堚€濆悗锛岃繖閲屼細鏄剧ず娓叉煋鍚庣殑 Clash 妯℃澘鍐呭銆?}</pre>
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
      setMessage(first.config ? "宸茶鍙栧綋鍓嶇紦瀛橀厤缃€? : "宸茶姹?Agent 璇诲彇閰嶇疆锛岀◢鍚庡啀鐐逛竴娆″彲鎷垮埌鏈€鏂扮粨鏋溿€?);
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
        <button onClick={back}>杩斿洖</button>
        <h1>sing-box 閰嶇疆</h1>
        <button onClick={readCurrent}>璇诲彇褰撳墠</button>
        <button onClick={format}>鏍煎紡鍖?/button>
        <button
          onClick={() => {
            JSON.parse(text);
            setMessage("JSON 鏍￠獙閫氳繃");
          }}
        >
          鏍￠獙
        </button>
        <button className="primary" onClick={apply}>
          搴旂敤骞堕噸鍚?
        </button>
      </div>

      <div className="grid-config">
        <Panel title="JSON 缂栬緫鍣? right={<span>{new Blob([text]).size} bytes</span>}>
          <textarea value={text} onChange={(event) => setText(event.target.value)} spellCheck={false} />
          <p className="panel-message">{message}</p>
        </Panel>

        <Panel title="鍘嗗彶鐗堟湰" right={<button onClick={loadVersions}>鍒锋柊</button>}>
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
                    setMessage("宸茶姹傚洖婊氥€?);
                  }}
                >
                  <RotateCcw size={15} />
                  鍥炴粴
                </button>
              </div>
            ))
          ) : (
            <div className="empty">鏆傛棤鏁版嵁</div>
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
        <button onClick={back}>杩斿洖</button>
        <h1>sing-box 鏃ュ織</h1>
        <button onClick={() => setCount(Math.max(50, count - 50))}>-</button>
        <input className="small" value={count} onChange={(event) => setCount(Number(event.target.value) || 200)} />
        <button onClick={() => setCount(count + 50)}>+</button>
        <button className="red-bg" onClick={() => setLines([])}>
          <Trash2 size={16} />
          娓呭睆
        </button>
      </div>

      <Panel title={<><StatusDot on />瀹炴椂鏃ュ織</>} right={<span>{lines.length} 琛?/span>}>
        <pre className="logs">{lines.join("\n")}</pre>
      </Panel>
    </section>
  );
}

    api(`/api/public/probes/history?agentId=${encodeURIComponent(selectedAgentId)}`)
      .then(setHistory)
      .catch((error) => setMessage(error.message));
  }, [selectedAgentId]);

  return (
    <section>
      <div className="stats">
        <Card label="鍏紑鎺㈤拡" value={summary?.total || 0} />
        <Card label="鍦ㄧ嚎" value={summary?.online || 0} green />
        <Card label="绂荤嚎" value={summary?.offline || 0} />
        <Card label="鍦板尯鏁? value={summary?.regions || 0} blue />
        <Card label="鎬绘祦閲? value={formatBytes(summary?.totalTraffic || 0)} />
        <Card label="瀹炴椂涓嬭" value={formatSpeed(summary?.totalRxSpeed || 0)} />
        <Card label="瀹炴椂涓婅" value={formatSpeed(summary?.totalTxSpeed || 0)} />
      </div>

      <Panel title="鍏紑鎺㈤拡鍗＄墖" right={<button onClick={() => load().catch(() => {})}>鍒锋柊</button>}>
        {probes.length ? (
          <div className="card-grid">
            {probes.map((probe) => (
              <div className="data-card" key={probe.id}>
                <div className="data-card-head">
                  <strong>{probe.flag ? `${probe.flag} ` : ""}{probe.name}</strong>
                  <span>{probe.online ? "online" : "offline"}</span>
                </div>
                <p className="muted">{probe.group || "鏈垎缁?} / {probe.region || "鏈爣娉ㄥ湴鍖?}</p>
                <p className="muted">CPU {formatPercent(probe.metrics?.cpuUsage)} / MEM {formatPercent(probe.metrics?.memoryUsage)} / DISK {formatPercent(probe.metrics?.diskUsage)}</p>
                <p className="muted">鈫?{formatSpeed(probe.metrics?.rxSpeed)} / 鈫?{formatSpeed(probe.metrics?.txSpeed)}</p>
                <div className="actions">
                  <button onClick={() => setSelectedAgentId(probe.id)}>鐪嬪巻鍙?/button>
                  <button onClick={() => openAgent(probe.id)}>璇︽儏</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">鏆傛椂娌℃湁鍏紑鎺㈤拡鏁版嵁銆?/div>
        )}
      </Panel>

      <div className="grid2">
        <Panel
          title="鍘嗗彶瓒嬪娍"
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

        <Panel title="鏈€杩戜簨浠?>
          <CompactEvents events={events} />
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

        method: "POST",
        body: JSON.stringify(sourceForm)
      });
      setSourceForm({ name: "", url: "", username: "", password: "", removeMissing: false });
      setMessage("璁㈤槄婧愬凡淇濆瓨銆?);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const syncSource = async (id) => {
    try {
      const response = await api(`/api/subscription-sources/${id}/sync`, { method: "POST" });
      setMessage(`鍚屾瀹屾垚锛屽鍏?${response.count} 鏉★紝鍙樻洿 ${response.changed} 鏉°€俙);
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
      setMessage(`鎺㈡祴瀹屾垚锛屽叡 ${response.results?.length || 0} 涓妭鐐广€俙);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const exportNodes = async (format) => {
    try {
      const body = await fetchText(`/api/node-pool/export?format=${encodeURIComponent(format)}`);
      await copyText(body);
      setMessage(`${format} 瀵煎嚭缁撴灉宸插鍒跺埌鍓创鏉裤€俙);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeNode = async (id) => {
    if (!window.confirm("纭鍒犻櫎杩欎釜鑺傜偣鍚楋紵")) return;
    try {
      await api(`/api/node-pool/${id}`, { method: "DELETE" });
      setMessage("鑺傜偣宸插垹闄ゃ€?);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="鑺傜偣瀵煎叆">
          <div className="form-grid">
            <Field label="鏉ユ簮鍚嶇О" value={importName} onChange={setImportName} />
            <Field label="鍘熷鍐呭" type="textarea" rows={10} value={importContent} onChange={setImportContent} placeholder="鏀寔 vmess/vless/trojan/ss/hysteria2 URI銆丆lash/Mihomo YAML銆乻ing-box outbound JSON銆乥ase64 璁㈤槄銆? />
          </div>
          <div className="actions">
            <button className="primary" onClick={importNodes}>瀵煎叆鑺傜偣</button>
            <button onClick={() => exportNodes("base64")}>澶嶅埗 Base64</button>
            <button onClick={() => exportNodes("clash")}>澶嶅埗 Clash</button>
            <button onClick={() => exportNodes("sing-box")}>澶嶅埗 sing-box</button>
          </div>
        </Panel>

        <Panel title="璁㈤槄婧愬悓姝?>
          <div className="form-grid">
            <Field label="鍚嶇О" value={sourceForm.name} onChange={(value) => setSourceForm((current) => ({ ...current, name: value }))} />
            <Field label="URL" value={sourceForm.url} onChange={(value) => setSourceForm((current) => ({ ...current, url: value }))} />
            <Field label="鐢ㄦ埛鍚? value={sourceForm.username} onChange={(value) => setSourceForm((current) => ({ ...current, username: value }))} />
            <Field label="瀵嗙爜" type="password" value={sourceForm.password} onChange={(value) => setSourceForm((current) => ({ ...current, password: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={createSource}>淇濆瓨璁㈤槄婧?/button>
          </div>
          {sources.length ? (
            <table>
              <thead>
                <tr>
                  <th>鍚嶇О</th>
                  <th>URL</th>
                  <th>鏇存柊鏃堕棿</th>
                  <th>鎿嶄綔</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>{source.url || "-"}</td>
                    <td>{formatDateTime(source.updatedAt)}</td>
                    <td><button className="link" onClick={() => syncSource(source.id)}>绔嬪嵆鍚屾</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">杩樻病鏈夎闃呮簮銆?/div>
          )}
        </Panel>
      </div>

      <Panel title="鑺傜偣姹? right={<button onClick={runChecks} disabled={!nodes.length}>鎵归噺 Proxy Check</button>}>
        {nodes.length ? (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>鍚嶇О</th>
                <th>鍗忚</th>
                <th>鍦板潃</th>
                <th>鏍囩</th>
                <th>鍦板尯</th>
                <th>鍋ュ悍</th>
                <th>鍒嗘暟</th>
                <th>鏈€杩戞鏌?/th>
                <th>鎿嶄綔</th>
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
                  <td><button className="link" onClick={() => removeNode(node.id)}>鍒犻櫎</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">杩樻病鏈夎妭鐐广€?/div>
        )}
      </Panel>

      <div className="grid2">
        <Panel title="鏈€杩戞鏌ョ粨鏋?>
          {checks.length ? (
            <table>
              <thead>
                <tr>
                  <th>鑺傜偣</th>
                  <th>缁撴灉</th>
                  <th>寤惰繜</th>
                  <th>妫€鏌ヨ€?/th>
                  <th>閿欒</th>
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
            <div className="empty">杩樻病鏈夋帰娴嬬粨鏋溿€?/div>
          )}
        </Panel>

        <Panel title="璁㈤槄璁块棶鏃ュ織">
          {accessRows.length ? (
            <table>
              <thead>
                <tr>
                  <th>鏃堕棿</th>
                  <th>璁㈤槄</th>
                  <th>鏉ユ簮 IP</th>
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
            <div className="empty">杩樻病鏈夎闂褰曘€?/div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}




                <td>{row.revoked ? null : <button className="link" onClick={() => revoke(row.id)}>鎾ら攢</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}


  const [authorized, setAuthorized] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [loginDraft, setLoginDraft] = useState({ username: "admin", password: "" });
  const [memoAgentFilter, setMemoAgentFilter] = useState("");

  const refreshAuth = async () => {
    try {
      const status = await api("/api/auth/status");
      setAuthorized(Boolean(status.authorized));
      setAuthMessage(status.authorized ? "" : "璇蜂娇鐢ㄥ悗鍙扮櫥褰曟€佹垨 ck_ API Token銆?);
      setAuthReady(true);
      return Boolean(status.authorized);
    } catch (error) {
      setAuthorized(false);
      setAuthMessage(error.message);
      setAuthReady(true);
      return false;
    }
  };

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
    refreshAuth().catch(() => {});
  }, [isAdminPath]);

  const loadAgents = () => api("/api/agents").then(setAgents);

  useEffect(() => {
    if (!isAdminPath) return;
    if (!tokenReady) return;
    if (!authorized) return;
    loadAgents().catch(() => {});
    const timer = setInterval(() => loadAgents().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [isAdminPath, tokenReady, authorized]);

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
    ensureTokenSession(token)
      .then(refreshAuth)
      .then((ok) => {
        if (ok) loadAgents().catch(() => {});
      })
      .catch((error) => {
        setAuthorized(false);
        setAuthMessage(error.message);
      });
  };

  const loginAdmin = async () => {
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify(loginDraft) });
      setLoginDraft((current) => ({ ...current, password: "" }));
      const ok = await refreshAuth();
      if (ok) loadAgents().catch(() => {});
    } catch (error) {
      setAuthorized(false);
      setAuthMessage(error.message);
    }
  };

  const clearToken = () => {
    setTokenDraft("");
    setActiveApiToken("");
    persistToken("");
    setAuthorized(false);
    setAgents([]);
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
    if (page === "console") return <ConsolePage agents={agents} agentId={agentId} setAgentId={setAgentId} openSsh={openSsh} />;
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

  if (!authReady) return <div className="login-shell"><div className="login-card">姝ｅ湪妫€鏌ュ悗鍙颁細璇?..</div></div>;
  if (!authorized) return <AdminAuthGate tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} loginDraft={loginDraft} setLoginDraft={setLoginDraft} loginAdmin={loginAdmin} message={authMessage} />;

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


