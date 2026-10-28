import React from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  CircleCheck,
  Code2,
  Link2,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { formatPercent, formatSpeed } from "../utils";
import useAgents from "../hooks/useAgents";
import ServerInventory, { ResourceMeter } from "../components/ServerInventory";

export default function Dashboard({ openAgent, openSsh, navigate }) {
  const state = useAgents();
  const { agents, pending, updatedAt, refresh } = state;
  const online = agents.filter((agent) => agent.connected);
  const offline = agents.length - online.length;
  const active = online.filter(
    (agent) => agent.singboxStatus === "active",
  ).length;
  const average = online.length
    ? online.reduce((n, a) => n + Number(a.metrics?.cpu?.usage || 0), 0) /
      online.length
    : 0;
  const rx = online.reduce(
    (n, a) => n + Number(a.metrics?.network?.rxRate || 0),
    0,
  );
  const tx = online.reduce(
    (n, a) => n + Number(a.metrics?.network?.txRate || 0),
    0,
  );
  const busiest = [...online]
    .sort(
      (a, b) =>
        Number(b.metrics?.cpu?.usage || 0) - Number(a.metrics?.cpu?.usage || 0),
    )
    .slice(0, 3);
  const issues = agents.filter(
    (a) =>
      !a.connected ||
      a.singboxStatus !== "active" ||
      Number(a.metrics?.cpu?.usage) >= 90 ||
      Number(a.metrics?.memory?.usage) >= 90 ||
      Number(a.metrics?.disk?.usage) >= 90,
  );
  return (
    <section className="control-dashboard">
      <div className="workbench-title">
        <div>
          <div className="page-overline">
            <span />
            你的连接，一目了然
          </div>
          <h1>
            工作台<span>Overview</span>
          </h1>
          <p>从这里掌握服务器状态，开始今天的管理工作。</p>
        </div>
        <div className="workbench-title-actions">
          <button onClick={refresh} disabled={pending} aria-label="刷新服务器">
            <RefreshCw size={15} className={pending ? "is-spinning" : ""} />
            刷新
          </button>
          <button className="primary" onClick={() => navigate("servers")}>
            <Plus size={16} />
            接入服务器
          </button>
        </div>
      </div>
      <div className="overview-stats">
        <div className="overview-stat">
          <div className="overview-stat-label">
            服务器总览
            <Server size={17} />
          </div>
          <strong>
            {updatedAt ? agents.length : "—"}
            <small>台</small>
          </strong>
          <div className="overview-stat-note">
            <span className="status-point" />
            {online.length} 在线
            <span className="note-divider" />
            {offline} 离线
          </div>
        </div>
        <div className="overview-stat">
          <div className="overview-stat-label">
            运行中的服务
            <Activity size={17} />
          </div>
          <strong>
            {updatedAt ? active : "—"}
            <small>个</small>
          </strong>
          <div className="overview-stat-note">已连接节点的 sing-box 实例</div>
        </div>
        <div className="overview-stat">
          <div className="overview-stat-label">
            平均 CPU 负载
            <CircleCheck size={17} />
          </div>
          <strong>{updatedAt ? formatPercent(average) : "—"}</strong>
          <div className="overview-stat-note">
            {online.length
              ? `${online.length} 台在线服务器的实时均值`
              : "等待服务器接入"}
          </div>
        </div>
        <div className="overview-stat traffic-stat">
          <div className="overview-stat-label">
            网络吞吐
            <ArrowUpRight size={17} />
          </div>
          <strong>{updatedAt ? formatSpeed(rx) : "—"}</strong>
          <div className="overview-stat-note">
            <ArrowDown size={12} />
            接收
            <span className="note-divider" />
            <ArrowUp size={12} />
            发送 {formatSpeed(tx)}
          </div>
        </div>
      </div>
      <div className="workbench-grid">
        <div className="workbench-primary">
          <ServerInventory
            {...state}
            openAgent={openAgent}
            openSsh={openSsh}
            title="我的服务器"
            description="实时查看节点状态，离线节点优先显示。"
            action={
              <button
                className="text-action"
                onClick={() => navigate("servers")}
              >
                管理全部
                <ArrowRight size={14} />
              </button>
            }
          />
          <div className="quick-actions-panel">
            <div className="section-heading">
              <h2>常用操作</h2>
              <span>少走一步，更快连接</span>
            </div>
            <div className="quick-actions-grid">
              {[
                ["console", Terminal, "打开终端", "直接连接在线服务器"],
                ["nodes", Code2, "配置节点", "按向导生成连接配置"],
                ["subscriptions", Link2, "管理订阅", "集中分发与聚合节点"],
              ].map(([id, Icon, label, note]) => (
                <button
                  key={id}
                  onClick={() =>
                    id === "console"
                      ? online.length
                        ? openSsh(online[0].id)
                        : navigate("servers")
                      : navigate(id)
                  }
                >
                  <span className="quick-action-icon">
                    <Icon size={19} />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{note}</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="workbench-secondary">
          <div className="attention-panel">
            <div className="section-heading">
              <h2>需要关注</h2>
              <span
                className={`attention-count ${issues.length ? "has-issues" : ""}`}
              >
                {issues.length}
              </span>
            </div>
            {!updatedAt ? (
              <p className="muted">正在读取节点状态…</p>
            ) : !agents.length ? (
              <div className="attention-clear">
                <Server size={24} />
                <strong>还没有服务器</strong>
                <p>从接入第一台服务器开始。</p>
              </div>
            ) : !issues.length ? (
              <div className="attention-clear">
                <ShieldCheck size={27} />
                <strong>一切运行正常</strong>
                <p>在线节点的服务与资源状态正常。</p>
              </div>
            ) : (
              <div className="attention-items">
                {issues.slice(0, 5).map((agent) => (
                  <button key={agent.id} onClick={() => openAgent(agent.id)}>
                    <span
                      className={`issue-indicator ${agent.connected ? "issue-warm" : ""}`}
                    />
                    <span>
                      <strong>{agent.name}</strong>
                      <small>
                        {!agent.connected
                          ? "Agent 离线 · 检查连接"
                          : agent.singboxStatus !== "active"
                            ? "sing-box 服务未运行"
                            : "资源使用接近上限"}
                      </small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            )}
            <button
              className="attention-link"
              onClick={() => navigate("monitor")}
            >
              查看监控与告警
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="load-panel">
            <div className="section-heading">
              <h2>资源速览</h2>
              <span>在线节点</span>
            </div>
            {busiest.length ? (
              busiest.map((agent) => (
                <div className="load-node" key={agent.id}>
                  <button onClick={() => openAgent(agent.id)}>
                    {agent.name}
                    <ArrowUpRight size={13} />
                  </button>
                  <ResourceMeter
                    label="CPU"
                    value={agent.metrics?.cpu?.usage}
                  />
                  <ResourceMeter
                    label="内存"
                    value={agent.metrics?.memory?.usage}
                  />
                  <ResourceMeter
                    label="磁盘"
                    value={agent.metrics?.disk?.usage}
                  />
                </div>
              ))
            ) : (
              <p className="muted">节点在线后显示资源情况。</p>
            )}
          </div>
          <div className="workspace-tip">
            <span className="tip-symbol">⌘</span>
            <strong>一个入口，管理所有连接</strong>
            <p>节点配置、文件传输和运行日志，都能从服务器详情直接打开。</p>
            <button onClick={() => navigate("workspace")}>
              查看资产工作区
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
