import { nanoid } from "nanoid";

const shareProtocols = ["vmess", "vless", "trojan", "ss", "hysteria2", "hy2"];
const sharePattern = /^(vmess|vless|trojan|ss|hysteria2|hy2):\/\//i;

function base64Encode(text) {
  return Buffer.from(String(text || ""), "utf8").toString("base64");
}

function base64Decode(text) {
  const normalized = String(text || "").trim().replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized) return "";
  return Buffer.from(normalized, "base64").toString("utf8");
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function toUrl(raw) {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function firstNonEmpty(...values) {
  return values.map((item) => String(item || "").trim()).find(Boolean) || "";
}

function normalizeHost(host) {
  return String(host || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function splitImportLines(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  let lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => sharePattern.test(line))) return lines;
  try {
    const decoded = base64Decode(raw);
    const decodedLines = decoded.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (decodedLines.some((line) => sharePattern.test(line))) lines = decodedLines;
  } catch {}
  return lines;
}

function parseVmess(raw) {
  try {
    const body = raw.replace(/^vmess:\/\//i, "");
    const json = JSON.parse(base64Decode(body));
    return {
      protocol: "vmess",
      name: firstNonEmpty(json.ps, json.name, "VMess"),
      server: String(json.add || json.host || ""),
      port: Number(json.port || 0) || null,
      meta: {
        uuid: json.id || "",
        alterId: Number(json.aid || 0) || 0,
        cipher: json.scy || "auto",
        network: json.net || "",
        tls: json.tls || "",
        path: json.path || "",
        sni: json.sni || json.host || ""
      }
    };
  } catch {
    return { protocol: "vmess", name: "VMess" };
  }
}

function parseStandardUrl(raw) {
  const url = toUrl(raw);
  if (!url) return null;
  const protocol = url.protocol.replace(":", "").toLowerCase();
  const name = safeDecodeURIComponent(url.hash.replace(/^#/, "")) || protocol.toUpperCase();
  return {
    protocol,
    name,
    server: url.hostname,
    port: Number(url.port || 0) || null,
    meta: {
      ...Object.fromEntries(url.searchParams.entries()),
      username: safeDecodeURIComponent(url.username || ""),
      password: safeDecodeURIComponent(url.password || "")
    }
  };
}

function parseSs(raw) {
  const parsed = parseStandardUrl(raw);
  if (!parsed) return { protocol: "ss", name: "Shadowsocks" };
  let method = "";
  let password = "";
  try {
    const userInfo = base64Decode(parsed.meta?.username || "");
    const splitAt = userInfo.indexOf(":");
    if (splitAt > 0) {
      method = userInfo.slice(0, splitAt);
      password = userInfo.slice(splitAt + 1);
    }
  } catch {}
  if (!parsed.server) {
    try {
      const noScheme = raw.replace(/^ss:\/\//i, "");
      const [left, hash = ""] = noScheme.split("#");
      const decoded = base64Decode(left.split("@")[0]);
      const splitAt = decoded.indexOf(":");
      method = splitAt > 0 ? decoded.slice(0, splitAt) : method;
      password = splitAt > 0 ? decoded.slice(splitAt + 1) : password;
      const serverPart = left.includes("@") ? left.split("@").slice(1).join("@") : "";
      const [server, port] = serverPart.split(":");
      parsed.server = server || parsed.server;
      parsed.port = Number(port || 0) || parsed.port;
      parsed.name = safeDecodeURIComponent(hash) || parsed.name;
    } catch {}
  }
  return { ...parsed, protocol: "ss", meta: { ...(parsed.meta || {}), method, password } };
}

export function parseNodeLine(raw) {
  const line = String(raw || "").trim();
  if (!sharePattern.test(line)) return null;
  const scheme = line.slice(0, line.indexOf("://")).toLowerCase();
  const parsed = scheme === "vmess" ? parseVmess(line) : scheme === "ss" ? parseSs(line) : parseStandardUrl(line);
  if (!parsed) return null;
  return {
    id: nanoid(10),
    name: parsed.name || scheme.toUpperCase(),
    source: "import",
    protocol: scheme === "hy2" ? "hysteria2" : parsed.protocol || scheme,
    server: parsed.server || "",
    port: parsed.port || null,
    raw: line,
    enabled: true,
    tags: [],
    meta: parsed.meta || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function parseNodeImport(text, sourceName = "import") {
  const seen = new Set();
  return splitImportLines(text)
    .map(parseNodeLine)
    .filter(Boolean)
    .filter((node) => {
      if (seen.has(node.raw)) return false;
      seen.add(node.raw);
      node.sourceName = String(sourceName || "import").trim() || "import";
      return true;
    });
}

function arrayFromValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

export function publicNode(node) {
  return {
    id: node.id,
    name: node.name,
    source: node.source || "import",
    sourceName: node.sourceName || "",
    protocol: node.protocol || "",
    server: node.server || "",
    port: node.port || null,
    enabled: node.enabled !== false,
    tags: node.tags || [],
    groupIds: node.groupIds || [],
    raw: node.raw || "",
    agentId: node.agentId || "",
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

export function upsertNode(nodes, patch) {
  const list = Array.isArray(nodes) ? nodes : [];
  const raw = String(patch.raw || "").trim();
  const index = list.findIndex((node) => node.id === patch.id || (raw && node.raw === raw));
  const current = index >= 0 ? list[index] : null;
  const next = {
    ...current,
    ...patch,
    id: current?.id || patch.id || nanoid(10),
    enabled: patch.enabled !== false,
    tags: Array.isArray(patch.tags) ? patch.tags : current?.tags || [],
    groupIds: Array.isArray(patch.groupIds) ? patch.groupIds : current?.groupIds || [],
    createdAt: current?.createdAt || patch.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return next;
}

export function createSubscriptionToken(name = "default") {
  return {
    id: nanoid(10),
    name: String(name || "default").trim() || "default",
    token: `sub_${nanoid(32)}`,
    createdAt: new Date().toISOString(),
    enabled: true,
    format: "base64",
    profile: { protocols: [], tags: [], sources: [], groupIds: [] },
    accessCount: 0,
    lastAccessAt: null
  };
}

export function publicSubscriptionToken(token, req) {
  const origin = `${req.protocol}://${req.get("host")}`;
  return {
    id: token.id,
    name: token.name,
    token: token.token,
    enabled: token.enabled !== false,
    format: token.format || "base64",
    profile: token.profile || { protocols: [], tags: [], sources: [], groupIds: [] },
    accessCount: Number(token.accessCount || 0),
    lastAccessAt: token.lastAccessAt || null,
    createdAt: token.createdAt,
    links: {
      base64: `${origin}/sub/${token.token}`,
      raw: `${origin}/sub/${token.token}?format=raw`,
      clash: `${origin}/sub/${token.token}?format=clash`,
      singbox: `${origin}/sub/${token.token}?format=sing-box`
    }
  };
}

export function normalizeSubscriptionToken(input = {}, current = {}) {
  const profile = input.profile || current.profile || {};
  return {
    ...current,
    id: current.id || input.id || nanoid(10),
    name: String(input.name ?? current.name ?? "订阅").trim() || "订阅",
    token: current.token || input.token || `sub_${nanoid(32)}`,
    enabled: input.enabled ?? current.enabled ?? true,
    format: String(input.format ?? current.format ?? "base64").trim() || "base64",
    profile: {
      protocols: arrayFromValue(profile.protocols),
      tags: arrayFromValue(profile.tags),
      sources: arrayFromValue(profile.sources),
      groupIds: arrayFromValue(profile.groupIds)
    },
    createdAt: current.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    accessCount: Number(current.accessCount || 0),
    lastAccessAt: current.lastAccessAt || null
  };
}

export function normalizeSubscriptionSource(input = {}, current = {}) {
  return {
    ...current,
    id: current.id || input.id || nanoid(10),
    name: String(input.name ?? current.name ?? "订阅源").trim() || "订阅源",
    url: String(input.url ?? current.url ?? "").trim(),
    text: String(input.text ?? current.text ?? ""),
    tags: arrayFromValue(input.tags ?? current.tags),
    intervalHours: Math.max(0, Number(input.intervalHours ?? current.intervalHours ?? 24) || 0),
    enabled: input.enabled ?? current.enabled ?? true,
    createdAt: current.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSyncAt: current.lastSyncAt || null,
    lastImportCount: Number(current.lastImportCount || 0),
    lastError: current.lastError || ""
  };
}

export function normalizeSubscriptionGroup(input = {}, current = {}) {
  return {
    ...current,
    id: current.id || input.id || nanoid(10),
    name: String(input.name ?? current.name ?? "默认分组").trim() || "默认分组",
    protocols: arrayFromValue(input.protocols ?? current.protocols),
    tags: arrayFromValue(input.tags ?? current.tags),
    sources: arrayFromValue(input.sources ?? current.sources),
    keyword: String(input.keyword ?? current.keyword ?? "").trim(),
    sort: String(input.sort ?? current.sort ?? "name").trim() || "name",
    enabled: input.enabled ?? current.enabled ?? true,
    createdAt: current.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function matchesEveryFilter(node, filters = {}) {
  const protocols = arrayFromValue(filters.protocols);
  const tags = arrayFromValue(filters.tags);
  const sources = arrayFromValue(filters.sources);
  const groupIds = arrayFromValue(filters.groupIds);
  const keyword = String(filters.keyword || "").trim().toLowerCase();
  if (protocols.length && !protocols.includes(node.protocol)) return false;
  if (tags.length && !tags.some((tag) => (node.tags || []).includes(tag))) return false;
  if (sources.length && !sources.includes(node.sourceName || node.source || "")) return false;
  if (groupIds.length && !groupIds.some((id) => (node.groupIds || []).includes(id))) return false;
  if (keyword && ![node.name, node.protocol, node.server, node.sourceName, ...(node.tags || [])].join(" ").toLowerCase().includes(keyword)) return false;
  return true;
}

export function selectSubscriptionNodes(nodes = [], token = {}, groups = []) {
  let selected = nodes.filter((node) => node.enabled !== false && node.raw);
  const tokenProfile = token.profile || {};
  const tokenGroupIds = arrayFromValue(tokenProfile.groupIds);
  const directTokenFilters = { ...tokenProfile, groupIds: [] };
  if (Object.values(directTokenFilters).some((value) => arrayFromValue(value).length)) {
    selected = selected.filter((node) => matchesEveryFilter(node, directTokenFilters));
  }
  const activeGroups = groups.filter((group) => group.enabled !== false && (!tokenGroupIds.length || tokenGroupIds.includes(group.id)));
  if (activeGroups.length) {
    selected = selected.filter((node) => activeGroups.some((group) => matchesEveryFilter(node, group)));
  }
  return selected.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function buildPanelNode(agent, input = {}) {
  const protocol = String(input.protocol || "").trim();
  const host = normalizeHost(firstNonEmpty(input.publicHost, agent?.ip, agent?.host));
  const port = Number(input.port || input.listen_port || 0) || null;
  const name = firstNonEmpty(input.nodeName, input.tag, `${agent?.name || "server"}-${protocol}`);
  if (!protocol || !host || !port || protocol === "mixed") return null;

  const common = {
    id: firstNonEmpty(input.nodeId, `panel-${agent?.id || "agent"}-${protocol}-${port}`),
    name,
    source: "panel",
    sourceName: agent?.name || "panel",
    protocol: protocol.replace("-ws", "").replace("-reality", ""),
    server: host,
    port,
    agentId: agent?.id || "",
    enabled: true,
    tags: [agent?.name, protocol].filter(Boolean),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (protocol === "vmess-ws") {
    const payload = {
      v: "2",
      ps: name,
      add: host,
      port: String(port),
      id: String(input.uuid || input.userId || ""),
      aid: "0",
      scy: "auto",
      net: "ws",
      type: "none",
      host: String(input.host || input.serverName || ""),
      path: String(input.path || "/ws"),
      tls: input.tls ? "tls" : ""
    };
    return { ...common, protocol: "vmess", meta: { uuid: payload.id, alterId: 0, cipher: "auto", network: "ws", path: payload.path, sni: payload.host }, raw: `vmess://${base64Encode(JSON.stringify(payload))}` };
  }

  if (protocol === "vless-reality") {
    const params = new URLSearchParams({
      encryption: "none",
      security: "reality",
      type: "tcp",
      flow: String(input.flow || "xtls-rprx-vision"),
      sni: String(input.serverName || "www.cloudflare.com"),
      fp: String(input.fingerprint || "chrome")
    });
    if (input.publicKey) params.set("pbk", String(input.publicKey));
    if (input.shortId) params.set("sid", String(input.shortId));
    return { ...common, protocol: "vless", meta: { username: String(input.uuid || input.userId || ""), ...Object.fromEntries(params.entries()) }, raw: `vless://${input.uuid || input.userId || ""}@${host}:${port}?${params.toString()}#${encodeURIComponent(name)}` };
  }

  if (protocol === "trojan") {
    const params = new URLSearchParams({ sni: String(input.serverName || host) });
    return { ...common, protocol: "trojan", meta: { password: String(input.password || ""), ...Object.fromEntries(params.entries()) }, raw: `trojan://${encodeURIComponent(String(input.password || ""))}@${host}:${port}?${params.toString()}#${encodeURIComponent(name)}` };
  }

  if (protocol === "hysteria2") {
    const params = new URLSearchParams({ sni: String(input.serverName || host) });
    return { ...common, protocol: "hysteria2", meta: { password: String(input.password || ""), ...Object.fromEntries(params.entries()) }, raw: `hysteria2://${encodeURIComponent(String(input.password || ""))}@${host}:${port}?${params.toString()}#${encodeURIComponent(name)}` };
  }

  if (protocol === "shadowsocks") {
    const method = String(input.method || "aes-256-gcm");
    const password = String(input.password || "");
    return { ...common, protocol: "ss", meta: { method, password }, raw: `ss://${base64Encode(`${method}:${password}`)}@${host}:${port}#${encodeURIComponent(name)}` };
  }

  return null;
}

function yamlString(value) {
  const text = String(value ?? "");
  return JSON.stringify(text);
}

function proxyFromNode(node) {
  if (!node.raw) return null;
  const name = node.name || `${node.protocol}-${node.server || node.id}`;
  const protocol = String(node.protocol || "").toLowerCase();
  if (protocol === "ss") return `  - name: ${yamlString(name)}\n    type: ss\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}\n    cipher: ${yamlString(node.meta?.method || "auto")}\n    password: ${yamlString(node.meta?.password || "")}`;
  if (protocol === "vmess") {
    const ws = node.meta?.network === "ws" ? `\n    network: ws\n    ws-opts:\n      path: ${yamlString(node.meta?.path || "/")}${node.meta?.sni ? `\n      headers:\n        Host: ${yamlString(node.meta.sni)}` : ""}` : "";
    return `  - name: ${yamlString(name)}\n    type: vmess\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}\n    uuid: ${yamlString(node.meta?.uuid || "")}\n    alterId: ${Number(node.meta?.alterId || 0)}\n    cipher: ${yamlString(node.meta?.cipher || "auto")}${ws}`;
  }
  if (protocol === "trojan") return `  - name: ${yamlString(name)}\n    type: trojan\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}\n    password: ${yamlString(node.meta?.password || node.meta?.username || "")}\n    sni: ${yamlString(node.meta?.sni || node.server || "")}`;
  if (protocol === "vless") return `  - name: ${yamlString(name)}\n    type: vless\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}\n    uuid: ${yamlString(node.meta?.username || "")}\n    flow: ${yamlString(node.meta?.flow || "")}\n    servername: ${yamlString(node.meta?.sni || node.server || "")}\n    client-fingerprint: ${yamlString(node.meta?.fp || "chrome")}\n    reality-opts:\n      public-key: ${yamlString(node.meta?.pbk || "")}\n      short-id: ${yamlString(node.meta?.sid || "")}`;
  if (protocol === "hysteria2") return `  - name: ${yamlString(name)}\n    type: hysteria2\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}\n    password: ${yamlString(node.meta?.password || node.meta?.username || "")}\n    sni: ${yamlString(node.meta?.sni || node.server || "")}`;
  return `  - name: ${yamlString(name)}\n    type: ${yamlString(protocol || "unknown")}\n    server: ${yamlString(node.server)}\n    port: ${Number(node.port || 0)}`;
}

export function renderSubscription(nodes = [], format = "base64") {
  const enabled = nodes.filter((node) => node.enabled !== false && node.raw);
  const raw = enabled.map((node) => node.raw).join("\n");
  const normalized = String(format || "base64").toLowerCase();

  if (normalized === "raw" || normalized === "plain") return { contentType: "text/plain; charset=utf-8", body: `${raw}\n` };
  if (normalized === "sing-box" || normalized === "singbox") {
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(
        {
          log: { level: "info" },
          outbounds: enabled.map((node) => ({ type: "selector", tag: node.name, raw: node.raw })),
          route: { final: enabled[0]?.name || "direct" }
        },
        null,
        2
      )
    };
  }
  if (normalized === "clash" || normalized === "yaml") {
    const names = enabled.map((node) => yamlString(node.name || node.id));
    const proxies = enabled.map(proxyFromNode).filter(Boolean).join("\n");
    return {
      contentType: "text/yaml; charset=utf-8",
      body: `mixed-port: 7890\nallow-lan: false\nmode: rule\nproxies:\n${proxies || "[]"}\nproxy-groups:\n  - name: Auto\n    type: select\n    proxies:\n${names.map((name) => `      - ${name}`).join("\n") || "      - DIRECT"}\nrules:\n  - MATCH,Auto\n`
    };
  }
  return { contentType: "text/plain; charset=utf-8", body: base64Encode(raw) };
}

export function isShareProtocol(raw) {
  return sharePattern.test(String(raw || "")) && shareProtocols.some((protocol) => String(raw || "").toLowerCase().startsWith(`${protocol}://`));
}
