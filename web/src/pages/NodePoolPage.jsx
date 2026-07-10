import React, { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { api, fetchText } from "../api";
import { copyText, formatDateTime, joinTags } from "../utils";

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

function NodePoolPage() {
  const [nodes, setNodes] = useState([]);
  const [sources, setSources] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [importName, setImportName] = useState("manual-import");
  const [importContent, setImportContent] = useState("");
  const [sourceForm, setSourceForm] = useState({ name: "", url: "", username: "", password: "", removeMissing: false });
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState([]);

  const load = async () => {
    try {
      const [nodeRows, sourceRows, accessLogRows] = await Promise.all([api("/api/node-pool"), api("/api/subscription-sources"), api("/api/subscription-access")]);
      setNodes(nodeRows);
      setSources(sourceRows);
      setAccessRows(accessLogRows);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const toggleSelected = (id) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const importNodes = async () => {
    try {
      const response = await api("/api/node-pool/import", {
        method: "POST",
        body: JSON.stringify({ source: importName || "manual", content: importContent })
      });
      setMessage(`导入完成，节点池当前 ${response.nodes.length} 条，变更 ${response.changed} 条。`);
      setImportContent("");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const createSource = async () => {
    try {
      await api("/api/subscription-sources", {
        method: "POST",
        body: JSON.stringify(sourceForm)
      });
      setSourceForm({ name: "", url: "", username: "", password: "", removeMissing: false });
      setMessage("订阅源已保存。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const syncSource = async (id) => {
    try {
      const response = await api(`/api/subscription-sources/${id}/sync`, { method: "POST" });
      setMessage(`同步完成，导入 ${response.count} 条，变更 ${response.changed} 条。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const runChecks = async () => {
    try {
      const response = await api("/api/node-pool/check", {
        method: "POST",
        body: JSON.stringify({ nodeIds: selectedIds, checkedBy: "server", timeoutMs: 5000 })
      });
      setChecks(response.results || []);
      setMessage(`探测完成，共 ${response.results?.length || 0} 个节点。`);
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const exportNodes = async (format) => {
    try {
      const body = await fetchText(`/api/node-pool/export?format=${encodeURIComponent(format)}`);
      await copyText(body);
      setMessage(`${format} 导出结果已复制到剪贴板。`);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeNode = async (id) => {
    if (!window.confirm("确认删除这个节点吗？")) return;
    try {
      await api(`/api/node-pool/${id}`, { method: "DELETE" });
      setMessage("节点已删除。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="grid2">
        <Panel title="节点导入">
          <div className="form-grid">
            <Field label="来源名称" value={importName} onChange={setImportName} />
            <Field label="原始内容" type="textarea" rows={10} value={importContent} onChange={setImportContent} placeholder="支持 vmess/vless/trojan/ss/hysteria2 URI、Clash/Mihomo YAML、sing-box outbound JSON、base64 订阅。" />
          </div>
          <div className="actions">
            <button className="primary" onClick={importNodes}>导入节点</button>
            <button onClick={() => exportNodes("base64")}>复制 Base64</button>
            <button onClick={() => exportNodes("clash")}>复制 Clash</button>
            <button onClick={() => exportNodes("sing-box")}>复制 sing-box</button>
          </div>
        </Panel>

        <Panel title="订阅源同步">
          <div className="form-grid">
            <Field label="名称" value={sourceForm.name} onChange={(value) => setSourceForm((current) => ({ ...current, name: value }))} />
            <Field label="URL" value={sourceForm.url} onChange={(value) => setSourceForm((current) => ({ ...current, url: value }))} />
            <Field label="用户名" value={sourceForm.username} onChange={(value) => setSourceForm((current) => ({ ...current, username: value }))} />
            <Field label="密码" type="password" value={sourceForm.password} onChange={(value) => setSourceForm((current) => ({ ...current, password: value }))} />
          </div>
          <div className="actions">
            <button className="primary" onClick={createSource}>保存订阅源</button>
          </div>
          {sources.length ? (
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>URL</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <td>{source.name}</td>
                    <td>{source.url || "-"}</td>
                    <td>{formatDateTime(source.updatedAt)}</td>
                    <td><button className="link" onClick={() => syncSource(source.id)}>立即同步</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有订阅源。</div>
          )}
        </Panel>
      </div>

      <Panel title="节点池" right={<button onClick={runChecks} disabled={!nodes.length}>批量 Proxy Check</button>}>
        {nodes.length ? (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>名称</th>
                <th>协议</th>
                <th>地址</th>
                <th>标签</th>
                <th>地区</th>
                <th>健康</th>
                <th>分数</th>
                <th>最近检查</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node) => (
                <tr key={node.id}>
                  <td><input type="checkbox" checked={selectedIds.includes(node.id)} onChange={() => toggleSelected(node.id)} /></td>
                  <td>{node.name}</td>
                  <td>{node.protocol}</td>
                  <td>{node.address}:{node.port}</td>
                  <td>{joinTags(node.tags) || "-"}</td>
                  <td>{node.region || "-"}</td>
                  <td>{node.health}</td>
                  <td>{node.score}</td>
                  <td>{formatDateTime(node.lastCheckAt)}</td>
                  <td><button className="link" onClick={() => removeNode(node.id)}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">还没有节点。</div>
        )}
      </Panel>

      <div className="grid2">
        <Panel title="最近检查结果">
          {checks.length ? (
            <table>
              <thead>
                <tr>
                  <th>节点</th>
                  <th>结果</th>
                  <th>延迟</th>
                  <th>检查者</th>
                  <th>错误</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((row) => (
                  <tr key={row.id}>
                    <td>{row.nodeId}</td>
                    <td>{row.ok ? "ok" : "fail"}</td>
                    <td>{row.latency} ms</td>
                    <td>{row.checkedBy}</td>
                    <td>{row.error || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有探测结果。</div>
          )}
        </Panel>

        <Panel title="订阅访问日志">
          {accessRows.length ? (
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>订阅</th>
                  <th>来源 IP</th>
                  <th>User-Agent</th>
                </tr>
              </thead>
              <tbody>
                {accessRows.slice(0, 30).map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.at)}</td>
                    <td>{row.profileId}</td>
                    <td>{row.ip}</td>
                    <td>{row.userAgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">还没有访问记录。</div>
          )}
        </Panel>
      </div>
      {message ? <p className="panel-message">{message}</p> : null}
    </section>
  );
}

export default NodePoolPage;
