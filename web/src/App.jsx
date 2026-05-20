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
  Laptop,
  LogIn,
  Menu,
  MemoryStick,
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
  SlidersHorizontal,
  Terminal,
  TrendingUp,
  Trash2,
  Unplug,
  Upload,
  UserCircle,
  Users,
  Wifi
} from "lucide-react";
import "./style.css";

const TOKEN_KEY = "chiken_api_token";
const URL_TOKEN_PARAM = "token";

const navGroups = [
  {
    items: [
      ["dashboard", Activity, "概览"],
      ["servers", Monitor, "服务器"],
      ["probeManage", SlidersHorizontal, "探针管理"],
      ["nodes", Code2, "节点配置"],
      ["subscriptions", Link2, "订阅分发"],
      ["protocolLab", PlugZap, "协议实验室"],
      ["memos", BookOpen, "Memos 笔记"],
      ["forward", PlugZap, "端口转发"],
      ["files", FolderSync, "文件对传"],
      ["credentials", KeyRound, "凭据管理"],
      ["tokens", HardDriveDownload, "API Token"],
      ["audit", ClipboardList, "审计日志"],
      ["settings", Settings, "使用说明"]
    ]
  }
];

const nav = navGroups.flatMap((group) => group.items);

const protocolDefinitions = {
  "vmess-ws": {
    name: "VMess + WebSocket",
    note: "适合标准 WebSocket 场景，切换时会自动生成新的 UUID 和路径。",
    defaults: () => ({ protocol: "vmess-ws", port: 20080, listen: "::", uuid: newUuid(), path: randPath() }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "path", label: "WS 路径", random: () => randPath() },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  "vless-reality": {
    name: "VLESS + Reality",
    note: "Reality 需要私钥和 short_id，切换协议时会自动补默认项。",
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
      fingerprint: "chrome",
      flow: "xtls-rprx-vision"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number" },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "serverName", label: "SNI / 握手域名" },
      { key: "serverPort", label: "握手端口", type: "number" },
      { key: "privateKey", label: "Reality 私钥" },
      { key: "publicKey", label: "Reality 公钥 / 订阅用" },
      { key: "shortId", label: "short_id", random: () => randShortId() },
      { key: "fingerprint", label: "浏览器指纹", placeholder: "chrome" },
      { key: "flow", label: "Flow" },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  trojan: {
    name: "Trojan + TLS",
    note: "首次下发会自动为当前入站补齐证书文件。",
    defaults: () => ({ protocol: "trojan", port: 443, listen: "::", password: randPassword(), serverName: "www.cloudflare.com" }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => 443 },
      { key: "password", label: "密码", random: () => randPassword() },
      { key: "serverName", label: "TLS 域名" },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  hysteria2: {
    name: "Hysteria2",
    note: "支持上下行带宽字段，便于直接生成可用配置。",
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
      { key: "serverName", label: "TLS 域名" },
      { key: "upMbps", label: "上行 Mbps", type: "number" },
      { key: "downMbps", label: "下行 Mbps", type: "number" },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  },
  shadowsocks: {
    name: "Shadowsocks",
    note: "默认使用更通用的 aes-256-gcm。",
    defaults: () => ({ protocol: "shadowsocks", port: 8388, listen: "::", method: "aes-256-gcm", password: randPassword() }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      {
        key: "method",
        label: "加密方式",
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
    note: "适合先做基础联通测试。",
    defaults: () => ({ protocol: "mixed", port: 2080, listen: "::" }),
    fields: [
      { key: "port", label: "监听端口", type: "number", random: () => randPort() },
      { key: "listen", label: "监听地址", placeholder: "::" }
    ]
  }
};

const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((item) => item.toString(16).padStart(2, "0")).join("");
const randPassword = () => randHex(12);
const randShortId = () => randHex(8);
const randPort = (base = 20000, size = 30000) => base + Math.floor(Math.random() * size);
const randPath = () => `/${randHex(3)}`;
const newUuid = () => crypto.randomUUID?.() || `${randHex(4)}-${randHex(2)}-${randHex(2)}-${randHex(2)}-${randHex(6)}`;

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
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}

function fileDownloadUrl(pathname, params = {}) {
  return buildAuthUrl(pathname, params);
}

async function copyText(text) {
  await navigator.clipboard?.writeText(String(text || ""));
}

function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
}

const clampPercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
}

function formatBytes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = number;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatSpeed(value) {
  return Number.isFinite(Number(value)) ? `${formatBytes(Number(value))}/s` : "0 B/s";
}

function formatTrafficPair(network = {}) {
  return `↓ ${formatBytes(network.rxBytes || network.totalRxBytes || 0)} / ↑ ${formatBytes(network.txBytes || network.totalTxBytes || 0)}`;
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "-";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days} 天 ${hours} 小时`;
  if (hours) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function formatDurationLong(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "-";
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = Math.floor(total % 60);
  if (days) return `${days} 天 ${hours} 时 ${minutes} 分 ${rest} 秒`;
  if (hours) return `${hours} 时 ${minutes} 分 ${rest} 秒`;
  return `${minutes} 分 ${rest} 秒`;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function formatTimeAgo(value) {
  const time = Date.parse(value || "");
  if (!Number.isFinite(time)) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 8) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function meterTone(value) {
  const number = Number(value) || 0;
  if (number >= 85) return "red";
  if (number >= 70) return "amber";
  return "green";
}

function countryCodeToFlag(code = "") {
  const upper = String(code).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return Array.from(upper).map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function isFlagEmoji(value = "") {
  return /^[\u{1F1E6}-\u{1F1FF}]{2}$/u.test(String(value).trim());
}

const regionFlagRules = [
  ["HK", ["hk", "hkg", "hong kong", "香港"]],
  ["JP", ["jp", "jpn", "tokyo", "osaka", "日本", "东京", "大阪"]],
  ["SG", ["sg", "sin", "singapore", "新加坡"]],
  ["US", ["us", "usa", "america", "los angeles", "sfo", "lax", "美国", "洛杉矶", "圣何塞", "西雅图"]],
  ["TW", ["tw", "taiwan", "台湾", "台北"]],
  ["KR", ["kr", "korea", "seoul", "韩国", "首尔"]],
  ["GB", ["gb", "uk", "london", "英国", "伦敦"]],
  ["DE", ["de", "germany", "frankfurt", "德国", "法兰克福"]],
  ["NL", ["nl", "netherlands", "amsterdam", "荷兰", "阿姆斯特丹"]],
  ["FR", ["fr", "france", "paris", "法国", "巴黎"]],
  ["CA", ["ca", "canada", "toronto", "加拿大", "多伦多"]],
  ["AU", ["au", "australia", "sydney", "澳洲", "澳大利亚", "悉尼"]]
];

function inferFlag(profile = {}, agent = {}) {
  const custom = String(profile.flag || "").trim();
  if (/^[a-z]{2}$/i.test(custom)) return countryCodeToFlag(custom);
  if (isFlagEmoji(custom)) return custom;
  const system = systemInfo(agent);
  const haystack = [
    profile.region,
    profile.group,
    profile.displayName,
    agent.name,
    agent.host,
    agent.ip,
    system.distro,
    system.kernel,
    ...(profile.tags || [])
  ].join(" ").toLowerCase();
  const match = regionFlagRules.find(([, keys]) => keys.some((key) => haystack.includes(key)));
  return match ? countryCodeToFlag(match[0]) : "";
}

function inferFlagCode(profile = {}, agent = {}) {
  const custom = String(profile.flag || "").trim();
  if (/^[a-z]{2}$/i.test(custom)) return custom.toUpperCase();
  const system = systemInfo(agent);
  const haystack = [
    profile.region,
    profile.group,
    profile.displayName,
    agent.name,
    agent.host,
    agent.ip,
    system.distro,
    system.kernel,
    ...(profile.tags || [])
  ].join(" ").toLowerCase();
  const match = regionFlagRules.find(([, keys]) => keys.some((key) => haystack.includes(key)));
  return match ? match[0] : "";
}

function flagImageUrl(code = "") {
  const upper = String(code || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? `https://flagcdn.com/w40/${upper.toLowerCase()}.png` : "";
}

function inferProbePreset(agent = {}, profile = {}) {
  const system = systemInfo(agent);
  const haystack = [
    profile.region,
    profile.group,
    profile.displayName,
    agent.name,
    agent.host,
    agent.ip,
    system.distro,
    system.kernel,
    ...(profile.tags || [])
  ].join(" ").toLowerCase();
  const match = regionFlagRules.find(([, keys]) => keys.some((key) => haystack.includes(key)));
  const code = match?.[0] || "";
  const regionMap = {
    HK: { region: "香港", group: "香港", osLabel: "Ubuntu 22.04", note: "香港云服务器" },
    JP: { region: "日本", group: "亚洲", osLabel: "Ubuntu 22.04", note: "日本节点" },
    SG: { region: "新加坡", group: "亚洲", osLabel: "Ubuntu 22.04", note: "新加坡节点" },
    US: { region: "美国", group: "美洲", osLabel: "Ubuntu 22.04", note: "美国节点" },
    DE: { region: "德国", group: "欧洲", osLabel: "Ubuntu 22.04", note: "德国节点" },
    GB: { region: "英国", group: "欧洲", osLabel: "Ubuntu 22.04", note: "英国节点" }
  };
  return {
    code,
    ...(regionMap[code] || { region: "", group: profile.group || "默认", osLabel: systemShortName(system) === "Ubuntu" ? "Ubuntu 22.04" : "", note: "" })
  };
}

function normalizeFlagInput(value = "") {
  const text = String(value || "").trim();
  if (/^[a-z]{2}$/i.test(text)) return countryCodeToFlag(text);
  return isFlagEmoji(text) ? text : "";
}

function systemInfo(agent = {}) {
  return agent.probe?.system || {};
}

function systemShortName(system = {}) {
  const label = system.distro || system.platform || "";
  if (/debian/i.test(label)) return "Debian";
  if (/ubuntu/i.test(label)) return "Ubuntu";
  if (/centos/i.test(label)) return "CentOS";
  if (/rocky/i.test(label)) return "Rocky";
  if (/almalinux/i.test(label)) return "AlmaLinux";
  if (/alpine/i.test(label)) return "Alpine";
  if (/fedora/i.test(label)) return "Fedora";
  if (/windows/i.test(label)) return "Windows";
  if (/darwin|mac/i.test(label)) return "macOS";
  return label || "-";
}

function osLabel(agent, profile = {}) {
  const system = systemInfo(agent);
  const distro = profile.osLabel || system.distro || agent.os || "-";
  const arch = system.arch || agent.arch || "";
  return arch && !String(distro).includes(arch) ? `${distro} / ${arch}` : distro;
}

function kernelLabel(agent = {}) {
  const system = systemInfo(agent);
  return [systemShortName(system), system.kernel].filter(Boolean).join(" · ") || "-";
}

function trafficLimitBytes(profile = {}) {
  const limit = Number(profile.trafficLimitGb);
  return Number.isFinite(limit) && limit > 0 ? limit * 1024 ** 3 : 0;
}

function trafficUsagePercent(agent) {
  const network = agent.probe?.network || {};
  const limit = trafficLimitBytes(agent.profile);
  if (!limit) return null;
  return ((Number(network.rxBytes || 0) + Number(network.txBytes || 0)) / limit) * 100;
}

const landscapeImages = [
  {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Rocky%20Mountain%20Landscape%20by%20Albert%20Bierstadt%2C%201870.jpg?width=1600",
    credit: "Albert Bierstadt / Wikimedia Commons"
  },
  {
    url: "https://commons.wikimedia.org/wiki/Special:FilePath/Grand%20Canyon%2C%20South%20Rim%20IMG%204531.jpg?width=1600",
    credit: "Macdon / Wikimedia Commons CC0"
  }
];

function MiniMeter({ value, tone = "blue" }) {
  const width = clampPercent(value);
  return (
    <div className={`mini-meter ${tone}`}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function ProbeMetric({ icon: Icon, label, value, detail, percent, tone = "blue" }) {
  return (
    <div className="probe-metric">
      <div className="probe-metric-head">
        {Icon ? <Icon size={17} /> : null}
        <span>{label}</span>
        <b>{value}</b>
      </div>
      {Number.isFinite(Number(percent)) ? <MiniMeter value={percent} tone={tone} /> : null}
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ProbePanel({ probe = {} }) {
  probe ||= {};
  const cpu = probe.cpu || {};
  const memory = probe.memory || {};
  const swap = probe.swap || {};
  const disk = probe.disk || {};
  const network = probe.network || {};
  const load = Array.isArray(probe.load) ? probe.load.join(" / ") : "-";
  return (
    <div className="probe-grid">
      <ProbeMetric icon={Cpu} label="CPU" value={formatPercent(cpu.usage)} detail={`${cpu.cores || "-"} 核 ${load}`} percent={cpu.usage} tone="blue" />
      <ProbeMetric icon={MemoryStick} label="内存" value={formatPercent(memory.usage)} detail={`${formatBytes(memory.used)} / ${formatBytes(memory.total)}`} percent={memory.usage} tone="green" />
      <ProbeMetric icon={HardDrive} label="硬盘" value={formatPercent(disk.usage)} detail={`${formatBytes(disk.used)} / ${formatBytes(disk.total)} ${disk.mount || ""}`} percent={disk.usage} tone="amber" />
      <ProbeMetric icon={Gauge} label="Swap" value={formatPercent(swap.usage)} detail={`${formatBytes(swap.used)} / ${formatBytes(swap.total)}`} percent={swap.usage} tone="violet" />
      <ProbeMetric icon={Wifi} label="实时速率" value={`↓ ${formatSpeed(network.rxSpeed)}`} detail={`↑ ${formatSpeed(network.txSpeed)} · Δ ${formatBytes((network.rxDelta || 0) + (network.txDelta || 0))}`} tone="blue" />
      <ProbeMetric icon={TrendingUp} label="累计流量" value={formatTrafficPair(network)} detail={`${network.interfaces || 0} 网卡 · ${network.sampleInterval ? `${Number(network.sampleInterval).toFixed(1)}s 采样` : "等待采样"}`} tone="green" />
      <ProbeMetric icon={Clock3} label="运行时间" value={formatDuration(probe.uptime)} detail={probe.updatedAt ? `更新于 ${probe.updatedAt}` : ""} tone="green" />
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

function Card({ label, value, accent = "", icon: Icon = null, hint = "" }) {
  return (
    <div className="stat">
      <span>{Icon ? <Icon size={17} /> : null}{label}</span>
      <b className={accent}>{value}</b>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", rows = 4, options = [], random = null }) {
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
          <Trash2 size={15} />
          清除
        </button>
      ) : null}
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
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
    <main className="probe-page komari-page">
      <header className="komari-header">
        <div className="komari-brand">
          <strong>CM</strong>
          <span>{site.subtitle || site.name || "Chiken Monitor"}</span>
        </div>
        {theme.showHeaderActions !== false ? <div className="komari-actions">
          <a className="square-btn" href="https://github.com/fengbule/chiken-easy" target="_blank" rel="noreferrer" title="GitHub"><Code2 size={17} /></a>
          <button className="square-btn" title="刷新" onClick={load}><RefreshCw size={17} /></button>
          <a className="square-btn admin" href="/admin" title="管理员入口"><KeyRound size={17} /></a>
        </div> : null}
      </header>

      <section className="komari-content">
        <div className="komari-hero">
          <div>
            <span className="hero-kicker">Chiken Monitor</span>
            <h1>{site.name || "Chiken Monitor"}</h1>
            <p>{site.description || "公开服务器状态、负载、实时速率与累计流量。"}</p>
          </div>
          <div className="hero-live">
            <span>Live</span>
            <b>{formatClock(now)}</b>
          </div>
        </div>

        <div className="komari-summary">
          <div><span>当前时间</span><b>{formatClock(now)}</b></div>
          <div><span>当前在线</span><b>{data ? `${data.online} / ${data.total}` : "-"}</b></div>
          <div><span>点亮地区</span><b>{summary.regions || 0}</b></div>
          <div><span>接管后累计</span><b>↑ {formatBytes(summary.txBytes)} / ↓ {formatBytes(summary.rxBytes)}</b></div>
          <div><span>网络速率</span><b>{formatSpeed(avgSpeed)}</b></div>
        </div>

        <div className="komari-toolbar">
          <label className="komari-search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索节点名称、地区、系统..." />
          </label>
          <div className="view-switch">
            <span>显示模式</span>
            <button className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")} title="卡片"><Monitor size={16} /></button>
            <button className={mode === "compact" ? "active" : ""} onClick={() => setMode("compact")} title="紧凑"><ClipboardList size={16} /></button>
          </div>
        </div>

        <div className="komari-groups">
          <span>分组</span>
          {groups.map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}
        </div>

        <p className="komari-count">共 {data?.total || 0} 个服务器，{data?.online || 0} 个在线{totalTraffic ? `，累计流量 ${formatBytes(totalTraffic)}` : ""}</p>

        <div className={mode === "grid" ? "komari-grid" : "komari-grid compact"}>
          {rows.map((agent) => {
            const probe = agent.probe || {};
            const profile = agent.profile || {};
            const system = systemInfo(agent);
            const cpu = probe.cpu || {};
            const memory = probe.memory || {};
            const disk = probe.disk || {};
            const network = probe.network || {};
            const trafficPercent = trafficUsagePercent(agent);
            const trafficTotal = Number(network.rxBytes || 0) + Number(network.txBytes || 0);
            const lastSpeed = (Number(network.rxSpeed) || 0) + (Number(network.txSpeed) || 0);
            return (
              <article className="komari-card" key={agent.id}>
                <div className="komari-card-head">
                  <div className="komari-title">
                    <span className="flag">{flagImageUrl(inferFlagCode(profile, agent)) ? <img src={flagImageUrl(inferFlagCode(profile, agent))} alt={inferFlagCode(profile, agent)} loading="lazy" /> : (inferFlag(profile, agent) || "🌐")}</span>
                    <div>
                      <h3>{profile.displayName || agent.name}</h3>
                      <div className="probe-badges">
                        {profile.region ? <span className="badge cyan-badge">{profile.region}</span> : null}
                        <span className="badge green-badge">{systemShortName(system)}</span>
                        {profile.price ? <span className="badge blue-badge">{profile.price}</span> : null}
                        {profile.expireText ? <span className={String(profile.expireText).includes("余") ? "badge green-badge" : "badge amber-badge"}>{profile.expireText}</span> : null}
                      </div>
                    </div>
                  </div>
                  <span className={`status-pill ${agent.connected ? "online" : ""}`}><StatusDot on={agent.connected} />{agent.connected ? "在线" : "离线"}</span>
                </div>

                <div className="komari-os-row">
                  <span>OS</span>
                  <b>{osLabel(agent, profile)}</b>
                </div>
                <div className="komari-system-strip">
                  <span><Monitor size={14} />{kernelLabel(agent)}</span>
                  <span><Cpu size={14} />{cpu.cores || "-"} 核</span>
                  <span><Clock3 size={14} />{formatTimeAgo(network.speedUpdatedAt || probe.updatedAt)}</span>
                </div>

                <ProbeLine label="CPU" value={formatPercent(cpu.usage)} percent={cpu.usage} tone={meterTone(cpu.usage)} />
                <ProbeLine label="内存" value={formatPercent(memory.usage)} detail={`${formatBytes(memory.used)} / ${formatBytes(memory.total)}`} percent={memory.usage} tone={meterTone(memory.usage)} />
                <ProbeLine label="磁盘" value={formatPercent(disk.usage)} detail={`${formatBytes(disk.used)} / ${formatBytes(disk.total)}`} percent={disk.usage} tone={meterTone(disk.usage)} />
                <ProbeLine label="总流量" value={Number.isFinite(trafficPercent) ? formatPercent(trafficPercent) : ""} detail={`↑ ${formatBytes(network.txBytes)} ↓ ${formatBytes(network.rxBytes)}${trafficLimitBytes(profile) ? ` / Sum(${formatBytes(trafficLimitBytes(profile))})` : ""}`} percent={trafficPercent} tone={meterTone(trafficPercent)} />

                <div className="komari-fact-row"><span>速率</span><b>{formatSpeed(lastSpeed)} · ↑ {formatSpeed(network.txSpeed)} ↓ {formatSpeed(network.rxSpeed)}</b></div>
                <div className="komari-fact-row"><span>接管后累计</span><b>{formatTrafficPair(network)} · {formatBytes(trafficTotal)}</b></div>
                <div className="komari-fact-row"><span>采样</span><b>{network.sampleInterval ? `${Number(network.sampleInterval).toFixed(1)}s · ${network.interfaces || 0} 网卡` : "等待下一次心跳"}</b></div>
                <div className="komari-fact-row"><span>运行时间</span><b>{formatDurationLong(probe.uptime)}</b></div>
                {profile.note ? <div className="komari-note">{profile.note}</div> : null}
                <span className="live-stamp">更新 {formatTimeAgo(probe.updatedAt)}</span>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function ProbeLine({ label, value, detail, percent, tone = "green" }) {
  return (
    <div className="komari-line">
      <div><span>{label}</span><b>{value}</b></div>
      <MiniMeter value={percent} tone={tone} />
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

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
    api(`/api/agents/${id}`).then((row) => {
      setAgent(row);
      setNameDraft(row.name || "");
    }).catch(() => {});
  }, [id, liveTick]);

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
  const detailRows = Object.entries(agent).filter(([key, value]) => key !== "probe" && (value === null || typeof value !== "object" || Array.isArray(value)));

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
        <button className="red-bg" onClick={uninstall}>卸载 Agent</button>
      </div>
      <div className="grid2">
        <Panel title="基本信息">
          <dl>
            {detailRows.map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
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
          <pre>{result || "操作结果会显示在这里。"}</pre>
        </Panel>
      </div>
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
  const [output, setOutput] = useState("");
  const [lineInput, setLineInput] = useState("");
  const wsRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    setConnected(false);
    setOutput("");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}${buildAuthUrl("/terminal", { agentId, mode })}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setOutput((current) => current + (message.output || ""));
      requestAnimationFrame(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight));
    };
    return () => ws.close();
  }, [agentId, mode, connectNonce]);

  const sendRaw = (data) => {
    if (!data || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "input", data }));
  };

  const sendLine = () => {
    if (!lineInput.trim()) return;
    sendRaw(mode === "ssh" ? `${lineInput}\r` : `${lineInput}\n`);
    setLineInput("");
  };

  const copyTerminal = async () => {
    const selection = window.getSelection()?.toString();
    await navigator.clipboard?.writeText(selection || output || "");
  };

  return (
    <Panel
      title={`${mode === "ssh" ? "SSH 终端" : "Agent 执行"} - ${agentName}`}
      right={<div className="terminal-tools"><span><StatusDot on={connected} />{connected ? "connected" : "closed"}</span><button onClick={copyTerminal}>复制</button><button onClick={() => setOutput("")}>清屏</button></div>}
    >
      <div
        ref={boxRef}
        tabIndex={0}
        className={`terminal ${mode === "ssh" ? "interactive" : ""}`}
        role="textbox"
        aria-label="SSH terminal"
        onClick={() => boxRef.current?.focus()}
        onPaste={(event) => {
          if (mode !== "ssh") return;
          const text = event.clipboardData.getData("text");
          if (!text) return;
          event.preventDefault();
          sendRaw(text);
        }}
        onKeyDown={(event) => {
          if (mode !== "ssh") return;
          if (event.altKey || event.metaKey) return;
          if (event.ctrlKey && event.key.toLowerCase() === "c" && window.getSelection()?.toString()) return;
          if (event.ctrlKey && event.key.toLowerCase() === "v") return;
          const data = sendKey(event.key, event.ctrlKey);
          if (!data) return;
          event.preventDefault();
          sendRaw(data);
        }}
      >
        <pre>{output || "连接建立后，点击这里即可直接输入。"}</pre>
      </div>
      <div className="terminal-tip">{mode === "ssh" ? "点击黑色区域后可直接输入；选中文本后 Ctrl+C 复制，粘贴会直接发送到 SSH。" : "Agent 模式按整行执行命令，适合作为 SSH 的兜底通道。"}</div>
      <div className="terminal-input">
        <input value={lineInput} onChange={(event) => setLineInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendLine()} placeholder="输入命令后回车发送" />
        {mode === "ssh" ? <button onClick={() => sendRaw("\u0003")}>Ctrl+C</button> : null}
        <button className="primary" onClick={sendLine}>
          <Send size={16} />
          发送
        </button>
      </div>
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

  useEffect(() => {
    Promise.all([api(`/api/agents/${id}`), api(`/api/agents/${id}/ssh-profile`), api("/api/credentials?type=ssh")])
      .then(([agentData, sshData, credentialRows]) => {
        setAgent(agentData);
        setProfile((current) => ({ ...current, ...sshData, password: "", privateKey: "" }));
        setCredentials(credentialRows);
        if (!sshData.ready) setMode("agent");
      })
      .catch((error) => setMessage(error.message));
  }, [id, liveTick]);

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

  if (!agent) return null;

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>SSH - {agent.name}</h1>
        <button onClick={() => setConnectNonce((value) => value + 1)}><RefreshCw size={16} />重连</button>
      </div>
      <div className="grid2">
        <Panel title="SSH 配置" right={<span className="muted">保存后可直接进入实时 SSH</span>}>
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
        <TerminalPanel agentId={id} agentName={agent.name} mode={mode} connectNonce={connectNonce} />
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

  const save = async () => {
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
            <Field label="主机" value={profile.host} onChange={(value) => patch("host", value)} />
            <Field label="端口" type="number" value={profile.port} onChange={(value) => patch("port", value)} />
            <Field label="用户名" value={profile.username} onChange={(value) => patch("username", value)} />
            <Field label="域" value={profile.domain} onChange={(value) => patch("domain", value)} placeholder="可留空" />
            <Field label="凭据" type="select" value={profile.credentialId || ""} onChange={(value) => patch("credentialId", value)} options={[["", "不使用凭据库"], ...credentials.map((item) => [item.id, item.name])]} />
            <Field label="密码" type="password" value={profile.password} onChange={(value) => patch("password", value)} />
            <Field label="宽度" type="number" value={profile.width} onChange={(value) => patch("width", value)} />
            <Field label="高度" type="number" value={profile.height} onChange={(value) => patch("height", value)} />
            <Field label="色深" type="number" value={profile.colorDepth} onChange={(value) => patch("colorDepth", value)} />
          </div>
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
        {!data.items?.length ? <div className="empty">当前目录为空</div> : null}
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
            {!files.length ? <div className="empty">暂无附件。</div> : null}
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
    setForm({
      ...empty,
      ...row.profile,
      tags: (row.profile.tags || []).join(", "),
      trafficLimitGb: row.profile.trafficLimitGb || "",
      displayName: row.profile.displayName || row.agent.name
    });
  };

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!selectedId) return;
    try {
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
      setMessage("探针展示信息已保存，公开页会实时刷新。");
      await load();
    } catch (error) {
      setMessage(error.message);
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
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <Field label="批量地区" value={bulk.region} onChange={(value) => patchBulk("region", value)} placeholder="如 香港 / 日本 / 美国" />
              <Field label="批量分组" value={bulk.group} onChange={(value) => patchBulk("group", value)} placeholder="如 亚洲 / 香港 / 欧洲" />
              <Field label="批量公开" type="select" value={bulk.hidden} onChange={(value) => patchBulk("hidden", value)} options={[["", "保持不变"], ["visible", "全部显示"], ["hidden", "全部隐藏"]]} />
              <Field label="排序起点" type="number" value={bulk.sortStart} onChange={(value) => patchBulk("sortStart", value)} />
              <Field label="排序步长" type="number" value={bulk.sortStep} onChange={(value) => patchBulk("sortStep", value)} />
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

          <Panel title="编辑公开探针">
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
                  <Field label="公开名称" value={form.displayName} onChange={(value) => patch("displayName", value)} />
                  <Field label="旗标" value={form.flag} onChange={(value) => patch("flag", normalizeFlagInput(value))} placeholder="如 🇭🇰 / US / JP" />
                  <Field label="分组" value={form.group} onChange={(value) => patch("group", value)} placeholder="亚洲 / 欧洲 / 美洲" />
                  <Field label="地区" value={form.region} onChange={(value) => patch("region", value)} placeholder="香港 / 日本 / SFO" />
                  <Field label="系统显示" value={form.osLabel} onChange={(value) => patch("osLabel", value)} placeholder={selectedSystem.distro || "留空使用 Agent 上报系统"} />
                  <Field label="排序" type="number" value={form.displayOrder} onChange={(value) => patch("displayOrder", value)} />
                  <Field label="价格标签" value={form.price} onChange={(value) => patch("price", value)} placeholder="$60/三年" />
                  <Field label="到期/余量标签" value={form.expireText} onChange={(value) => patch("expireText", value)} placeholder="余1075天" />
                  <Field label="账单备注" value={form.billing} onChange={(value) => patch("billing", value)} />
                  <Field label="总流量 GB" type="number" value={form.trafficLimitGb} onChange={(value) => patch("trafficLimitGb", value)} placeholder="留空不显示百分比" />
                  <Field label="标签" value={form.tags} onChange={(value) => patch("tags", value)} placeholder="英文逗号分隔" />
                  <Field label="公开显示" type="select" value={form.hidden ? "hidden" : "visible"} onChange={(value) => patch("hidden", value === "hidden")} options={[["visible", "显示"], ["hidden", "隐藏"]]} />
                  <Field label="卡片备注" type="textarea" rows={3} value={form.note} onChange={(value) => patch("note", value)} />
                </div>
                <div className="panel-tip">
                  公开页不会输出服务器 IP 或主机地址。系统发行版来自 Agent 上报，国旗优先使用这里填写的旗标，留空时会按地区/名称自动推断。
                </div>
                <div className="actions">
                  <button className="primary" onClick={save}><Save size={16} />保存探针</button>
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
    if (module === "about") return <StaticAdminPage title="关于" body="Chiken Monitor 是 chiken-easy 的监控、探测、节点控制与订阅分发后台。" embedded />;
    if (module === "docs") return <StaticAdminPage title="文档" body="这里集中放置 Chiken Monitor 功能：服务器展示、站点设置、主题、通知、远程执行、延迟监测、会话、账户和日志。" actions={<a className="button-link" href="https://github.com/fengbule/chiken-easy" target="_blank" rel="noreferrer">打开 GitHub</a>} embedded />;
    if (module === "home") return <StaticAdminPage title="主页" body="公开主页是 Chiken Monitor 探针面板，默认无需登录可查看服务器状态。" actions={<a className="button-link" href="/" target="_blank" rel="noreferrer">打开公开主页</a>} embedded />;
    return null;
  };

  return (
    <section>
      <Panel title="Chiken Monitor 功能卡片">
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
  const load = () => api("/api/admin/settings").then(setSettings);
  useEffect(() => {
    load().catch(() => {});
  }, [section]);
  const current = settings?.[section] || {};
  const patch = (key, value) => setSettings((data) => ({ ...data, [section]: { ...(data?.[section] || {}), [key]: value } }));
  const save = async () => {
    try {
      const response = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ [section]: current }) });
      setSettings(response);
      setMessage("设置已保存。");
    } catch (error) {
      setMessage(error.message);
    }
  };
  const testNotification = async () => {
    try {
      setMessage("");
      const response = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ [section]: current }) });
      setSettings(response);
      const result = await api("/api/admin/notifications/test", { method: "POST", body: JSON.stringify({}) });
      setMessage(`测试通知已发送：${(result.results || []).map((row) => row.channel).join(", ") || "无通道"}`);
    } catch (error) {
      setMessage(error.message);
    }
  };
  if (!settings) return null;

  const fields = {
    site: [
      ["name", "站点名称", "text", "Chiken Monitor"],
      ["subtitle", "公开页标题", "text", "Chiken Monitor"],
      ["description", "站点描述", "text", ""],
      ["footer", "页脚文字", "text", ""]
    ],
    theme: [
      ["mode", "主题模式", "select", "", [["light", "浅色"], ["dark", "深色"], ["system", "跟随系统"]]],
      ["cardDensity", "卡片密度", "select", "", [["compact", "紧凑"], ["standard", "标准"], ["relaxed", "宽松"]]],
      ["accent", "强调色", "text", "green"],
      ["showHeaderActions", "顶部按钮", "select", "", [[true, "显示"], [false, "隐藏"]]]
    ],
    login: [
      ["title", "登录标题", "text", "Chiken Monitor"],
      ["sessionDays", "会话有效天数", "number", "7"],
      ["allowPasswordLogin", "密码登录", "select", "", [[true, "允许"], [false, "禁用"]]]
    ],
    notifications: [
      ["offlineEnabled", "离线通知", "select", "", [[true, "启用"], [false, "关闭"]]],
      ["loadEnabled", "负载通知", "select", "", [[true, "启用"], [false, "关闭"]]],
      ["cpuThreshold", "CPU 阈值", "number", "90"],
      ["memoryThreshold", "内存阈值", "number", "90"],
      ["diskThreshold", "磁盘阈值", "number", "90"],
      ["cooldownMinutes", "冷却分钟", "number", "10"],
      ["channel", "通知通道", "select", "", [["webhook", "Webhook"], ["telegram", "Telegram"], ["both", "Webhook + Telegram"]]],
      ["webhookUrl", "Webhook URL", "text", ""],
      ["telegramBotToken", "Telegram Bot Token", "password", ""],
      ["telegramChatId", "Telegram Chat ID", "text", ""],
      ["telegramApiBase", "Telegram API Base", "text", "https://api.telegram.org"]
    ],
    general: [
      ["publicRefreshSeconds", "公开页刷新秒数", "number", "5"],
      ["adminRefreshSeconds", "后台刷新秒数", "number", "5"],
      ["publicHideIp", "公开隐藏 IP", "select", "", [[true, "隐藏"], [false, "显示"]]],
      ["publicDefaultGroup", "默认分组", "text", "全部"]
    ]
  }[section] || [];

  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title={title}>
        {section === "notifications" ? (
          <div className="settings-helper">
            <div><b>通知通道</b><span>Webhook、Telegram 或两者同时发送，保存后可以立即点测试。</span></div>
            <div><b>告警规则</b><span>离线与负载告警共用冷却时间，避免短时间重复轰炸。</span></div>
            <div><b>隐私</b><span>测试与告警只发送节点名称和指标，不包含公开页隐藏的 IP。</span></div>
          </div>
        ) : null}
        <div className="form-grid">
          {fields.map(([key, label, type, placeholder, options]) => (
            <Field
              key={key}
              label={label}
              type={type}
              value={current[key] ?? ""}
              onChange={(value) => patch(key, value === "true" ? true : value === "false" ? false : value)}
              placeholder={placeholder}
              options={(options || []).map(([value, text]) => [String(value), text])}
            />
          ))}
        </div>
        <div className="actions">
          <button className="primary" onClick={save}><Save size={16} />保存</button>
          {section === "notifications" ? <button onClick={testNotification}><Bell size={16} />发送测试通知</button> : null}
          <button onClick={load}><RefreshCw size={16} />重载</button>
        </div>
        {message ? <p className="panel-message">{message}</p> : null}
      </Panel>
    </section>
  );
}

function SessionsPage({ liveTick, embedded = false }) {
  const [rows, setRows] = useState([]);
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
                <td>{row.revoked ? null : <button className="link" onClick={async () => { await api(`/api/admin/sessions/${row.id}`, { method: "DELETE" }); await load(); }}>撤销</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function AccountPage({ embedded = false }) {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title="账户">
        <div className="form-grid">
          <Field label="旧密码" type="password" value={form.oldPassword} onChange={(value) => patch("oldPassword", value)} />
          <Field label="新密码" type="password" value={form.newPassword} onChange={(value) => patch("newPassword", value)} />
        </div>
        <div className="actions">
          <button className="primary" onClick={async () => {
            try {
              await api("/api/auth/password", { method: "PUT", body: JSON.stringify(form) });
              setMessage("密码已更新。");
              setForm({ oldPassword: "", newPassword: "" });
            } catch (error) {
              setMessage(error.message);
            }
          }}>修改密码</button>
        </div>
        {message ? <p className="panel-message">{message}</p> : null}
      </Panel>
    </section>
  );
}

function StaticAdminPage({ title, body, actions = null, embedded = false }) {
  return (
    <section className={embedded ? "embedded-section" : ""}>
      <Panel title={title}>
        <div className="guide-card flat">
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
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
  const [message, setMessage] = useState("");

  const load = () => api("/api/probe-tasks").then(setTasks);
  useEffect(() => {
    load().catch(() => {});
  }, [liveTick]);

  const patch = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const create = async () => {
    try {
      setMessage("");
      const result = await api("/api/probe-tasks", { method: "POST", body: JSON.stringify(form) });
      setForm((current) => ({ ...current, name: "" }));
      setMessage(`任务已创建，已下发 ${result.sent?.length || 0} 个在线节点。`);
      await load();
    } catch (error) {
      setMessage(error.message);
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
            <button className="primary" onClick={create}>创建并运行</button>
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
      <Panel title="任务列表">
        <table>
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
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.name}</td>
                <td>{task.type}</td>
                <td>{task.type === "tcp" ? `${task.target}:${task.port}` : task.target}</td>
                <td>{task.agentId ? agents.find((agent) => agent.id === task.agentId)?.name || task.agentId : "全部在线"}</td>
                <td><span className={`status-pill ${task.lastResult?.ok ? "online" : ""}`}><StatusDot on={task.lastResult?.ok} />{task.lastResult ? (task.lastResult.ok ? "ok" : "fail") : "pending"}</span></td>
                <td>{task.lastResult?.latency ? `${task.lastResult.latency} ms` : "-"}{task.lastResult?.agentName ? <div className="muted">{task.lastResult.agentName}</div> : null}</td>
                <td>{task.lastResult?.at || "-"}</td>
                <td className="actions-cell">
                  <button className="link" onClick={async () => { const result = await api(`/api/probe-tasks/${task.id}/run`, { method: "POST" }); setMessage(`已重新下发 ${result.sent?.length || 0} 个在线节点。`); await load(); }}>运行</button>
                  <button className="link" onClick={async () => { if (!window.confirm(`删除探测任务 ${task.name}？`)) return; await api(`/api/probe-tasks/${task.id}`, { method: "DELETE" }); setMessage("任务已删除。"); await load(); }}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function ConfigPage({ id, back, liveTick }) {
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
          )) : <div className="empty">暂无版本</div>}
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
  useEffect(() => {
    api("/api/audit").then(setRows).catch(() => {});
  }, [liveTick]);
  return (
    <section>
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
                <td><code>{JSON.stringify(row.detail)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

function Tutorial() {
  const cards = [
    ["Chiken Monitor 探针", "Agent 会持续上报 CPU、内存、Swap、硬盘、负载、运行时间、网络速率和进程数。"],
    ["直接输入终端", "SSH 终端区域支持直接键盘输入，不再只能依赖底部输入框。"],
    ["远程桌面", "新增 RDP 凭据保存、端口测试和 .rdp 文件生成。"],
    ["文件对传", "支持双栏浏览、浏览器上传、远端下载和服务器之间直传。"],
    ["凭据与命令库", "可集中保存 SSH/RDP 凭据和常用命令，并复用到服务器操作。"]
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
  const [currentUser, setCurrentUser] = useState("");
  const [liveTick, setLiveTick] = useState(0);

  useEffect(() => {
    if (!isAdminPath) return;
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
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
    loadAgents().catch(() => {});
  };

  const clearToken = () => {
    setTokenDraft("");
    setActiveApiToken("");
    setCurrentUser("");
    window.localStorage.removeItem(TOKEN_KEY);
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

  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard liveTick={liveTick} openAgent={openAgent} openSsh={openSsh} openDesktop={openDesktop} openFiles={openFiles} />;
    if (page === "servers") return <Servers agents={agents} openAgent={openAgent} openSsh={openSsh} openDesktop={openDesktop} openFiles={openFiles} />;
    if (page === "nodes") return <NodeWizard agents={agents} />;
    if (page === "subscriptions") return <SubscriptionPage liveTick={liveTick} />;
    if (page === "protocolLab") return <ProtocolLabPage agents={agents} liveTick={liveTick} />;
    if (page === "memos") return <MemosPage liveTick={liveTick} />;
    if (page === "forward") return <ForwardWizard agents={agents} />;
    if (page === "probeManage") return <ProbeManagePage liveTick={liveTick} agents={agents} />;
    if (page === "probeTasks") return <ProbeTasksPage agents={agents} liveTick={liveTick} />;
    if (page === "siteSettings") return <MonitorSettingsPage section="site" title="站点设置" />;
    if (page === "themeManage") return <MonitorSettingsPage section="theme" title="主题管理" />;
    if (page === "loginSettings") return <MonitorSettingsPage section="login" title="登录设置" />;
    if (page === "notifySettings" || page === "offlineNotify" || page === "loadNotify" || page === "notifyGeneral") return <MonitorSettingsPage section="notifications" title={nav.find(([id]) => id === page)?.[2] || "通知设置"} />;
    if (page === "generalSettings") return <MonitorSettingsPage section="general" title="通用设置" />;
    if (page === "sessions") return <SessionsPage liveTick={liveTick} />;
    if (page === "account") return <AccountPage />;
    if (page === "about") return <StaticAdminPage title="关于" body="Chiken Monitor 是 chiken-easy 的监控、探测、节点控制与订阅分发后台。" />;
    if (page === "docs") return <StaticAdminPage title="文档" body="常用入口已经集中在侧边栏：服务器、探针管理、延迟监测、远程执行、订阅分发、文件对传和凭据管理。" actions={<a className="button-link" href="https://github.com/fengbule/chiken-easy" target="_blank" rel="noreferrer">打开 GitHub</a>} />;
    if (page === "home") return <StaticAdminPage title="主页" body="公开主页是 Chiken Monitor 探针面板，默认无需登录可查看服务器状态。" actions={<a className="button-link" href="/" target="_blank" rel="noreferrer">打开公开主页</a>} />;
    if (page === "defaultTheme") return <MonitorSettingsPage section="theme" title="默认主题设置" />;
    if (page === "files" || page === "files-agent") return <FilesPage agents={agents} initialAgentId={page === "files-agent" ? agentId : ""} />;
    if (page === "credentials") return <CredentialsPage liveTick={liveTick} />;
    if (page === "commands") return <CommandsPage agents={agents} liveTick={liveTick} />;
    if (page === "detail") return <AgentDetail id={agentId} back={() => setPage("servers")} openConfig={() => setPage("config")} openLogs={() => setPage("logs")} openSsh={() => setPage("ssh")} openDesktop={() => setPage("desktop")} openFiles={() => setPage("files-agent")} liveTick={liveTick} />;
    if (page === "ssh") return <SshPage id={agentId} back={() => setPage("servers")} liveTick={liveTick} />;
    if (page === "desktop") return <DesktopPage id={agentId} back={() => setPage("servers")} liveTick={liveTick} />;
    if (page === "config") return <ConfigPage id={agentId} back={() => setPage("detail")} liveTick={liveTick} />;
    if (page === "logs") return <LogsPage id={agentId} back={() => setPage("detail")} />;
    if (page === "tokens") return <ApiTokens tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} clearToken={clearToken} activeToken={getActiveApiToken()} />;
    if (page === "audit") return <Audit liveTick={liveTick} />;
    return <Tutorial />;
  }, [page, liveTick, agents, agentId, tokenDraft]);

  if (!tokenReady) return null;
  if (!getActiveApiToken()) return <LoginPage onLogin={login} />;

  return (
    <Layout page={page} setPage={setPage} headerExtra={<HeaderAccount user={currentUser} logout={logout} />}>
      {content}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
