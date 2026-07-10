import React, { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { api } from "../api";

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

function Field({ label, value, onChange, random, type = "text", placeholder = "", options = [], rows = 4 }) {
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

function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => api("/api/settings").then(setSettings).catch((error) => setMessage(error.message));

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const save = async () => {
    try {
      const response = await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
      setSettings(response);
      setMessage("设置已保存。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const testNotification = async () => {
    try {
      await api("/api/settings/notifications/test", { method: "POST" });
      setMessage("测试通知已发送。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  if (!settings) return null;

  return (
    <section>
      <div className="grid2">
        <Panel title="监控与告警设置">
          <div className="form-grid">
            <Field label="公开页刷新秒数" type="number" value={settings.publicProbeRefreshSec} onChange={(value) => setSettings((current) => ({ ...current, publicProbeRefreshSec: Number(value || 10) }))} />
            <Field label="CPU 阈值" type="number" value={settings.alerts?.cpuThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, cpuThreshold: Number(value || 90) } }))} />
            <Field label="内存阈值" type="number" value={settings.alerts?.memoryThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, memoryThreshold: Number(value || 90) } }))} />
            <Field label="磁盘阈值" type="number" value={settings.alerts?.diskThreshold || 90} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, diskThreshold: Number(value || 90) } }))} />
            <Field label="冷却分钟" type="number" value={settings.alerts?.cooldownMinutes || 30} onChange={(value) => setSettings((current) => ({ ...current, alerts: { ...current.alerts, cooldownMinutes: Number(value || 30) } }))} />
            <Field label="Telegram Chat ID" value={settings.telegramChatId || ""} onChange={(value) => setSettings((current) => ({ ...current, telegramChatId: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={save}>保存设置</button>
            <button onClick={testNotification}>测试通知</button>
          </div>
        </Panel>

        <Panel title="安全状态">
          <div className="panel-stack">
            <p className="muted">Query token: {settings.queryTokenEnabled ? "enabled" : "disabled"}</p>
            <p className="muted">Master key: {settings.masterKeySet ? "set" : "missing"}</p>
            <p className="muted">Storage mode: {settings.storageMode}</p>
            {settings.hasTelegramToken ? <p className="muted">Telegram token 已配置</p> : <p className="muted">Telegram token 未配置</p>}
            {settings.hasWebhookUrl ? <p className="muted">Webhook 已配置</p> : <p className="muted">Webhook 未配置</p>}
          </div>
          {settings.warnings?.length ? (
            <div className="warning-list">
              {settings.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : (
            <div className="empty">当前没有额外警告。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

export default SettingsPage;
