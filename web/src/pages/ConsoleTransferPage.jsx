import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Download, FolderPlus, RefreshCw, Trash2, Upload } from "lucide-react";
import { api, downloadBinary, ensureTokenSession, uploadForm } from "../api";
import { formatBytes, formatDateTime } from "../utils";

function defaultPane(agentId = "") {
  return {
    agentId,
    path: "/",
    rows: [],
    loading: false,
    message: ""
  };
}

function buildTargetPath(basePath, fileName) {
  return basePath === "/" ? `/${fileName}` : `${basePath}/${fileName}`;
}

function PaneTable({ pane, title, side, onAgentChange, onPathChange, onRefresh, onEnter, onUpload, onDownload, onDelete, onMkdir, onTransfer }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span>{pane.agentId || "未选择服务器"}</span>
      </div>
      <div className="toolbar pane-toolbar">
        <select value={pane.agentId} onChange={(event) => onAgentChange(side, event.target.value)}>
          <option value="">选择服务器</option>
          {pane.agentOptions.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <input value={pane.path} onChange={(event) => onPathChange(side, event.target.value)} placeholder="/" />
        <button onClick={() => onRefresh(side)} disabled={!pane.agentId || pane.loading}>
          <RefreshCw size={15} />
          刷新
        </button>
        <button onClick={() => onMkdir(side)} disabled={!pane.agentId}>
          <FolderPlus size={15} />
          新建目录
        </button>
        <label className="upload-label">
          <input type="file" onChange={(event) => onUpload(side, event)} disabled={!pane.agentId} />
          <Upload size={15} />
          上传
        </label>
      </div>

      {pane.message ? <p className="panel-message">{pane.message}</p> : null}

      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>大小</th>
            <th>修改时间</th>
            <th>类型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {pane.rows.length ? (
            pane.rows.map((entry) => (
              <tr key={`${entry.name}-${entry.modifiedAt}`}>
                <td>{entry.name}</td>
                <td>{entry.isDirectory ? "-" : formatBytes(entry.size)}</td>
                <td>{formatDateTime(entry.modifiedAt)}</td>
                <td>{entry.isDirectory ? "dir" : "file"}</td>
                <td className="actions-cell">
                  {entry.isDirectory ? <button className="link" onClick={() => onEnter(side, entry)}>进入</button> : null}
                  {!entry.isDirectory ? <button className="link" onClick={() => onDownload(side, entry)}><Download size={14} />下载</button> : null}
                  {!entry.isDirectory ? <button className="link" onClick={() => onTransfer(side, entry)}><ArrowLeftRight size={14} />互传</button> : null}
                  {!entry.isDirectory ? <button className="link" onClick={() => onDelete(side, entry)}><Trash2 size={14} />删除</button> : null}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="empty">当前目录为空或尚未读取</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ConsoleTransferPage({ agents, agentId, setAgentId }) {
  const defaultLeft = agentId || agents[0]?.id || "";
  const defaultRight = agents.find((agent) => agent.id !== defaultLeft)?.id || agents[1]?.id || agents[0]?.id || "";
  const [leftPane, setLeftPane] = useState(defaultPane(defaultLeft));
  const [rightPane, setRightPane] = useState(defaultPane(defaultRight));
  const [globalMessage, setGlobalMessage] = useState("");

  const options = useMemo(() => agents.map((agent) => ({ id: agent.id, name: agent.name })), [agents]);

  useEffect(() => {
    if (!leftPane.agentId && agents[0]) setLeftPane((current) => ({ ...current, agentId: agents[0].id }));
    if (!rightPane.agentId && agents[1]) setRightPane((current) => ({ ...current, agentId: agents[1].id }));
  }, [agents, leftPane.agentId, rightPane.agentId]);

  useEffect(() => {
    if (leftPane.agentId) setAgentId(leftPane.agentId);
  }, [leftPane.agentId, setAgentId]);

  const setPane = (side, updater) => {
    if (side === "left") setLeftPane((current) => updater(current));
    else setRightPane((current) => updater(current));
  };

  const loadPane = async (side, nextPath) => {
    const pane = side === "left" ? leftPane : rightPane;
    if (!pane.agentId) return;
    setPane(side, (current) => ({ ...current, loading: true, message: "" }));
    try {
      const response = await api(`/api/agents/${pane.agentId}/sftp?path=${encodeURIComponent(nextPath || pane.path)}`);
      setPane(side, (current) => ({
        ...current,
        loading: false,
        rows: response.entries || [],
        path: response.path || nextPath || current.path,
        message: ""
      }));
    } catch (error) {
      setPane(side, (current) => ({ ...current, loading: false, message: error.message }));
    }
  };

  useEffect(() => {
    if (leftPane.agentId) loadPane("left", "/").catch(() => {});
  }, [leftPane.agentId]);

  useEffect(() => {
    if (rightPane.agentId) loadPane("right", "/").catch(() => {});
  }, [rightPane.agentId]);

  const changeAgent = (side, value) => {
    setPane(side, (current) => ({ ...defaultPane(value), agentOptions: current.agentOptions || [] }));
  };

  const updatePath = (side, value) => {
    setPane(side, (current) => ({ ...current, path: value }));
  };

  const enterDirectory = (side, entry) => {
    const pane = side === "left" ? leftPane : rightPane;
    const next = pane.path === "/" ? `/${entry.name}` : `${pane.path}/${entry.name}`;
    loadPane(side, next).catch(() => {});
  };

  const uploadToPane = async (side, event) => {
    const pane = side === "left" ? leftPane : rightPane;
    const file = event.target.files?.[0];
    if (!pane.agentId || !file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("directory", pane.path);
    try {
      await uploadForm(`/api/agents/${pane.agentId}/sftp/upload`, formData);
      setPane(side, (current) => ({ ...current, message: "上传完成" }));
      await loadPane(side, pane.path);
    } catch (error) {
      setPane(side, (current) => ({ ...current, message: error.message }));
    } finally {
      event.target.value = "";
    }
  };

  const downloadFromPane = async (side, entry) => {
    const pane = side === "left" ? leftPane : rightPane;
    try {
      await ensureTokenSession();
      await downloadBinary(`/api/agents/${pane.agentId}/sftp/download?path=${encodeURIComponent(buildTargetPath(pane.path, entry.name))}`, entry.name);
    } catch (error) {
      setPane(side, (current) => ({ ...current, message: error.message }));
    }
  };

  const deleteFromPane = async (side, entry) => {
    const pane = side === "left" ? leftPane : rightPane;
    if (!window.confirm(`确认删除 ${entry.name} 吗？`)) return;
    try {
      await api(`/api/agents/${pane.agentId}/sftp?path=${encodeURIComponent(buildTargetPath(pane.path, entry.name))}`, { method: "DELETE" });
      setPane(side, (current) => ({ ...current, message: "删除完成" }));
      await loadPane(side, pane.path);
    } catch (error) {
      setPane(side, (current) => ({ ...current, message: error.message }));
    }
  };

  const mkdirInPane = async (side) => {
    const pane = side === "left" ? leftPane : rightPane;
    const name = window.prompt("输入目录名");
    if (!name) return;
    try {
      await api(`/api/agents/${pane.agentId}/sftp/mkdir`, {
        method: "POST",
        body: JSON.stringify({ path: buildTargetPath(pane.path, name) })
      });
      await loadPane(side, pane.path);
    } catch (error) {
      setPane(side, (current) => ({ ...current, message: error.message }));
    }
  };

  const transferBetweenServers = async (side, entry) => {
    const sourcePane = side === "left" ? leftPane : rightPane;
    const targetPane = side === "left" ? rightPane : leftPane;
    if (!sourcePane.agentId || !targetPane.agentId) {
      setGlobalMessage("请先在左右两侧都选择服务器。");
      return;
    }
    if (sourcePane.agentId === targetPane.agentId) {
      setGlobalMessage("左右两侧需要是不同服务器，才能做服务器间互传。");
      return;
    }

    const sourcePath = buildTargetPath(sourcePane.path, entry.name);
    const targetPath = buildTargetPath(targetPane.path, entry.name);
    if (!window.confirm(`确认把 ${entry.name} 从 ${sourcePane.agentId} 传到 ${targetPane.agentId} 吗？`)) return;
    try {
      const response = await api("/api/sftp/copy-between", {
        method: "POST",
        body: JSON.stringify({
          sourceAgentId: sourcePane.agentId,
          sourcePath,
          targetAgentId: targetPane.agentId,
          targetPath
        })
      });
      setGlobalMessage(response.output || "服务器互传完成");
      await loadPane(side === "left" ? "right" : "left", targetPane.path);
    } catch (error) {
      setGlobalMessage(error.message);
    }
  };

  const leftView = { ...leftPane, agentOptions: options };
  const rightView = { ...rightPane, agentOptions: options };

  return (
    <section>
      <div className="toolbar">
        <h1>双服务器文件管理 / 互传</h1>
      </div>
      {globalMessage ? <p className="panel-message">{globalMessage}</p> : null}
      <div className="dual-pane-grid">
        <PaneTable
          pane={leftView}
          title="左侧服务器"
          side="left"
          onAgentChange={changeAgent}
          onPathChange={updatePath}
          onRefresh={(side) => loadPane(side).catch(() => {})}
          onEnter={enterDirectory}
          onUpload={uploadToPane}
          onDownload={downloadFromPane}
          onDelete={deleteFromPane}
          onMkdir={mkdirInPane}
          onTransfer={transferBetweenServers}
        />
        <PaneTable
          pane={rightView}
          title="右侧服务器"
          side="right"
          onAgentChange={changeAgent}
          onPathChange={updatePath}
          onRefresh={(side) => loadPane(side).catch(() => {})}
          onEnter={enterDirectory}
          onUpload={uploadToPane}
          onDownload={downloadFromPane}
          onDelete={deleteFromPane}
          onMkdir={mkdirInPane}
          onTransfer={transferBetweenServers}
        />
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>说明</h2>
        </div>
        <div className="panel-stack">
          <p className="muted">现在可以同时查看两台服务器的文件列表，并把单个文件从左侧服务器传到右侧，或反向互传。</p>
          <p className="muted">服务器互传通过控制面板中转，不依赖浏览器手工下载再上传。</p>
        </div>
      </div>
    </section>
  );
}
