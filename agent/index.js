import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { exec, execFile } from "child_process";
import net from "net";
import { nanoid } from "nanoid";
import { buildForwardPlan } from "../server/configFactory.js";

const stateDir = process.env.CHIKEN_AGENT_STATE || path.resolve("agent-state");
const stateFile = path.join(stateDir, "agent.json");
const configPath = process.env.SINGBOX_CONFIG || "/etc/sing-box/config.json";
const backupDir = process.env.SINGBOX_BACKUP_DIR || "/etc/sing-box/chiken-backups";
const forwardDir = process.env.CHIKEN_FORWARDER_DIR || path.resolve("forwarders");
const forwardHostDir = process.env.CHIKEN_FORWARDER_HOST_DIR || forwardDir;
const serviceMode = process.env.CHIKEN_SERVICE_MODE || (process.platform === "win32" ? "mock" : "systemd");
const singboxContainer = process.env.SINGBOX_CONTAINER || "chiken-singbox";
const singboxImage = process.env.SINGBOX_IMAGE || "ghcr.io/sagernet/sing-box:latest";
const singboxConfigVolume = process.env.SINGBOX_CONFIG_VOLUME || "chiken-singbox-config";
const realmImage = process.env.CHIKEN_REALM_IMAGE || "4points/realm:latest";
const gostImage = process.env.CHIKEN_GOST_IMAGE || "gogost/gost:latest";
const heartbeatInterval = Math.max(2000, Number(process.env.CHIKEN_HEARTBEAT_INTERVAL || 5000) || 5000);
const hostProcDir = process.env.CHIKEN_HOST_PROC || "/proc";
const hostEtcDir = process.env.CHIKEN_HOST_ETC || "/etc";
const diskPath = process.env.CHIKEN_DISK_PATH || "/";
const preferredInterfaces = String(process.env.CHIKEN_NET_INTERFACES || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const virtualInterfacePattern = /^(lo|docker\d*|br-|veth|virbr|vmnet|vboxnet|cni|flannel|kube-ipvs|tailscale|zt|wg|tun|tap)/i;

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(forwardDir, { recursive: true });

let previousCpuSnapshot = null;
let previousNetworkSnapshot = null;

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

function runShell(command, options = {}) {
  return new Promise((resolve) => {
    exec(command, { timeout: 30000, maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout || ""}${stderr || ""}`.trim(), code: error?.code || 0 });
    });
  });
}

async function runDocker(args, options = {}) {
  return run("docker", args, { timeout: 60000, ...options });
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

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function readTextIfExists(file) {
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  } catch {}
  return "";
}

function hostProcFile(name) {
  const first = path.join(hostProcDir, name);
  if (fs.existsSync(first)) return first;
  return path.join("/proc", name);
}

function parseOsRelease(text = "") {
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index);
        const value = line.slice(index + 1).replace(/^["']|["']$/g, "");
        return [key, value];
      })
  );
}

function systemProbe() {
  const hostRootCandidates = [
    "/host/usr-lib/os-release",
    path.join(hostProcDir, "1/root/etc/os-release"),
    path.join(hostProcDir, "1/root/usr/lib/os-release"),
    path.join(hostEtcDir, "os-release"),
    "/host/etc/os-release",
    "/etc/os-release",
    "/usr/lib/os-release"
  ];
  const release = parseOsRelease(hostRootCandidates.map((file) => readTextIfExists(file)).find(Boolean) || "");
  const kernel = readTextIfExists(hostProcFile("sys/kernel/osrelease")).trim() || os.release();
  return {
    platform: process.platform,
    arch: process.arch,
    distro: release.PRETTY_NAME || release.NAME || process.platform,
    distroId: release.ID || "",
    distroVersion: release.VERSION_ID || release.VERSION || "",
    kernel
  };
}

function meminfoValues() {
  const text = readTextIfExists(hostProcFile("meminfo"));
  if (!text) return null;
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((row) => row.length >= 2)
      .map(([key, value]) => [key.replace(":", ""), Number(value) * 1024])
  );
}

function uptimeProbe() {
  const text = readTextIfExists(hostProcFile("uptime"));
  const seconds = Number(text.trim().split(/\s+/)[0]);
  return Number.isFinite(seconds) ? Math.floor(seconds) : Math.floor(os.uptime());
}

function loadProbe() {
  const text = readTextIfExists(hostProcFile("loadavg"));
  const values = text
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((value) => round(Number(value), 2));
  return values.every((value) => Number.isFinite(value)) ? values : os.loadavg().map((value) => round(value, 2));
}

function cpuSnapshot() {
  const rows = os.cpus();
  const total = rows.reduce(
    (sum, cpu) => sum + Object.values(cpu.times).reduce((itemSum, value) => itemSum + value, 0),
    0
  );
  const idle = rows.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  return { total, idle, at: Date.now() };
}

function cpuUsage() {
  const next = cpuSnapshot();
  const previous = previousCpuSnapshot;
  previousCpuSnapshot = next;
  if (!previous) return null;

  const totalDelta = next.total - previous.total;
  const idleDelta = next.idle - previous.idle;
  if (totalDelta <= 0) return null;
  return round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)), 1);
}

function memoryProbe() {
  const values = meminfoValues();
  if (values?.MemTotal) {
    const total = values.MemTotal || 0;
    const free = values.MemAvailable ?? values.MemFree ?? 0;
    const used = Math.max(0, total - free);
    return {
      total,
      free,
      used,
      usage: total ? round((used / total) * 100, 1) : null
    };
  }
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    total,
    free,
    used,
    usage: total ? round((used / total) * 100, 1) : null
  };
}

async function swapProbe() {
  if (process.platform !== "linux") return null;
  const values = meminfoValues();
  if (!values) return null;
  const total = values.SwapTotal || 0;
  const free = values.SwapFree || 0;
  const used = Math.max(0, total - free);
  return {
    total,
    free,
    used,
    usage: total ? round((used / total) * 100, 1) : 0
  };
}

async function diskProbe() {
  const candidates = [...new Set([String(diskPath || "/").trim() || "/", "/host/proc/1/root", "/"] )];
  for (const candidate of candidates) {
    const safePath = candidate.replace(/'/g, "'\\''");
    const result = await runShell(`df -kP '${safePath}' 2>/dev/null | tail -n 1`);
    if (!result.ok || !result.output) continue;
    const line = result.output
      .split("\n")
      .map((row) => row.trim())
      .filter(Boolean)
      .find((row) => /^\S+\s+\d+\s+\d+\s+\d+\s+\d+%\s+/.test(row));
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) continue;
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const free = Number(parts[3]) * 1024;
    if (!Number.isFinite(total) || total <= 0) continue;
    return {
      mount: parts.slice(5).join(" "),
      total,
      used,
      free,
      usage: total ? round((used / total) * 100, 1) : null
    };
  }
  return null;
}

function shouldCountInterface(iface) {
  if (preferredInterfaces.length) return preferredInterfaces.includes(iface);
  return !virtualInterfacePattern.test(iface);
}

function networkTotals() {
  const netDevPath = hostProcFile("net/dev");
  if (!fs.existsSync(netDevPath)) return null;
  const rows = fs.readFileSync(netDevPath, "utf8").split("\n").slice(2);
  const parsed = rows
    .map((row) => {
      const [ifaceRaw, valuesRaw] = row.trim().split(":");
      if (!ifaceRaw || !valuesRaw) return null;
      const iface = ifaceRaw.trim();
      const values = valuesRaw.trim().split(/\s+/).map(Number);
      return { iface, rxBytes: values[0] || 0, txBytes: values[8] || 0 };
    })
    .filter(Boolean);
  const selected = parsed.filter((row) => shouldCountInterface(row.iface));
  const counted = selected.length ? selected : parsed.filter((row) => row.iface !== "lo");
  const totals = counted.reduce(
    (sum, row) => {
      sum.rxBytes += row.rxBytes;
      sum.txBytes += row.txBytes;
      sum.interfaces += 1;
      return sum;
    },
    { rxBytes: 0, txBytes: 0, interfaces: 0 }
  );
  return { ...totals, at: Date.now() };
}

function networkProbe() {
  const next = networkTotals();
  if (!next) return null;
  const previous = previousNetworkSnapshot;
  previousNetworkSnapshot = next;
  if (!previous) return { ...next, rawRxBytes: next.rxBytes, rawTxBytes: next.txBytes, rxSpeed: null, txSpeed: null, rxDelta: 0, txDelta: 0, sampleInterval: 0 };

  const seconds = Math.max(1, (next.at - previous.at) / 1000);
  const rxDelta = next.rxBytes >= previous.rxBytes ? next.rxBytes - previous.rxBytes : next.rxBytes;
  const txDelta = next.txBytes >= previous.txBytes ? next.txBytes - previous.txBytes : next.txBytes;
  return {
    ...next,
    rawRxBytes: next.rxBytes,
    rawTxBytes: next.txBytes,
    rxDelta,
    txDelta,
    sampleInterval: round(seconds, 3),
    rxSpeed: round(Math.max(0, rxDelta) / seconds, 1),
    txSpeed: round(Math.max(0, txDelta) / seconds, 1)
  };
}

async function processCount() {
  if (process.platform === "win32") return null;
  try {
    const rows = fs.readdirSync(hostProcDir).filter((item) => /^\d+$/.test(item));
    if (rows.length) return rows.length;
  } catch {}
  const result = await runShell("ps -e --no-headers 2>/dev/null | wc -l");
  const value = Number(result.output);
  return Number.isFinite(value) ? value : null;
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

async function icmpProbe(task) {
  const target = String(task.target || "").trim();
  const timeoutSeconds = Math.max(1, Math.ceil(Number(task.timeout || 5000) / 1000));
  const command = process.platform === "win32" ? `ping -n 1 -w ${timeoutSeconds * 1000} ${target}` : `ping -c 1 -W ${timeoutSeconds} ${target}`;
  const started = nowMs();
  const result = await runShell(command, { timeout: Number(task.timeout || 5000) + 1000 });
  const latencyMatch = result.output.match(/time[=<]([\d.]+)\s*ms/i);
  return {
    ok: result.ok,
    latency: latencyMatch ? Number(latencyMatch[1]) : nowMs() - started,
    output: result.output.slice(0, 500)
  };
}

function tcpProbe(task) {
  const target = String(task.target || "").trim();
  const port = Number(task.port || 80) || 80;
  const timeout = Number(task.timeout || 5000) || 5000;
  const started = nowMs();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target, port }, () => {
      socket.end();
      resolve({ ok: true, latency: nowMs() - started, output: `tcp ok ${target}:${port}` });
    });
    socket.setTimeout(timeout);
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, latency: nowMs() - started, output: `tcp timeout ${target}:${port}` });
    });
    socket.on("error", (error) => resolve({ ok: false, latency: nowMs() - started, output: error.message }));
  });
}

async function httpProbe(task) {
  const target = String(task.target || "").trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(task.timeout || 5000) || 5000);
  const started = nowMs();
  try {
    const response = await fetch(target, { method: task.method || "GET", signal: controller.signal });
    return {
      ok: response.ok,
      latency: nowMs() - started,
      status: response.status,
      output: `${response.status} ${response.statusText}`
    };
  } catch (error) {
    return { ok: false, latency: nowMs() - started, output: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function runProbeTask(task = {}) {
  const type = String(task.type || "tcp").toLowerCase();
  let result;
  if (type === "icmp") result = await icmpProbe(task);
  else if (type === "http") result = await httpProbe(task);
  else result = await tcpProbe(task);
  return {
    taskId: task.id,
    type,
    target: task.target,
    port: task.port,
    ok: Boolean(result.ok),
    latency: Number.isFinite(Number(result.latency)) ? Math.round(Number(result.latency) * 10) / 10 : null,
    status: result.status || null,
    output: String(result.output || "").slice(0, 500)
  };
}

async function collectProbe() {
  const [disk, swap, processes] = await Promise.all([diskProbe(), swapProbe(), processCount()]);
  return {
    updatedAt: new Date().toISOString(),
    uptime: uptimeProbe(),
    system: systemProbe(),
    load: loadProbe(),
    cpu: {
      usage: cpuUsage(),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || ""
    },
    memory: memoryProbe(),
    swap,
    disk,
    network: networkProbe(),
    process: { count: processes }
  };
}

async function collectStatus() {
  return {
    singboxStatus: (await service("status")).output || "unknown",
    probe: await collectProbe()
  };
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
  if (msg.command === "exec") return { commandId: msg.id, ...(await runShell(msg.payload.command)) };
  if (msg.command === "probe_task") {
    const probeResult = await runProbeTask(msg.payload.task || msg.payload);
    return { commandId: msg.id, ok: probeResult.ok, output: probeResult.output, probeResult };
  }
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
  return { commandId: msg.id, ok: false, output: "unknown command" };
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

  ws.on("open", async () => {
    const status = await collectStatus();
    ws.send(
      JSON.stringify({
        type: "hello",
        token,
        agent: {
          ...state,
          name: process.env.CHIKEN_AGENT_NAME || state.name || os.hostname(),
          host: process.env.CHIKEN_AGENT_HOST || os.hostname(),
          ip: process.env.CHIKEN_AGENT_IP || Object.values(os.networkInterfaces()).flat().find((item) => item && !item.internal && item.family === "IPv4")?.address || "-",
          os: process.platform,
          arch: process.arch,
          singboxVersion: await singboxVersion(),
          ...status
        }
      })
    );

    setInterval(async () => {
      ws.send(JSON.stringify({ type: "heartbeat", status: await collectStatus() }));
    }, heartbeatInterval);
  });

  ws.on("message", async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (!msg.command) return;
    try {
      const result = await handle(ws, msg);
      ws.send(JSON.stringify({ type: "command_result", ...result, log: result.output }));
      if (result.config) ws.send(JSON.stringify({ type: "config", config: result.config }));
    } catch (error) {
      ws.send(JSON.stringify({ type: "command_result", commandId: msg.id, ok: false, output: error.message }));
    }
  });

  ws.on("close", () => setTimeout(connect, 5000));
  ws.on("error", () => {});
}

connect();
