import React from "react";

export default function EmptyState({ title = "暂无数据", detail = "当前还没有可显示的内容。" }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p className="muted">{detail}</p>
    </div>
  );
}
