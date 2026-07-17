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

function Card({ label, value, tone = "default", hint }) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-accent" />
      <span>{label}</span>
      <b>{value}</b>
      {hint ? <small>{hint}</small> : null}
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
    <div className="table-scroll">
    <table className="agent-table">
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

  if (!data) return <section className="dashboard-page"><Panel title="仪表盘"><div className="empty dashboard-loading"><span className="loading-orbit" />正在同步控制面数据...</div></Panel></section>;

  return (
    <section className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <span className="hero-kicker">INFRASTRUCTURE OVERVIEW</span>
          <h1>基础设施总览</h1>
          <p>集中查看 Agent 在线状态、资源负载与实时网络吞吐。</p>
        </div>
        <div className={`health-summary ${data.offline ? "health-warning" : ""}`}>
          <span className="health-pulse" />
          <span><strong>{data.offline ? `${data.offline} 个节点待检查` : "所有节点运行正常"}</strong><small>{data.online} / {data.total} Agent 在线</small></span>
        </div>
      </div>
      <div className="stats">
        <Card label="服务器总数" value={data.total} hint="已纳管节点" />
        <Card label="在线 Agent" value={data.online} tone="success" hint="连接正常" />
        <Card label="离线 Agent" value={data.offline} tone={data.offline ? "danger" : "success"} hint={data.offline ? "需要检查" : "无异常"} />
        <Card label="sing-box 活跃" value={data.activeSingbox} tone="primary" hint="服务实例" />
        <Card label="平均 CPU" value={formatPercent(data.averageCpu)} tone="violet" hint="实时负载" />
        <Card label="总下行" value={formatSpeed(data.totalRxRate)} tone="cyan" hint="接收速率" />
        <Card label="总上行" value={formatSpeed(data.totalTxRate)} tone="amber" hint="发送速率" />
      </div>
      <Panel title="节点运行状态" right={<span className="panel-meta">每 5 秒自动刷新</span>}>
        <AgentTable agents={data.recent} openAgent={openAgent} openSsh={openSsh} />
      </Panel>
    </section>
  );
}

export default Dashboard;
