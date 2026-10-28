import React, { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Search,
  Server,
  Terminal,
  X,
} from "lucide-react";
import { formatDateTime, formatPercent, formatSpeed } from "../utils";

export function ResourceMeter({ label, value, stale = false }) {
  const percentage = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className={`resource-meter ${stale ? "stale" : ""}`}>
      <div>
        <span>{label}</span>
        <strong>{value == null ? "—" : formatPercent(percentage)}</strong>
      </div>
      <div className="meter-track">
        <span
          className={
            percentage >= 90 ? "critical" : percentage >= 75 ? "warm" : ""
          }
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function ServerInventory({
  agents,
  pending,
  error,
  updatedAt,
  refresh,
  openAgent,
  openSsh,
  title = "服务器",
  description = "统一管理连接状态、资源负载与节点服务。",
  action,
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("attention");
  const counts = useMemo(
    () => ({
      all: agents.length,
      online: agents.filter((a) => a.connected).length,
      offline: agents.filter((a) => !a.connected).length,
    }),
    [agents],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return agents
      .filter(
        (agent) =>
          (filter === "all" ||
            Boolean(agent.connected) === (filter === "online")) &&
          [
            agent.name,
            agent.host,
            agent.ip,
            agent.region,
            agent.group,
            ...(agent.tags || []),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(needle),
      )
      .sort((a, b) => {
        if (sort === "name")
          return String(a.name).localeCompare(String(b.name), "zh-CN", {
            numeric: true,
          });
        if (sort === "cpu")
          return (
            Number(b.metrics?.cpu?.usage || 0) -
            Number(a.metrics?.cpu?.usage || 0)
          );
        return (
          Number(a.connected) - Number(b.connected) ||
          String(a.name).localeCompare(String(b.name), "zh-CN")
        );
      });
  }, [agents, query, filter, sort]);
  return (
    <div className="inventory-panel">
      <div className="inventory-heading">
        <div>
          <h2>
            {title}
            <span>{agents.length}</span>
          </h2>
          <p>{description}</p>
        </div>
        {action}
      </div>
      <div className="inventory-tools">
        <div
          className="inventory-tabs"
          role="group"
          aria-label="服务器状态筛选"
        >
          {[
            ["all", "全部"],
            ["online", "在线"],
            ["offline", "离线"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
              <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="inventory-search">
          <Search size={16} />
          <input
            aria-label="搜索服务器"
            placeholder="搜索名称、IP 或标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query ? (
            <button aria-label="清空搜索" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          ) : null}
        </div>
        <label className="inventory-sort">
          <span className="sr-only">排序方式</span>
          <select
            aria-label="排序方式"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="attention">异常优先</option>
            <option value="name">名称排序</option>
            <option value="cpu">CPU 从高到低</option>
          </select>
          <ChevronDown size={13} />
        </label>
      </div>
      {error ? (
        <div className="request-error" role="alert">
          <span>
            {updatedAt
              ? "自动更新中断，正在显示上次数据。"
              : "暂时无法加载服务器。"}{" "}
            {error}
          </span>
          <button onClick={refresh} disabled={pending}>
            重试
          </button>
        </div>
      ) : null}
      {pending && !updatedAt && !error ? (
        <div
          className="inventory-skeleton"
          role="status"
          aria-label="正在加载服务器"
        >
          {[0, 1, 2].map((n) => (
            <div key={n}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : null}
      {updatedAt && filtered.length === 0 ? (
        <div className="inventory-empty">
          <Server size={30} strokeWidth={1.4} />
          <h3>{agents.length ? "没有匹配的服务器" : "等待第一台服务器接入"}</h3>
          <p>
            {agents.length
              ? "试试其他关键词，或清除状态筛选。"
              : "创建接入令牌，在目标服务器运行安装命令后即可看到实时状态。"}
          </p>
          {agents.length ? (
            <button
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              重置筛选
            </button>
          ) : (
            action
          )}
        </div>
      ) : null}
      {filtered.length ? (
        <div className="inventory-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>服务器</th>
                <th>连接状态</th>
                <th>资源使用</th>
                <th>实时流量</th>
                <th>最近心跳</th>
                <th>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent, index) => (
                <tr
                  key={agent.id}
                  className={!agent.connected ? "server-disconnected" : ""}
                >
                  <td data-label="服务器">
                    <div className="server-identity">
                      <span className={`server-avatar avatar-${index % 3}`}>
                        <Server size={18} />
                      </span>
                      <div>
                        <button
                          className="server-name"
                          onClick={() => openAgent(agent.id)}
                        >
                          {agent.name || agent.host || agent.id}
                        </button>
                        <span className="server-address">
                          {agent.ip || agent.host || "未上报地址"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td data-label="连接状态">
                    <span
                      className={`connection-badge ${agent.connected ? "connected" : "disconnected"}`}
                    >
                      <i />
                      {agent.connected ? "在线" : "离线"}
                    </span>
                    <small className="service-caption">
                      {!agent.connected
                        ? "服务状态待确认"
                        : agent.singboxStatus === "active"
                          ? `sing-box ${agent.singboxVersion || "运行中"}`
                          : "sing-box 未运行"}
                    </small>
                  </td>
                  <td data-label="资源使用">
                    <div className="server-resources">
                      <ResourceMeter
                        label="CPU"
                        value={agent.metrics?.cpu?.usage}
                        stale={!agent.connected}
                      />
                      <ResourceMeter
                        label="内存"
                        value={agent.metrics?.memory?.usage}
                        stale={!agent.connected}
                      />
                    </div>
                  </td>
                  <td data-label="实时流量">
                    <div className="server-traffic">
                      <span>
                        <ArrowDown size={12} />
                        {agent.connected
                          ? formatSpeed(agent.metrics?.network?.rxRate)
                          : "—"}
                      </span>
                      <span>
                        <ArrowUp size={12} />
                        {agent.connected
                          ? formatSpeed(agent.metrics?.network?.txRate)
                          : "—"}
                      </span>
                    </div>
                  </td>
                  <td data-label="最近心跳">
                    <time
                      className="server-heartbeat"
                      dateTime={agent.lastSeen}
                      title={
                        agent.lastSeen
                          ? formatDateTime(agent.lastSeen)
                          : "暂无心跳"
                      }
                    >
                      {formatDateTime(agent.lastSeen)}
                    </time>
                    {!agent.connected ? (
                      <small className="stale-caption">历史数据</small>
                    ) : (
                      <small className="service-caption">每 5 秒更新</small>
                    )}
                  </td>
                  <td className="inventory-row-actions">
                    <button
                      title={
                        agent.connected ? "打开终端" : "节点离线，无法打开终端"
                      }
                      aria-label={`打开 ${agent.name} 的终端`}
                      disabled={!agent.connected}
                      onClick={() => openSsh?.(agent.id)}
                    >
                      <Terminal size={16} />
                      <span>终端</span>
                    </button>
                    <button
                      className="server-detail"
                      aria-label={`查看 ${agent.name} 详情`}
                      onClick={() => openAgent(agent.id)}
                    >
                      <ArrowUpRight size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="inventory-foot">
        <span>
          显示 {filtered.length} / {agents.length} 台服务器
        </span>
        <span>
          {updatedAt
            ? `最近同步 ${updatedAt.toLocaleTimeString("zh-CN", { hour12: false })}`
            : "等待同步"}
        </span>
      </div>
    </div>
  );
}
