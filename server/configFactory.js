import { nanoid } from "nanoid";

export const protocolCatalog = [
  { id: "vmess-ws", name: "VMess + WebSocket" },
  { id: "vless-reality", name: "VLESS + Reality" },
  { id: "trojan", name: "Trojan + TLS" },
  { id: "hysteria2", name: "Hysteria2" },
  { id: "shadowsocks", name: "Shadowsocks" },
  { id: "mixed", name: "Mixed HTTP/SOCKS" },
  { id: "port-forward", name: "TCP/UDP 端口转发" }
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
    if (!input.targetHost || !input.targetPort) throw new Error("端口转发需要目标地址和目标端口");
    return {
      type: "direct",
      tag,
      listen,
      listen_port: port,
      network: input.network || "tcp",
      override_address: input.targetHost,
      override_port: Number(input.targetPort)
    };
  }

  throw new Error(`不支持的协议: ${input.protocol}`);
}

export function buildConfig(input) {
  return makeBaseConfig([buildInbound(input)]);
}
