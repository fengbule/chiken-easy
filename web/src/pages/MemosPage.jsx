import React, { useEffect, useState } from "react";
import { Shuffle } from "lucide-react";
import { api, downloadBinary, ensureTokenSession, uploadForm } from "../api";
import { formatBytes, formatDateTime, joinTags, parseCommaList, renderMarkdownHtml } from "../utils";

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

function MemoPreview({ content }) {
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdownHtml(content) }} />;
}

function MemosPage({ agents, agentFilter = "", onClearAgentFilter }) {
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [form, setForm] = useState({
    id: "",
    title: "",
    content: "",
    tags: "",
    visibility: "private",
    pinned: false,
    archived: false,
    agentId: agentFilter || "",
    nodeId: "",
    forwardRuleId: ""
  });
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (query) queryParams.set("q", query);
      if (tag) queryParams.set("tag", tag);
      if (agentFilter) queryParams.set("agentId", agentFilter);
      const memoUrl = queryParams.size ? `/api/memos?${queryParams}` : "/api/memos";
      const [memoRows, fileRows] = await Promise.all([api(memoUrl), api("/api/files")]);
      setRows(memoRows);
      setFiles(fileRows);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [query, tag, agentFilter]);

  useEffect(() => {
    if (agentFilter) setForm((current) => ({ ...current, agentId: agentFilter }));
  }, [agentFilter]);

  const resetForm = () => {
    setForm({
      id: "",
      title: "",
      content: "",
      tags: "",
      visibility: "private",
      pinned: false,
      archived: false,
      agentId: agentFilter || "",
      nodeId: "",
      forwardRuleId: ""
    });
  };

  const openMemo = (memo) => {
    setForm({
      id: memo.id,
      title: memo.title,
      content: memo.content,
      tags: joinTags(memo.tags),
      visibility: memo.visibility || "private",
      pinned: Boolean(memo.pinned),
      archived: Boolean(memo.archived),
      agentId: memo.agentId || agentFilter || "",
      nodeId: memo.nodeId || "",
      forwardRuleId: memo.forwardRuleId || ""
    });
  };

  const saveMemo = async () => {
    try {
      const payload = {
        ...form,
        tags: parseCommaList(form.tags)
      };
      const url = form.id ? `/api/memos/${form.id}` : "/api/memos";
      const method = form.id ? "PUT" : "POST";
      await api(url, { method, body: JSON.stringify(payload) });
      setMessage(form.id ? "备忘录已更新。" : "备忘录已创建。");
      resetForm();
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const deleteMemo = async () => {
    if (!form.id) return;
    if (!window.confirm("确认删除这条备忘录吗？")) return;
    try {
      await api(`/api/memos/${form.id}`, { method: "DELETE" });
      setMessage("备忘录已删除。");
      resetForm();
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !form.id) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("memoId", form.id);
    formData.append("visibility", form.visibility);
    formData.append("tags", form.tags);
    try {
      setUploading(true);
      await uploadForm("/api/files/upload", formData);
      setMessage("附件已上传。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const downloadAttachment = async (file) => {
    try {
      await ensureTokenSession();
      await downloadBinary(`/api/files/${file.id}/download`, file.name);
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeAttachment = async (fileId) => {
    if (!window.confirm("确认删除附件吗？")) return;
    try {
      await api(`/api/files/${fileId}`, { method: "DELETE" });
      setMessage("附件已删除。");
      load().catch(() => {});
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <section>
      <div className="toolbar">
        <input placeholder="搜索标题 / 正文 / 标签" value={query} onChange={(event) => setQuery(event.target.value)} />
        <input placeholder="按标签筛选" value={tag} onChange={(event) => setTag(event.target.value)} />
        {agentFilter ? <button onClick={onClearAgentFilter}>清除服务器筛选</button> : null}
        <button onClick={resetForm}>新建备忘录</button>
      </div>

      <div className="grid2">
        <Panel title="备忘录列表">
          {rows.length ? (
            <div className="list-stack">
              {rows.map((memo) => (
                <button className={`list-card ${form.id === memo.id ? "active" : ""}`} key={memo.id} onClick={() => openMemo(memo)}>
                  <strong>{memo.pinned ? "置顶 · " : ""}{memo.title}</strong>
                  <span>{joinTags(memo.tags) || "无标签"} / {memo.visibility}</span>
                  <span>{formatDateTime(memo.updatedAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">还没有备忘录。</div>
          )}
        </Panel>

        <Panel title="编辑备忘录">
          <div className="form-grid">
            <Field label="标题" value={form.title} onChange={(value) => setForm((current) => ({ ...current, title: value }))} />
            <Field label="标签" value={form.tags} onChange={(value) => setForm((current) => ({ ...current, tags: value }))} placeholder="ops, server, renewal" />
            <Field label="可见性" type="select" value={form.visibility} onChange={(value) => setForm((current) => ({ ...current, visibility: value }))} options={[["private", "私有"], ["public", "公开"], ["link", "仅链接可见"]]} />
            <Field label="关联服务器" type="select" value={form.agentId} onChange={(value) => setForm((current) => ({ ...current, agentId: value }))} options={[["", "未关联"], ...agents.map((agent) => [agent.id, agent.name])]} />
            <label>
              <span>置顶</span>
              <input type="checkbox" checked={form.pinned} onChange={(event) => setForm((current) => ({ ...current, pinned: event.target.checked }))} />
            </label>
            <label>
              <span>归档</span>
              <input type="checkbox" checked={form.archived} onChange={(event) => setForm((current) => ({ ...current, archived: event.target.checked }))} />
            </label>
          </div>
          <div className="subscription-editor">
            <label>
              Markdown
              <textarea className="inline-textarea" rows={14} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} />
            </label>
          </div>
          <div className="actions">
            <button className="primary" onClick={saveMemo}>保存</button>
            <button className="red-bg" onClick={deleteMemo} disabled={!form.id}>删除</button>
            <label className="upload-label">
              <input type="file" onChange={uploadAttachment} disabled={!form.id || uploading} />
              {uploading ? "上传中..." : "上传附件"}
            </label>
          </div>
          {message ? <p className="panel-message">{message}</p> : null}
        </Panel>
      </div>

      <div className="grid2">
        <Panel title="Markdown 预览">
          <MemoPreview content={form.content} />
        </Panel>

        <Panel title="附件与文件">
          {form.id ? (
            form.id && rows.find((memo) => memo.id === form.id)?.attachments?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.find((memo) => memo.id === form.id)?.attachments?.map((file) => (
                    <tr key={file.id}>
                      <td>{file.name}</td>
                      <td>{file.mimeType}</td>
                      <td>{formatBytes(file.size)}</td>
                      <td>{formatDateTime(file.uploadedAt)}</td>
                      <td className="actions-cell">
                        <button className="link" onClick={() => downloadAttachment(file)}>下载</button>
                        <button className="link" onClick={() => removeAttachment(file.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">当前备忘录还没有附件。</div>
            )
          ) : (
            <div className="empty">先保存一条备忘录，才能上传附件。</div>
          )}

          <div className="sub-panel">
            <h3>全部文件</h3>
            {files.length ? (
              <table>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>关联 Memo</th>
                    <th>标签</th>
                    <th>引用</th>
                  </tr>
                </thead>
                <tbody>
                  {files.slice(0, 20).map((file) => (
                    <tr key={file.id}>
                      <td>{file.name}</td>
                      <td>{file.memoId || "-"}</td>
                      <td>{joinTags(file.tags) || "-"}</td>
                      <td>{file.refCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">还没有文件。</div>
            )}
          </div>
        </Panel>
      </div>
    </section>
  );
}

export default MemosPage;
