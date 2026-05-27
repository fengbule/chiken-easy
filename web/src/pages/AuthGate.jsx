import React from "react";
import { KeyRound, Lock, LogIn } from "lucide-react";

export default function AuthGate({
  tokenDraft,
  setTokenDraft,
  onTokenLogin,
  loginForm,
  setLoginForm,
  onPasswordLogin,
  loading,
  error
}) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-badge">Admin Access</div>
        <h1>先登录，后台才能加载服务器与控制功能。</h1>
        <p className="auth-copy">
          你现在看到“选不到服务器”，通常是因为浏览器还没有有效的 API Token 或管理员会话。
        </p>

        <div className="auth-grid">
          <div className="panel auth-panel">
            <div className="panel-head">
              <h2>API Token</h2>
            </div>
            <div className="form-grid">
              <label>
                Token
                <div className="input-row">
                  <input value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="ck_xxx" />
                </div>
              </label>
            </div>
            <div className="actions">
              <button className="primary" onClick={onTokenLogin} disabled={loading}>
                <KeyRound size={15} />
                使用 Token 登录
              </button>
            </div>
          </div>

          <div className="panel auth-panel">
            <div className="panel-head">
              <h2>管理员密码</h2>
            </div>
            <div className="form-grid">
              <label>
                用户名
                <div className="input-row">
                  <input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} placeholder="admin" />
                </div>
              </label>
              <label>
                密码
                <div className="input-row">
                  <input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} placeholder="password" />
                </div>
              </label>
            </div>
            <div className="actions">
              <button className="primary" onClick={onPasswordLogin} disabled={loading}>
                <LogIn size={15} />
                密码登录
              </button>
            </div>
          </div>
        </div>

        <div className="auth-note">
          <Lock size={15} />
          <span>登录成功后，服务器列表、节点、SFTP、互传、BBR、审计等功能才会加载。</span>
        </div>

        {error ? <p className="panel-message auth-error">{error}</p> : null}
      </div>
    </div>
  );
}
