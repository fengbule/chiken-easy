const endpointCatalog = [
  {
    group: "Auth And Health",
    method: "GET",
    path: "/api/health",
    auth: "public",
    description: "Health check for the control plane."
  },
  {
    group: "Auth And Health",
    method: "GET",
    path: "/api/auth/status",
    auth: "optional",
    description: "Current auth/session status and safe settings summary."
  },
  {
    group: "Auth And Health",
    method: "POST",
    path: "/api/auth/login",
    auth: "public",
    description: "Create an admin browser session with username and password.",
    body: { username: "admin", password: "your-password" }
  },
  {
    group: "Auth And Health",
    method: "POST",
    path: "/api/auth/session",
    auth: "token",
    description: "Create a browser session from a valid API token.",
    body: { token: "ck_xxx" }
  },
  {
    group: "Auth And Health",
    method: "DELETE",
    path: "/api/auth/session",
    auth: "session",
    description: "Clear the current browser session."
  },
  {
    group: "Public Probes",
    method: "GET",
    path: "/",
    auth: "public",
    description: "Cloudflare-inspired public probe page."
  },
  {
    group: "Public Probes",
    method: "GET",
    path: "/api/public/summary",
    auth: "public",
    description: "Sanitized public summary for probe fleet status."
  },
  {
    group: "Public Probes",
    method: "GET",
    path: "/api/public/probes",
    auth: "public",
    description: "List sanitized public probe cards."
  },
  {
    group: "Public Probes",
    method: "GET",
    path: "/api/public/probes/history?agentId=...",
    auth: "public",
    description: "History for a public probe card."
  },
  {
    group: "Public Probes",
    method: "GET",
    path: "/api/public/events",
    auth: "public",
    description: "Recent public monitor events."
  },
  {
    group: "Dashboard And Monitor",
    method: "GET",
    path: "/api/dashboard",
    auth: "token-or-session",
    description: "Admin dashboard summary."
  },
  {
    group: "Dashboard And Monitor",
    method: "GET",
    path: "/api/monitor/summary",
    auth: "token-or-session",
    description: "Admin monitor summary."
  },
  {
    group: "Agents",
    method: "GET",
    path: "/api/agents",
    auth: "token-or-session",
    description: "List registered agents."
  },
  {
    group: "Agents",
    method: "GET",
    path: "/api/agents/:id",
    auth: "token-or-session",
    description: "Agent detail including metrics and memos."
  },
  {
    group: "Agents",
    method: "GET",
    path: "/api/agents/:id/probe/history",
    auth: "token-or-session",
    description: "Detailed monitor history for one agent."
  },
  {
    group: "Agents",
    method: "POST",
    path: "/api/agents/:id/service/:action",
    auth: "token-or-session",
    description: "Control sing-box service. Action: start, stop, restart, status."
  },
  {
    group: "Config And Nodes",
    method: "POST",
    path: "/api/config/render",
    auth: "token-or-session",
    description: "Render a sing-box config preview from wizard input."
  },
  {
    group: "Config And Nodes",
    method: "POST",
    path: "/api/agents/:id/config/wizard",
    auth: "token-or-session",
    description: "Build and apply a wizard-based sing-box config."
  },
  {
    group: "Config And Nodes",
    method: "GET",
    path: "/api/agents/:id/config",
    auth: "token-or-session",
    description: "Read cached current config for an agent."
  },
  {
    group: "Config And Nodes",
    method: "POST",
    path: "/api/agents/:id/config",
    auth: "token-or-session",
    description: "Apply a raw config object.",
    body: { config: { inbounds: [], outbounds: [] }, restart: true }
  },
  {
    group: "Config And Nodes",
    method: "GET",
    path: "/api/agents/:id/config/versions",
    auth: "token-or-session",
    description: "List config history for one agent."
  },
  {
    group: "Config And Nodes",
    method: "POST",
    path: "/api/agents/:id/config/rollback/:versionId",
    auth: "token-or-session",
    description: "Roll back to a previous config version."
  },
  {
    group: "Network Tuning",
    method: "GET",
    path: "/api/agents/:id/network/tuning",
    auth: "token-or-session",
    description: "Inspect network tuning status without modifying the host."
  },
  {
    group: "Network Tuning",
    method: "POST",
    path: "/api/agents/:id/network/tuning/dry-run",
    auth: "token-or-session",
    description: "Return a safe BBR tuning plan without modifying the host.",
    body: { profile: "enable-bbr" }
  },
  {
    group: "Network Tuning",
    method: "POST",
    path: "/api/agents/:id/network/tuning/apply",
    auth: "token-or-session",
    description: "Apply one network tuning profile with backup, audit, and post-check.",
    body: { profile: "enable-bbr" }
  },
  {
    group: "Network Tuning",
    method: "POST",
    path: "/api/agents/:id/network/tuning/rollback",
    auth: "token-or-session",
    description: "Restore the saved network tuning backup."
  },
  {
    group: "Network Tuning",
    method: "GET",
    path: "/api/agents/:id/network/tuning/history",
    auth: "token-or-session",
    description: "List network tuning history and before/after comparisons."
  },
  {
    group: "Forwarding",
    method: "POST",
    path: "/api/forward/render",
    auth: "token-or-session",
    description: "Render a forward rule preview."
  },
  {
    group: "Forwarding",
    method: "GET",
    path: "/api/agents/:id/forwards",
    auth: "token-or-session",
    description: "List forward rules for one agent."
  },
  {
    group: "Forwarding",
    method: "POST",
    path: "/api/agents/:id/forward/wizard",
    auth: "token-or-session",
    description: "Create or update a forward rule."
  },
  {
    group: "Forwarding",
    method: "DELETE",
    path: "/api/agents/:id/forwards/:ruleId",
    auth: "token-or-session",
    description: "Remove a forward rule."
  },
  {
    group: "Forwarding",
    method: "POST",
    path: "/api/agents/:id/forward-images/:engine/check",
    auth: "token-or-session",
    description: "Preflight check for Realm or GOST image availability."
  },
  {
    group: "SSH And Terminal",
    method: "GET",
    path: "/api/agents/:id/ssh-profile",
    auth: "token-or-session",
    description: "Read the saved SSH profile."
  },
  {
    group: "SSH And Terminal",
    method: "PUT",
    path: "/api/agents/:id/ssh-profile",
    auth: "token-or-session",
    description: "Update the saved SSH profile."
  },
  {
    group: "SSH And Terminal",
    method: "POST",
    path: "/api/agents/:id/ssh-profile/test",
    auth: "token-or-session",
    description: "Test the saved SSH profile."
  },
  {
    group: "SSH And Terminal",
    method: "POST",
    path: "/api/agents/:id/ssh",
    auth: "token-or-session",
    description: "Run one command over SSH or agent fallback."
  },
  {
    group: "SSH And Terminal",
    method: "WS",
    path: "/terminal?agentId=...&mode=ssh|agent",
    auth: "token-or-session",
    description: "Interactive terminal WebSocket."
  },
  {
    group: "SFTP",
    method: "GET",
    path: "/api/agents/:id/sftp?path=...",
    auth: "token-or-session",
    description: "List SFTP directory entries."
  },
  {
    group: "SFTP",
    method: "POST",
    path: "/api/agents/:id/sftp/upload",
    auth: "token-or-session",
    description: "Upload one file to the remote agent."
  },
  {
    group: "SFTP",
    method: "GET",
    path: "/api/agents/:id/sftp/download?path=...",
    auth: "token-or-session",
    description: "Download one file from the remote agent."
  },
  {
    group: "SFTP",
    method: "DELETE",
    path: "/api/agents/:id/sftp?path=...",
    auth: "token-or-session",
    description: "Delete one remote file."
  },
  {
    group: "SFTP",
    method: "POST",
    path: "/api/agents/:id/sftp/mkdir",
    auth: "token-or-session",
    description: "Create a remote directory."
  },
  {
    group: "SFTP",
    method: "POST",
    path: "/api/agents/:id/sftp/rename",
    auth: "token-or-session",
    description: "Rename or move a remote path."
  },
  {
    group: "Workspace",
    method: "GET",
    path: "/api/assets",
    auth: "token-or-session",
    description: "List managed server assets."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/assets",
    auth: "token-or-session",
    description: "Create an asset record."
  },
  {
    group: "Workspace",
    method: "PUT",
    path: "/api/assets/:id",
    auth: "token-or-session",
    description: "Update an asset record."
  },
  {
    group: "Workspace",
    method: "GET",
    path: "/api/credentials",
    auth: "token-or-session",
    description: "List stored credentials."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/credentials",
    auth: "token-or-session",
    description: "Create one credential record."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/credentials/:id/test",
    auth: "token-or-session",
    description: "Test one credential."
  },
  {
    group: "Workspace",
    method: "GET",
    path: "/api/scripts",
    auth: "token-or-session",
    description: "List reusable scripts."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/scripts",
    auth: "token-or-session",
    description: "Create one reusable script."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/scripts/:id/run",
    auth: "token-or-session",
    description: "Run one script on one agent."
  },
  {
    group: "Workspace",
    method: "POST",
    path: "/api/scripts/run-batch",
    auth: "token-or-session",
    description: "Run one script or command on multiple agents."
  },
  {
    group: "Workspace",
    method: "GET",
    path: "/api/command-runs",
    auth: "token-or-session",
    description: "List recent script or command runs."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "GET",
    path: "/api/node-pool",
    auth: "token-or-session",
    description: "List node pool entries."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "POST",
    path: "/api/node-pool/import",
    auth: "token-or-session",
    description: "Import nodes from URIs, Clash YAML, or sing-box JSON."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "POST",
    path: "/api/node-pool/from-agent/:id",
    auth: "token-or-session",
    description: "Import one local node from an agent profile."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "POST",
    path: "/api/node-pool/check",
    auth: "token-or-session",
    description: "Run proxy-check for one or more node IDs."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "GET",
    path: "/api/node-pool/export?format=base64|clash|sing-box|raw",
    auth: "token-or-session",
    description: "Export enabled node pool entries."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "GET",
    path: "/api/subscriptions",
    auth: "token-or-session",
    description: "List subscription profiles."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "POST",
    path: "/api/subscriptions",
    auth: "token-or-session",
    description: "Create one subscription profile."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "PUT",
    path: "/api/subscriptions/:id",
    auth: "token-or-session",
    description: "Update one subscription profile."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "POST",
    path: "/api/subscriptions/render",
    auth: "token-or-session",
    description: "Preview rendered subscription output."
  },
  {
    group: "Node Pool And Subscriptions",
    method: "GET",
    path: "/sub/:token",
    auth: "public-token",
    description: "Public subscription download endpoint."
  },
  {
    group: "Memos And Files",
    method: "GET",
    path: "/api/memos",
    auth: "token-or-session",
    description: "List memos with optional query, tag, and agent filters."
  },
  {
    group: "Memos And Files",
    method: "POST",
    path: "/api/memos",
    auth: "token-or-session",
    description: "Create one memo."
  },
  {
    group: "Memos And Files",
    method: "PUT",
    path: "/api/memos/:id",
    auth: "token-or-session",
    description: "Update one memo."
  },
  {
    group: "Memos And Files",
    method: "DELETE",
    path: "/api/memos/:id",
    auth: "token-or-session",
    description: "Delete one memo."
  },
  {
    group: "Memos And Files",
    method: "GET",
    path: "/api/files",
    auth: "token-or-session",
    description: "List uploaded files."
  },
  {
    group: "Memos And Files",
    method: "POST",
    path: "/api/files/upload",
    auth: "token-or-session",
    description: "Upload one memo or workspace file."
  },
  {
    group: "Memos And Files",
    method: "GET",
    path: "/api/files/:id/download",
    auth: "token-or-session",
    description: "Download one stored file."
  },
  {
    group: "Memos And Files",
    method: "DELETE",
    path: "/api/files/:id",
    auth: "token-or-session",
    description: "Delete one stored file."
  },
  {
    group: "Settings And Governance",
    method: "GET",
    path: "/api/settings",
    auth: "token-or-session",
    description: "Read safe settings and status."
  },
  {
    group: "Settings And Governance",
    method: "PUT",
    path: "/api/settings",
    auth: "token-or-session",
    description: "Update admin settings."
  },
  {
    group: "Settings And Governance",
    method: "POST",
    path: "/api/settings/notifications/test",
    auth: "token-or-session",
    description: "Send a test notification."
  },
  {
    group: "Settings And Governance",
    method: "GET",
    path: "/api/api-tokens",
    auth: "token-or-session",
    description: "List API tokens."
  },
  {
    group: "Settings And Governance",
    method: "POST",
    path: "/api/api-tokens",
    auth: "token-or-session",
    description: "Create an API token."
  },
  {
    group: "Settings And Governance",
    method: "DELETE",
    path: "/api/api-tokens/:id",
    auth: "token-or-session",
    description: "Revoke an API token."
  },
  {
    group: "Settings And Governance",
    method: "GET",
    path: "/api/audit",
    auth: "token-or-session",
    description: "Query audit events."
  },
  {
    group: "Install And Deploy",
    method: "POST",
    path: "/api/agents/:id/install-command",
    auth: "token-or-session",
    description: "Generate one one-click agent install bundle and command."
  },
  {
    group: "Install And Deploy",
    method: "POST",
    path: "/api/agents/:id/deploy",
    auth: "token-or-session",
    description: "Push the generated install script over SSH."
  },
  {
    group: "Install And Deploy",
    method: "GET",
    path: "/install/agent.sh?bundle=...",
    auth: "bundle-token",
    description: "One-click generated agent install script."
  }
];

function buildPaths() {
  const paths = {};
  for (const row of endpointCatalog) {
    if (row.method === "WS") continue;
    const pathKey = row.path.replace(/\?[^#]+$/, "").replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    paths[pathKey] ||= {};
    paths[pathKey][row.method.toLowerCase()] = {
      summary: row.description,
      tags: [row.group],
      security: row.auth === "public" || row.auth === "optional" || row.auth === "public-token" || row.auth === "bundle-token" ? [] : [{ bearerAuth: [] }],
      requestBody: row.body
        ? {
            required: true,
            content: {
              "application/json": {
                example: row.body
              }
            }
          }
        : undefined,
      responses: {
        200: { description: "Successful response" },
        400: { description: "Validation or bad request error" },
        401: { description: "Authentication required or invalid" },
        404: { description: "Resource not found" },
        409: { description: "Conflict or agent offline" }
      }
    };
  }
  return paths;
}

export function buildOpenApiSpec() {
  return {
    openapi: "3.1.0",
    info: {
      title: "ChikenEasy Control API",
      version: "0.1.0",
      description: "Operational API for probes, agents, subscriptions, memos, WebSSH, and BBR diagnostics."
    },
    servers: [{ url: "/" }],
    tags: Array.from(new Set(endpointCatalog.map((item) => item.group))).map((name) => ({ name })),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API token"
        }
      }
    },
    paths: buildPaths(),
    "x-chiken-websockets": endpointCatalog.filter((item) => item.method === "WS")
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderApiDocsPage(options = {}) {
  const title = escapeHtml(options.title || "ChikenEasy API Docs");
  const rows = JSON.stringify(endpointCatalog);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --bg: #f7f3ee;
        --bg-soft: #eef4fb;
        --panel: rgba(255,255,255,0.94);
        --border: rgba(15,23,42,0.1);
        --text: #152033;
        --muted: #5f6b7d;
        --navy: #0f2747;
        --orange: #f38020;
        --blue: #1355c2;
        font-family: "Aptos", "Segoe UI Variable", "Noto Sans SC", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(243,128,32,0.16), transparent 26%),
          linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 42%, #fff 100%);
      }
      .shell { width: min(1180px, calc(100vw - 32px)); margin: 0 auto; padding: 36px 0 52px; }
      .hero, .panel {
        border: 1px solid var(--border);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: 0 18px 48px rgba(17,34,68,0.08);
      }
      .hero {
        padding: 28px;
        margin-bottom: 22px;
      }
      .eyebrow {
        display: inline-flex;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(243,128,32,0.14);
        color: #d85b07;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      h1 { margin: 16px 0 12px; font-size: clamp(30px, 4vw, 48px); line-height: 1.04; }
      p { color: var(--muted); line-height: 1.75; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
      .actions a {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(15,23,42,0.08);
        color: var(--navy);
        text-decoration: none;
        font-weight: 700;
      }
      .actions a.primary {
        background: linear-gradient(135deg, var(--navy), var(--blue));
        border-color: transparent;
        color: white;
      }
      .toolbar {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      input {
        min-height: 42px;
        min-width: 280px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.12);
      }
      .panel { overflow: hidden; }
      .panel-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 24px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
      }
      .panel-body { padding: 20px 24px 24px; }
      .group { margin-bottom: 24px; }
      .group h2 { margin: 0 0 12px; font-size: 18px; }
      .endpoint-list { display: grid; gap: 14px; }
      .endpoint {
        border: 1px solid rgba(15,23,42,0.08);
        border-radius: 18px;
        padding: 16px 18px;
        background: rgba(255,255,255,0.82);
      }
      .endpoint-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .verb {
        min-width: 62px;
        text-align: center;
        padding: 6px 10px;
        border-radius: 999px;
        color: white;
        font-size: 12px;
        font-weight: 800;
      }
      .verb.get { background: #1355c2; }
      .verb.post { background: #f38020; }
      .verb.put { background: #0f2747; }
      .verb.delete { background: #cf4f4f; }
      .verb.ws { background: #198754; }
      code {
        padding: 4px 8px;
        border-radius: 10px;
        background: rgba(19,85,194,0.08);
        color: var(--navy);
      }
      pre {
        margin: 12px 0 0;
        padding: 14px 16px;
        border-radius: 16px;
        background: #0f172a;
        color: #e9f1ff;
        overflow: auto;
      }
      .auth {
        display: inline-flex;
        align-items: center;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(15,23,42,0.06);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .empty { color: var(--muted); text-align: center; padding: 40px 0; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="hero">
        <div class="eyebrow">API Docs</div>
        <h1>Control probes, agents, nodes, memos, WebSSH, and BBR diagnostics over HTTP.</h1>
        <p>
          Most endpoints accept either a browser session or an <code>Authorization: Bearer ck_xxx</code> token.
          Public probe endpoints remain open by design, while write actions are audited.
        </p>
        <div class="actions">
          <a class="primary" href="/docs/api/openapi.json">OpenAPI JSON</a>
          <a href="/admin">Admin Console</a>
          <a href="/">Public Probes</a>
        </div>
      </div>

      <div class="toolbar">
        <input id="search" placeholder="Filter by path, method, group, or keyword" />
      </div>

      <div class="panel">
        <div class="panel-head">
          <strong>Endpoint Catalog</strong>
          <span id="result-count"></span>
        </div>
        <div class="panel-body" id="catalog"></div>
      </div>
    </div>

    <script>
      const rows = ${rows};
      const searchInput = document.getElementById("search");
      const catalog = document.getElementById("catalog");
      const resultCount = document.getElementById("result-count");

      function render(filter = "") {
        const query = String(filter || "").trim().toLowerCase();
        const filtered = rows.filter((row) => {
          if (!query) return true;
          return [row.group, row.method, row.path, row.auth, row.description, JSON.stringify(row.body || {})].join(" ").toLowerCase().includes(query);
        });
        resultCount.textContent = filtered.length + " endpoints";
        const groups = [...new Set(filtered.map((row) => row.group))];
        if (!filtered.length) {
          catalog.innerHTML = '<div class="empty">No endpoints matched the current filter.</div>';
          return;
        }
        catalog.innerHTML = groups.map((group) => {
          const items = filtered.filter((row) => row.group === group);
          return '<div class="group"><h2>' + group + '</h2><div class="endpoint-list">' + items.map((row) => {
            const verbClass = row.method.toLowerCase();
            return '<div class="endpoint">' +
              '<div class="endpoint-top">' +
                '<span class="verb ' + verbClass + '">' + row.method + '</span>' +
                '<code>' + row.path + '</code>' +
                '<span class="auth">' + row.auth + '</span>' +
              '</div>' +
              '<p>' + row.description + '</p>' +
              (row.body ? '<pre>' + JSON.stringify(row.body, null, 2) + '</pre>' : '') +
            '</div>';
          }).join("") + '</div></div>';
        }).join("");
      }

      render();
      searchInput.addEventListener("input", () => render(searchInput.value));
    </script>
  </body>
</html>`;
}

export { endpointCatalog };
