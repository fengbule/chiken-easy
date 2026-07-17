import React from "react";

export default function Layout({ nav, page, setPage, children, headerExtra }) {
  const navPage = ["detail", "config", "logs", "ssh"].includes(page) ? "servers" : page;
  const currentLabel = nav.find(([id]) => id === navPage)?.[2] || "服务器";
  return (
    <div className="app">
      <aside className="app-sidebar">
        <div className="brand">
          <span className="brand-mark">CE</span>
          <span className="brand-copy">
            <strong>ChikenEasy</strong>
            <small>Control plane</small>
          </span>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          <span className="nav-caption">工作空间</span>
          {nav.map(([id, Icon, label]) => (
            <button
              key={id}
              className={navPage === id ? "active" : ""}
              onClick={() => setPage(id)}
              title={label}
              aria-current={navPage === id ? "page" : undefined}
            >
              <span className="nav-icon"><Icon size={18} strokeWidth={1.9} /></span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" />
          <span><strong>系统就绪</strong><small>安全连接已启用</small></span>
        </div>
      </aside>
      <main className="main-shell">
        <header className="topbar">
          <div className="page-heading">
            <span>CHIKEN EASY</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="header-tools">
            {headerExtra}
            <div className="user-chip" title="当前管理员">
              <span className="user-avatar">A</span>
              <span className="user-copy"><strong>admin</strong><small>管理员</small></span>
            </div>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
