import React, { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, formatDateTime, formatPercent, formatSpeed } from "../utils";

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
    ["内存", samples.map((item) => item.memory ?? item.memoryUsage), `${formatPercent(latest.memory ?? latest.memoryUsage ?? 0)}`],
    ["下行", samples.map((item) => item.rxRate ?? item.rxSpeed), formatSpeed(latest.rxRate ?? latest.rxSpeed ?? 0)],
    ["上行", samples.map((item) => item.txRate ?? item.txSpeed), formatSpeed(latest.txRate ?? latest.txSpeed ?? 0)]
  ];

  if (!samples.length) return <p className="panel-message">暂时还没有足够的实时样本用于绘图。</p>;

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

function MonitorPage({ openAgent }) {
  const [summary, setSummary] = useState(null);
  const [probes, setProbes] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [history, setHistory] = useState({ raw: [], aggregated: [] });
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [summaryData, probesData, eventData] = await Promise.all([api("/api/monitor/summary"), api("/api/public/probes"), api("/api/public/events")]);
      setSummary(summaryData);
      setProbes(probesData);
      setEvents(eventData);
      const fallbackId = selectedAgentId || probesData[0]?.id || "";
      if (fallbackId && fallbackId !== selectedAgentId) setSelectedAgentId(fallbackId);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    const timer = setInterval(() => load().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedAgentId) return;
    api(`/api/public/probes/history?agentId=${encodeURIComponent(selectedAgentId)}`)
      .then(setHistory)
      .catch((error) => setMessage(error.message));
  }, [selectedAgentId]);

  return (
    <section>
      <div className="stats">
        <Card label="公开探针" value={summary?.total || 0} />
        <Card label="在线" value={summary?.online || 0} green />
        <Card label="离线" value={summary?.offline || 0} />
        <Card label="地区数" value={summary?.regions || 0} blue />
        <Card label="总流量" value={formatBytes(summary?.totalTraffic || 0)} />
        <Card label="实时下行" value={formatSpeed(summary?.totalRxSpeed || 0)} />
        <Card label="实时上行" value={formatSpeed(summary?.totalTxSpeed || 0)} />
      </div>

      <Panel title="公开探针卡片" right={<button onClick={() => load().catch(() => {})}>刷新</button>}>
        {probes.length ? (
          <div className="card-grid">
            {probes.map((probe) => (
              <div className="data-card" key={probe.id}>
                <div className="data-card-head">
                  <strong>{probe.flag ? `${probe.flag} ` : ""}{probe.name}</strong>
                  <span>{probe.online ? "online" : "offline"}</span>
                </div>
                <p className="muted">{probe.group || "未分组"} / {probe.region || "未标注地区"}</p>
                <p className="muted">CPU {formatPercent(probe.metrics?.cpuUsage)} / MEM {formatPercent(probe.metrics?.memoryUsage)} / DISK {formatPercent(probe.metrics?.diskUsage)}</p>
                <p className="muted">↓ {formatSpeed(probe.metrics?.rxSpeed)} / ↑ {formatSpeed(probe.metrics?.txSpeed)}</p>
                <div className="actions">
                  <button onClick={() => setSelectedAgentId(probe.id)}>看历史</button>
                  <button onClick={() => openAgent(probe.id)}>详情</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">暂时没有公开探针数据。</div>
        )}
      </Panel>

      <div className="grid2">
        <Panel
          title="历史趋势"
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

        <Panel title="最近事件">
          <CompactEvents events={events} />
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

export default MonitorPage;
