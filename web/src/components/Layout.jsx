import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Command, Menu, X } from "lucide-react";

const groups = [
  ["工作台", ["dashboard", "servers", "monitor"]],
  ["连接与服务", ["console", "nodes", "node-pool", "subscriptions", "forward"]],
  ["管理", ["workspace", "memos", "tokens", "audit", "settings"]],
];

export default function Layout({ nav, page, setPage, children, headerExtra }) {
  const navPage = ["detail", "config", "logs", "ssh"].includes(page)
    ? "servers"
    : page;
  const currentLabel = nav.find(([id]) => id === navPage)?.[2] || "服务器";
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawer = useRef(null);
  const menuButton = useRef(null);
  useEffect(() => {
    if (mobileOpen) drawer.current?.showModal();
    else if (drawer.current?.open) drawer.current.close();
  }, [mobileOpen]);
  const navigate = (id) => {
    setPage(id);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const sidebar = (mobile = false) => (
    <>
      <button
        className="workspace-brand"
        onClick={() => navigate("dashboard")}
        aria-label="ChikenEasy 首页"
      >
        <span className="workspace-logo">
          <Command size={21} />
        </span>
        <span>
          <strong>ChikenEasy</strong>
          <small>服务器与连接管理</small>
        </span>
      </button>
      {mobile ? (
        <button
          className="drawer-close"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        >
          <X size={20} />
        </button>
      ) : null}
      <nav
        className="workspace-nav"
        aria-label={mobile ? "移动端导航" : "主导航"}
      >
        {groups.map(([title, ids]) => (
          <div className="nav-group" key={title}>
            <div className="nav-group-title">{title}</div>
            {ids.map((id) => {
              const item = nav.find(([key]) => key === id);
              if (!item) return null;
              const [, Icon, label] = item;
              return (
                <button
                  key={id}
                  className={navPage === id ? "selected" : ""}
                  aria-current={navPage === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <a className="sidebar-public" href="/" target="_blank" rel="noreferrer">
        <span>公开状态页</span>
        <ArrowUpRight size={16} />
      </a>
      <div className="workspace-footer">
        <span className="workspace-avatar">CE</span>
        <span>
          <strong>我的工作空间</strong>
          <small>自托管控制台</small>
        </span>
      </div>
    </>
  );
  return (
    <div className="app workspace-app">
      <a className="skip-link" href="#main-content">
        跳转到主要内容
      </a>
      <aside className="workspace-sidebar">{sidebar()}</aside>
      <dialog
        className="workspace-drawer"
        ref={drawer}
        onCancel={() => setMobileOpen(false)}
        onClose={() => {
          setMobileOpen(false);
          menuButton.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === drawer.current) setMobileOpen(false);
        }}
      >
        <div className="drawer-content">{sidebar(true)}</div>
      </dialog>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <button
              ref={menuButton}
              className="mobile-menu"
              aria-label="打开导航"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="workspace-account">
            <details className="access-menu">
              <summary>
                访问凭据
                <ChevronDown size={13} />
              </summary>
              <div className="access-popover">
                <strong>当前浏览器的 API 凭据</strong>
                <p>已有登录会话时，无需再输入令牌。</p>
                {headerExtra}
              </div>
            </details>
            <span className="account-divider" />
            <span className="workspace-avatar" title="管理员">
              A
            </span>
          </div>
        </header>
        <div className="workspace-content" id="main-content" tabIndex={-1}>
          {children}
        </div>
        <footer className="workspace-bottom">
          <span>ChikenEasy</span>
          <span>让每一次连接都井然有序</span>
        </footer>
      </main>
    </div>
  );
}
