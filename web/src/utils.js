export function buildAuthUrl(url, extraParams = {}) {
  const target = new URL(url, window.location.origin);
  for (const [key, value] of Object.entries(extraParams)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }
  return `${target.pathname}${target.search}`;
}

export async function copyText(value) {
  await navigator.clipboard.writeText(String(value || ""));
}

export function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinTags(value) {
  return Array.isArray(value) ? value.join(", ") : "";
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function renderMarkdownHtml(source) {
  const text = String(source || "");
  const blocks = [];
  let html = escapeHtml(text);

  html = html.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const token = `__CODE_BLOCK_${blocks.length}__`;
    blocks.push(`<pre class="markdown-code"><div class="markdown-code-head"><span>${escapeHtml(lang || "code")}</span></div><code>${escapeHtml(code.trim())}</code></pre>`);
    return token;
  });

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html.replace(/\n/g, "<br />")}</p>`;
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-3]>)/g, "$1").replace(/(<\/h[1-3]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>)/g, "$1").replace(/(<\/ul>)<\/p>/g, "$1");

  blocks.forEach((block, index) => {
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return html;
}

export const randHex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((item) => item.toString(16).padStart(2, "0")).join("");
export const randPassword = () => randHex(12);
export const randShortId = () => randHex(8);
export const randPort = (base = 20000, size = 30000) => base + Math.floor(Math.random() * size);
export const randPath = () => `/${randHex(3)}`;
export const newUuid = () => crypto.randomUUID?.() || `${randHex(4)}-${randHex(2)}-${randHex(2)}-${randHex(2)}-${randHex(6)}`;

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 100 || index === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[index]}`;
}

export function formatSpeed(value) {
  return `${formatBytes(value)}/s`;
}

export function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

export function formatUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
