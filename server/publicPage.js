function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderPublicProbePage(options = {}) {
  const title = escapeHtml(options.title || "ChikenEasy Public Probes");
  const refreshSec = Math.max(5, Number(options.refreshSec || 10) || 10);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f3ee;
        --bg-soft: #eef4fb;
        --card: rgba(255, 255, 255, 0.92);
        --card-strong: #ffffff;
        --border: rgba(15, 23, 42, 0.1);
        --text: #17212f;
        --muted: #5f6b7d;
        --navy: #0f2747;
        --blue: #1355c2;
        --blue-soft: rgba(19, 85, 194, 0.1);
        --orange: #f38020;
        --orange-strong: #d85b07;
        --orange-soft: rgba(243, 128, 32, 0.14);
        --success: #198754;
        --danger: #cf4f4f;
        font-family: "Aptos", "Segoe UI Variable", "Noto Sans SC", sans-serif;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--text);
        background:
          radial-gradient(circle at top right, rgba(243, 128, 32, 0.18), transparent 30%),
          radial-gradient(circle at left center, rgba(19, 85, 194, 0.08), transparent 28%),
          linear-gradient(180deg, var(--bg) 0%, var(--bg-soft) 44%, #ffffff 100%);
      }
      a { color: inherit; text-decoration: none; }
      .shell { min-height: 100vh; }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 10;
        backdrop-filter: blur(18px);
        background: rgba(247, 243, 238, 0.82);
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .topbar-inner,
      .hero,
      .content,
      .footer {
        width: min(1200px, calc(100vw - 32px));
        margin: 0 auto;
      }
      .topbar-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 74px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .brand-mark {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        font-weight: 800;
        color: white;
        background: linear-gradient(135deg, var(--orange) 0%, var(--orange-strong) 100%);
        box-shadow: 0 12px 28px rgba(243, 128, 32, 0.28);
      }
      .brand-copy strong {
        display: block;
        font-size: 17px;
      }
      .brand-copy span {
        display: block;
        color: var(--muted);
        font-size: 13px;
      }
      .top-links {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .ghost-link,
      .solid-link {
        min-height: 40px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        font-weight: 600;
      }
      .solid-link {
        color: white;
        border-color: transparent;
        background: linear-gradient(135deg, var(--navy), var(--blue));
        box-shadow: 0 14px 28px rgba(19, 85, 194, 0.18);
      }
      .hero {
        padding: 52px 0 28px;
        display: grid;
        grid-template-columns: 1.3fr 0.95fr;
        gap: 22px;
      }
      .hero-card,
      .panel,
      .stat,
      .probe-card {
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: 24px;
        box-shadow: 0 18px 50px rgba(17, 34, 68, 0.08);
      }
      .hero-card {
        padding: 28px;
        position: relative;
        overflow: hidden;
      }
      .hero-card::after {
        content: "";
        position: absolute;
        inset: auto -80px -120px auto;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(243, 128, 32, 0.18), transparent 68%);
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--orange-soft);
        color: var(--orange-strong);
        font-weight: 700;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      h1 {
        margin: 18px 0 14px;
        font-size: clamp(34px, 5vw, 56px);
        line-height: 1.02;
      }
      .hero-copy {
        margin: 0;
        max-width: 62ch;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.8;
      }
      .hero-note {
        margin-top: 22px;
        color: var(--muted);
        font-size: 13px;
      }
      .hero-stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .stat {
        padding: 22px;
      }
      .stat-label {
        color: var(--muted);
        font-size: 13px;
        margin-bottom: 10px;
      }
      .stat-value {
        font-size: 32px;
        font-weight: 800;
      }
      .stat-value.orange { color: var(--orange-strong); }
      .stat-value.blue { color: var(--blue); }
      .content {
        display: grid;
        grid-template-columns: 1.55fr 0.95fr;
        gap: 22px;
        padding-bottom: 34px;
      }
      .panel {
        padding: 0;
        overflow: hidden;
      }
      .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 18px 24px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .panel-head h2 {
        margin: 0;
        font-size: 17px;
      }
      .panel-head span {
        color: var(--muted);
        font-size: 13px;
      }
      .panel-body {
        padding: 22px 24px 24px;
      }
      .probe-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .probe-card {
        padding: 18px;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
      }
      .probe-card:hover,
      .probe-card.active {
        transform: translateY(-2px);
        border-color: rgba(243, 128, 32, 0.36);
        box-shadow: 0 18px 40px rgba(17, 34, 68, 0.12);
      }
      .probe-top,
      .event-top,
      .detail-row,
      .mini-stat {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .probe-top strong {
        font-size: 16px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .badge.online {
        color: var(--success);
        background: rgba(25, 135, 84, 0.12);
      }
      .badge.offline {
        color: var(--danger);
        background: rgba(207, 79, 79, 0.12);
      }
      .probe-sub,
      .event-copy,
      .detail-copy,
      .empty,
      .footer {
        color: var(--muted);
      }
      .probe-sub {
        margin: 10px 0 0;
        font-size: 13px;
        line-height: 1.6;
      }
      .mini-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-top: 16px;
      }
      .mini-stat {
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.82);
        border: 1px solid rgba(15, 23, 42, 0.05);
      }
      .mini-stat span {
        font-size: 12px;
        color: var(--muted);
      }
      .mini-stat strong {
        font-size: 14px;
      }
      .detail-stack,
      .events,
      .spark-stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .detail-box,
      .event-card {
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.88);
      }
      .detail-row strong,
      .event-top strong {
        font-size: 14px;
      }
      .detail-row span,
      .event-top span {
        font-size: 12px;
        color: var(--muted);
      }
      .event-copy {
        margin-top: 8px;
        font-size: 13px;
        line-height: 1.6;
      }
      .spark-card {
        padding: 14px 16px;
        border-radius: 18px;
        background: rgba(248, 250, 252, 0.92);
        border: 1px solid rgba(15, 23, 42, 0.08);
      }
      .spark-card strong {
        display: block;
        margin-bottom: 8px;
        font-size: 14px;
      }
      .spark-card svg {
        width: 100%;
        height: 68px;
        display: block;
      }
      .footer {
        padding: 0 0 36px;
        font-size: 13px;
        line-height: 1.7;
      }
      .empty {
        padding: 28px 4px;
        text-align: center;
      }
      @media (max-width: 1040px) {
        .hero,
        .content {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .topbar-inner {
          min-height: 64px;
          padding: 12px 0;
          align-items: flex-start;
          flex-direction: column;
        }
        .hero,
        .content {
          width: min(1200px, calc(100vw - 24px));
        }
        .hero {
          padding-top: 34px;
        }
        .hero-stats,
        .mini-grid {
          grid-template-columns: 1fr;
        }
        h1 {
          font-size: 34px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">
            <div class="brand-mark">CE</div>
            <div class="brand-copy">
              <strong>${title}</strong>
              <span>Cloudflare-inspired public network probes</span>
            </div>
          </div>
          <div class="top-links">
            <a class="ghost-link" href="/docs/api">API Docs</a>
            <a class="solid-link" href="/admin">Admin Console</a>
          </div>
        </div>
      </div>

      <div class="hero">
        <div class="hero-card">
          <div class="eyebrow">Public Probes</div>
          <h1>Probe health, routes, and fleet posture in one place.</h1>
          <p class="hero-copy">
            This page exposes sanitized public probe data only. Use the admin console for control actions, SSH, memos, subscriptions, BBR tuning, and automation.
          </p>
          <p class="hero-note">Auto refresh every ${refreshSec} seconds. If this page looks stale after an update, try Ctrl+F5 first.</p>
        </div>
        <div class="hero-stats" id="summary-cards">
          <div class="stat"><div class="stat-label">Loading</div><div class="stat-value orange">...</div></div>
        </div>
      </div>

      <div class="content">
        <div class="panel">
          <div class="panel-head">
            <h2>Probe Fleet</h2>
            <span id="probe-count">Loading...</span>
          </div>
          <div class="panel-body">
            <div class="probe-grid" id="probe-grid"></div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Selected Probe</h2>
            <span id="selected-title">Waiting for probe data</span>
          </div>
          <div class="panel-body">
            <div class="detail-stack" id="probe-detail"></div>
            <div class="spark-stack" id="probe-history"></div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Recent Events</h2>
            <span>Public only</span>
          </div>
          <div class="panel-body">
            <div class="events" id="event-list"></div>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="hero">
          <div>Public probe data is sanitized by design. Sensitive SSH, token, key, file, and subscription management stays behind the admin console and API token protection.</div>
        </div>
      </div>
    </div>

    <script>
      const refreshMs = ${refreshSec * 1000};
      const state = { selectedAgentId: "", probes: [], summary: null, events: [] };

      const formatBytes = (value = 0) => {
        const bytes = Number(value || 0);
        if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        let current = bytes;
        let index = 0;
        while (current >= 1024 && index < units.length - 1) {
          current /= 1024;
          index += 1;
        }
        const digits = current >= 100 || index === 0 ? 0 : current >= 10 ? 1 : 2;
        return current.toFixed(digits) + " " + units[index];
      };

      const formatSpeed = (value = 0) => formatBytes(value) + "/s";
      const formatPercent = (value = 0) => Math.round(Number(value || 0)) + "%";
      const formatDateTime = (value) => {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toISOString().replace("T", " ").slice(0, 16);
      };

      async function fetchJson(url) {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error(await response.text());
        return response.json();
      }

      function sparkline(points, color) {
        const values = (points || []).map((item) => Number(item || 0));
        const width = 320;
        const height = 68;
        if (!values.length || values.every((item) => item === 0)) {
          return '<div class="empty">No history yet</div>';
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const step = values.length > 1 ? width / (values.length - 1) : width;
        const coords = values.map((value, index) => {
          const x = Math.round(index * step * 100) / 100;
          const y = Math.round((height - 8 - ((value - min) / range) * (height - 18)) * 100) / 100;
          return [x, y];
        });
        const line = coords.map(([x, y], index) => (index ? "L" : "M") + " " + x + " " + y).join(" ");
        const area = line + " L " + coords[coords.length - 1][0] + " " + height + " L " + coords[0][0] + " " + height + " Z";
        return '<svg viewBox="0 0 ' + width + " " + height + '"><path d="' + area + '" fill="rgba(19,85,194,0.12)"></path><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      }

      function renderSummary() {
        const summary = state.summary || {};
        const cards = [
          ["Total Probes", summary.total || 0, "orange"],
          ["Online", summary.online || 0, "blue"],
          ["Offline", summary.offline || 0, ""],
          ["Regions", summary.regions || 0, ""],
          ["Real-time RX", formatSpeed(summary.totalRxSpeed || 0), ""],
          ["Real-time TX", formatSpeed(summary.totalTxSpeed || 0), ""]
        ];
        document.getElementById("summary-cards").innerHTML = cards
          .map(([label, value, tone]) => '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value ' + tone + '">' + value + "</div></div>")
          .join("");
      }

      function selectProbe(id) {
        state.selectedAgentId = id;
        renderProbes();
        loadHistory(id).catch((error) => {
          document.getElementById("probe-history").innerHTML = '<div class="empty">' + error.message + "</div>";
        });
      }

      function renderProbes() {
        const probes = state.probes || [];
        document.getElementById("probe-count").textContent = probes.length ? probes.length + " probes" : "No public probes";
        document.getElementById("probe-grid").innerHTML = probes.length
          ? probes
              .map((probe) => {
                const active = state.selectedAgentId === probe.id ? " active" : "";
                return '<button class="probe-card' + active + '" type="button" data-id="' + probe.id + '">' +
                  '<div class="probe-top"><strong>' + (probe.flag ? probe.flag + " " : "") + probe.name + '</strong><span class="badge ' + (probe.online ? "online" : "offline") + '">' + (probe.online ? "online" : "offline") + "</span></div>" +
                  '<p class="probe-sub">' + (probe.group || "ungrouped") + " / " + (probe.region || "unlabelled region") + "</p>" +
                  '<div class="mini-grid">' +
                    '<div class="mini-stat"><span>CPU</span><strong>' + formatPercent(probe.metrics?.cpuUsage) + '</strong></div>' +
                    '<div class="mini-stat"><span>Memory</span><strong>' + formatPercent(probe.metrics?.memoryUsage) + '</strong></div>' +
                    '<div class="mini-stat"><span>RX</span><strong>' + formatSpeed(probe.metrics?.rxSpeed) + '</strong></div>' +
                    '<div class="mini-stat"><span>TX</span><strong>' + formatSpeed(probe.metrics?.txSpeed) + '</strong></div>' +
                  '</div>' +
                '</button>';
              })
              .join("")
          : '<div class="empty">No public probes available</div>';

        for (const button of document.querySelectorAll(".probe-card")) {
          button.addEventListener("click", () => selectProbe(button.dataset.id));
        }

        const selected = probes.find((probe) => probe.id === state.selectedAgentId) || probes[0] || null;
        if (selected && state.selectedAgentId !== selected.id) state.selectedAgentId = selected.id;
        renderDetail(selected);
      }

      function renderDetail(probe) {
        document.getElementById("selected-title").textContent = probe ? probe.name : "Waiting for probe data";
        if (!probe) {
          document.getElementById("probe-detail").innerHTML = '<div class="empty">Select a probe to inspect history</div>';
          document.getElementById("probe-history").innerHTML = "";
          return;
        }

        document.getElementById("probe-detail").innerHTML = [
          ["Probe", probe.name],
          ["Status", probe.online ? "online" : "offline"],
          ["Group", probe.group || "-"],
          ["Region", probe.region || "-"],
          ["Total Traffic", formatBytes((probe.metrics?.rxTotal || 0) + (probe.metrics?.txTotal || 0))],
          ["CPU / MEM", formatPercent(probe.metrics?.cpuUsage) + " / " + formatPercent(probe.metrics?.memoryUsage)]
        ]
          .map(([label, value]) => '<div class="detail-box"><div class="detail-row"><strong>' + label + '</strong><span>' + value + "</span></div></div>")
          .join("");
      }

      function renderEvents() {
        const events = state.events || [];
        document.getElementById("event-list").innerHTML = events.length
          ? events
              .map((event) => '<div class="event-card"><div class="event-top"><strong>' + event.type + '</strong><span>' + formatDateTime(event.updatedAt) + '</span></div><div class="event-copy">' + (event.message || "No message") + "</div></div>")
              .join("")
          : '<div class="empty">No public events yet</div>';
      }

      async function loadHistory(agentId) {
        const history = await fetchJson("/api/public/probes/history?agentId=" + encodeURIComponent(agentId));
        const raw = Array.isArray(history.raw) ? history.raw : [];
        const points = raw.slice(-20);
        document.getElementById("probe-history").innerHTML = points.length
          ? [
              ['CPU', points.map((item) => item.cpuUsage || 0), '#f38020'],
              ['RX', points.map((item) => item.rxSpeed || 0), '#1355c2'],
              ['TX', points.map((item) => item.txSpeed || 0), '#0f2747']
            ]
              .map(([label, values, color]) => '<div class="spark-card"><strong>' + label + '</strong>' + sparkline(values, color) + "</div>")
              .join("")
          : '<div class="empty">No history samples yet</div>';
      }

      async function load() {
        const [summary, probes, events] = await Promise.all([
          fetchJson("/api/public/summary"),
          fetchJson("/api/public/probes"),
          fetchJson("/api/public/events")
        ]);
        state.summary = summary;
        state.probes = probes;
        state.events = events;
        renderSummary();
        renderProbes();
        renderEvents();
        if (state.selectedAgentId) await loadHistory(state.selectedAgentId);
      }

      load().catch((error) => {
        document.getElementById("probe-grid").innerHTML = '<div class="empty">' + error.message + "</div>";
      });
      setInterval(() => load().catch(() => {}), refreshMs);
    </script>
  </body>
</html>`;
}
