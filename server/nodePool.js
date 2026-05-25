import { nanoid } from "nanoid";
import yaml from "js-yaml";

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function now() {
  return new Date().toISOString();
}

function stableKey(node) {
  return [node.protocol, node.address, node.port, node.uuid, node.password, node.auth].map((item) => cleanText(item)).join("|");
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
  return cleanText(value)
    .split(/[,\n]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function makeNode(partial = {}) {
  const timestamp = now();
  return {
    id: cleanText(partial.id) || nanoid(10),
    name: cleanText(partial.name) || cleanText(partial.address) || "node",
    protocol: cleanText(partial.protocol) || "unknown",
    address: cleanText(partial.address),
    port: cleanPort(partial.port),
    uuid: cleanText(partial.uuid),
    password: cleanText(partial.password),
    auth: cleanText(partial.auth),
    tls: Boolean(partial.tls),
    reality: partial.reality || null,
    ws: partial.ws || null,
    grpc: partial.grpc || null,
    hysteria2: partial.hysteria2 || null,
    ss: partial.ss || null,
    mixed: partial.mixed || null,
    source: cleanText(partial.source) || "manual",
    sourceId: cleanText(partial.sourceId),
    tags: normalizeList(partial.tags),
    group: cleanText(partial.group),
    region: cleanText(partial.region),
    enabled: partial.enabled !== false,
    health: partial.health || "unknown",
    score: Number(partial.score ?? 50),
    lastCheckAt: partial.lastCheckAt || null,
    lastError: cleanText(partial.lastError),
    raw: partial.raw || null,
    metadata: partial.metadata || {},
    createdAt: partial.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function parseHostPort(value) {
  const text = cleanText(value);
  const index = text.lastIndexOf(":");
  if (index < 0) return { host: text, port: 0 };
  return { host: text.slice(0, index), port: cleanPort(text.slice(index + 1)) };
}

function safeBase64Decode(value) {
  const raw = cleanText(value).replace(/\s+/g, "");
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = normalized + (padding ? "=".repeat(4 - padding) : "");
  return Buffer.from(padded, "base64").toString("utf8");
}

function parseVmess(uri) {
  const payload = JSON.parse(safeBase64Decode(uri.slice("vmess://".length).split("#")[0]));
  return makeNode({
    name: payload.ps || payload.name || `vmess-${payload.add}`,
    protocol: "vmess",
    address: payload.add,
    port: payload.port,
    uuid: payload.id,
    tls: cleanText(payload.tls).toLowerCase() === "tls",
    ws: payload.net === "ws" ? { path: cleanText(payload.path) || "/", host: cleanText(payload.host) } : null,
    source: "import",
    raw: uri,
    metadata: payload
  });
}

function parseVless(uri) {
  const parsed = new URL(uri);
  return makeNode({
    name: decodeURIComponent(parsed.hash.slice(1) || `vless-${parsed.hostname}`),
    protocol: "vless",
    address: parsed.hostname,
    port: parsed.port,
    uuid: decodeURIComponent(parsed.username || ""),
    tls: cleanText(parsed.searchParams.get("security")).toLowerCase() === "reality" || cleanText(parsed.searchParams.get("security")).toLowerCase() === "tls",
    reality: cleanText(parsed.searchParams.get("security")).toLowerCase() === "reality"
      ? {
          publicKey: cleanText(parsed.searchParams.get("pbk")),
          shortId: cleanText(parsed.searchParams.get("sid")),
          serverName: cleanText(parsed.searchParams.get("sni"))
        }
      : null,
    ws: cleanText(parsed.searchParams.get("type")) === "ws" ? { path: cleanText(parsed.searchParams.get("path")), host: cleanText(parsed.searchParams.get("host")) } : null,
    source: "import",
    raw: uri,
    metadata: Object.fromEntries(parsed.searchParams.entries())
  });
}

function parseTrojan(uri) {
  const parsed = new URL(uri);
  return makeNode({
    name: decodeURIComponent(parsed.hash.slice(1) || `trojan-${parsed.hostname}`),
    protocol: "trojan",
    address: parsed.hostname,
    port: parsed.port,
    password: decodeURIComponent(parsed.username || ""),
    tls: true,
    source: "import",
    raw: uri,
    metadata: Object.fromEntries(parsed.searchParams.entries())
  });
}

function parseHysteria2(uri) {
  const normalized = uri.replace("hy2://", "hysteria2://");
  const parsed = new URL(normalized);
  return makeNode({
    name: decodeURIComponent(parsed.hash.slice(1) || `hy2-${parsed.hostname}`),
    protocol: "hysteria2",
    address: parsed.hostname,
    port: parsed.port,
    password: decodeURIComponent(parsed.username || parsed.password || parsed.searchParams.get("password") || ""),
    tls: true,
    hysteria2: Object.fromEntries(parsed.searchParams.entries()),
    source: "import",
    raw: uri,
    metadata: Object.fromEntries(parsed.searchParams.entries())
  });
}

function parseShadowsocks(uri) {
  const raw = uri.slice("ss://".length);
  const [base] = raw.split("#");
  let auth = "";
  let hostPort = "";
  if (base.includes("@")) {
    const index = base.lastIndexOf("@");
    auth = base.slice(0, index);
    hostPort = base.slice(index + 1);
    if (!auth.includes(":")) auth = safeBase64Decode(auth);
  } else {
    const decoded = safeBase64Decode(base);
    const index = decoded.lastIndexOf("@");
    auth = decoded.slice(0, index);
    hostPort = decoded.slice(index + 1);
  }
  const [method, password] = auth.split(":");
  const { host, port } = parseHostPort(hostPort);
  return makeNode({
    name: decodeURIComponent(uri.split("#")[1] || `ss-${host}`),
    protocol: "ss",
    address: host,
    port,
    password,
    ss: { method },
    source: "import",
    raw: uri
  });
}

function parseHttpLike(uri, protocol) {
  const parsed = new URL(uri);
  return makeNode({
    name: decodeURIComponent(parsed.hash.slice(1) || `${protocol}-${parsed.hostname}`),
    protocol,
    address: parsed.hostname,
    port: parsed.port || (protocol === "http" ? 80 : 1080),
    auth: parsed.username ? `${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password || "")}` : "",
    source: "import",
    raw: uri
  });
}

function parseUriLine(line) {
  const value = cleanText(line);
  if (!value) return null;
  if (value.startsWith("vmess://")) return parseVmess(value);
  if (value.startsWith("vless://")) return parseVless(value);
  if (value.startsWith("trojan://")) return parseTrojan(value);
  if (value.startsWith("hysteria2://") || value.startsWith("hy2://")) return parseHysteria2(value);
  if (value.startsWith("ss://")) return parseShadowsocks(value);
  if (value.startsWith("http://")) return parseHttpLike(value, "http");
  if (value.startsWith("socks://") || value.startsWith("socks5://")) return parseHttpLike(value, "socks");
  return null;
}

function parseYamlNodes(content) {
  const doc = yaml.load(content);
  const proxies = Array.isArray(doc?.proxies) ? doc.proxies : [];
  return proxies
    .map((proxy) =>
      makeNode({
        name: proxy.name,
        protocol: proxy.type,
        address: proxy.server,
        port: proxy.port,
        uuid: proxy.uuid,
        password: proxy.password,
        auth: proxy.username ? `${proxy.username}:${proxy.password || ""}` : "",
        tls: Boolean(proxy.tls),
        reality: proxy["reality-opts"] || null,
        ws: proxy["ws-opts"] || null,
        grpc: proxy["grpc-opts"] || null,
        hysteria2: proxy.type === "hysteria2" ? proxy : null,
        ss: proxy.type === "ss" ? { method: proxy.cipher } : null,
        source: "yaml",
        raw: proxy,
        metadata: proxy
      })
    )
    .filter((item) => item.address && item.port);
}

function parseSingboxOutbounds(content) {
  const json = JSON.parse(content);
  const outbounds = Array.isArray(json?.outbounds) ? json.outbounds : [];
  return outbounds
    .map((outbound) =>
      makeNode({
        name: outbound.tag || outbound.server || outbound.type,
        protocol: outbound.type,
        address: outbound.server || outbound.address,
        port: outbound.server_port || outbound.port,
        uuid: outbound.uuid,
        password: outbound.password,
        auth: outbound.username ? `${outbound.username}:${outbound.password || ""}` : "",
        tls: Boolean(outbound.tls?.enabled || outbound.tls),
        reality: outbound.tls?.reality || null,
        ws: outbound.transport?.type === "ws" ? outbound.transport : null,
        grpc: outbound.transport?.type === "grpc" ? outbound.transport : null,
        source: "sing-box",
        raw: outbound,
        metadata: outbound
      })
    )
    .filter((item) => item.address && item.port);
}

function decodeMaybeBase64(content) {
  const text = cleanText(content);
  if (!text) return "";
  if (text.includes("://") || /proxies\s*:/i.test(text) || text.includes("{")) return text;
  try {
    const decoded = safeBase64Decode(text);
    if (decoded.includes("://") || /proxies\s*:/i.test(decoded) || decoded.includes("{")) return decoded;
  } catch {}
  return text;
}

export function importNodesFromContent(content, options = {}) {
  const normalized = decodeMaybeBase64(content);
  const nodes = [];
  const warnings = [];

  if (/proxies\s*:/i.test(normalized)) {
    try {
      return { nodes: parseYamlNodes(normalized), warnings };
    } catch (error) {
      warnings.push(`YAML import failed: ${error.message}`);
    }
  }

  if (/\"outbounds\"\s*:/i.test(normalized)) {
    try {
      return { nodes: parseSingboxOutbounds(normalized), warnings };
    } catch (error) {
      warnings.push(`sing-box outbound import failed: ${error.message}`);
    }
  }

  for (const line of normalized.split(/\r?\n/)) {
    try {
      const parsed = parseUriLine(line);
      if (parsed) nodes.push(parsed);
    } catch (error) {
      warnings.push(`Skipped one node: ${error.message}`);
    }
  }

  if (options.source) {
    for (const node of nodes) {
      node.source = options.source;
      node.sourceId = cleanText(options.sourceId);
    }
  }
  return { nodes, warnings };
}

export function upsertNodePool(existingPool = {}, incomingNodes = [], options = {}) {
  const nowAt = now();
  const pool = { ...existingPool };
  const byKey = new Map(Object.values(pool).map((node) => [stableKey(node), node]));
  const changed = [];

  for (const item of incomingNodes) {
    const node = makeNode(item);
    const current = byKey.get(stableKey(node));
    if (current) {
      pool[current.id] = {
        ...current,
        ...node,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: nowAt
      };
      changed.push({ id: current.id, action: "updated" });
    } else {
      pool[node.id] = { ...node, updatedAt: nowAt, createdAt: node.createdAt || nowAt };
      byKey.set(stableKey(node), pool[node.id]);
      changed.push({ id: node.id, action: "created" });
    }
  }

  if (options.removeMissing && incomingNodes.length) {
    const keep = new Set(incomingNodes.map((node) => stableKey(makeNode(node))));
    for (const [id, node] of Object.entries(pool)) {
      if (cleanText(node.sourceId) !== cleanText(options.sourceId)) continue;
      if (!keep.has(stableKey(node))) {
        delete pool[id];
        changed.push({ id, action: "removed" });
      }
    }
  }

  return { pool, changed };
}

export function scoreNode(node, history = []) {
  const successCount = history.filter((item) => item.ok).length;
  const totalCount = history.length || 1;
  const successRate = successCount / totalCount;
  const averageLatency = history.length ? history.reduce((sum, item) => sum + Number(item.latencyMs || item.latency || 0), 0) / history.length : 999;
  const protocolSuccessCount = history.filter((item) => item.ok && !item.unsupported && !item.notImplemented && Number(item.statusCode || 0) > 0).length;
  const protocolRate = protocolSuccessCount / totalCount;
  const recentFailureCount = history.filter((item) => !item.ok).length;
  const weight = Number(node.metadata?.manualWeight || 0) || 0;
  let score = 100;
  score -= Math.max(0, 50 - successRate * 50);
  score -= Math.min(30, averageLatency / 50);
  score -= Math.min(15, recentFailureCount * 5);
  score += Math.round(protocolRate * 12);
  score += Math.max(-20, Math.min(20, weight));
  if (node.enabled === false) score = Math.min(score, 20);
  if (node.health === "offline") score = Math.min(score, 10);
  if (node.expiresAt && Date.parse(node.expiresAt) && Date.parse(node.expiresAt) < Date.now()) score = Math.min(score, 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function exportNodePool(nodes = [], format = "base64") {
  const list = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
  const enabled = list.filter((node) => node.enabled !== false);
  const uriLines = enabled.map((node) => {
    if (node.protocol === "ss") {
      const auth = Buffer.from(`${node.ss?.method || "aes-256-gcm"}:${node.password}`).toString("base64");
      return `ss://${auth}@${node.address}:${node.port}#${encodeURIComponent(node.name)}`;
    }
    if (node.protocol === "vmess") {
      const payload = { v: "2", ps: node.name, add: node.address, port: String(node.port), id: node.uuid, aid: "0", scy: "auto", net: node.ws ? "ws" : "tcp", path: node.ws?.path || "/", tls: node.tls ? "tls" : "" };
      return `vmess://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
    }
    if (node.protocol === "vless") {
      const url = new URL(`vless://${encodeURIComponent(node.uuid)}@${node.address}:${node.port}`);
      url.searchParams.set("encryption", "none");
      if (node.reality) {
        url.searchParams.set("security", "reality");
        url.searchParams.set("sni", cleanText(node.reality.serverName));
        url.searchParams.set("pbk", cleanText(node.reality.publicKey));
        url.searchParams.set("sid", cleanText(node.reality.shortId));
      }
      return `${url.toString()}#${encodeURIComponent(node.name)}`;
    }
    if (node.protocol === "trojan") return `trojan://${encodeURIComponent(node.password)}@${node.address}:${node.port}#${encodeURIComponent(node.name)}`;
    if (node.protocol === "hysteria2") return `hysteria2://${encodeURIComponent(node.password)}@${node.address}:${node.port}#${encodeURIComponent(node.name)}`;
    if (node.protocol === "http") return `http://${node.address}:${node.port}#${encodeURIComponent(node.name)}`;
    if (node.protocol === "socks") return `socks5://${node.address}:${node.port}#${encodeURIComponent(node.name)}`;
    return "";
  }).filter(Boolean);

  if (format === "base64" || format === "v2rayN") {
    const raw = uriLines.join("\n");
    return { contentType: "text/plain; charset=utf-8", body: Buffer.from(raw).toString("base64"), raw };
  }

  if (format === "raw") {
    return { contentType: "text/plain; charset=utf-8", body: uriLines.join("\n"), raw: uriLines.join("\n") };
  }

  if (format === "clash" || format === "mihomo") {
    const doc = {
      proxies: enabled.map((node) => ({
        name: node.name,
        type: node.protocol === "ss" ? "ss" : node.protocol === "vmess" ? "vmess" : node.protocol === "vless" ? "vless" : node.protocol,
        server: node.address,
        port: node.port,
        uuid: node.uuid || undefined,
        password: node.password || undefined,
        cipher: node.ss?.method || undefined,
        tls: node.tls || undefined,
        "ws-opts": node.ws || undefined,
        "reality-opts": node.reality
          ? {
              "public-key": node.reality.publicKey,
              "short-id": node.reality.shortId
            }
          : undefined
      }))
    };
    return { contentType: "application/yaml; charset=utf-8", body: yaml.dump(doc, { noRefs: true }), raw: yaml.dump(doc, { noRefs: true }) };
  }

  if (format === "sing-box") {
    const doc = {
      outbounds: enabled.map((node) => ({
        type: node.protocol === "ss" ? "shadowsocks" : node.protocol,
        tag: node.name,
        server: node.address,
        server_port: node.port,
        uuid: node.uuid || undefined,
        password: node.password || undefined,
        method: node.ss?.method || undefined
      }))
    };
    return { contentType: "application/json; charset=utf-8", body: JSON.stringify(doc, null, 2), raw: JSON.stringify(doc, null, 2) };
  }

  return { contentType: "text/plain; charset=utf-8", body: uriLines.join("\n"), raw: uriLines.join("\n") };
}
