import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ClipboardList, Monitor, RefreshCw, RotateCcw, Save, Server, Settings, Terminal, Trash2 } from "lucide-react";
import "./style.css";

const api = async (url, options) => {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
};

const nav = [
  ["dashboard", Activity, "仪表盘"],
  ["servers", Monitor, "服务器"],
  ["audit", ClipboardList, "审计日志"],
  ["settings", Settings, "设置"]
];

function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
}

function Layout({ page, setPage, children }) {
  return <div className="app">
    <aside>
      <div className="brand">ChikenEasy</div>
      {nav.map(([id, Icon, label]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={18} />{label}</button>)}
    </aside>
    <main>
      <header><strong>{nav.find(([id]) => id === page)?.[2] || "服务器"}</strong><span>admin</span></header>
      {children}
    </main>
  </div>;
}

function Dashboard({ openAgent }) {
  const [data, setData] = useState(null);
  const load = () => api("/api/dashboard").then(setData);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!data) return null;
  return <section>
    <div className="stats">
      <Card label="服务器总数" value={data.total} />
      <Card label="在线" value={data.online} green />
      <Card label="离线" value={data.offline} />
      <Card label="sing-box 运行中" value={data.activeSingbox} blue />
    </div>
    <Panel title="最近接入">
      <AgentTable agents={data.recent} openAgent={openAgent} compact />
    </Panel>
  </section>;
}

function Card({ label, value, green, blue }) {
  return <div className="stat"><span>{label}</span><b className={green ? "green" : blue ? "blue" : ""}>{value}</b></div>;
}

function Panel({ title, right, children }) {
  return <div className="panel"><div className="panel-head"><h2>{title}</h2>{right}</div>{children}</div>;
}

function Servers({ openAgent }) {
  const [agents, setAgents] = useState([]);
  const [q, setQ] = useState("");
  const load = () => api("/api/agents").then(setAgents);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const list = agents.filter((a) => [a.name, a.host, a.ip, ...(a.tags || [])].join(" ").toLowerCase().includes(q.toLowerCase()));
  return <section>
    <div className="toolbar"><input placeholder="按名称 / 主机 / IP / 标签筛选" value={q} onChange={(e) => setQ(e.target.value)} /><button onClick={load}><RefreshCw size={16}/>刷新</button><TokenButton /></div>
    <Panel title="服务器"><AgentTable agents={list} openAgent={openAgent} /></Panel>
  </section>;
}

function TokenButton() {
  const [token, setToken] = useState("");
  return <button className="primary" onClick={async () => setToken((await api("/api/tokens", { method: "POST" })).token)}><Save size={16}/>生成接入 Token{token && <code>{token}</code>}</button>;
}

function AgentTable({ agents, openAgent }) {
  return <table><thead><tr><th>名称</th><th>主机</th><th>IP</th><th>架构</th><th>在线</th><th>sing-box</th><th>版本</th><th>标签</th><th>最近心跳</th><th>操作</th></tr></thead>
    <tbody>{agents.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.host}</td><td>{a.ip}</td><td>{a.arch}</td><td><StatusDot on={a.connected}/>{a.connected ? "online" : "offline"}</td><td><StatusDot on={a.singboxStatus === "active"}/>{a.singboxStatus}</td><td>{a.singboxVersion}</td><td>{(a.tags || []).join(", ") || "-"}</td><td>{a.lastSeen || "-"}</td><td><button className="link" onClick={() => openAgent(a.id)}>详情</button></td></tr>)}</tbody></table>;
}

function AgentDetail({ id, back }) {
  const [agent, setAgent] = useState(null);
  const [result, setResult] = useState("-");
  const load = () => api(`/api/agents/${id}`).then(setAgent);
  useEffect(() => { load(); }, [id]);
  const service = async (action) => setResult(JSON.stringify(await api(`/api/agents/${id}/service/${action}`, { method: "POST" }), null, 2));
  if (!agent) return null;
  return <section>
    <div className="toolbar"><button onClick={back}>返回</button><h1>{agent.name} <StatusDot on={agent.connected}/>{agent.connected ? "online" : "offline"}</h1><button onClick={() => service("status")}>刷新</button><button onClick={() => window.dispatchEvent(new CustomEvent("open-config", { detail: id }))}>配置</button><button onClick={() => window.dispatchEvent(new CustomEvent("open-logs", { detail: id }))}>日志</button></div>
    <div className="grid2">
      <Panel title="基本信息"><dl>{Object.entries(agent).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd></React.Fragment>)}</dl></Panel>
      <Panel title="服务控制"><div className="actions"><button className="green-bg" onClick={() => service("start")}>启动</button><button className="blue-bg" onClick={() => service("restart")}>重启</button><button className="red-bg" onClick={() => service("stop")}>停止</button><button onClick={() => service("status")}>查询状态</button></div><pre>{result}</pre></Panel>
    </div>
  </section>;
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
  return <section><div className="toolbar"><button onClick={back}>返回</button><h1>sing-box 配置</h1><button onClick={readCurrent}>读取当前</button><button onClick={format}>格式化</button><button onClick={() => { JSON.parse(text); setMsg("JSON 校验通过"); }}>校验</button><button className="primary" onClick={apply}>应用并重启</button></div>
    <div className="grid-config"><Panel title="JSON 编辑器" right={<span>{new Blob([text]).size} bytes</span>}><textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}/><p>{msg}</p></Panel>
    <Panel title="历史版本" right={<button onClick={loadVersions}>刷新</button>}>{versions.length ? versions.map((v) => <div className="version" key={v.id}><span>{v.at}</span><button onClick={async () => { await api(`/api/agents/${id}/config/rollback/${v.id}`, { method: "POST" }); setMsg("已请求回滚"); }}><RotateCcw size={15}/>回滚</button></div>) : <div className="empty">暂无数据</div>}</Panel></div></section>;
}

function LogsPage({ id, back }) {
  const [lines, setLines] = useState([]);
  const [n, setN] = useState(200);
  useEffect(() => {
    const es = new EventSource(`/api/agents/${id}/logs/stream?lines=${n}`);
    es.onmessage = (e) => setLines((xs) => [...xs, JSON.parse(e.data).line].slice(-1000));
    return () => es.close();
  }, [id, n]);
  return <section><div className="toolbar"><button onClick={back}>返回</button><h1>sing-box 日志</h1><button onClick={() => setN(Math.max(50, n - 50))}>-</button><input className="small" value={n} onChange={(e) => setN(Number(e.target.value) || 200)} /><button onClick={() => setN(n + 50)}>+</button><button className="red-bg" onClick={() => setLines([])}><Trash2 size={16}/>清屏</button></div><Panel title={<><StatusDot on/>实时</>} right={<span>{lines.length} 行</span>}><pre className="logs">{lines.join("\n")}</pre></Panel></section>;
}

function Audit() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api("/api/audit").then(setRows); }, []);
  return <Panel title="审计日志"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>目标</th><th>详情</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{r.at}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.target}</td><td><code>{JSON.stringify(r.detail)}</code></td></tr>)}</tbody></table></Panel>;
}

function SettingsPage() {
  return <Panel title="接入说明"><pre>{`中控: PORT=7788 npm start
Agent: CHIKEN_SERVER=ws://你的中控:7788/agent CHIKEN_TOKEN=面板生成的Token npm run dev:agent
生产环境建议使用 nginx/Caddy 终止 TLS，并为 /agent 启用客户端证书校验。`}</pre></Panel>;
}

function sampleConfig() {
  return { log: { level: "info" }, dns: { servers: [{ tag: "cloudflare", type: "udp", server: "1.1.1.1" }], final: "cloudflare" }, inbounds: [], outbounds: [{ type: "direct", tag: "direct" }] };
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [agentId, setAgentId] = useState("");
  const openAgent = (id) => { setAgentId(id); setPage("detail"); };
  useEffect(() => {
    const c = (e) => { setAgentId(e.detail); setPage("config"); };
    const l = (e) => { setAgentId(e.detail); setPage("logs"); };
    window.addEventListener("open-config", c); window.addEventListener("open-logs", l);
    return () => { window.removeEventListener("open-config", c); window.removeEventListener("open-logs", l); };
  }, []);
  const content = useMemo(() => {
    if (page === "dashboard") return <Dashboard openAgent={openAgent}/>;
    if (page === "servers") return <Servers openAgent={openAgent}/>;
    if (page === "detail") return <AgentDetail id={agentId} back={() => setPage("servers")}/>;
    if (page === "config") return <ConfigPage id={agentId} back={() => setPage("detail")}/>;
    if (page === "logs") return <LogsPage id={agentId} back={() => setPage("detail")}/>;
    if (page === "audit") return <Audit/>;
    return <SettingsPage/>;
  }, [page, agentId]);
  return <Layout page={["detail","config","logs"].includes(page) ? "servers" : page} setPage={setPage}>{content}</Layout>;
}

createRoot(document.getElementById("root")).render(<App />);
