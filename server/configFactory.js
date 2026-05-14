import { nanoid } from "nanoid";

export const protocolCatalog = [
  { id: "vmess-ws", name: "VMess + WebSocket" },
  { id: "vless-reality", name: "VLESS + Reality" },
  { id: "trojan", name: "Trojan + TLS" },
  { id: "hysteria2", name: "Hysteria2" },
  { id: "shadowsocks", name: "Shadowsocks" },
  { id: "mixed", name: "Mixed HTTP/SOCKS" }
];

export const forwardCatalog = [
  { id: "tcp", name: "TCP 转发" },
  { id: "udp", name: "UDP 转发" },
  { id: "tcp_udp", name: "TCP + UDP 双栈转发" }
];

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
  const port = Number(input.port || input.listen_port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("端口必须是 1-65535");
  const tag = input.tag || `${input.protocol}-${port}`;
  const listen = input.listen || "::";
  const uuid = input.uuid || nanoid();
  const password = input.password || nanoid(20);
  const serverName = input.serverName || input.sni || "www.cloudflare.com";

  if (input.protocol === "vmess-ws") {
    return {
      type: "vmess",
      tag,
      listen,
      listen_port: port,
      users: [{ uuid, alterId: 0 }],
      transport: { type: "ws", path: input.path || "/ws" }
    };
  }

  if (input.protocol === "vless-reality") {
    return {
      type: "vless",
      tag,
      listen,
      listen_port: port,
      users: [{ uuid, flow: input.flow || "xtls-rprx-vision" }],
      tls: {
        enabled: true,
        server_name: serverName,
        reality: {
          enabled: true,
          handshake: { server: serverName, server_port: Number(input.serverPort || 443) },
          private_key: input.privateKey || "CHANGE_ME_REALITY_PRIVATE_KEY",
          short_id: [input.shortId || "0123456789abcdef"]
        }
      }
    };
  }

  if (input.protocol === "trojan") {
    return { type: "trojan", tag, listen, listen_port: port, users: [{ password }], tls: { enabled: true, server_name: input.serverName || "example.com" } };
  }

  if (input.protocol === "hysteria2") {
    return { type: "hysteria2", tag, listen, listen_port: port, users: [{ password }], tls: { enabled: true, server_name: input.serverName || "example.com" } };
  }

  if (input.protocol === "shadowsocks") {
    return { type: "shadowsocks", tag, listen, listen_port: port, method: input.method || "2022-blake3-aes-128-gcm", password };
  }

  if (input.protocol === "mixed") {
    return { type: "mixed", tag, listen, listen_port: port };
  }

  if (input.protocol === "port-forward") {
    return buildForwardInbound(input);
  }

  throw new Error(`不支持的协议: ${input.protocol}`);
}

export function buildConfig(input) {
  return makeBaseConfig([buildInbound(input)]);
}

export function buildForwardInbound(input) {
  const port = Number(input.port || input.listen_port);
  const targetPort = Number(input.targetPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("端口必须是 1-65535");
  if (!input.targetHost || !Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error("端口转发需要目标地址和目标端口");
  return {
    type: "direct",
    tag: input.tag || `forward-${input.network || "tcp"}-${port}`,
    listen: input.listen || "::",
    listen_port: port,
    network: input.network || "tcp",
    override_address: input.targetHost,
    override_port: targetPort
  };
}

export function buildForwardConfig(input) {
  const rules = Array.isArray(input.rules) && input.rules.length ? input.rules : [input];
  const inbounds = [];
  for (const rule of rules) {
    if (rule.network === "tcp_udp") {
      inbounds.push(buildForwardInbound({ ...rule, network: "tcp", tag: rule.tag ? `${rule.tag}-tcp` : undefined }));
      inbounds.push(buildForwardInbound({ ...rule, network: "udp", tag: rule.tag ? `${rule.tag}-udp` : undefined }));
    } else {
      inbounds.push(buildForwardInbound(rule));
    }
  }
  return makeBaseConfig(inbounds);
}
