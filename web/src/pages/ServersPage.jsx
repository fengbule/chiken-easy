import React, { useMemo, useState } from "react";
import { Search, Server, Shield, TerminalSquare } from "lucide-react";
import { formatPercent, formatSpeed } from "../utils";
import { StatusDot } from "../components/StatusBadge";

function AgentMetricSummary({ metrics }) {
  if (!metrics) return <span className="muted">等待探针</span>;
  return (
    <div className="metric-inline">
      <span>CPU {formatPercent(metrics.cpu?.usage)}</span>
      <span>内存 {formatPercent(metrics.memory?.usage)}</span>
      <span>磁盘 {formatPercent(metrics.disk?.usage)}</span>
    </div>
  );
}

function AgentTrafficSummary({ metrics }) {
  if (!metrics) return <span className="muted">等待探针</span>;
  return (
    <div className="metric-inline">
      <span>下行 {formatSpeed(metrics.network?.rxRate)}</span>
      <span>上行 {formatSpeed(metrics.network?.txRate)}</span>
    </div>
  );
}

export default function ServersPage({ agents, openAgent, openSsh }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return agents;
    return agents.filter((agent) =>
      [agent.name, agent.host, agent.ip, agent.group, agent.region, ...(agent.tags || [])].join(" ").toLowerCase().includes(term)
    );
  }, [agents, query]);

  const summary = useMemo(
    () => ({
      total: filtered.length,
      online: filtered.filter((agent) => agent.connected).length,
      sshReady: filtered.filter((agent) => agent.sshConfigured).length
    }),
    [filtered]
  );

  return (
    <section>
      <div className="stats">
        <div className="stat">
          <span>服务器总数</span>
          <b>{summary.total}</b>
        </div>
        <div className="stat">
          <span>在线</span>
          <b className="green">{summary.online}</b>
        </div>
        <div className="stat">
          <span>SSH 已配置</span>
          <b className="blue">{summary.sshReady}</b>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search">
          <Search size={16} />
          <input placeholder="搜索名称 / 主机 / IP / 标签 / 地区" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      <div className="card-grid">
        {filtered.map((agent) => (
          <div className="data-card server-card" key={agent.id}>
            <div className="data-card-head">
              <strong>{agent.name}</strong>
              <span className={agent.connected ? "server-pill ok" : "server-pill"}>{agent.connected ? "在线" : "离线"}</span>
            </div>
            <p className="muted">{agent.host || "-"} / {agent.ip || "-"}</p>
            <p className="muted">{agent.group || "未分组"} / {agent.region || "未标注地区"}</p>
            <div className="server-meta">
              <span><Server size={14} /> {agent.singboxStatus || "unknown"}</span>
              <span><Shield size={14} /> {agent.sshConfigured ? "SSH 就绪" : "SSH 未配置"}</span>
              <span><TerminalSquare size={14} /> {agent.arch || "-"}</span>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => openAgent(agent.id)}>详情</button>
              <button onClick={() => openSsh(agent.id)}>SSH</button>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>服务器列表</h2>
          <span>{filtered.length} 台</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>主机</th>
              <th>IP</th>
              <th>在线</th>
              <th>sing-box</th>
              <th>SSH</th>
              <th>监控</th>
              <th>流量</th>
              <th>最近心跳</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((agent) => (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.host}</td>
                <td>{agent.ip}</td>
                <td>
                  <StatusDot on={agent.connected} />
                  {agent.connected ? "online" : "offline"}
                </td>
                <td>{agent.singboxStatus}</td>
                <td>{agent.sshConfigured ? `${agent.sshMode}@${agent.sshPort}` : "未配置"}</td>
                <td><AgentMetricSummary metrics={agent.metrics} /></td>
                <td><AgentTrafficSummary metrics={agent.metrics} /></td>
                <td>{agent.lastSeen || "-"}</td>
                <td className="actions-cell">
                  <button className="link" onClick={() => openAgent(agent.id)}>详情</button>
                  <button className="link" onClick={() => openSsh(agent.id)}>SSH</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
