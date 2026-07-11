import React, { useEffect, useState } from "react";
import { api } from "../api";

function Panel({ title, children }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function Audit() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    api("/api/audit").then(setRows).catch(() => {});
  }, []);

  return (
    <Panel title="审计日志">
      <table>
        <thead>
          <tr>
            <th>时间</th>
            <th>操作者</th>
            <th>动作</th>
            <th>目标</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.at}</td>
              <td>{row.actor}</td>
              <td>{row.action}</td>
              <td>{row.target}</td>
              <td>
                <code>{JSON.stringify(row.detail)}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
