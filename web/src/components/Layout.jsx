import React from "react";

export default function Layout({ nav, page, setPage, children, headerExtra }) {
  const navPage = ["detail", "config", "logs", "ssh"].includes(page) ? "servers" : page;
  const title = nav.find(([id]) => id === navPage)?.[2] || "服务器";

  return (
    <div className="app">
      <aside>
        <div className="brand">ChikenEasy</div>
        {nav.map(([id, Icon, label]) => (
          <button key={id} className={navPage === id ? "active" : ""} onClick={() => setPage(id)}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </aside>
      <main>
        <header>
          <strong>{title}</strong>
          <div className="header-tools">
            {headerExtra}
            <span>管理员</span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
