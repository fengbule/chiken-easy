import React, { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { api, downloadBinary, ensureTokenSession, uploadForm } from "../api";
import { formatBytes, formatDateTime } from "../utils";
import StatusBadge from "../components/StatusBadge";

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

function AgentEmptyState({ title = "没有可选 Agent" }) {
  return (
    <Panel title={title}>
      <div className="empty">没有拿到 Agent 列表。请确认后台已登录、右上角不要填写 sess_；如使用 API Token，请填 ck_ 开头的令牌。</div>
    </Panel>
  );
}

export default function ConsolePage({ agents, agentId, setAgentId, openSsh }) {
  const [panes, setPanes] = useState({
    left: { agentId: "", path: "/", rows: [], loading: false },
    right: { agentId: "", path: "/", rows: [], loading: false }
  });
  const [message, setMessage] = useState("");
  const [renameForm, setRenameForm] = useState({ agentId: "", oldPath: "", newPath: "" });
  const [transferring, setTransferring] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

  const sideLabel = (side) => (side === "left" ? "左侧" : "右侧");
  const otherSide = (side) => (side === "left" ? "right" : "left");
  const getAgent = (id) => agents.find((item) => item.id === id);
  const sortedRows = (rows = []) => [...rows].sort((left, right) => {
    if (left.isDirectory !== right.isDirectory) return left.isDirectory ? -1 : 1;
    return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN", { numeric: true, sensitivity: "base" });
  });
  const entryPath = (pane, entry) => (pane.path === "/" ? `/${entry.name}` : `${pane.path}/${entry.name}`);
  const parentTarget = (panePath) => {
    const parent = panePath && panePath !== "/" ? panePath.split("/").filter(Boolean).slice(0, -1).join("/") : "";
    return parent ? `/${parent}` : "/";
  };

  const patchPane = (side, patch) => {
    setPanes((current) => ({ ...current, [side]: { ...current[side], ...patch } }));
  };

  const loadPane = async (side, nextPath = panes[side].path, nextAgentId = panes[side].agentId) => {
    if (!nextAgentId) return;
    patchPane(side, { loading: true, agentId: nextAgentId });
    try {
      const response = await api(`/api/agents/${nextAgentId}/sftp?path=${encodeURIComponent(nextPath || "/")}`);
      patchPane(side, {
        agentId: nextAgentId,
        path: response.path || nextPath || "/",
        rows: response.entries || [],
        loading: false
      });
      setMessage("");
    } catch (error) {
      patchPane(side, { loading: false });
      setMessage(`${sideLabel(side)}读取失败：${error.message}`);
    }
  };

  useEffect(() => {
    if (!agents.length) return;
    setPanes((current) => {
      const leftAgentId = agentId || current.left.agentId || agents[0].id;
      const rightAgentId = current.right.agentId || agents.find((agent) => agent.id !== leftAgentId)?.id || leftAgentId;
      return {
        left: { ...current.left, agentId: leftAgentId, rows: current.left.agentId === leftAgentId ? current.left.rows : [] },
        right: { ...current.right, agentId: rightAgentId, rows: current.right.agentId === rightAgentId ? current.right.rows : [] }
      };
    });
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents.length, agentId]);

  useEffect(() => {
    if (panes.left.agentId && !panes.left.rows.length && !panes.left.loading) loadPane("left", "/", panes.left.agentId).catch(() => {});
  }, [panes.left.agentId]);

  useEffect(() => {
    if (panes.right.agentId && !panes.right.rows.length && !panes.right.loading) loadPane("right", "/", panes.right.agentId).catch(() => {});
  }, [panes.right.agentId]);

  const changePaneAgent = (side, nextAgentId) => {
    patchPane(side, { agentId: nextAgentId, path: "/", rows: [] });
    if (side === "left") setAgentId(nextAgentId);
    loadPane(side, "/", nextAgentId).catch(() => {});
  };

  const jumpToPath = (side, index) => {
    const pane = panes[side];
    const parts = pane.path.split("/").filter(Boolean);
    const target = index < 0 ? "/" : `/${parts.slice(0, index + 1).join("/")}`;
    loadPane(side, target, pane.agentId).catch(() => {});
  };

  const goTo = (side, entry) => {
    if (!entry.isDirectory) return;
    const pane = panes[side];
    loadPane(side, entryPath(pane, entry), pane.agentId).catch(() => {});
  };

  const uploadRemote = async (side, event) => {
    const file = event.target.files?.[0];
    const pane = panes[side];
    if (!file || !pane.agentId) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("directory", pane.path);
    try {
      await uploadForm(`/api/agents/${pane.agentId}/sftp/upload`, formData);
      setMessage(`${sideLabel(side)}上传完成：${file.name}`);
      loadPane(side, pane.path, pane.agentId).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      event.target.value = "";
    }
  };

  const downloadRemote = async (side, entry) => {
    const pane = panes[side];
    try {
      await ensureTokenSession();
      await downloadBinary(`/api/agents/${pane.agentId}/sftp/download?path=${encodeURIComponent(entryPath(pane, entry))}`, entry.name);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteRemote = async (side, entry) => {
    const pane = panes[side];
    const fullPath = entryPath(pane, entry);
    if (!window.confirm(`确认删除 ${fullPath} 吗？`)) return;
    try {
      await api(`/api/agents/${pane.agentId}/sftp?path=${encodeURIComponent(fullPath)}`, { method: "DELETE" });
      setMessage(`${sideLabel(side)}已删除：${fullPath}`);
      loadPane(side, pane.path, pane.agentId).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const mkdirRemote = async (side) => {
    const pane = panes[side];
    const name = window.prompt(`在${sideLabel(side)}创建目录`);
    if (!name) return;
    try {
      const nextPath = pane.path === "/" ? `/${name}` : `${pane.path}/${name}`;
      await api(`/api/agents/${pane.agentId}/sftp/mkdir`, { method: "POST", body: JSON.stringify({ path: nextPath }) });
      setMessage(`${sideLabel(side)}目录已创建：${nextPath}`);
      loadPane(side, pane.path, pane.agentId).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const transferEntry = async (side, entry) => {
    if (entry.isDirectory) return;
    const source = panes[side];
    const target = panes[otherSide(side)];
    if (!source.agentId || !target.agentId) return;
    const sourcePath = entryPath(source, entry);
    const targetPath = target.path === "/" ? `/${entry.name}` : `${target.path}/${entry.name}`;
    const transferKey = `${side}:${sourcePath}`;
    setTransferring(transferKey);
    try {
      const response = await api("/api/sftp/transfer", {
        method: "POST",
        body: JSON.stringify({
          sourceAgentId: source.agentId,
          sourcePath,
          targetAgentId: target.agentId,
          targetPath
        })
      });
      setMessage(`对传完成：${formatBytes(response.size)}，${sourcePath} → ${targetPath}`);
      loadPane(otherSide(side), target.path, target.agentId).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setTransferring("");
    }
  };

  const renameRemote = async () => {
    const targetAgentId = renameForm.agentId || panes.left.agentId;
    if (!targetAgentId || !renameForm.oldPath || !renameForm.newPath) return;
    try {
      await api(`/api/agents/${targetAgentId}/sftp/rename`, { method: "POST", body: JSON.stringify(renameForm) });
      setMessage("重命名完成。");
      setRenameForm({ agentId: targetAgentId, oldPath: "", newPath: "" });
      for (const side of ["left", "right"]) {
        if (panes[side].agentId === targetAgentId) loadPane(side, panes[side].path, targetAgentId).catch(() => {});
      }
    } catch (error) {
      setMessage(error.message);
    }
  };

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      await ensureTokenSession();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await downloadBinary("/api/backups/download", `chiken-easy-backup-${stamp}.json.gz`);
      setMessage("备份压缩包已开始下载。迁移到新服务器时，请同时确保 CHIKEN_MASTER_KEY 与旧服务器一致。");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBackupBusy(false);
    }
  };

  const restoreBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm("恢复会覆盖当前 data/ 中同名运行数据；系统会先自动生成恢复前快照。继续吗？")) {
      event.target.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("backup", file);
    setBackupBusy(true);
    try {
      const response = await uploadForm("/api/backups/restore", formData);
      setMessage(`恢复完成：${response.fileCount} 个文件，恢复前快照 ${response.preRestoreBackup}`);
      for (const side of ["left", "right"]) loadPane(side, panes[side].path, panes[side].agentId).catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBackupBusy(false);
      event.target.value = "";
    }
  };

  const renderPane = (side, title) => {
    const pane = panes[side];
    const agent = getAgent(pane.agentId);
    const rows = sortedRows(pane.rows);
    const pathParts = pane.path.split("/").filter(Boolean);
    return (
      <Panel
        title={title}
        right={<span className="panel-muted">{rows.length} 项 · {pane.loading ? "读取中" : "目录优先"}</span>}
      >
        <div className="sftp-pane">
          <div className="sftp-pane-toolbar">
            <label>
              Agent
              <select value={pane.agentId} onChange={(event) => changePaneAgent(side, event.target.value)}>
                {agents.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.connected ? "online" : "offline"}</option>
                ))}
              </select>
            </label>
            <label className="sftp-pane-path">
              路径
              <div className="path-input-row">
                <input value={pane.path} onChange={(event) => patchPane(side, { path: event.target.value })} onKeyDown={(event) => {
                  if (event.key === "Enter") loadPane(side, pane.path, pane.agentId).catch(() => {});
                }} />
                <button onClick={() => loadPane(side, pane.path, pane.agentId).catch(() => {})}>前往</button>
              </div>
            </label>
          </div>
          <div className="sftp-pane-actions">
            <button onClick={() => loadPane(side, pane.path, pane.agentId).catch(() => {})}>刷新</button>
            <button onClick={() => loadPane(side, parentTarget(pane.path), pane.agentId).catch(() => {})} disabled={pane.path === "/"}>上级</button>
            <button onClick={() => openSsh(pane.agentId)} disabled={!pane.agentId}>SSH</button>
            <button onClick={() => mkdirRemote(side)}>新建目录</button>
            <label className="upload-label">
              <input type="file" onChange={(event) => uploadRemote(side, event)} />
              上传
            </label>
          </div>
          <div className="sftp-current compact">
            <div className="sftp-current-main">
              <strong>{agent?.name || "Agent"}</strong>
              <StatusBadge ok={agent?.connected} text={agent?.connected ? "online" : "offline"} />
            </div>
            <div className="path-crumbs">
              <button onClick={() => jumpToPath(side, -1)}>/</button>
              {pathParts.map((part, index) => (
                <button key={`${side}-${part}-${index}`} onClick={() => jumpToPath(side, index)}>{part}</button>
              ))}
            </div>
          </div>
          <div className="sftp-file-list">
            <div className="file-row file-head">
              <span>名称</span>
              <span>大小</span>
              <span>修改日期</span>
              <span>操作</span>
            </div>
            <div className="sftp-file-scroll">
              <button className="file-row file-up" onClick={() => loadPane(side, parentTarget(pane.path), pane.agentId).catch(() => {})} disabled={pane.path === "/"}>
                <span className="file-title">
                  <span className="file-icon">UP</span>
                  <span className="file-label">[上级目录]</span>
                </span>
                <span />
                <span />
                <span>{pane.path === "/" ? "根目录" : parentTarget(pane.path)}</span>
              </button>
              {rows.length ? rows.map((entry) => {
                const transferKey = `${side}:${entryPath(pane, entry)}`;
                return (
                  <div className={`file-row ${entry.isDirectory ? "directory" : "file"}`} key={`${entry.name}-${entry.modifiedAt}`}>
                    <button className="file-name" onClick={() => (entry.isDirectory ? goTo(side, entry) : downloadRemote(side, entry))}>
                      <span className="file-icon">{entry.isDirectory ? "DIR" : "FILE"}</span>
                      <span className="file-label" title={entry.name}>{entry.name}{entry.isDirectory ? "/" : ""}</span>
                    </button>
                    <span>{entry.isDirectory ? "" : formatBytes(entry.size)}</span>
                    <span>{formatDateTime(entry.modifiedAt)}</span>
                    <span className="file-actions">
                      {entry.isDirectory ? <button onClick={() => goTo(side, entry)}>进入</button> : <button onClick={() => downloadRemote(side, entry)}>下载</button>}
                      {!entry.isDirectory ? <button onClick={() => transferEntry(side, entry)} disabled={Boolean(transferring)}>{transferring === transferKey ? "传输中" : side === "left" ? "传到右侧" : "传到左侧"}</button> : null}
                      {!entry.isDirectory ? <button className="link danger-link" onClick={() => deleteRemote(side, entry)}>删除</button> : null}
                    </span>
                  </div>
                );
              }) : <div className="empty compact-empty">{pane.loading ? "正在读取目录..." : "目录为空或尚未读取。"}</div>}
            </div>
          </div>
        </div>
      </Panel>
    );
  };

  if (!agents.length) return <AgentEmptyState title="SFTP / 终端需要先选择 Agent" />;

  return (
    <section>
      <div className="sftp-shell">
        <div>
          <h1>双栏 SFTP 对传</h1>
          <p className="muted">左右两边都是可视化文件管理器。进入目录后直接点文件行的"传到右侧/左侧"，不需要手动复制路径。</p>
        </div>
        <div className="sftp-hero-actions">
          <button className="primary" onClick={downloadBackup} disabled={backupBusy}>
            {backupBusy ? "处理中..." : "一键下载备份"}
          </button>
          <label className="upload-label">
            <input type="file" accept=".gz,.json,.backup,application/gzip,application/json" onChange={restoreBackup} />
            上传备份恢复
          </label>
        </div>
      </div>

      <div className="sftp-dual-grid">
        {renderPane("left", "左侧文件")}
        {renderPane("right", "右侧文件")}
      </div>

      <div className="grid2 sftp-lower-grid">
        <Panel title="一键备份 / 迁移恢复">
          <div className="backup-actions">
            <button className="primary" onClick={downloadBackup} disabled={backupBusy}>
              {backupBusy ? "处理中..." : "下载备份压缩包"}
            </button>
            <label className="upload-label">
              <input type="file" accept=".gz,.json,.backup,application/gzip,application/json" onChange={restoreBackup} />
              上传备份并恢复
            </label>
          </div>
          <div className="panel-tip">备份包含 data/ 运行状态、审计、SQLite 文件和上传附件，不包含 .env、.local、私钥、node_modules、dist。迁移到新服务器时请先部署相同版本，并设置同一个 CHIKEN_MASTER_KEY。</div>
        </Panel>

        <Panel title="路径工具">
          <div className="form-grid">
            <label>
              Agent
              <select value={renameForm.agentId || panes.left.agentId} onChange={(event) => setRenameForm((current) => ({ ...current, agentId: event.target.value }))}>
                {agents.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} · {item.connected ? "online" : "offline"}</option>
                ))}
              </select>
            </label>
            <Field label="旧路径" value={renameForm.oldPath} onChange={(value) => setRenameForm((current) => ({ ...current, oldPath: value }))} placeholder="/tmp/a.txt" />
            <Field label="新路径" value={renameForm.newPath} onChange={(value) => setRenameForm((current) => ({ ...current, newPath: value }))} placeholder="/tmp/b.txt" />
          </div>
          <div className="actions">
            <button className="primary" onClick={renameRemote}>执行重命名</button>
          </div>
          {message ? <pre>{message}</pre> : null}
        </Panel>
      </div>
    </section>
  );
}
