import { nanoid } from "nanoid";

export const defaultSubscriptionTemplateId = "clash-basic";

export const subscriptionTemplateCatalog = [
  {
    id: "clash-basic",
    name: "Clash Rule Basic",
    description: "Rule mode with auto test and manual selector."
  },
  {
    id: "clash-global",
    name: "Clash Global",
    description: "Global mode with a simple select group."
  },
  {
    id: "clash-fallback",
    name: "Clash Fallback",
    description: "Rule mode with fallback group for unstable nodes."
  }
];

const templateIds = new Set(subscriptionTemplateCatalog.map((item) => item.id));
const protocolLabels = {
  "vmess-ws": "VMess WS",
  "vless-reality": "VLESS Reality",
  trojan: "Trojan",
  hysteria2: "Hysteria2",
  shadowsocks: "Shadowsocks",
  mixed: "Mixed"
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item)).filter(Boolean);
}

function cleanPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function dedupe(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isScalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function yamlScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  const text = String(value ?? "");
  if (text === "") return '""';
  if (/^[A-Za-z0-9._/:,+@%*=-]+$/.test(text) && !/^(true|false|null|yes|no|on|off|-?\d+(\.\d+)?)$/i.test(text)) return text;
  return JSON.stringify(text);
}

function appendYamlEntry(lines, key, value, indent = 0) {
  if (value === undefined || value === null) return;
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      lines.push(`${pad}${key}: []`);
      return;
    }
    lines.push(`${pad}${key}:`);
    for (const item of value) appendYamlArrayItem(lines, item, indent + 2);
    return;
  }
  if (value && typeof value === "object") {
    lines.push(`${pad}${key}:`);
    appendYamlObject(lines, value, indent + 2);
    return;
  }
  lines.push(`${pad}${key}: ${yamlScalar(value)}`);
}

function appendYamlArrayItem(lines, value, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) {
      lines.push(`${pad}- []`);
      return;
    }
    lines.push(`${pad}-`);
    for (const item of value) appendYamlArrayItem(lines, item, indent + 2);
    return;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined && item !== null);
    if (!entries.length) {
      lines.push(`${pad}- {}`);
      return;
    }
    const [firstKey, firstValue] = entries[0];
    if (Array.isArray(firstValue)) {
      if (!firstValue.length) {
        lines.push(`${pad}- ${firstKey}: []`);
      } else {
        lines.push(`${pad}- ${firstKey}:`);
        for (const item of firstValue) appendYamlArrayItem(lines, item, indent + 4);
      }
    } else if (firstValue && typeof firstValue === "object") {
      lines.push(`${pad}- ${firstKey}:`);
      appendYamlObject(lines, firstValue, indent + 4);
    } else {
      lines.push(`${pad}- ${firstKey}: ${yamlScalar(firstValue)}`);
    }
    for (const [key, item] of entries.slice(1)) appendYamlEntry(lines, key, item, indent + 2);
    return;
  }
  lines.push(`${pad}- ${yamlScalar(value)}`);
}

function appendYamlObject(lines, value, indent = 0) {
  for (const [key, item] of Object.entries(value)) appendYamlEntry(lines, key, item, indent);
}

function safeBase64Decode(value) {
  const raw = cleanText(value).replace(/\s+/g, "");
  if (!raw) return "";
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded = normalized + (padding ? "=".repeat(4 - padding) : "");
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeFragment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildNodeDisplayName(profile) {
  return cleanText(profile.name) || `${profile.agentName || profile.agentId || "Node"} ${protocolLabels[profile.protocol] || profile.protocol || ""}`.trim();
}

function ensureUniqueName(name, usedNames) {
  const base = cleanText(name) || "Proxy";
  if (!usedNames.has(base)) {
    usedNames.add(base);
    return base;
  }
  let index = 2;
  while (usedNames.has(`${base} (${index})`)) index += 1;
  const unique = `${base} (${index})`;
  usedNames.add(unique);
  return unique;
}

function buildWsOptions(path, host) {
  const wsPath = cleanText(path) || "/";
  const wsHost = cleanText(host);
  return wsHost ? { path: wsPath, headers: { Host: wsHost } } : { path: wsPath };
}

function formatBandwidth(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "100 Mbps";
  return `${number} Mbps`;
}

function normalizeImportedName(value, fallback) {
  return cleanText(value) || fallback;
}

function validateNodeProfile(profile) {
  if (!profile) return { ok: false, reason: "node profile not found" };
  if (!cleanText(profile.server)) return { ok: false, reason: "export host is required" };
  if (!cleanPort(profile.port)) return { ok: false, reason: "export port is invalid" };

  if (profile.protocol === "vmess-ws" && !cleanText(profile.uuid)) {
    return { ok: false, reason: "vmess uuid is required" };
  }
  if (profile.protocol === "vless-reality") {
    if (!cleanText(profile.uuid)) return { ok: false, reason: "vless uuid is required" };
    if (!cleanText(profile.publicKey)) return { ok: false, reason: "reality public key is required for subscription export" };
    if (!cleanText(profile.shortId)) return { ok: false, reason: "reality short id is required for subscription export" };
    if (!cleanText(profile.serverName)) return { ok: false, reason: "reality server name is required for subscription export" };
  }
  if (profile.protocol === "trojan" && !cleanText(profile.password)) {
    return { ok: false, reason: "trojan password is required" };
  }
  if (profile.protocol === "hysteria2" && !cleanText(profile.password)) {
    return { ok: false, reason: "hysteria2 password is required" };
  }
  if (profile.protocol === "shadowsocks") {
    if (!cleanText(profile.method)) return { ok: false, reason: "shadowsocks method is required" };
    if (!cleanText(profile.password)) return { ok: false, reason: "shadowsocks password is required" };
  }
  return { ok: true, reason: "" };
}

function clashProxyFromNodeProfile(profile, name) {
  const server = cleanText(profile.server);
  const port = cleanPort(profile.port);

  if (profile.protocol === "vmess-ws") {
    return {
      name,
      type: "vmess",
      server,
      port,
      udp: true,
      uuid: cleanText(profile.uuid),
      alterId: 0,
      cipher: "auto",
      network: "ws",
      "ws-opts": buildWsOptions(profile.path)
    };
  }

  if (profile.protocol === "vless-reality") {
    return {
      name,
      type: "vless",
      server,
      port,
      udp: true,
      uuid: cleanText(profile.uuid),
      flow: cleanText(profile.flow) || "xtls-rprx-vision",
      "packet-encoding": "xudp",
      tls: true,
      servername: cleanText(profile.serverName),
      "skip-cert-verify": false,
      "client-fingerprint": cleanText(profile.clientFingerprint) || "chrome",
      "reality-opts": {
        "public-key": cleanText(profile.publicKey),
        "short-id": cleanText(profile.shortId)
      },
      encryption: ""
    };
  }

  if (profile.protocol === "trojan") {
    return {
      name,
      type: "trojan",
      server,
      port,
      udp: true,
      password: cleanText(profile.password),
      sni: cleanText(profile.serverName) || server,
      "skip-cert-verify": true
    };
  }

  if (profile.protocol === "hysteria2") {
    return {
      name,
      type: "hysteria2",
      server,
      port,
      udp: true,
      password: cleanText(profile.password),
      up: formatBandwidth(profile.upMbps),
      down: formatBandwidth(profile.downMbps),
      sni: cleanText(profile.serverName) || server,
      "skip-cert-verify": true,
      alpn: ["h3"]
    };
  }

  if (profile.protocol === "shadowsocks") {
    return {
      name,
      type: "ss",
      server,
      port,
      udp: true,
      cipher: cleanText(profile.method) || "aes-256-gcm",
      password: cleanText(profile.password)
    };
  }

  if (profile.protocol === "mixed") {
    return {
      name,
      type: "http",
      server,
      port
    };
  }

  return null;
}

function uriFromNodeProfile(profile, name) {
  const server = cleanText(profile.server);
  const port = cleanPort(profile.port);
  const encodedName = encodeURIComponent(name);

  if (profile.protocol === "vmess-ws") {
    const payload = {
      v: "2",
      ps: name,
      add: server,
      port: String(port),
      id: cleanText(profile.uuid),
      aid: "0",
      scy: "auto",
      net: "ws",
      type: "none",
      host: "",
      path: cleanText(profile.path) || "/",
      tls: ""
    };
    return `vmess://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  }

  if (profile.protocol === "vless-reality") {
    const url = new URL(`vless://${encodeURIComponent(cleanText(profile.uuid))}@${server}:${port}`);
    url.searchParams.set("encryption", "none");
    url.searchParams.set("security", "reality");
    url.searchParams.set("sni", cleanText(profile.serverName));
    url.searchParams.set("fp", cleanText(profile.clientFingerprint) || "chrome");
    url.searchParams.set("pbk", cleanText(profile.publicKey));
    url.searchParams.set("sid", cleanText(profile.shortId));
    url.searchParams.set("type", "tcp");
    if (cleanText(profile.flow)) url.searchParams.set("flow", cleanText(profile.flow));
    return `${url.toString()}#${encodedName}`;
  }

  if (profile.protocol === "trojan") {
    const url = new URL(`trojan://${encodeURIComponent(cleanText(profile.password))}@${server}:${port}`);
    url.searchParams.set("sni", cleanText(profile.serverName) || server);
    url.searchParams.set("allowInsecure", "1");
    return `${url.toString()}#${encodedName}`;
  }

  if (profile.protocol === "hysteria2") {
    const url = new URL(`hysteria2://${encodeURIComponent(cleanText(profile.password))}@${server}:${port}`);
    url.searchParams.set("sni", cleanText(profile.serverName) || server);
    url.searchParams.set("insecure", "1");
    url.searchParams.set("upmbps", String(Number(profile.upMbps || 100) || 100));
    url.searchParams.set("downmbps", String(Number(profile.downMbps || 100) || 100));
    return `${url.toString()}#${encodedName}`;
  }

  if (profile.protocol === "shadowsocks") {
    const auth = Buffer.from(`${cleanText(profile.method)}:${cleanText(profile.password)}`).toString("base64");
    return `ss://${auth}@${server}:${port}#${encodedName}`;
  }

  if (profile.protocol === "mixed") {
    return `http://${server}:${port}#${encodedName}`;
  }

  return "";
}

function parseHostPort(value) {
  const raw = cleanText(value);
  if (!raw) return { host: "", port: 0 };
  if (raw.startsWith("[")) {
    const index = raw.lastIndexOf("]:");
    if (index > -1) return { host: raw.slice(1, index), port: cleanPort(raw.slice(index + 2)) };
  }
  const index = raw.lastIndexOf(":");
  if (index < 0) return { host: raw, port: 0 };
  return { host: raw.slice(0, index), port: cleanPort(raw.slice(index + 1)) };
}

function parseVmessUri(uri) {
  const payload = cleanText(uri).slice("vmess://".length).split("#")[0];
  const decoded = safeBase64Decode(payload);
  const data = JSON.parse(decoded);
  const name = decodeFragment(cleanText(uri).split("#")[1] || data.ps || data.name || `VMess ${data.add}:${data.port}`);
  const proxy = {
    name,
    type: "vmess",
    server: cleanText(data.add || data.server || data.host),
    port: cleanPort(data.port),
    udp: true,
    uuid: cleanText(data.id),
    alterId: Number(data.aid || 0) || 0,
    cipher: cleanText(data.scy || data.cipher) || "auto"
  };
  const network = cleanText(data.net).toLowerCase() || "tcp";
  if (network === "ws") {
    proxy.network = "ws";
    proxy["ws-opts"] = buildWsOptions(data.path, data.host);
  }
  if (cleanText(data.tls).toLowerCase() && cleanText(data.tls).toLowerCase() !== "none") {
    proxy.tls = true;
    if (cleanText(data.sni || data.host)) proxy.servername = cleanText(data.sni || data.host);
    if (String(data.allowInsecure || "") === "1") proxy["skip-cert-verify"] = true;
  }
  return { name, uri, proxy };
}

function parseVlessUri(uri) {
  const parsed = new URL(uri);
  const params = parsed.searchParams;
  const name = decodeFragment(parsed.hash.slice(1) || `VLESS ${parsed.hostname}:${parsed.port}`);
  const proxy = {
    name,
    type: "vless",
    server: parsed.hostname,
    port: cleanPort(parsed.port),
    udp: true,
    uuid: decodeURIComponent(parsed.username || ""),
    encryption: ""
  };
  if (cleanText(params.get("flow"))) proxy.flow = cleanText(params.get("flow"));
  const security = cleanText(params.get("security")).toLowerCase();
  if (security && security !== "none") {
    proxy.tls = true;
    proxy.servername = cleanText(params.get("sni") || params.get("host")) || parsed.hostname;
    if (params.get("allowInsecure") === "1" || params.get("insecure") === "1") proxy["skip-cert-verify"] = true;
  }
  if (security === "reality") {
    proxy["client-fingerprint"] = cleanText(params.get("fp")) || "chrome";
    proxy["reality-opts"] = {
      "public-key": cleanText(params.get("pbk")),
      "short-id": cleanText(params.get("sid"))
    };
    proxy["packet-encoding"] = "xudp";
  }
  const network = cleanText(params.get("type")).toLowerCase();
  if (network === "ws") {
    proxy.network = "ws";
    proxy["ws-opts"] = buildWsOptions(params.get("path"), params.get("host"));
  }
  return { name, uri, proxy };
}

function parseTrojanUri(uri) {
  const parsed = new URL(uri);
  const params = parsed.searchParams;
  const name = decodeFragment(parsed.hash.slice(1) || `Trojan ${parsed.hostname}:${parsed.port}`);
  const proxy = {
    name,
    type: "trojan",
    server: parsed.hostname,
    port: cleanPort(parsed.port),
    udp: true,
    password: decodeURIComponent(parsed.username || "")
  };
  const sni = cleanText(params.get("sni") || params.get("peer"));
  if (sni) proxy.sni = sni;
  if (params.get("allowInsecure") === "1" || params.get("insecure") === "1") proxy["skip-cert-verify"] = true;
  if (cleanText(params.get("fp"))) proxy["client-fingerprint"] = cleanText(params.get("fp"));
  const network = cleanText(params.get("type")).toLowerCase();
  if (network === "ws") {
    proxy.network = "ws";
    proxy["ws-opts"] = buildWsOptions(params.get("path"), params.get("host"));
  }
  return { name, uri, proxy };
}

function parseHysteria2Uri(uri) {
  const parsed = new URL(uri);
  const params = parsed.searchParams;
  const name = decodeFragment(parsed.hash.slice(1) || `Hysteria2 ${parsed.hostname}:${parsed.port}`);
  const password = decodeURIComponent(parsed.username || parsed.password || params.get("password") || "");
  const proxy = {
    name,
    type: "hysteria2",
    server: parsed.hostname,
    port: cleanPort(parsed.port),
    udp: true,
    password
  };
  const sni = cleanText(params.get("sni"));
  if (sni) proxy.sni = sni;
  if (params.get("insecure") === "1" || params.get("allowInsecure") === "1") proxy["skip-cert-verify"] = true;
  if (cleanText(params.get("up"))) proxy.up = formatBandwidth(params.get("up"));
  if (cleanText(params.get("down"))) proxy.down = formatBandwidth(params.get("down"));
  if (cleanText(params.get("upmbps"))) proxy.up = formatBandwidth(params.get("upmbps"));
  if (cleanText(params.get("downmbps"))) proxy.down = formatBandwidth(params.get("downmbps"));
  if (cleanText(params.get("obfs"))) proxy.obfs = cleanText(params.get("obfs"));
  if (cleanText(params.get("obfs-password"))) proxy["obfs-password"] = cleanText(params.get("obfs-password"));
  const alpn = cleanArray(cleanText(params.get("alpn")).split(","));
  if (alpn.length) proxy.alpn = alpn;
  return { name, uri, proxy };
}

function parseShadowsocksUri(uri) {
  const raw = cleanText(uri).slice("ss://".length);
  const hashIndex = raw.indexOf("#");
  const fragment = hashIndex > -1 ? raw.slice(hashIndex + 1) : "";
  const base = hashIndex > -1 ? raw.slice(0, hashIndex) : raw;
  const queryIndex = base.indexOf("?");
  const content = queryIndex > -1 ? base.slice(0, queryIndex) : base;

  let auth = "";
  let hostPort = "";

  if (content.includes("@")) {
    const index = content.lastIndexOf("@");
    auth = content.slice(0, index);
    hostPort = content.slice(index + 1);
    if (!auth.includes(":")) auth = safeBase64Decode(auth);
  } else {
    const decoded = safeBase64Decode(content);
    const index = decoded.lastIndexOf("@");
    if (index < 0) throw new Error("invalid shadowsocks uri");
    auth = decoded.slice(0, index);
    hostPort = decoded.slice(index + 1);
  }

  const authIndex = auth.indexOf(":");
  if (authIndex < 0) throw new Error("invalid shadowsocks auth");
  const method = auth.slice(0, authIndex);
  const password = auth.slice(authIndex + 1);
  const { host, port } = parseHostPort(hostPort);
  const name = decodeFragment(fragment || `SS ${host}:${port}`);
  return {
    name,
    uri,
    proxy: {
      name,
      type: "ss",
      server: host,
      port,
      udp: true,
      cipher: method,
      password
    }
  };
}

function parseHttpLikeUri(uri) {
  const parsed = new URL(uri);
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  const name = decodeFragment(parsed.hash.slice(1) || `${scheme.toUpperCase()} ${parsed.hostname}:${parsed.port}`);
  const proxy = {
    name,
    type: scheme.startsWith("socks") ? "socks5" : "http",
    server: parsed.hostname,
    port: cleanPort(parsed.port || (scheme === "https" ? 443 : 80))
  };
  if (parsed.username) proxy.username = decodeURIComponent(parsed.username);
  if (parsed.password) proxy.password = decodeURIComponent(parsed.password);
  if (scheme === "https") proxy.tls = true;
  return { name, uri, proxy };
}

function parseProxyUri(uri) {
  const text = cleanText(uri);
  if (text.startsWith("vmess://")) return parseVmessUri(text);
  if (text.startsWith("vless://")) return parseVlessUri(text);
  if (text.startsWith("trojan://")) return parseTrojanUri(text);
  if (text.startsWith("hysteria2://") || text.startsWith("hy2://")) return parseHysteria2Uri(text.replace("hy2://", "hysteria2://"));
  if (text.startsWith("ss://")) return parseShadowsocksUri(text);
  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("socks5://") || text.startsWith("socks://")) return parseHttpLikeUri(text);
  throw new Error("unsupported proxy uri");
}

function decodeImportedContent(content) {
  const raw = String(content || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "";
  if (/proxies\s*:/m.test(raw) || raw.includes("://")) return raw;
  try {
    const decoded = safeBase64Decode(raw);
    if (/proxies\s*:/m.test(decoded) || decoded.includes("://")) return decoded;
  } catch {}
  return raw;
}

function extractClashProxies(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^\s*proxies\s*:\s*$/.test(line));
  if (start < 0) return null;

  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && /^\S.*:/.test(line) && !line.trimStart().startsWith("-")) break;
    block.push(line);
  }

  const nonEmpty = block.filter((line) => line.trim());
  if (!nonEmpty.length) return { block: "", names: [] };
  const baseIndent = Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0]?.length || 0));
  const normalized = block.map((line) => (line.trim() ? `  ${line.slice(baseIndent)}` : "")).join("\n").trimEnd();
  const names = [];
  for (const line of normalized.split("\n")) {
    const match = line.match(/^\s*-\s*name\s*:\s*(.+)\s*$/) || line.match(/^\s+name\s*:\s*(.+)\s*$/);
    if (!match) continue;
    const value = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (value) names.push(value);
  }
  return { block: normalized, names };
}

function renderClashTemplate(templateId, generatedProxies, rawBlocks, proxyNames) {
  const pool = dedupe(proxyNames);
  const hasNodes = pool.length > 0;

  const groupsByTemplate = {
    "clash-basic": {
      mode: "rule",
      groups: [
        ...(hasNodes
          ? [
              {
                name: "Auto",
                type: "url-test",
                url: "https://www.gstatic.com/generate_204",
                interval: 300,
                lazy: true,
                proxies: pool
              }
            ]
          : []),
        {
          name: "Proxy",
          type: "select",
          proxies: hasNodes ? ["Auto", ...pool, "DIRECT"] : ["DIRECT"]
        }
      ],
      rules: [
        "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
        "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
        "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
        "IP-CIDR,224.0.0.0/4,DIRECT,no-resolve",
        "IP-CIDR6,::1/128,DIRECT,no-resolve",
        "MATCH,Proxy"
      ]
    },
    "clash-global": {
      mode: "global",
      groups: [
        ...(hasNodes
          ? [
              {
                name: "Auto",
                type: "url-test",
                url: "https://www.gstatic.com/generate_204",
                interval: 300,
                lazy: true,
                proxies: pool
              }
            ]
          : []),
        {
          name: "Global",
          type: "select",
          proxies: hasNodes ? ["Auto", ...pool, "DIRECT"] : ["DIRECT"]
        }
      ],
      rules: ["MATCH,Global"]
    },
    "clash-fallback": {
      mode: "rule",
      groups: [
        ...(hasNodes
          ? [
              {
                name: "Fallback",
                type: "fallback",
                url: "https://www.gstatic.com/generate_204",
                interval: 300,
                lazy: true,
                proxies: pool
              }
            ]
          : []),
        {
          name: "Proxy",
          type: "select",
          proxies: hasNodes ? ["Fallback", ...pool, "DIRECT"] : ["DIRECT"]
        }
      ],
      rules: [
        "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
        "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
        "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
        "MATCH,Proxy"
      ]
    }
  };

  const template = groupsByTemplate[templateId] || groupsByTemplate[defaultSubscriptionTemplateId];
  const preamble = {
    "mixed-port": 7890,
    "allow-lan": true,
    mode: template.mode,
    "log-level": "info",
    "unified-delay": true,
    ipv6: true,
    dns: {
      enable: true,
      "enhanced-mode": "fake-ip",
      nameserver: ["1.1.1.1", "8.8.8.8"],
      fallback: ["https://1.1.1.1/dns-query", "https://dns.google/dns-query"]
    }
  };
  const trailer = {
    "proxy-groups": template.groups,
    rules: template.rules
  };

  const lines = [
    `# Generated by ChikenEasy at ${new Date().toISOString()}`,
    `# Template: ${templateId}`
  ];
  appendYamlObject(lines, preamble, 0);
  if (!generatedProxies.length && !rawBlocks.length) {
    lines.push("proxies: []");
  } else {
    lines.push("proxies:");
    for (const proxy of generatedProxies) appendYamlArrayItem(lines, proxy, 2);
    for (const block of rawBlocks) {
      if (!block) continue;
      lines.push(...block.split("\n"));
    }
  }
  appendYamlObject(lines, trailer, 0);
  return `${lines.join("\n")}\n`;
}

function parseImportedSubscription(importItem) {
  const warnings = [];
  const decoded = decodeImportedContent(importItem.content);
  const clash = extractClashProxies(decoded);
  if (clash) {
    if (!clash.names.length) warnings.push(`Import "${importItem.name}" contains a Clash proxies block without readable proxy names.`);
    return {
      rawBlocks: clash.block ? [clash.block] : [],
      rawNames: clash.names,
      generated: [],
      uris: [],
      warnings
    };
  }

  const generated = [];
  const uris = [];
  const lines = decoded
    .split("\n")
    .map((line) => cleanText(line))
    .filter((line) => line && !line.startsWith("#"));

  for (const line of lines) {
    try {
      const parsed = parseProxyUri(line);
      generated.push(parsed.proxy);
      uris.push(parsed.uri);
    } catch (error) {
      warnings.push(`Import "${importItem.name}" skipped one entry: ${error.message}.`);
    }
  }

  if (!generated.length && !warnings.length) warnings.push(`Import "${importItem.name}" did not contain any supported nodes.`);
  return { rawBlocks: [], rawNames: [], generated, uris, warnings };
}

export function buildNodeProfile(agent, input, versionId) {
  const protocol = cleanText(input.protocol) || "vmess-ws";
  return {
    agentId: agent.id,
    agentName: cleanText(agent.name) || agent.id,
    protocol,
    name: cleanText(input.exportName) || `${cleanText(agent.name) || agent.id} ${protocolLabels[protocol] || protocol}`,
    server: cleanText(input.exportHost || input.server) || cleanText(agent.ip || agent.host),
    port: cleanPort(input.port || input.listen_port),
    path: cleanText(input.path) || "/ws",
    uuid: cleanText(input.uuid || input.userId),
    password: cleanText(input.password),
    method: cleanText(input.method) || "aes-256-gcm",
    serverName: cleanText(input.serverName || input.sni),
    publicKey: cleanText(input.publicKey),
    shortId: cleanText(input.shortId),
    flow: cleanText(input.flow) || "xtls-rprx-vision",
    clientFingerprint: cleanText(input.clientFingerprint) || "chrome",
    upMbps: Number(input.upMbps || 100) || 100,
    downMbps: Number(input.downMbps || 100) || 100,
    versionId,
    updatedAt: new Date().toISOString()
  };
}

export function listSubscriptionNodes(state) {
  return Object.values(state.nodeProfiles || {})
    .map((profile) => {
      const validation = validateNodeProfile(profile);
      return {
        agentId: profile.agentId,
        agentName: profile.agentName,
        protocol: profile.protocol,
        protocolLabel: protocolLabels[profile.protocol] || profile.protocol,
        name: buildNodeDisplayName(profile),
        server: profile.server,
        port: profile.port,
        updatedAt: profile.updatedAt,
        ready: validation.ok,
        reason: validation.reason
      };
    })
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
}

export function buildSubscriptionProfile(input, current = {}) {
  const now = new Date().toISOString();
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    name: cleanText(input.name) || current.name || `subscription-${nanoid(6)}`,
    template: templateIds.has(cleanText(input.template)) ? cleanText(input.template) : current.template || defaultSubscriptionTemplateId,
    publicToken: cleanText(input.publicToken) || current.publicToken || nanoid(18),
    localNodes: dedupe(cleanArray(input.localNodes ?? current.localNodes ?? [])),
    imports: (Array.isArray(input.imports) ? input.imports : current.imports || [])
      .map((item, index) => ({
        id: cleanText(item?.id) || nanoid(8),
        name: normalizeImportedName(item?.name, `Import ${index + 1}`),
        content: String(item?.content || "").trim(),
        updatedAt: now
      }))
      .filter((item) => item.content),
    createdAt: current.createdAt || now,
    updatedAt: now
  };
}

export function renderSubscription(profile, state, options = {}) {
  const warnings = [];
  const usedNames = new Set();
  const rawBlocks = [];
  const rawNames = [];
  const generated = [];
  const uris = [];

  for (const importItem of profile.imports || []) {
    const result = parseImportedSubscription(importItem);
    warnings.push(...result.warnings);
    for (const name of result.rawNames) {
      if (usedNames.has(name)) warnings.push(`Duplicate proxy name detected: ${name}. Imported Clash blocks keep their original names.`);
      usedNames.add(name);
      rawNames.push(name);
    }
    rawBlocks.push(...result.rawBlocks);
    for (const proxy of result.generated) {
      const uniqueName = ensureUniqueName(proxy.name, usedNames);
      generated.push({ ...proxy, name: uniqueName });
    }
    uris.push(...result.uris);
  }

  for (const agentId of profile.localNodes || []) {
    const nodeProfile = state.nodeProfiles?.[agentId];
    const validation = validateNodeProfile(nodeProfile);
    if (!validation.ok) {
      warnings.push(`Local node ${agentId} skipped: ${validation.reason}.`);
      continue;
    }
    const name = ensureUniqueName(buildNodeDisplayName(nodeProfile), usedNames);
    const proxy = clashProxyFromNodeProfile(nodeProfile, name);
    const uri = uriFromNodeProfile(nodeProfile, name);
    if (!proxy || !uri) {
      warnings.push(`Local node ${agentId} skipped: unsupported export protocol ${nodeProfile.protocol}.`);
      continue;
    }
    generated.push(proxy);
    uris.push(uri);
  }

  const templateId = templateIds.has(cleanText(options.template || profile.template)) ? cleanText(options.template || profile.template) : defaultSubscriptionTemplateId;
  const proxyNames = [...generated.map((item) => item.name), ...rawNames];
  const body = renderClashTemplate(templateId, generated, rawBlocks, proxyNames);
  const uriContent = uris.join("\n");
  return {
    templateId,
    body,
    uriContent,
    uriBase64: uriContent ? Buffer.from(uriContent).toString("base64") : "",
    warnings: dedupe(warnings),
    proxyCount: proxyNames.length,
    importCount: (profile.imports || []).length,
    localNodeCount: (profile.localNodes || []).length
  };
}
