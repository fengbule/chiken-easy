import React from "react";

export function StatusDot({ on }) {
  return <span className={`dot ${on ? "ok" : ""}`} />;
}

export default function StatusBadge({ ok, text }) {
  return (
    <span className={`status-badge ${ok ? "status-ok" : "status-warn"}`}>
      <StatusDot on={ok} />
      {text}
    </span>
  );
}
