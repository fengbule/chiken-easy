import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ClipboardList, Code2, KeyRound, Monitor, PlugZap, RefreshCw, RotateCcw, Save, Settings, Shuffle, Terminal, Trash2 } from "lucide-react";
import "./style.css";

const api = async (url, options) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
};

const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((x) => x.toString(16).padStart(2, "0")).join("");
const randPassword = () => randHex(12);
const randShortId = () => randHex(8);

const nav = [
  ["dashboard", Activity, "仪表盘"],
  ["servers", Monitor, "服务器"],
  ["nodes", Code2, "节点配置"],
  ["forward", PlugZap, "端口转发"],
  ["tokens", KeyRound, "API 令牌"],
  ["audit", ClipboardList, "审计日志"],
  ["settings", Settings, "教程"]
];

function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
}

function Layout({ page, setPage, children }) {
  return <div className="app"><aside><div className="brand">ChikenEasy</div>{nav.map(([id, Icon, label]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}</aside><main><header><strong>{nav.find(([id]) => id === page)?.[2] || "服务器"}</strong><span>admin</span></header>{children}</main></div>;
}

function Panel({ title, right, children }) {
  return <div className="panel"><div className="panel-head"><h2>{title}</h2>{right}</div>{children}</div>;
}

function Card({ label, value, green, blue }) {
  return <div className="stat"><span>{label}</span><b className={green ? "green" : blue ? "blue" : ""}>{value}</b></div>;
}

function Field({ label, value, onChange, random, type = "text" }) {
  return <label>{label}<div className="input-row"><input type={type} value={value} onChange={(e) => onChange(e.target.value)} />{random && <button type="button" className="icon-btn" onClick={random} title="随机生成"><Shuffle size={15}/></button>}</div></label>;
}

function Dashboard({ openAgent }) {
  const [data, setData] = useState(null);
  const load = () => api("/api/dashboard").then(setData);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!data) return null;
  return <section><div className="stats"><Card label="服务器总数" value={data.total} /><Card label="在线" value={data.online} green /><Card label="离线" value={data.offline} /><Card label="sing-box 运行中" value={data.activeSingbox} blue /></div><Panel title="最近接入"><AgentTable agents={data.recent} openAgent={openAgent} /></Panel></section>;
}

function Servers({ openAgent }) {
  const [agents, setAgents] = useState([]);
  const [q, setQ] = useState("");
  const load = () => api("/api/agents").then(setAgents);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const list = agents.filter((a) => [a.name, a.host, a.ip, ...(a.tags || [])].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <section><div className="toolbar"><input placeholder="按名称 / 主机 / IP / 标签筛选" value={q} onChange={(e) => setQ(e.target.value)} /><button onClick={load}><RefreshCw size={16}/>刷新</button><TokenButton /></div><Panel title="服务器"><AgentTable agents={list} openAgent={openAgent} /></Panel></section>;
}

function TokenButton() {
  const [token, setToken] = useState("");
  return <button className="primary" onClick={async () => setToken((await api("/api/tokens", { method: "POST" })).token)}><Save size={16}/>生成接入 Token{token && <code>{token}</code>}</button>;
}

function AgentTable({ agents, openAgent }) {
  return <table><thead><tr><th>名称</th><th>主机</th><th>IP</th><th>架构</th><th>在线</th><th>sing-box</th><th>版本</th><th>标签</th><th>最近心跳</th><th>操作</th></tr></thead><tbody>{agents.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.host}</td><td>{a.ip}</td><td>{a.arch}</td><td><StatusDot on={a.connected}/>{a.connected ? "online" : "offline"}</td><td><StatusDot on={a.singboxStatus === "active"}/>{a.singboxStatus}</td><td>{a.singboxVersion}</td><td>{(a.tags || []).join(", ") || "-"}</td><td>{a.lastSeen || "-"}</td><td><button className="link" onClick={() => openAgent(a.id)}>详情</button></td></tr>)}</tbody></table>;
}

function AgentDetail({ id, back, openConfig, openLogs }) {
  const [agent, setAgent] = useState(null);
  const [result, setResult] = useState("-");
  const load = () => api(`/api/agents/${id}`).then(setAgent);
  useEffect(() => { load(); }, [id]);
  const service = async (action) => setResult(JSON.stringify(await api(`/api/agents/${id}/service/${action}`, { method: "POST" }), null, 2));
  const uninstall = async () => {
    if (!confirm("确认卸载这台机器上的 Agent？卸载后该机器会离线，需要重新安装才能接入。")) return;
    setResult(JSON.stringify(await api(`/api/agents/${id}/uninstall`, { method: "POST", body: JSON.stringify({ removeSingbox: false }) }), null, 2));
  };
  if (!agent) return null;
  return <section><div className="toolbar"><button onClick={back}>返回</button><h1>{agent.name} <StatusDot on={agent.connected}/>{agent.connected ? "online" : "offline"}</h1><button onClick={() => service("status")}>刷新</button><button onClick={openConfig}>配置</button><button onClick={openLogs}>日志</button><button className="red-bg" onClick={uninstall}>卸载 Agent</button></div><div className="grid2"><Panel title="基本信息"><dl>{Object.entries(agent).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd></React.Fragment>)}</dl></Panel><Panel title="服务控制"><div className="actions"><button className="green-bg" onClick={() => service("start")}>启动</button><button className="blue-bg" onClick={() => service("restart")}>重启</button><button className="red-bg" onClick={() => service("stop")}>停止</button><button onClick={() => service("status")}>查询状态</button></div><pre>{result}</pre></Panel></div><TerminalPanel agent={agent}/></section>;
}

function TerminalPanel({ agent }) {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const wsRef = useRef(null);
  const boxRef = useRef(null);
  const connect = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/terminal?agentId=${agent.id}`);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setOutput((x) => x + msg.output);
      setTimeout(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight), 0);
    };
  };
  useEffect(() => { connect(); return () => wsRef.current?.close(); }, [agent.id]);
  const send = () => {
    if (!input.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    setOutput((x) => x + input + "\n");
    wsRef.current.send(input);
    setInput("");
  };
  return <Panel title={`SSH 终端 - ${agent.name}`} right={<span><StatusDot on={connected}/>{connected ? "connected" : "closed"}</span>}><div className="terminal" ref={boxRef}>{output}</div><div className="terminal-input"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="输入命令，回车执行" /><button onClick={send}><Terminal size={16}/>发送</button></div></Panel>;
}

function NodeWizard({ agents }) {
  const [form, setForm] = useState({ agentId: "", protocol: "vmess-ws", port: 443, uuid: crypto.randomUUID?.() || randHex(16), path: "/ws", sni: "www.cloudflare.com", serverName: "example.com", privateKey: "CHANGE_ME_REALITY_PRIVATE_KEY", shortId: randShortId(), password: randPassword() });
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => { if (!form.agentId && agents[0]) setForm((x) => ({ ...x, agentId: agents[0].id })); }, [agents, form.agentId]);
  const patch = (key, value) => setForm((x) => ({ ...x, [key]: value }));
  const render = async () => setPreview(JSON.stringify((await api("/api/config/render", { method: "POST", body: JSON.stringify(form) })).config, null, 2));
  const apply = async () => setResult(JSON.stringify(await api(`/api/agents/${form.agentId}/config/wizard`, { method: "POST", body: JSON.stringify(form) }), null, 2));
  return <section><div className="grid2"><Panel title="节点配置" right={<button onClick={render}>预览 JSON</button>}><div className="form-grid"><label>服务器<select value={form.agentId} onChange={(e) => patch("agentId", e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} - {a.ip}</option>)}</select></label><label>协议<select value={form.protocol} onChange={(e) => patch("protocol", e.target.value)}><option value="vmess-ws">VMess + WS</option><option value="vless-reality">VLESS + Reality</option><option value="trojan">Trojan + TLS</option><option value="hysteria2">Hysteria2</option><option value="shadowsocks">Shadowsocks</option><option value="mixed">Mixed</option></select></label><Field label="监听端口" value={form.port} onChange={(v) => patch("port", v)} random={() => patch("port", 20000 + Math.floor(Math.random() * 30000))}/><Field label="UUID" value={form.uuid} onChange={(v) => patch("uuid", v)} random={() => patch("uuid", crypto.randomUUID?.() || randHex(16))}/><Field label="WS 路径" value={form.path} onChange={(v) => patch("path", v)} random={() => patch("path", `/${randHex(3)}`)}/><Field label="SNI / Reality 伪装域名" value={form.sni} onChange={(v) => patch("sni", v)} random={() => patch("sni", ["www.cloudflare.com","www.microsoft.com","www.apple.com","www.yahoo.com"][Math.floor(Math.random()*4)])}/><Field label="Reality 私钥" value={form.privateKey} onChange={(v) => patch("privateKey", v)} random={() => patch("privateKey", "请在服务器执行 sing-box generate reality-keypair")}/><Field label="Reality short_id" value={form.shortId} onChange={(v) => patch("shortId", v)} random={() => patch("shortId", randShortId())}/><Field label="密码" value={form.password} onChange={(v) => patch("password", v)} random={() => patch("password", randPassword())}/></div><div className="actions"><button className="primary" onClick={apply}>下发并重启</button></div><pre>{result}</pre></Panel><Panel title="生成预览"><pre className="preview">{preview || "点击预览 JSON 查看 sing-box 配置"}</pre></Panel></div></section>;
}

function ForwardWizard({ agents }) {
  const [form, setForm] = useState({ agentId: "", network: "tcp", port: 31080, targetHost: "1.1.1.1", targetPort: 80 });
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => { if (!form.agentId && agents[0]) setForm((x) => ({ ...x, agentId: agents[0].id })); }, [agents, form.agentId]);
  const patch = (key, value) => setForm((x) => ({ ...x, [key]: value }));
  const render = async () => setPreview(JSON.stringify((await api("/api/forward/render", { method: "POST", body: JSON.stringify(form) })).config, null, 2));
  const apply = async () => setResult(JSON.stringify(await api(`/api/agents/${form.agentId}/forward/wizard`, { method: "POST", body: JSON.stringify(form) }), null, 2));
  return <section><div className="grid2"><Panel title="端口转发" right={<button onClick={render}>预览 JSON</button>}><div className="form-grid"><label>服务器<select value={form.agentId} onChange={(e) => patch("agentId", e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name} - {a.ip}</option>)}</select></label><label>转发模式<select value={form.network} onChange={(e) => patch("network", e.target.value)}><option value="tcp">TCP</option><option value="udp">UDP</option><option value="tcp_udp">TCP + UDP</option></select></label><Field label="公网监听端口" value={form.port} onChange={(v) => patch("port", v)} random={() => patch("port", 20000 + Math.floor(Math.random() * 30000))}/><Field label="目标地址" value={form.targetHost} onChange={(v) => patch("targetHost", v)} /><Field label="目标端口" value={form.targetPort} onChange={(v) => patch("targetPort", v)} /></div><div className="actions"><button className="primary" onClick={apply}>下发并重启</button></div><pre>{result}</pre></Panel><Panel title="生成预览"><pre className="preview">{preview || "点击预览 JSON 查看转发配置"}</pre></Panel></div></section>;
}

function ConfigPage({ id, back }) {
  const [text, setText] = useState(JSON.stringify(sampleConfig(), null, 2));
  const [versions, setVersions] = useState([]);
  const [msg, setMsg] = useState("");
  const loadVersions = () => api(`/api/agents/${id}/config/versions`).then(setVersions);
  useEffect(() => { loadVersions(); }, [id]);
  const readCurrent = async () => {
    const first = await api(`/api/agents/${id}/config`);
    if (first.config) setText(JSON.stringify(first.config, null, 2));
    setMsg(first.config ? "已读取当前配置" : "已请求 Agent 读取配置，稍后自动刷新");
    setTimeout(async () => {
      const next = await api(`/api/agents/${id}/config`);
      if (next.config) setText(JSON.stringify(next.config, null, 2));
    }, 900);
  };
  const format = () => setText(JSON.stringify(JSON.parse(text), null, 2));
  const apply = async () => { const r = await api(`/api/agents/${id}/config`, { method: "POST", body: JSON.stringify({ config: JSON.parse(text), restart: true }) }); setMsg(JSON.stringify(r)); loadVersions(); };
  return <section><div className="toolbar"><button onClick={back}>返回</button><h1>sing-box 配置</h1><button onClick={readCurrent}>读取当前</button><button onClick={format}>格式化</button><button onClick={() => { JSON.parse(text); setMsg("JSON 校验通过"); }}>校验</button><button className="primary" onClick={apply}>应用并重启</button></div><div className="grid-config"><Panel title="JSON 编辑器" right={<span>{new Blob([text]).size} bytes</span>}><textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}/><p>{msg}</p></Panel><Panel title="历史版本" right={<button onClick={loadVersions}>刷新</button>}>{versions.length ? versions.map((v) => <div className="version" key={v.id}><span>{v.at}</span><button onClick={async () => { await api(`/api/agents/${id}/config/rollback/${v.id}`, { method: "POST" }); setMsg("已请求回滚"); }}><RotateCcw size={15}/>回滚</button></div>) : <div className="empty">暂无数据</div>}</Panel></div></section>;
}

function LogsPage({ id, back }) {
  const [lines, setLines] = useState([]);
  const [n, setN] = useState(200);
  useEffect(() => { const es = new EventSource(`/api/agents/${id}/logs/stream?lines=${n}`); es.onmessage = (e) => setLines((xs) => [...xs, JSON.parse(e.data).line].slice(-1000)); return () => es.close(); }, [id, n]);
  return <section><div className="toolbar"><button onClick={back}>返回</button><h1>sing-box 日志</h1><button onClick={() => setN(Math.max(50, n - 50))}>-</button><input className="small" value={n} onChange={(e) => setN(Number(e.target.value) || 200)} /><button onClick={() => setN(n + 50)}>+</button><button className="red-bg" onClick={() => setLines([])}><Trash2 size={16}/>清屏</button></div><Panel title={<><StatusDot on/>实时</>} right={<span>{lines.length} 行</span>}><pre className="logs">{lines.join("\n")}</pre></Panel></section>;
}

function ApiTokens() {
  const [rows, setRows] = useState([]);
  const [created, setCreated] = useState("");
  const [name, setName] = useState("automation");
  const load = () => api("/api/api-tokens").then(setRows);
  useEffect(() => { load(); }, []);
  const create = async () => { const r = await api("/api/api-tokens", { method: "POST", body: JSON.stringify({ name }) }); setCreated(r.token); load(); };
  return <section><div className="toolbar"><input value={name} onChange={(e) => setName(e.target.value)} /><button className="primary" onClick={create}>生成 API Token</button>{created && <code>{created}</code>}</div><Panel title="API 令牌"><table><thead><tr><th>名称</th><th>Token</th><th>创建时间</th><th>状态</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id || r.name}><td>{r.name}</td><td><code>{r.token}</code></td><td>{r.createdAt}</td><td>{r.revoked ? "revoked" : "active"}</td></tr>)}</tbody></table></Panel></section>;
}

function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/api/audit").then(setRows); }, []);
  return <Panel title="审计日志"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th><th>详情</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.at}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.target}</td><td><code>{JSON.stringify(r.detail)}</code></td></tr>)}</tbody></table></Panel>;
}

function Tutorial() {
  const cards = [
    ["节点配置", "选择服务器和协议，随机生成 UUID、密码、short_id，预览 JSON 后下发。VLESS Reality 的私钥请在服务器执行 sing-box generate reality-keypair。"],
    ["端口转发", "进入端口转发页，选择 TCP、UDP 或 TCP+UDP，填写公网端口和目标地址。Docker 部署使用 host network，新端口会直接监听宿主机。"],
    ["SSH 终端", "服务器详情页提供终端窗口。它通过 Agent 长连接执行命令并实时回显，适合排错和轻量维护。"],
    ["API Token", "API 令牌可交给自动化或 AI。请求头使用 Authorization: Bearer ck_xxx。带错 token 会被拒绝，生产可开启强制鉴权。"],
    ["卸载 Agent", "服务器详情页可卸载 Agent。卸载后该节点离线，但 sing-box 默认保留，避免误删服务。"]
  ];
  return <section><div className="guide-grid">{cards.map(([title, body]) => <div className="guide-card" key={title}><h3>{title}</h3><p>{body}</p></div>)}</div></section>;
}

function sampleConfig() {
  return { log: { level: "info" }, dns: { servers: [{ tag: "cloudflare", type: "udp", server: "1.1.1.1" }], final: "cloudflare" }, inbounds: [], outbounds: [{ type: "direct", tag: "direct" }], route: { final: "direct" } };
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [agentId, setAgentId] = useState("");
  const [agents, setAgents] = useState([]);
  const loadAgents = () => api("/api/agents").then(setAgents);
  useEffect(() => { loadAgents(); const t = setInterval(loadAgents, 5000); return () => clearInterval(t); }, []);
  const openAgent = (id) => { setAgentId(id); setPage("detail"); };
  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard openAgent={openAgent}/>;
    if (page === "servers") return <Servers openAgent={openAgent}/>;
    if (page === "nodes") return <NodeWizard agents={agents}/>;
    if (page === "forward") return <ForwardWizard agents={agents}/>;
    if (page === "detail") return <AgentDetail id={agentId} back={() => setPage("servers")} openConfig={() => setPage("config")} openLogs={() => setPage("logs")}/>;
    if (page === "config") return <ConfigPage id={agentId} back={() => setPage("detail")}/>;
    if (page === "logs") return <LogsPage id={agentId} back={() => setPage("detail")}/>;
    if (page === "tokens") return <ApiTokens/>;
    if (page === "audit") return <Audit/>;
    return <Tutorial/>;
  }, [page, agentId, agents]);
  return <Layout page={["detail","config","logs"].includes(page) ? "servers" : page} setPage={setPage}>{content}</Layout>;
}

createRoot(document.getElementById("root")).render(<App />);
