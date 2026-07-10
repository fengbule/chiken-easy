import React, { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, formatPercent, formatSpeed } from "../utils";
import { StatusDot } from "../components/StatusBadge";

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

function AgentTable({ agents, openAgent, openSsh }) {
  if (!agents.length) {
    return <div className="empty">No Agent data yet. Please confirm the admin session is valid and wait for Agent heartbeat.</div>;
  }

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

function Dashboard({ openAgent, openSsh }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => api("/api/dashboard").then(setData).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);

  if (!data) return <Panel title="Dashboard"><div className="empty">Loading dashboard data...</div></Panel>;

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

export default Dashboard;
