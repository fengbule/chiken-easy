import path from "path";
import { nanoid } from "nanoid";

export const protocolCatalog = [
  { id: "vmess-ws", name: "VMess + WebSocket" },
  { id: "vless-reality", name: "VLESS + Reality" },
  { id: "trojan", name: "Trojan + TLS" },
  { id: "hysteria2", name: "Hysteria2" },
  { id: "shadowsocks", name: "Shadowsocks" },
  { id: "mixed", name: "Mixed HTTP/SOCKS" }
];

export const forwardCatalog = {
  networks: [
    { id: "tcp", name: "TCP" },
    { id: "udp", name: "UDP" },
    { id: "tcp_udp", name: "TCP + UDP" }
  ],
  engines: [
    { id: "sing-box", name: "sing-box Direct", networks: ["tcp", "udp", "tcp_udp"] },
    { id: "realm", name: "Realm", networks: ["tcp", "udp", "tcp_udp"] },
    { id: "gost", name: "GOST", networks: ["tcp", "udp", "tcp_udp"] }
  ]
};

const supportedProtocols = new Set(protocolCatalog.map((item) => item.id));
const supportedNetworks = new Set(forwardCatalog.networks.map((item) => item.id));
const supportedEngines = new Set(forwardCatalog.engines.map((item) => item.id));

function ensurePort(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${label} must be an integer between 1 and 65535`);
  }
  return port;
}

function ensureNonEmpty(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || nanoid(8);
}

function tagToFileStem(tag) {
  return sanitizeName(tag).toLowerCase();
}

function withTlsPaths(tls, tag, input) {
  const stem = tagToFileStem(tag);
  return {
    ...tls,
    certificate_path: input.certificatePath || `/etc/sing-box/tls/${stem}.crt`,
    key_path: input.keyPath || `/etc/sing-box/tls/${stem}.key`
  };
}

export function makeBaseConfig(inbounds = []) {
  return {
    log: { level: "info" },
    dns: {
      servers: [{ tag: "cloudflare", type: "udp", server: "1.1.1.1" }],
      final: "cloudflare"
    },
    inbounds,
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { final: "direct" }
  };
}

export function buildInbound(input) {
  const protocol = ensureNonEmpty(input.protocol, "protocol");
  if (!supportedProtocols.has(protocol)) {
    throw new Error(`Unsupported protocol: ${protocol}`);
  }

  const port = ensurePort(input.port || input.listen_port, "listen port");
  const tag = sanitizeName(input.tag || `${protocol}-${port}`);
  const listen = String(input.listen || "::").trim() || "::";
  const uuid = String(input.uuid || input.userId || "").trim() || nanoid();
  const password = String(input.password || "").trim() || nanoid(20);
  const serverName = String(input.serverName || input.sni || "www.cloudflare.com").trim() || "www.cloudflare.com";

  if (protocol === "vmess-ws") {
    return {
      type: "vmess",
      tag,
      listen,
      listen_port: port,
      users: [{ uuid, alterId: 0 }],
      transport: { type: "ws", path: String(input.path || "/ws").trim() || "/ws" }
    };
  }

  if (protocol === "vless-reality") {
    return {
      type: "vless",
      tag,
      listen,
      listen_port: port,
      users: [{ uuid, flow: String(input.flow || "xtls-rprx-vision").trim() || "xtls-rprx-vision" }],
      tls: {
        enabled: true,
        server_name: serverName,
        reality: {
          enabled: true,
          handshake: { server: serverName, server_port: ensurePort(input.serverPort || 443, "Reality handshake port") },
          private_key: ensureNonEmpty(input.privateKey || "CHANGE_ME_REALITY_PRIVATE_KEY", "Reality private key"),
          short_id: [String(input.shortId || "0123456789abcdef").trim() || "0123456789abcdef"]
        }
      }
    };
  }

  if (protocol === "trojan") {
    return {
      type: "trojan",
      tag,
      listen,
      listen_port: port,
      users: [{ password }],
      tls: withTlsPaths(
        {
          enabled: true,
          server_name: serverName
        },
        tag,
        input
      )
    };
  }

  if (protocol === "hysteria2") {
    return {
      type: "hysteria2",
      tag,
      listen,
      listen_port: port,
      users: [{ password }],
      up_mbps: Number(input.upMbps || 100),
      down_mbps: Number(input.downMbps || 100),
      tls: withTlsPaths(
        {
          enabled: true,
          server_name: serverName
        },
        tag,
        input
      )
    };
  }

  if (protocol === "shadowsocks") {
    return {
      type: "shadowsocks",
      tag,
      listen,
      listen_port: port,
      method: String(input.method || "aes-256-gcm").trim() || "aes-256-gcm",
      password
    };
  }

  if (protocol === "mixed") {
    return { type: "mixed", tag, listen, listen_port: port };
  }

  throw new Error(`Unsupported protocol: ${protocol}`);
}

export function buildConfig(input) {
  return makeBaseConfig([buildInbound(input)]);
}

export function buildForwardRule(input) {
  const engine = String(input.engine || "sing-box").trim() || "sing-box";
  const network = String(input.network || "tcp").trim() || "tcp";
  if (!supportedEngines.has(engine)) throw new Error(`Unsupported forward engine: ${engine}`);
  if (!supportedNetworks.has(network)) throw new Error(`Unsupported forward network: ${network}`);

  return {
    id: sanitizeName(input.id || nanoid(10)),
    name: String(input.name || "").trim() || `${engine}-${network}-${ensurePort(input.port || input.listen_port, "listen port")}`,
    engine,
    network,
    listen: String(input.listen || "0.0.0.0").trim() || "0.0.0.0",
    port: ensurePort(input.port || input.listen_port, "listen port"),
    targetHost: ensureNonEmpty(input.targetHost, "target host"),
    targetPort: ensurePort(input.targetPort, "target port"),
    notes: String(input.notes || "").trim(),
    updatedAt: input.updatedAt || new Date().toISOString()
  };
}

function singBoxForwardInbound(rule, network, tagSuffix = network) {
  return {
    type: "direct",
    tag: sanitizeName(`${rule.id}-${tagSuffix}`),
    listen: rule.listen,
    listen_port: rule.port,
    network,
    override_address: rule.targetHost,
    override_port: rule.targetPort
  };
}

function buildSingBoxForwardConfig(rule) {
  const networks = rule.network === "tcp_udp" ? ["tcp", "udp"] : [rule.network];
  return makeBaseConfig(networks.map((network) => singBoxForwardInbound(rule, network)));
}

export function getForwardContainerName(ruleId) {
  return `chiken-forward-${sanitizeName(ruleId).toLowerCase()}`;
}

export function buildForwardPlan(input, options = {}) {
  const rule = "targetHost" in input ? buildForwardRule(input) : input;
  const hostDir = String(options.hostDir || "/opt/chiken-forwarders");
  const containerName = getForwardContainerName(rule.id);

  if (rule.engine === "sing-box") {
    const relativePath = path.posix.join(rule.id, "config.json");
    return {
      rule,
      container: {
        name: containerName,
        image: String(options.singBoxImage || "ghcr.io/sagernet/sing-box:latest"),
        networkMode: "host",
        command: ["run", "-c", "/etc/sing-box/config.json"],
        mounts: [
          {
            hostPath: path.posix.join(hostDir, relativePath),
            containerPath: "/etc/sing-box/config.json",
            readOnly: true
          }
        ]
      },
      files: [
        {
          relativePath,
          content: JSON.stringify(buildSingBoxForwardConfig(rule), null, 2)
        }
      ],
      preview: buildSingBoxForwardConfig(rule)
    };
  }

  if (rule.engine === "realm") {
    const command = ["-l", `${rule.listen}:${rule.port}`, "-r", `${rule.targetHost}:${rule.targetPort}`];
    if (rule.network === "tcp_udp") command.unshift("-u");
    if (rule.network === "udp") command.unshift("-u", "-t");

    return {
      rule,
      container: {
        name: containerName,
        image: String(options.realmImage || "4points/realm:latest"),
        networkMode: "host",
        command,
        mounts: []
      },
      files: [],
      preview: {
        engine: "realm",
        listen: `${rule.listen}:${rule.port}`,
        target: `${rule.targetHost}:${rule.targetPort}`,
        network: rule.network,
        command
      }
    };
  }

  if (rule.engine === "gost") {
    const listeners = [];
    if (rule.network === "tcp" || rule.network === "tcp_udp") {
      listeners.push("tcp", `tcp://:${rule.port}/${rule.targetHost}:${rule.targetPort}`);
    }
    if (rule.network === "udp" || rule.network === "tcp_udp") {
      listeners.push("udp", `udp://:${rule.port}/${rule.targetHost}:${rule.targetPort}?keepAlive=true&ttl=5s&readBufferSize=4096`);
    }

    const command = [];
    for (let index = 0; index < listeners.length; index += 2) {
      command.push("-L", listeners[index + 1]);
    }

    return {
      rule,
      container: {
        name: containerName,
        image: String(options.gostImage || "gogost/gost:latest"),
        networkMode: "host",
        command,
        mounts: []
      },
      files: [],
      preview: {
        engine: "gost",
        network: rule.network,
        listeners: listeners.filter((_, index) => index % 2 === 1),
        command
      }
    };
  }

  throw new Error(`Unsupported forward engine: ${rule.engine}`);
}

export function buildForwardConfig(input) {
  return buildForwardPlan(input).preview;
}
