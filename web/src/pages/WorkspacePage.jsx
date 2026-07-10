import React, { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { api } from "../api";
import { formatDateTime, joinTags, parseCommaList } from "../utils";

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

function WorkspacePage({ agents, openSsh, openConsole }) {
  const [assets, setAssets] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [runs, setRuns] = useState([]);
  const [assetForm, setAssetForm] = useState({ id: "", agentId: "", displayName: "", host: "", ip: "", port: 22, username: "root", group: "", tags: "", provider: "", region: "", note: "", public: true, publicName: "", publicGroup: "", publicRegion: "", publicFlag: "" });
  const [credentialForm, setCredentialForm] = useState({ name: "", host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", note: "" });
  const [scriptForm, setScriptForm] = useState({ id: "", name: "uptime", content: "uptime", category: "ops", tags: "uptime", timeoutMs: 30000 });
  const [batchAgentIds, setBatchAgentIds] = useState([]);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [assetRows, credentialRows, scriptRows, runRows] = await Promise.all([api("/api/assets"), api("/api/credentials"), api("/api/scripts"), api("/api/command-runs")]);
      setAssets(assetRows);
      setCredentials(credentialRows);
      setScripts(scriptRows);
      setRuns(runRows);
      if (!batchAgentIds.length) setBatchAgentIds(agents.map((agent) => agent.id));
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [agents.length]);

  const saveAsset = async () => {
    try {
      const payload = { ...assetForm, tags: parseCommaList(assetForm.tags) };
      const url = assetForm.id ? `/api/assets/${assetForm.id}` : "/api/assets";
      const method = assetForm.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage("服务器资产已保存。");
      setAssetForm({ id: "", agentId: "", displayName: "", host: "", ip: "", port: 22, username: "root", group: "", tags: "", provider: "", region: "", note: "", public: true, publicName: "", publicGroup: "", publicRegion: "", publicFlag: "" });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveCredential = async () => {
    try {
      await api("/api/credentials", { method: "POST", body: JSON.stringify(credentialForm) });
      setMessage("凭据已保存。");
      setCredentialForm({ name: "", host: "", port: 22, username: "root", mode: "password", password: "", privateKey: "", note: "" });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const testCredential = async (id) => {
    try {
      const response = await api(`/api/credentials/${id}/test`, { method: "POST" });
      setMessage(response.output || "凭据测试通过。");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const revokeCredential = async (id) => {
    if (!window.confirm("确认撤销这份凭据吗？")) return;
    try {
      await api(`/api/credentials/${id}`, { method: "DELETE" });
      setMessage("凭据已撤销。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const saveScript = async () => {
    try {
      const payload = { ...scriptForm, tags: parseCommaList(scriptForm.tags) };
      const url = scriptForm.id ? `/api/scripts/${scriptForm.id}` : "/api/scripts";
      const method = scriptForm.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage("脚本已保存。");
      setScriptForm({ id: "", name: "uptime", content: "uptime", category: "ops", tags: "uptime", timeoutMs: 30000 });
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const runBatch = async () => {
    try {
      const script = scripts.find((item) => item.name === scriptForm.name) || scripts.find((item) => item.id === scriptForm.id);
      const response = await api("/api/scripts/run-batch", {
        method: "POST",
        body: JSON.stringify({
          scriptId: script?.id || "",
          command: script ? "" : scriptForm.content,
          agentIds: batchAgentIds,
          concurrency: 2,
          timeoutMs: Number(scriptForm.timeoutMs || 30000)
        })
      });
      setMessage(`批量命令已执行，共 ${response.results?.length || 0} 台。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="服务器资产">
          <div className="form-grid">
            <Field label="关联 Agent" type="select" value={assetForm.agentId} onChange={(value) => setAssetForm((current) => ({ ...current, agentId: value }))} options={[["", "不关联"], ...agents.map((agent) => [agent.id, agent.name])]} />
            <Field label="显示名称" value={assetForm.displayName} onChange={(value) => setAssetForm((current) => ({ ...current, displayName: value }))} />
            <Field label="Host" value={assetForm.host} onChange={(value) => setAssetForm((current) => ({ ...current, host: value }))} />
            <Field label="IP" value={assetForm.ip} onChange={(value) => setAssetForm((current) => ({ ...current, ip: value }))} />
            <Field label="用户名" value={assetForm.username} onChange={(value) => setAssetForm((current) => ({ ...current, username: value }))} />
            <Field label="标签" value={assetForm.tags} onChange={(value) => setAssetForm((current) => ({ ...current, tags: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={saveAsset}>保存资产</button>
          </div>
          {assets.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Agent</th>
                  <th>地址</th>
                  <th>标签</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{asset.displayName}</td>
                    <td>{asset.agentId || "-"}</td>
                    <td>{asset.host || asset.ip || "-"}</td>
                    <td>{joinTags(asset.tags) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有服务器资产。</div>
          )}
        </Panel>

        <Panel title="凭据托管">
          <div className="form-grid">
            <Field label="名称" value={credentialForm.name} onChange={(value) => setCredentialForm((current) => ({ ...current, name: value }))} />
            <Field label="Host" value={credentialForm.host} onChange={(value) => setCredentialForm((current) => ({ ...current, host: value }))} />
            <Field label="用户名" value={credentialForm.username} onChange={(value) => setCredentialForm((current) => ({ ...current, username: value }))} />
            <Field label="认证方式" type="select" value={credentialForm.mode} onChange={(value) => setCredentialForm((current) => ({ ...current, mode: value }))} options={[["password", "密码"], ["privateKey", "私钥"]]} />
            {credentialForm.mode === "password" ? <Field label="密码" type="password" value={credentialForm.password} onChange={(value) => setCredentialForm((current) => ({ ...current, password: value }))} /> : null}
            {credentialForm.mode === "privateKey" ? <Field label="私钥" type="textarea" rows={6} value={credentialForm.privateKey} onChange={(value) => setCredentialForm((current) => ({ ...current, privateKey: value }))} /> : null}
          </div>
          <div className="actions">
            <button className="primary" onClick={saveCredential}>保存凭据</button>
          </div>
          {credentials.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>Host</th>
                  <th>认证</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {credentials.map((credential) => (
                  <tr key={credential.id}>
                    <td>{credential.name}</td>
                    <td>{credential.host}:{credential.port}</td>
                    <td>{credential.mode}</td>
                    <td>{credential.revokedAt ? "revoked" : "active"}</td>
                    <td className="actions-cell">
                      <button className="link" onClick={() => testCredential(credential.id)}>测试</button>
                      <button className="link" onClick={() => revokeCredential(credential.id)}>撤销</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有凭据。</div>
          )}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="脚本库与批量命令">
          <div className="form-grid">
            <Field label="脚本名称" value={scriptForm.name} onChange={(value) => setScriptForm((current) => ({ ...current, name: value }))} />
            <Field label="分类" value={scriptForm.category} onChange={(value) => setScriptForm((current) => ({ ...current, category: value }))} />
            <Field label="标签" value={scriptForm.tags} onChange={(value) => setScriptForm((current) => ({ ...current, tags: value }))} />
            <Field label="超时毫秒" type="number" value={scriptForm.timeoutMs} onChange={(value) => setScriptForm((current) => ({ ...current, timeoutMs: value }))} />
            <Field label="命令内容" type="textarea" rows={10} value={scriptForm.content} onChange={(value) => setScriptForm((current) => ({ ...current, content: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={saveScript}>保存脚本</button>
            <button onClick={runBatch}>对选中服务器批量执行</button>
          </div>
          <div className="choice-grid">
            {agents.map((agent) => (
              <label key={agent.id} className="subscription-node">
                <input type="checkbox" checked={batchAgentIds.includes(agent.id)} onChange={() => setBatchAgentIds((current) => (current.includes(agent.id) ? current.filter((item) => item !== agent.id) : [...current, agent.id]))} />
                <div>
                  <strong>{agent.name}</strong>
                  <span>{agent.host || agent.ip}</span>
                </div>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="脚本结果与快捷入口">
          <div className="actions">
            {agents.map((agent) => (
              <React.Fragment key={agent.id}>
                <button onClick={() => openSsh(agent.id)}>SSH {agent.name}</button>
                <button onClick={() => openConsole(agent.id)}>SFTP {agent.name}</button>
              </React.Fragment>
            ))}
          </div>
          {runs.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>脚本 / 命令</th>
                  <th>目标</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map((run) => (
                  <tr key={run.id}>
                    <td>{formatDateTime(run.createdAt || run.at)}</td>
                    <td>{run.scriptId || run.command}</td>
                    <td>{joinTags(run.agentIds || (run.agentId ? [run.agentId] : []))}</td>
                    <td><code>{JSON.stringify(run.results || run.output).slice(0, 240)}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有执行记录。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

export default WorkspacePage;
