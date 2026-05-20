import { nanoid } from "nanoid";

const shareProtocols = ["vmess", "vless", "trojan", "ss", "ssr", "hysteria2", "hy2", "hy", "tuic", "socks", "socks5", "http", "https", "anytls"];
const sharePattern = /^(vmess|vless|trojan|ss|ssr|hysteria2|hy2|hy|tuic|socks|socks5|http|https|anytls):\/\//i;

export const routeTemplates = {
  minimal: {
    id: "minimal",
    name: "Minimal",
    description: "Only a selector and MATCH rule.",
    rules: ["MATCH,Auto"],
    ruleProviders: {}
  },
  mainland: {
    id: "mainland",
    name: "Mainland Smart",
    description: "DIRECT for LAN/CN/private, reject ads, proxy the rest.",
    rules: ["RULE-SET,reject,REJECT", "RULE-SET,private,DIRECT", "RULE-SET,cn,DIRECT", "GEOIP,CN,DIRECT", "MATCH,Auto"],
    ruleProviders: {
      reject: { type: "http", behavior: "domain", url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/reject.txt", path: "./ruleset/reject.yaml", interval: 86400 },
      private: { type: "http", behavior: "domain", url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt", path: "./ruleset/private.yaml", interval: 86400 },
      cn: { type: "http", behavior: "domain", url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/cncidr.txt", path: "./ruleset/cn.yaml", interval: 86400 }
    }
  },
  streaming: {
    id: "streaming",
    name: "Streaming",
    description: "Add media and AI selectors for daily use.",
    rules: ["DOMAIN-SUFFIX,openai.com,Auto", "DOMAIN-SUFFIX,chatgpt.com,Auto", "DOMAIN-SUFFIX,netflix.com,Auto", "DOMAIN-SUFFIX,youtube.com,Auto", "RULE-SET,private,DIRECT", "GEOIP,CN,DIRECT", "MATCH,Auto"],
    ruleProviders: {
      private: { type: "http", behavior: "domain", url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt", path: "./ruleset/private.yaml", interval: 86400 }
    }
  }
};

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

function cleanYamlValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function parseSimpleClashProxies(text) {
  const lines = String(text || "").split(/\r?\n/);
  const blocks = [];
  let inProxies = false;
  let current = null;

  for (const line of lines) {
    if (/^\s*proxies\s*:\s*$/i.test(line)) {
      inProxies = true;
      continue;
    }
    if (!inProxies) continue;
    if (/^\s*(proxy-groups|rules|rule-providers|proxy-providers)\s*:/i.test(line)) break;

    const start = line.match(/^\s*-\s+name\s*:\s*(.+)\s*$/i);
    if (start) {
      if (current) blocks.push(current);
      current = { name: cleanYamlValue(start[1]) };
      continue;
    }
    if (!current) continue;
    const pair = line.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (pair) current[pair[1]] = cleanYamlValue(pair[2]);
  }
  if (current) blocks.push(current);
  return blocks;
}

function rawFromClashProxy(proxy) {
  const type = String(proxy.type || "").toLowerCase();
  const name = encodeURIComponent(proxy.name || type.toUpperCase());
  const server = proxy.server || "";
  const port = Number(proxy.port || 0) || 0;
  if (!type || !server || !port) return "";
  if (type === "ss") return `ss://${base64Encode(`${proxy.cipher || "auto"}:${proxy.password || ""}`)}@${server}:${port}#${name}`;
  if (type === "trojan") return `trojan://${encodeURIComponent(proxy.password || "")}@${server}:${port}?sni=${encodeURIComponent(proxy.sni || proxy.servername || server)}#${name}`;
  if (type === "vless") {
    const params = new URLSearchParams({
      encryption: proxy.encryption || "none",
      type: proxy.network || "tcp",
      security: proxy.tls === "true" || proxy.tls === true ? "tls" : proxy.security || "none"
    });
    if (proxy.servername || proxy.sni) params.set("sni", proxy.servername || proxy.sni);
    if (proxy.flow) params.set("flow", proxy.flow);
    return `vless://${proxy.uuid || ""}@${server}:${port}?${params.toString()}#${name}`;
  }
  if (type === "vmess") {
    const payload = {
      v: "2",
      ps: proxy.name || "VMess",
      add: server,
      port: String(port),
      id: proxy.uuid || "",
      aid: String(proxy.alterId || proxy.alterid || 0),
      scy: proxy.cipher || "auto",
      net: proxy.network || "tcp",
      type: "none",
      host: proxy.servername || proxy.sni || "",
      path: proxy["ws-path"] || proxy.path || "",
      tls: proxy.tls === "true" || proxy.tls === true ? "tls" : ""
    };
    return `vmess://${base64Encode(JSON.stringify(payload))}`;
  }
  if (type === "hysteria2" || type === "hy2" || type === "hy") return `hysteria2://${encodeURIComponent(proxy.password || proxy.auth || "")}@${server}:${port}?sni=${encodeURIComponent(proxy.sni || server)}#${name}`;
  if (type === "tuic") return `tuic://${proxy.uuid || ""}:${encodeURIComponent(proxy.password || "")}@${server}:${port}?sni=${encodeURIComponent(proxy.sni || server)}#${name}`;
  if (type === "socks5" || type === "socks" || type === "http" || type === "https") {
    const auth = proxy.username || proxy.password ? `${encodeURIComponent(proxy.username || "")}:${encodeURIComponent(proxy.password || "")}@` : "";
    return `${type}://${auth}${server}:${port}#${name}`;
  }
  return "";
}

function parseClashImport(text, sourceName = "import") {
  return parseSimpleClashProxies(text)
    .map((proxy) => rawFromClashProxy(proxy))
    .filter(Boolean)
    .map(parseNodeLine)
    .filter(Boolean)
    .map((node) => ({ ...node, sourceName: String(sourceName || "import").trim() || "import" }));
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
    protocol: ["hy", "hy2"].includes(scheme) ? "hysteria2" : parsed.protocol || scheme,
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
  return [...splitImportLines(text).map(parseNodeLine).filter(Boolean), ...parseClashImport(text, sourceName)]
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

function rulesFromValue(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
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
    sourceId: node.sourceId || "",
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
    profile: { protocols: [], tags: [], sources: [], groupIds: [], keyword: "", limit: 0, sort: "name" },
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
    profile: token.profile || { protocols: [], tags: [], sources: [], groupIds: [], keyword: "", limit: 0, sort: "name" },
    expiresAt: token.expiresAt || "",
    maxAccess: Number(token.maxAccess || 0),
    accessCount: Number(token.accessCount || 0),
    lastAccessAt: token.lastAccessAt || null,
    createdAt: token.createdAt,
    links: {
      base64: `${origin}/sub/${token.token}`,
      v2rayn: `${origin}/sub/${token.token}?format=v2rayn`,
      raw: `${origin}/sub/${token.token}?format=raw`,
      clash: `${origin}/sub/${token.token}?format=clash`,
      mihomo: `${origin}/sub/${token.token}?format=mihomo`,
      singbox: `${origin}/sub/${token.token}?format=sing-box`
    }
  };
}

export function normalizeSubscriptionToken(input = {}, current = {}) {
  const profile = input.profile || current.profile || {};
  return {
    ...current,
    id: current.id || input.id || nanoid(10),
    name: String(input.name ?? current.name ?? "Subscription").trim() || "Subscription",
    token: current.token || input.token || `sub_${nanoid(32)}`,
    enabled: input.enabled ?? current.enabled ?? true,
    format: String(input.format ?? current.format ?? "base64").trim() || "base64",
    profile: {
      protocols: arrayFromValue(profile.protocols),
      tags: arrayFromValue(profile.tags),
      sources: arrayFromValue(profile.sources),
      groupIds: arrayFromValue(profile.groupIds),
      keyword: String(profile.keyword ?? "").trim(),
      limit: Math.max(0, Number(profile.limit || 0) || 0),
      sort: String(profile.sort || "name").trim() || "name",
      routeTemplate: String(profile.routeTemplate || current.profile?.routeTemplate || "mainland").trim() || "mainland",
      customRules: rulesFromValue(profile.customRules),
      prependRules: rulesFromValue(profile.prependRules)
    },
    expiresAt: String(input.expiresAt ?? current.expiresAt ?? "").trim(),
    maxAccess: Math.max(0, Number(input.maxAccess ?? current.maxAccess ?? 0) || 0),
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
    name: String(input.name ?? current.name ?? "Subscription Source").trim() || "Subscription Source",
    url: String(input.url ?? current.url ?? "").trim(),
    text: String(input.text ?? current.text ?? ""),
    tags: arrayFromValue(input.tags ?? current.tags),
    intervalHours: Math.max(0, Number(input.intervalHours ?? current.intervalHours ?? 24) || 0),
    replaceExisting: input.replaceExisting ?? current.replaceExisting ?? true,
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
    name: String(input.name ?? current.name ?? "Default Group").trim() || "Default Group",
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
  const directTokenFilters = { ...tokenProfile, groupIds: [], limit: 0, sort: "" };
  if (Object.values(directTokenFilters).some((value) => arrayFromValue(value).length)) {
    selected = selected.filter((node) => matchesEveryFilter(node, directTokenFilters));
  }
  const activeGroups = groups.filter((group) => group.enabled !== false && (!tokenGroupIds.length || tokenGroupIds.includes(group.id)));
  if (activeGroups.length) {
    selected = selected.filter((node) => activeGroups.some((group) => matchesEveryFilter(node, group)));
  }
  const sort = String(tokenProfile.sort || "name");
  selected = selected.sort((a, b) => {
    if (sort === "protocol") return String(a.protocol).localeCompare(String(b.protocol)) || String(a.name).localeCompare(String(b.name));
    if (sort === "source") return String(a.sourceName || a.source).localeCompare(String(b.sourceName || b.source)) || String(a.name).localeCompare(String(b.name));
    if (sort === "updated") return Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "");
    return String(a.name).localeCompare(String(b.name));
  });
  const limit = Math.max(0, Number(tokenProfile.limit || 0) || 0);
  return limit ? selected.slice(0, limit) : selected;
}

function countBy(nodes, getter) {
  const result = {};
  for (const node of nodes) {
    const values = arrayFromValue(getter(node));
    for (const value of values.length ? values : ["-"]) result[value] = (result[value] || 0) + 1;
  }
  return result;
}

export function summarizeSubscriptionNodes(nodes = []) {
  const enabled = nodes.filter((node) => node.enabled !== false && node.raw);
  return {
    total: nodes.length,
    enabled: enabled.length,
    protocols: countBy(enabled, (node) => node.protocol || "-"),
    sources: countBy(enabled, (node) => node.sourceName || node.source || "-"),
    tags: countBy(enabled, (node) => node.tags || [])
  };
}

export function validateSubscriptionOutputs(nodes = [], token = {}) {
  const formats = ["v2rayn", "raw", "clash", "mihomo", "sing-box"];
  const results = {};
  for (const format of formats) {
    try {
      const rendered = renderSubscription(nodes, format, token.profile || {});
      const checks = [];
      if (format === "v2rayn") {
        const decoded = base64Decode(rendered.body).split(/\r?\n/).filter(Boolean);
        checks.push({ name: "base64-decodes", ok: decoded.length > 0 });
        checks.push({ name: "share-links", ok: decoded.every((line) => sharePattern.test(line)) });
      }
      if (format === "raw") {
        const rows = rendered.body.split(/\r?\n/).filter(Boolean);
        checks.push({ name: "raw-links", ok: rows.length > 0 && rows.every((line) => sharePattern.test(line)) });
      }
      if (format === "clash" || format === "mihomo") {
        checks.push({ name: "has-proxies", ok: /proxies:\n\s+- name:/m.test(rendered.body) });
        checks.push({ name: "has-groups", ok: /proxy-groups:/m.test(rendered.body) });
        checks.push({ name: "has-rules", ok: /rules:\n\s+- /m.test(rendered.body) });
      }
      if (format === "sing-box") {
        const parsed = JSON.parse(rendered.body);
        checks.push({ name: "json", ok: Boolean(parsed?.outbounds) });
      }
      results[format] = {
        ok: checks.every((check) => check.ok),
        contentType: rendered.contentType,
        bytes: Buffer.byteLength(rendered.body),
        checks
      };
    } catch (error) {
      results[format] = { ok: false, error: error.message, checks: [] };
    }
  }
  return {
    ok: Object.values(results).every((row) => row.ok),
    formats: results,
    summary: summarizeSubscriptionNodes(nodes)
  };
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

function yamlBlock(value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) return value.map((item) => `${pad}- ${typeof item === "object" ? `\n${yamlBlock(item, indent + 2)}` : yamlString(item)}`).join("\n");
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        if (Array.isArray(item)) return `${pad}${key}:\n${yamlBlock(item, indent + 2)}`;
        if (item && typeof item === "object") return `${pad}${key}:\n${yamlBlock(item, indent + 2)}`;
        return `${pad}${key}: ${typeof item === "number" || typeof item === "boolean" ? item : yamlString(item)}`;
      })
      .join("\n");
  }
  return `${pad}${yamlString(value)}`;
}

function normalizeRouteTemplate(options = {}) {
  const id = String(options.routeTemplate || options.template || "mainland").trim() || "mainland";
  const base = routeTemplates[id] || routeTemplates.mainland;
  return {
    ...base,
    ruleProviders: { ...(base.ruleProviders || {}) },
    rules: [...rulesFromValue(options.prependRules), ...(base.rules || []), ...rulesFromValue(options.customRules)]
  };
}

function renderClashSubscription(enabled, options = {}) {
  const names = enabled.map((node) => yamlString(node.name || node.id));
  const proxies = enabled.map(proxyFromNode).filter(Boolean).join("\n");
  const template = normalizeRouteTemplate(options);
  const providers = Object.keys(template.ruleProviders || {}).length ? `rule-providers:\n${yamlBlock(template.ruleProviders, 2)}\n` : "";
  return {
    contentType: "text/yaml; charset=utf-8",
    body: `mixed-port: 7890\nallow-lan: false\nmode: rule\nlog-level: info\nexternal-controller: 127.0.0.1:9090\nprofile:\n  store-selected: true\n  store-fake-ip: true\ndns:\n  enable: true\n  listen: 0.0.0.0:1053\n  enhanced-mode: fake-ip\n  nameserver:\n    - 223.5.5.5\n    - 119.29.29.29\n  fallback:\n    - https://1.1.1.1/dns-query\n    - https://8.8.8.8/dns-query\nproxies:\n${proxies || "[]"}\nproxy-groups:\n  - name: Auto\n    type: url-test\n    url: http://www.gstatic.com/generate_204\n    interval: 300\n    tolerance: 50\n    proxies:\n${names.map((name) => `      - ${name}`).join("\n") || "      - DIRECT"}\n  - name: Manual\n    type: select\n    proxies:\n${names.map((name) => `      - ${name}`).join("\n") || "      - DIRECT"}\n${providers}rules:\n${template.rules.map((rule) => `  - ${rule}`).join("\n")}\n`
  };
}

export function renderSubscription(nodes = [], format = "base64", options = {}) {
  const enabled = nodes.filter((node) => node.enabled !== false && node.raw);
  const raw = enabled.map((node) => node.raw).join("\n");
  const normalized = String(format || "base64").toLowerCase();

  if (normalized === "raw" || normalized === "plain") return { contentType: "text/plain; charset=utf-8", body: `${raw}\n` };
  if (["v2rayn", "v2ray", "base64"].includes(normalized)) return { contentType: "text/plain; charset=utf-8", body: base64Encode(raw) };
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
  if (["clash", "mihomo", "yaml", "yml"].includes(normalized)) return renderClashSubscription(enabled, options);
  return { contentType: "text/plain; charset=utf-8", body: base64Encode(raw) };
}

export function isShareProtocol(raw) {
  return sharePattern.test(String(raw || "")) && shareProtocols.some((protocol) => String(raw || "").toLowerCase().startsWith(`${protocol}://`));
}
