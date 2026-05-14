import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ClipboardList,
  Code2,
  Download,
  FolderClosed,
  FolderSync,
  HardDriveDownload,
  KeyRound,
  Laptop,
  Monitor,
  PlugZap,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Settings,
  Shuffle,
  Terminal,
  Trash2,
  Upload
} from "lucide-react";
import "./style.css";

const TOKEN_KEY = "chiken_api_token";
const URL_TOKEN_PARAM = "token";

const nav = [
  ["dashboard", Activity, "概览"],
  ["servers", Monitor, "服务器"],
  ["nodes", Code2, "节点配置"],
  ["forward", PlugZap, "端口转发"],
  ["files", FolderSync, "文件对传"],
  ["credentials", KeyRound, "凭据管理"],
  ["commands", Terminal, "命令库"],
  ["tokens", HardDriveDownload, "API Token"],
  ["audit", ClipboardList, "审计日志"],
  ["settings", Settings, "使用说明"]
];

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
      shortId: randShortId(),
      flow: "xtls-rprx-vision"
    }),
    fields: [
      { key: "port", label: "监听端口", type: "number" },
      { key: "uuid", label: "UUID", random: () => newUuid() },
      { key: "serverName", label: "SNI / 握手域名" },
      { key: "serverPort", label: "握手端口", type: "number" },
      { key: "privateKey", label: "Reality 私钥" },
      { key: "shortId", label: "short_id", random: () => randShortId() },
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
    throw new Error(message);
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}

function fileDownloadUrl(pathname, params = {}) {
  return buildAuthUrl(pathname, params);
}

function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
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

function Card({ label, value, accent = "" }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className={accent}>{value}</b>
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

function Layout({ page, setPage, headerExtra, children }) {
  const navPage = ["detail", "ssh", "config", "logs", "desktop", "files-agent"].includes(page) ? "servers" : page;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">ChikenEasy</div>
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={navPage === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </aside>
      <main className="main">
        <header className="topbar">
          <strong>{nav.find(([id]) => id === navPage)?.[2] || "控制台"}</strong>
          <div className="header-tools">{headerExtra}<span className="muted">admin</span></div>
        </header>
        {children}
      </main>
    </div>
  );
}

function AgentTable({ agents, openAgent, openSsh, openDesktop, openFiles }) {
  return (
    <table>
      <thead>
        <tr>
          <th>名称</th>
          <th>主机</th>
          <th>IP</th>
          <th>系统</th>
          <th>在线</th>
          <th>sing-box</th>
          <th>SSH</th>
          <th>RDP</th>
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
            <td>{agent.os}/{agent.arch}</td>
            <td><StatusDot on={agent.connected} />{agent.connected ? "online" : "offline"}</td>
            <td><StatusDot on={agent.singboxStatus === "active"} />{agent.singboxStatus}</td>
            <td>{agent.sshConfigured ? `${agent.sshMode}@${agent.sshPort}` : "未配置"}</td>
            <td>{agent.rdpConfigured ? `${agent.rdpHost}:${agent.rdpPort}` : "未配置"}</td>
            <td>{agent.lastSeen || "-"}</td>
            <td className="actions-cell">
              <button className="link" onClick={() => openAgent(agent.id)}>详情</button>
              <button className="link" onClick={() => openSsh(agent.id)}>SSH</button>
              <button className="link" onClick={() => openDesktop(agent.id)}>桌面</button>
              <button className="link" onClick={() => openFiles(agent.id)}>文件</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dashboard({ liveTick, openAgent, openSsh, openDesktop, openFiles }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api("/api/dashboard").then(setData).catch(() => {});
  }, [liveTick]);
  if (!data) return null;
  return (
    <section>
      <div className="stats">
        <Card label="服务器总数" value={data.total} />
        <Card label="在线" value={data.online} accent="green" />
        <Card label="离线" value={data.offline} />
        <Card label="sing-box 活跃" value={data.activeSingbox} accent="blue" />
      </div>
      <Panel title="最近活跃">
        <AgentTable agents={data.recent} openAgent={openAgent} openSsh={openSsh} openDesktop={openDesktop} openFiles={openFiles} />
      </Panel>
    </section>
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
  const [result, setResult] = useState("");

  useEffect(() => {
    api(`/api/agents/${id}`).then(setAgent).catch(() => {});
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

  if (!agent) return null;

  return (
    <section>
      <div className="toolbar">
        <button onClick={back}>返回</button>
        <h1>{agent.name}</h1>
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
            {Object.entries(agent).map(([key, value]) => (
              <React.Fragment key={key}>
                <dt>{key}</dt>
                <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
              </React.Fragment>
            ))}
          </dl>
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

  return (
    <Panel
      title={`${mode === "ssh" ? "SSH 终端" : "Agent 执行"} - ${agentName}`}
      right={<span><StatusDot on={connected} />{connected ? "connected" : "closed"}</span>}
    >
      <div
        ref={boxRef}
        tabIndex={0}
        className={`terminal ${mode === "ssh" ? "interactive" : ""}`}
        onClick={() => boxRef.current?.focus()}
        onKeyDown={(event) => {
          if (mode !== "ssh") return;
          if (event.altKey || event.metaKey) return;
          const data = sendKey(event.key, event.ctrlKey);
          if (!data) return;
          event.preventDefault();
          sendRaw(data);
        }}
      >
        {output || "连接建立后，点击这里即可直接输入。"}
      </div>
      <div className="terminal-tip">{mode === "ssh" ? "终端区域已支持直接键盘输入、方向键、Tab、Ctrl+C。" : "Agent 模式按整行执行命令，适合作为 SSH 的兜底通道。"}</div>
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
  const switchProtocol = (nextProtocol) => setForm((current) => ({ agentId: current.agentId, ...protocolDefinitions[nextProtocol].defaults() }));

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
    ["实时探针", "前端会订阅服务器事件流，服务器在线状态、配置结果和审计都会更快刷新。"],
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
  const [page, setPage] = useState("dashboard");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

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

  const loadAgents = () => api("/api/agents").then((rows) => {
    setAgents(rows);
    if (!agentId && rows[0]) setAgentId(rows[0].id);
  });

  useEffect(() => {
    if (!tokenReady) return;
    loadAgents().catch(() => {});
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
    if (page === "forward") return <ForwardWizard agents={agents} />;
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

  return (
    <Layout page={page} setPage={setPage} headerExtra={<AccessTokenBar tokenDraft={tokenDraft} setTokenDraft={setTokenDraft} saveToken={saveToken} clearToken={clearToken} hasToken={Boolean(getActiveApiToken())} />}>
      {content}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
