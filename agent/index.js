import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { exec, execFile } from "child_process";
import http from "http";
import https from "https";
import net from "net";
import tls from "tls";
import { nanoid } from "nanoid";
import { buildForwardPlan } from "../shared/configFactory.js";
import { createProbeCollector } from "./systemProbe.js";

const stateDir = process.env.CHIKEN_AGENT_STATE || path.resolve("agent-state");
const stateFile = path.join(stateDir, "agent.json");
const configPath = process.env.SINGBOX_CONFIG || "/etc/sing-box/config.json";
const backupDir = process.env.SINGBOX_BACKUP_DIR || "/etc/sing-box/chiken-backups";
const forwardDir = process.env.CHIKEN_FORWARDER_DIR || path.resolve("forwarders");
const forwardHostDir = process.env.CHIKEN_FORWARDER_HOST_DIR || forwardDir;
const hostRoot = process.env.CHIKEN_HOST_ROOT || "/";
const serviceMode = process.env.CHIKEN_SERVICE_MODE || (process.platform === "win32" ? "mock" : "systemd");
const singboxContainer = process.env.SINGBOX_CONTAINER || "chiken-singbox";
const singboxImage = process.env.SINGBOX_IMAGE || "ghcr.io/sagernet/sing-box:latest";
const singboxConfigVolume = process.env.SINGBOX_CONFIG_VOLUME || "chiken-singbox-config";
const realmImage = process.env.CHIKEN_REALM_IMAGE || "4points/realm:latest";
const gostImage = process.env.CHIKEN_GOST_IMAGE || "gogost/gost:latest";
const proxyCheckUrl = process.env.CHIKEN_PROXY_CHECK_URL || "https://www.gstatic.com/generate_204";
const probeIntervalMs = Math.max(3000, Math.min(30000, (Number(process.env.CHIKEN_PROBE_INTERVAL || 5) || 5) * 1000));
const agentVersion = process.env.CHIKEN_AGENT_VERSION || (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../package.json"), "utf8")).version; } catch { return "0.0.0"; } })();
const collectProbe = createProbeCollector({ hostRoot });
const proxyCheckStateDir = path.join(stateDir, "proxy-check");
const activeProcesses = new Map();
const recentCommandIds = new Map();
const recentCommandLimit = 500;

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(forwardDir, { recursive: true });
fs.mkdirSync(proxyCheckStateDir, { recursive: true });

function cleanText(value) {
  return String(value ?? "").trim();
}

function readState() {
  if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const state = { id: nanoid(), name: os.hostname(), tags: [] };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return state;
}

function run(cmd, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout || ""}${stderr || ""}`.trim(), code: error?.code || 0 });
    });
  });
}

function terminateProcessTree(child, signal = "SIGTERM") {
  if (!child?.pid || child.exitCode !== null) return false;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
    return true;
  } catch {
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

function runShell(command, options = {}) {
  return new Promise((resolve) => {
    const { commandId = "", timeout = 30000, ...execOptions } = options;
    let timedOut = false;
    const child = exec(command, {
      timeout: commandId ? 0 : timeout,
      maxBuffer: 4 * 1024 * 1024,
      detached: Boolean(commandId) && process.platform !== "win32",
      ...execOptions
    }, (error, stdout, stderr) => {
      clearTimeout(timeoutTimer);
      if (commandId) activeProcesses.delete(commandId);
      resolve({
        ok: !error && !timedOut,
        output: timedOut ? `command timeout after ${timeout}ms` : `${stdout || ""}${stderr || ""}`.trim(),
        code: timedOut ? "timeout" : error?.code || 0,
        timeout: timedOut
      });
    });
    if (commandId) activeProcesses.set(commandId, child);
    const timeoutTimer = commandId && timeout > 0
      ? setTimeout(() => {
          timedOut = true;
          terminateProcessTree(child, "SIGTERM");
          setTimeout(() => terminateProcessTree(child, "SIGKILL"), 1000).unref();
        }, timeout)
      : null;
    if (timeoutTimer) timeoutTimer.unref();
    child.once("exit", () => {
      if (timedOut && commandId) activeProcesses.delete(commandId);
    });
  });
}

function parseOsRelease(raw) {
  const result = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value.replace(/\\"/g, "\"");
  }
  return result;
}

function readOsInfo() {
  const candidates = [
    path.join(hostRoot, "etc/os-release"),
    path.join(hostRoot, "usr/lib/os-release"),
    "/hostfs/etc/os-release",
    "/hostfs/usr/lib/os-release",
    "/host/etc/os-release",
    "/host/usr-lib/os-release",
    "/etc/os-release",
    "/usr/lib/os-release"
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = parseOsRelease(fs.readFileSync(candidate, "utf8"));
      return {
        osId: parsed.ID || "",
        osName: parsed.NAME || parsed.ID || "",
        osPretty: parsed.PRETTY_NAME || parsed.NAME || parsed.ID || process.platform,
        osVersion: parsed.VERSION || "",
        osVersionId: parsed.VERSION_ID || ""
      };
    } catch {}
  }
  return {
    osId: process.platform,
    osName: process.platform,
    osPretty: process.platform,
    osVersion: os.release(),
    osVersionId: ""
  };
}

function systemIdentity() {
  return {
    os: process.platform,
    arch: process.arch,
    ...readOsInfo()
  };
}

async function runDocker(args, options = {}) {
  return run("docker", args, { timeout: 60000, ...options });
}

async function ensureDockerImage(image) {
  const inspect = await runDocker(["image", "inspect", image], { timeout: 30000 });
  if (inspect.ok) return { ok: true, image, present: true, pulled: false, output: "image present locally" };

  const pull = await runDocker(["pull", image], { timeout: 180000 });
  if (pull.ok) return { ok: true, image, present: true, pulled: true, output: "image pulled successfully" };

  return {
    ok: false,
    image,
    present: false,
    pulled: false,
    output: pull.output || inspect.output || `failed to pull ${image}`
  };
}

async function probeForwardImage(engine) {
  const image = engine === "realm" ? realmImage : engine === "gost" ? gostImage : singboxImage;
  const result = await ensureDockerImage(image);
  return {
    ok: result.ok,
    engine,
    image,
    present: Boolean(result.present),
    pulled: Boolean(result.pulled),
    output: result.output
  };
}

function splitAuth(auth) {
  const raw = String(auth || "");
  const index = raw.indexOf(":");
  if (index < 0) return { username: raw, password: "" };
  return {
    username: raw.slice(0, index),
    password: raw.slice(index + 1)
  };
}

function randomLocalPort() {
  return 20000 + Math.floor(Math.random() * 20000);
}

function buildProxyCheckOutbound(node) {
  const protocol = String(node.protocol || "").trim().toLowerCase();
  const sni = cleanText(node.tls?.sni || node.hysteria2?.sni) || node.address;

  if (protocol === "ss" || protocol === "shadowsocks") {
    return {
      type: "shadowsocks",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      method: node.ss?.method || node.method || "aes-256-gcm",
      password: node.password
    };
  }
  if (protocol === "trojan") {
    return {
      type: "trojan",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      password: node.password,
      tls: {
        enabled: true,
        server_name: sni,
        insecure: true
      }
    };
  }
  if (protocol === "vless") {
    const outbound = {
      type: "vless",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      uuid: cleanText(node.uuid),
      flow: cleanText(node.reality?.flow || node.flow)
    };
    if (node.reality?.publicKey || node.reality?.public_key) {
      outbound.tls = {
        enabled: true,
        server_name: sni || "www.cloudflare.com",
        utls: {
          enabled: true,
          fingerprint: cleanText(node.reality?.fingerprint || node.tls?.fingerprint) || "chrome"
        },
        reality: {
          enabled: true,
          public_key: cleanText(node.reality?.publicKey || node.reality?.public_key),
          short_id: cleanText(node.reality?.shortId || node.reality?.short_id) || "0123456789abcdef"
        }
      };
    } else {
      outbound.tls = {
        enabled: true,
        server_name: sni,
        insecure: true
      };
    }
    return outbound;
  }
  if (protocol === "vmess") {
    const outbound = {
      type: "vmess",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      uuid: cleanText(node.uuid),
      transport: {
        type: "ws",
        path: cleanText(node.ws?.path || node.transport?.path) || "/"
      },
      tls: {
        enabled: node.tls?.enabled === true,
        server_name: sni,
        insecure: true
      }
    };
    const wsHost = cleanText(node.ws?.host || node.transport?.host);
    if (wsHost) outbound.transport.headers = { Host: wsHost };
    if (node.ws?.fingerprint || node.tls?.fingerprint) {
      outbound.tls.utls = {
        enabled: true,
        fingerprint: cleanText(node.ws?.fingerprint || node.tls?.fingerprint) || "chrome"
      };
    }
    return outbound;
  }
  if (protocol === "hysteria2" || protocol === "hy2") {
    return {
      type: "hysteria2",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      password: node.password || node.hysteria2?.password,
      up_mbps: Number(node.hysteria2?.upMbps || node.upMbps || 100),
      down_mbps: Number(node.hysteria2?.downMbps || node.downMbps || 100),
      tls: {
        enabled: true,
        server_name: sni,
        insecure: true
      }
    };
  }
  if (protocol === "http") {
    const auth = splitAuth(node.auth);
    return {
      type: "http",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      username: auth.username || undefined,
      password: auth.password || undefined
    };
  }
  if (protocol === "socks" || protocol === "mixed") {
    const auth = splitAuth(node.auth);
    return {
      type: "socks",
      tag: "proxy",
      server: node.address,
      server_port: Number(node.port),
      version: "5",
      username: auth.username || undefined,
      password: auth.password || undefined
    };
  }
  return null;
}

function buildProxyCheckConfig(node, listenPort) {
  const outbound = buildProxyCheckOutbound(node);
  if (!outbound) return null;
  return {
    log: { level: "warn" },
    inbounds: [
      {
        type: "mixed",
        tag: "mixed-in",
        listen: "127.0.0.1",
        listen_port: listenPort
      }
    ],
    outbounds: [
      outbound,
      { type: "direct", tag: "direct" }
    ],
    route: {
      final: "proxy"
    }
  };
}

async function waitForLocalPort(port, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(800);
      socket.once("connect", () => finish(true));
      socket.once("timeout", () => finish(false));
      socket.once("error", () => finish(false));
      socket.connect(port, "127.0.0.1");
    });
    if (result) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function classifyProxyInitError(logText, protocol) {
  const lower = String(logText || "").toLowerCase();
  if (lower.includes("dns") && (lower.includes("resolve") || lower.includes("no such host") || lower.includes("lookup") || lower.includes("nxdomain"))) return "dns_failure";
  if (lower.includes("reality") && (lower.includes("handshake") || lower.includes("mismatch") || lower.includes("verification") || lower.includes("short_id"))) return "reality_handshake_failed";
  if (lower.includes("tls") && (lower.includes("handshake") || lower.includes("bad certificate") || lower.includes("unknown ca") || lower.includes("certificate"))) return "tls_failure";
  if (lower.includes("auth") || lower.includes("password") || lower.includes("uuid") || lower.includes("unauthorized")) return "auth_failure";
  if (lower.includes("connection refused") || lower.includes("no route to host") || lower.includes("network is unreachable") || lower.includes("connect:")) return "tcp_connect_failed";
  if (lower.includes("timeout") || lower.includes("deadline exceeded")) return "timeout";
  if (lower.includes("unsupported") || lower.includes("not supported")) return "unsupported_environment";
  if (lower.includes("config") && (lower.includes("invalid") || lower.includes("error") || lower.includes("parse"))) return "config_invalid";
  if (protocol === "https" && (lower.includes("403") || lower.includes("404"))) return "target_error";
  return "singbox_start_failed";
}

async function startTemporaryProxy(node) {
  const config = buildProxyCheckConfig(node, randomLocalPort());
  if (!config) return { ok: false, error: "unsupported protocol", unsupported: true, errorType: "config_invalid" };
  const imageReady = await ensureDockerImage(singboxImage);
  if (!imageReady.ok) return { ok: false, error: imageReady.output || "failed to ensure sing-box image", errorType: "image_pull_failed" };

  const listenPort = config.inbounds[0].listen_port;
  const runId = `${cleanProxyName(node.id || node.name || nanoid(6))}-${listenPort}`;
  const containerName = `chiken-proxy-check-${runId}`.slice(0, 63);
  const dir = path.join(proxyCheckStateDir, runId);
  fs.mkdirSync(dir, { recursive: true });
  const configBase64 = Buffer.from(JSON.stringify(config, null, 2)).toString("base64");
  const networkMode =
    serviceMode === "docker"
      ? process.env.HOSTNAME
        ? `container:${process.env.HOSTNAME}`
        : "host"
      : "host";

  await runDocker(["rm", "-f", containerName], { timeout: 15000 });
  const result = await runDocker(
    [
      "run",
      "-d",
      "--name",
      containerName,
      "--network",
      networkMode,
      "--entrypoint",
      "sh",
      "-e",
      `CHIKEN_PROXY_CONFIG_B64=${configBase64}`,
      singboxImage,
      "-lc",
      'echo "$CHIKEN_PROXY_CONFIG_B64" | base64 -d >/tmp/config.json && sing-box run -c /tmp/config.json'
    ],
    { timeout: 120000 }
  );

  if (!result.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    const errorType = classifyProxyInitError(result.output, String(node.protocol || ""));
    return { ok: false, error: result.output || "failed to start temporary sing-box proxy", errorType };
  }

  const ready = await waitForLocalPort(listenPort, 12000);
  if (!ready) {
    const logs = await runDocker(["logs", "--tail", "100", containerName], { timeout: 30000 });
    const inspect = await runDocker(["inspect", "-f", "{{.State.Status}}", containerName], { timeout: 15000 });
    await runDocker(["rm", "-f", containerName], { timeout: 30000 });
    fs.rmSync(dir, { recursive: true, force: true });
    const combinedLogs = [logs.output, inspect.output ? `state=${inspect.output}` : ""].filter(Boolean).join("; ");
    const errorType = classifyProxyInitError(combinedLogs, String(node.protocol || ""));
    return {
      ok: false,
      error: [combinedLogs, "temporary proxy did not become ready"].filter(Boolean).join("; "),
      errorType
    };
  }

  return {
    ok: true,
    listenPort,
    containerName,
    dir,
    protocol: String(node.protocol || "").trim().toLowerCase()
  };
}

async function stopTemporaryProxy(temp) {
  if (!temp) return;
  await runDocker(["rm", "-f", temp.containerName], { timeout: 30000 });
  fs.rmSync(temp.dir, { recursive: true, force: true });
}

function cleanProxyName(value) {
  return String(value || "node")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "node";
}

async function service(action) {
  const name = process.env.SINGBOX_SERVICE || "sing-box";
  if (serviceMode === "mock") return { ok: true, output: `mock ${action} ${name}` };
  if (serviceMode === "docker") {
    if (action === "status") {
      const result = await runDocker(["inspect", "-f", "{{.State.Status}}", singboxContainer]);
      return { ...result, output: result.output === "running" ? "active" : result.output };
    }
    return runDocker([action, singboxContainer]);
  }
  if (action === "status") return run("systemctl", ["is-active", name]);
  return run("systemctl", [action, name]);
}

async function singboxVersion() {
  if (serviceMode === "docker") {
    const result = await runDocker(["exec", singboxContainer, "sing-box", "version"]);
    return result.output.split(/\s+/).find((item) => /^\d+\.\d+/.test(item)) || "-";
  }
  const result = await run(process.env.SINGBOX_BIN || "sing-box", ["version"]);
  return result.output.split(/\s+/).find((item) => /^\d+\.\d+/.test(item)) || "-";
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function ensureTlsPair(certPath, keyPath, serverName) {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return { ok: true, output: "tls assets already exist" };

  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });

  const san = `subjectAltName=DNS:${serverName || "localhost"},DNS:localhost,IP:127.0.0.1`;
  const result = await run(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-sha256",
      "-days",
      "3650",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-subj",
      `/CN=${serverName || "localhost"}`,
      "-addext",
      san
    ],
    { timeout: 60000 }
  );

  if (!result.ok) {
    throw new Error(result.output || `failed to generate TLS certificate for ${serverName || "localhost"}`);
  }
}

async function ensureTlsAssets(config) {
  for (const inbound of config?.inbounds || []) {
    if (!inbound?.tls?.enabled) continue;
    if (!inbound.tls.certificate_path || !inbound.tls.key_path) continue;
    await ensureTlsPair(inbound.tls.certificate_path, inbound.tls.key_path, inbound.tls.server_name || os.hostname());
  }
}

function restoreConfig(previousRaw) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  if (previousRaw === null) {
    fs.rmSync(configPath, { force: true });
    return;
  }
  fs.writeFileSync(configPath, previousRaw);
}

async function validateConfig() {
  if (serviceMode === "docker") {
    return runDocker(["run", "--rm", "-v", `${singboxConfigVolume}:/etc/sing-box`, singboxImage, "check", "-c", configPath], { timeout: 120000 });
  }
  return run(process.env.SINGBOX_BIN || "sing-box", ["check", "-c", configPath], { timeout: 120000 });
}

async function writeConfig(config, restart) {
  const previousRaw = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : null;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  if (previousRaw !== null) {
    const backup = path.join(backupDir, `config.${Date.now()}.json`);
    fs.writeFileSync(backup, previousRaw);
  }

  await ensureTlsAssets(config);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  const check = await validateConfig();
  if (!check.ok) {
    restoreConfig(previousRaw);
    return {
      ...check,
      output: [check.output, "config validation failed, previous config restored"].filter(Boolean).join("\n")
    };
  }

  if (restart) return service("restart");
  return { ok: true, output: "config applied" };
}

async function tailLogs(lines = 200) {
  if (serviceMode === "mock") return { ok: true, output: "mock log: sing-box running" };
  if (serviceMode === "docker") return runDocker(["logs", "--tail", String(lines), singboxContainer]);
  return run("journalctl", ["-u", process.env.SINGBOX_SERVICE || "sing-box", "-n", String(lines), "--no-pager"]);
}

function buildProxyRequestOptions(url, proxyNode) {
  const target = new URL(url);
  const timeoutMs = Math.max(1000, Number(proxyNode.timeoutMs || 15000) || 15000);
  const headers = {
    Host: target.host,
    Connection: "close",
    "User-Agent": "chiken-easy-proxy-check/1.0"
  };

  if (proxyNode.protocol === "http") {
    if (proxyNode.auth) headers["Proxy-Authorization"] = `Basic ${Buffer.from(proxyNode.auth).toString("base64")}`;
    return {
      transport: target.protocol === "https:" ? https : http,
      options: {
        host: proxyNode.address,
        port: Number(proxyNode.port),
        method: "GET",
        path: url,
        headers,
        timeout: timeoutMs
      }
    };
  }

  return null;
}

function readResponseText(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    response.on("error", reject);
  });
}

function checkHttpProxy(proxyNode, url) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const target = new URL(url);
    const socket = net.createConnection({ host: proxyNode.address, port: Number(proxyNode.port) || 0 });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok: Boolean(result.ok),
        latencyMs: Date.now() - startedAt,
        statusCode: result.statusCode || 0,
        exitIp: result.exitIp || "",
        exitCountry: result.exitCountry || "",
        error: result.error || "",
        body: result.body || ""
      });
    };
    socket.setTimeout(Math.max(1000, Number(proxyNode.timeoutMs || 15000) || 15000));
    socket.once("timeout", () => finish({ ok: false, error: "timeout" }));
    socket.once("error", (error) => finish({ ok: false, error: error.message || "socket error" }));
    socket.once("connect", async () => {
      try {
        const headers = [`CONNECT ${target.hostname}:${Number(target.port || 443)} HTTP/1.1`, `Host: ${target.host}`, "Connection: close"];
        if (proxyNode.auth) headers.push(`Proxy-Authorization: Basic ${Buffer.from(proxyNode.auth).toString("base64")}`);
        socket.write(`${headers.join("\r\n")}\r\n\r\n`);
        const head = await readSocketUntil(socket, "\r\n\r\n", Number(proxyNode.timeoutMs || 15000) || 15000);
        const statusLine = head.split("\r\n")[0] || "";
        const statusCode = Number(statusLine.split(" ")[1] || 0);
        if (statusCode < 200 || statusCode >= 300) throw new Error(`HTTP CONNECT failed (${statusCode || "unknown"})`);

        const secureSocket = tls.connect({
          socket,
          servername: target.hostname,
          rejectUnauthorized: false
        });
        const request = [
          `GET ${target.pathname || "/"}${target.search || ""} HTTP/1.1`,
          `Host: ${target.host}`,
          "Connection: close",
          "User-Agent: chiken-easy-proxy-check/1.0",
          "",
          ""
        ].join("\r\n");
        secureSocket.write(request);
        const responseText = await readTlsSocket(secureSocket, Number(proxyNode.timeoutMs || 15000) || 15000);
        const match = responseText.match(/^HTTP\/1\.[01]\s+(\d+)/);
        finish({
          ok: Boolean(match && Number(match[1]) >= 200 && Number(match[1]) < 500),
          statusCode: match ? Number(match[1]) : 0,
          body: responseText
        });
      } catch (error) {
        finish({ ok: false, error: error.message || "HTTP proxy check failed" });
      }
    });
  });
}

function writeSocks5Address(bufferParts, host, port) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    bufferParts.push(Buffer.from([0x01, ...host.split(".").map((part) => Number(part))]));
  } else {
    const hostBuffer = Buffer.from(host);
    bufferParts.push(Buffer.from([0x03, hostBuffer.length]));
    bufferParts.push(hostBuffer);
  }
  bufferParts.push(Buffer.from([Math.floor(port / 256), port % 256]));
}

function readSocketOnce(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const onData = (chunk) => cleanup(() => resolve(Buffer.from(chunk)));
    const onError = (error) => cleanup(() => reject(error));
    const onClose = () => cleanup(() => reject(new Error("socket closed")));
    const timer = setTimeout(() => cleanup(() => reject(new Error("timeout"))), timeoutMs);
    const cleanup = (finish) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      finish();
    };
    socket.once("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readSocketUntil(socket, delimiter, timeoutMs) {
  return new Promise((resolve, reject) => {
    let text = "";
    const onData = (chunk) => {
      text += chunk.toString("utf8");
      if (text.includes(delimiter)) cleanup(() => resolve(text));
    };
    const onError = (error) => cleanup(() => reject(error));
    const onClose = () => cleanup(() => reject(new Error("socket closed")));
    const timer = setTimeout(() => cleanup(() => reject(new Error("timeout"))), timeoutMs);
    const cleanup = (finish) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      finish();
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

function readTlsSocket(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => {
      socket.destroy(new Error("timeout"));
    }, timeoutMs);
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("close", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

async function checkSocksProxy(proxyNode, url) {
  const target = new URL(url);
  const timeoutMs = Math.max(1000, Number(proxyNode.timeoutMs || 15000) || 15000);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        latencyMs: Date.now() - startedAt,
        statusCode: result.statusCode || 0,
        ok: Boolean(result.ok),
        exitIp: result.exitIp || "",
        exitCountry: result.exitCountry || "",
        error: result.error || "",
        body: result.body || ""
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish({ ok: false, error: "timeout" }));
    socket.once("error", (error) => finish({ ok: false, error: error.message || "socket error" }));

    socket.connect(Number(proxyNode.port), proxyNode.address, async () => {
      try {
        const methods = [0x00];
        if (proxyNode.auth) methods.push(0x02);
        socket.write(Buffer.from([0x05, methods.length, ...methods]));
        const greeting = await readSocketOnce(socket, timeoutMs);
        if (greeting[1] === 0xff) throw new Error("SOCKS auth method rejected");

        if (greeting[1] === 0x02) {
          const [user = "", pass = ""] = String(proxyNode.auth || "").split(":");
          const userBuffer = Buffer.from(user);
          const passBuffer = Buffer.from(pass);
          socket.write(Buffer.concat([Buffer.from([0x01, userBuffer.length]), userBuffer, Buffer.from([passBuffer.length]), passBuffer]));
          const authReply = await readSocketOnce(socket, timeoutMs);
          if (authReply[1] !== 0x00) throw new Error("SOCKS auth failed");
        }

        const connectParts = [Buffer.from([0x05, 0x01, 0x00])];
        writeSocks5Address(connectParts, target.hostname, Number(target.port || (target.protocol === "https:" ? 443 : 80)));
        socket.write(Buffer.concat(connectParts));
        const connectReply = await readSocketOnce(socket, timeoutMs);
        if (connectReply[1] !== 0x00) throw new Error(`SOCKS connect failed (${connectReply[1]})`);
        const stream =
          target.protocol === "https:"
            ? tls.connect({
                socket,
                servername: target.hostname,
                rejectUnauthorized: false
              })
            : socket;

        const request = `GET ${target.pathname || "/"}${target.search || ""} HTTP/1.1\r\nHost: ${target.host}\r\nConnection: close\r\nUser-Agent: chiken-easy-proxy-check/1.0\r\n\r\n`;
        stream.write(request);
        const responseText = await readTlsSocket(stream, timeoutMs);
        const statusMatch = responseText.match(/^HTTP\/1\.[01]\s+(\d+)/);
        finish({
          ok: Boolean(statusMatch && Number(statusMatch[1]) >= 200 && Number(statusMatch[1]) < 500),
          statusCode: statusMatch ? Number(statusMatch[1]) : 0,
          body: responseText
        });
      } catch (error) {
        finish({ ok: false, error: error.message || "SOCKS check failed" });
      }
    });
  });
}

async function checkShadowsocksLikeProxy(proxyNode) {
  const temp = await startTemporaryProxy(proxyNode);
  if (!temp.ok) return { ok: false, statusCode: 0, error: temp.error || "temporary proxy start failed" };
  try {
    return await checkSocksProxy({ address: "127.0.0.1", port: temp.listenPort, timeoutMs: proxyNode.timeoutMs }, proxyNode.url || proxyCheckUrl);
  } finally {
    await stopTemporaryProxy(temp);
  }
}

async function resolveExitMetadataThroughProxy(proxyNode, url) {
  const target = String(url || "https://api.ip.sb/geoip").trim();
  const result = proxyNode.kind === "http" ? await checkHttpProxy(proxyNode, target) : await checkSocksProxy(proxyNode, target);
  if (!result.ok || !result.body) return { exitIp: "", exitCountry: "" };
  try {
    const json = JSON.parse(result.body.split("\r\n\r\n").pop() || "{}");
    return {
      exitIp: String(json.ip || json.query || ""),
      exitCountry: String(json.country || json.country_name || json.countryCode || "")
    };
  } catch {
    return { exitIp: "", exitCountry: "" };
  }
}

async function runProxyCheck(payload = {}) {
  const node = payload.node || {};
  const protocol = String(node.protocol || "").trim().toLowerCase();
  const targetUrl = String(payload.url || proxyCheckUrl || "https://www.gstatic.com/generate_204").trim();
  const timeoutMs = Math.max(1000, Number(payload.timeoutMs || 15000) || 15000);
  const base = {
    ok: false,
    protocol,
    latencyMs: 0,
    exitIp: "",
    exitCountry: "",
    statusCode: 0,
    error: "",
    checkedAt: new Date().toISOString(),
    agentId: readState().id,
    nodeId: String(payload.nodeId || node.id || "")
  };

  if (!node.address || !node.port) {
    return { ...base, error: "node address or port missing" };
  }

  if (protocol === "http") {
    const proxy = { ...node, timeoutMs, kind: "http" };
    const result = await checkHttpProxy(proxy, targetUrl);
    const geo = result.ok ? await resolveExitMetadataThroughProxy(proxy, "https://api.ip.sb/geoip") : { exitIp: "", exitCountry: "" };
    return { ...base, ...result, ...geo, unsupported: false };
  }
  if (protocol === "socks" || protocol === "mixed") {
    const proxy = { ...node, timeoutMs, kind: "socks" };
    const result = await checkSocksProxy(proxy, targetUrl);
    const geo = result.ok ? await resolveExitMetadataThroughProxy(proxy, "https://api.ip.sb/geoip") : { exitIp: "", exitCountry: "" };
    return { ...base, ...result, ...geo, unsupported: false };
  }
  if (protocol === "ss" || protocol === "shadowsocks") {
    const temp = await startTemporaryProxy({ ...node, timeoutMs });
    if (!temp.ok) return { ...base, error: temp.error || "temporary proxy start failed", errorType: temp.errorType || "proxy_start_failed" };
    try {
      const proxy = { address: "127.0.0.1", port: temp.listenPort, timeoutMs, kind: "socks" };
      const result = await checkSocksProxy(proxy, targetUrl);
      const geo = result.ok ? await resolveExitMetadataThroughProxy(proxy, "https://api.ip.sb/geoip") : { exitIp: "", exitCountry: "" };
      return { ...base, ...result, ...geo, unsupported: false };
    } finally {
      await stopTemporaryProxy(temp);
    }
  }
  if (["trojan", "vless", "vmess", "hysteria2", "hy2"].includes(protocol)) {
    const temp = await startTemporaryProxy({ ...node, timeoutMs });
    if (!temp.ok) return { ...base, error: temp.error || "temporary proxy start failed", errorType: temp.errorType || "proxy_start_failed" };
    try {
      const proxy = { address: "127.0.0.1", port: temp.listenPort, timeoutMs, kind: "socks" };
      const result = await checkSocksProxy(proxy, targetUrl);
      if (!result.ok && !result.error) result.error = "proxy check target unreachable";
      const geo = result.ok ? await resolveExitMetadataThroughProxy(proxy, "https://api.ip.sb/geoip") : { exitIp: "", exitCountry: "" };
      const errorType = result.ok ? "" : classifyProxyInitError(result.error || "", protocol);
      return { ...base, ...result, ...geo, unsupported: false, errorType };
    } finally {
      await stopTemporaryProxy(temp);
    }
  }
  return { ...base, error: "unsupported protocol", unsupported: true };
}

function writeForwardFiles(plan) {
  for (const file of plan.files || []) {
    const localPath = path.join(forwardDir, ...file.relativePath.split("/"));
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, file.content);
  }
}

async function applyForwardRule(rule) {
  if (serviceMode !== "docker") {
    return { ok: false, output: "forward engines currently require docker agent mode" };
  }

  const plan = buildForwardPlan(rule, {
    hostDir: forwardHostDir,
    singBoxImage: singboxImage,
    realmImage,
    gostImage
  });

  writeForwardFiles(plan);
  await runDocker(["rm", "-f", plan.container.name]);

  const imageReady = await ensureDockerImage(plan.container.image);
  if (!imageReady.ok) {
    return {
      ok: false,
      output: `image preflight failed for ${plan.rule.engine}: ${imageReady.output}`,
      errorType: "image_pull_failed",
      image: plan.container.image
    };
  }

  const args = ["run", "-d", "--name", plan.container.name, "--restart", "unless-stopped", "--network", plan.container.networkMode];
  for (const mount of plan.container.mounts || []) {
    args.push("-v", `${mount.hostPath}:${mount.containerPath}${mount.readOnly ? ":ro" : ""}`);
  }
  args.push(plan.container.image, ...(plan.container.command || []));

  const result = await runDocker(args, { timeout: 120000 });
  if (!result.ok) return result;
  return { ok: true, output: `${plan.rule.engine} forward ${plan.rule.name} is active on ${plan.rule.listen}:${plan.rule.port}` };
}

async function removeForwardRule(rule) {
  if (serviceMode !== "docker") {
    return { ok: false, output: "forward engines currently require docker agent mode" };
  }

  const plan = buildForwardPlan(rule, {
    hostDir: forwardHostDir,
    singBoxImage: singboxImage,
    realmImage,
    gostImage
  });
  const result = await runDocker(["rm", "-f", plan.container.name]);
  const output = result.ok || /No such container/i.test(result.output || "") ? "forward removed" : result.output;
  fs.rmSync(path.join(forwardDir, plan.rule.id), { recursive: true, force: true });
  return { ok: result.ok || /No such container/i.test(result.output || ""), output };
}

async function handle(ws, msg) {
  if (msg.command === "service") return { commandId: msg.id, ...(await service(msg.payload.action)) };
  if (msg.command === "read_config") return { commandId: msg.id, ok: true, output: JSON.stringify(readConfig(), null, 2), config: readConfig() };
  if (msg.command === "apply_config") return { commandId: msg.id, ...(await writeConfig(msg.payload.config, msg.payload.restart)) };
  if (msg.command === "apply_forward_rule") return { commandId: msg.id, ...(await applyForwardRule(msg.payload.rule || msg.payload)) };
  if (msg.command === "remove_forward_rule") return { commandId: msg.id, ...(await removeForwardRule(msg.payload.rule || msg.payload)) };
  if (msg.command === "forward_image_probe") return { commandId: msg.id, ...(await probeForwardImage(msg.payload.engine)) };
  if (msg.command === "proxy_check") return { commandId: msg.id, ...(await runProxyCheck(msg.payload || {})) };
  if (msg.command === "exec") return { commandId: msg.id, ...(await runShell(msg.payload.command, { commandId: msg.id, timeout: Number(msg.payload?.timeoutMs || 30000) || 30000 })) };
  if (msg.command === "uninstall_agent") {
    if (serviceMode === "docker") {
      const removeSingbox = msg.payload?.removeSingbox ? "docker rm -f chiken-singbox || true;" : "";
      runShell(`sh -c '(${removeSingbox} sleep 1; docker rm -f chiken-agent) >/tmp/chiken-uninstall.log 2>&1 &'`);
      return { commandId: msg.id, ok: true, output: "agent uninstall scheduled" };
    }
    runShell("sh -c '(sleep 1; systemctl disable --now chiken-agent || true; rm -f /etc/systemd/system/chiken-agent.service) >/tmp/chiken-uninstall.log 2>&1 &'");
    return { commandId: msg.id, ok: true, output: "agent uninstall scheduled" };
  }
  if (msg.command === "tail_logs") {
    const result = await tailLogs(msg.payload.lines);
    for (const line of result.output.split("\n")) ws.send(JSON.stringify({ type: "log", line }));
    return { commandId: msg.id, ok: result.ok, output: `${result.output.split("\n").length} log lines sent` };
  }
  if (msg.command === "preset") {
    if (msg.payload.type === "service") return { commandId: msg.id, ...(await service(msg.payload.action)) };
    if (msg.payload.type === "logs") return { commandId: msg.id, ...(await tailLogs(msg.payload.lines)) };
    if (msg.payload.type === "config") return { commandId: msg.id, ...(await validateConfig()) };
  }
  if (msg.command === "cancel") {
    const targetId = cleanText(msg.payload?.commandId);
    const child = activeProcesses.get(targetId);
    if (!child) return { commandId: msg.id, ok: false, output: `command ${targetId || "unknown"} is not running`, cancelled: false };
    const terminated = terminateProcessTree(child, "SIGTERM");
    if (terminated) setTimeout(() => terminateProcessTree(child, "SIGKILL"), 1000).unref();
    return {
      commandId: msg.id,
      ok: terminated,
      output: terminated ? `terminated command ${targetId}` : `failed to terminate command ${targetId}`,
      cancelled: terminated,
      targetCommandId: targetId
    };
  }
  if (msg.command === "ping") return { commandId: msg.id, ok: true, output: "pong", version: agentVersion };
  return { commandId: msg.id, ok: false, output: "unknown command" };
}

async function buildAgentHello(state) {
  return {
    ...state,
    name: process.env.CHIKEN_AGENT_NAME || state.name || os.hostname(),
    host: process.env.CHIKEN_AGENT_HOST || os.hostname(),
    ip:
      process.env.CHIKEN_AGENT_IP ||
      Object.values(os.networkInterfaces())
        .flat()
        .find((item) => item && !item.internal && item.family === "IPv4")?.address ||
      "-",
    ...systemIdentity(),
    version: agentVersion,
    singboxVersion: await singboxVersion(),
    singboxStatus: (await service("status")).output || "unknown",
    metrics: await collectProbe().catch(() => null)
  };
}

async function buildHeartbeatStatus() {
  return {
    ...systemIdentity(),
    singboxStatus: (await service("status")).output || "unknown",
    metrics: await collectProbe().catch(() => null)
  };
}

async function connect() {
  const state = readState();
  const server = process.env.CHIKEN_SERVER || "ws://127.0.0.1:7788/agent";
  const token = process.env.CHIKEN_TOKEN || "";
  const ws = new WebSocket(server, {
    cert: process.env.CHIKEN_CERT ? fs.readFileSync(process.env.CHIKEN_CERT) : undefined,
    key: process.env.CHIKEN_KEY ? fs.readFileSync(process.env.CHIKEN_KEY) : undefined,
    ca: process.env.CHIKEN_CA ? fs.readFileSync(process.env.CHIKEN_CA) : undefined
  });

  let heartbeatTimer = null;
  let reconnectDelayMs = 1000;
  const maxReconnectDelayMs = 60000;
  const runningCommands = new Set();

  ws.on("open", async () => {
    reconnectDelayMs = 1000;
    ws.send(
      JSON.stringify({
        type: "hello",
        token,
        agent: await buildAgentHello(state)
      })
    );

    heartbeatTimer = setInterval(async () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ type: "heartbeat", status: await buildHeartbeatStatus() }));
      } catch {}
    }, probeIntervalMs);
  });

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || !msg.command || typeof msg.command !== "string") return;
    if (!msg.id || typeof msg.id !== "string") return;

    if (runningCommands.has(msg.id) || recentCommandIds.has(msg.id)) {
      ws.send(JSON.stringify({ type: "command_result", commandId: msg.id, ok: false, output: "duplicate command id" }));
      return;
    }
    runningCommands.add(msg.id);

    try {
      const result = await handle(ws, msg);
      ws.send(JSON.stringify({ type: "command_result", ...result, log: result.output }));
      if (result.config) ws.send(JSON.stringify({ type: "config", config: result.config }));
    } catch (error) {
      ws.send(JSON.stringify({ type: "command_result", commandId: msg.id, ok: false, output: error.message }));
    } finally {
      runningCommands.delete(msg.id);
      recentCommandIds.set(msg.id, Date.now());
      while (recentCommandIds.size > recentCommandLimit) {
        recentCommandIds.delete(recentCommandIds.keys().next().value);
      }
    }
  });

  ws.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    const delay = Math.floor(reconnectDelayMs + Math.random() * 1000);
    reconnectDelayMs = Math.min(maxReconnectDelayMs, Math.floor(reconnectDelayMs * 1.8));
    setTimeout(connect, delay);
  });

  ws.on("error", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  });
}

connect();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
