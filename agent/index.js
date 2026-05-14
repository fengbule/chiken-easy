import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { nanoid } from "nanoid";

const stateDir = process.env.CHIKEN_AGENT_STATE || path.resolve("agent-state");
const stateFile = path.join(stateDir, "agent.json");
const configPath = process.env.SINGBOX_CONFIG || "/etc/sing-box/config.json";
const backupDir = process.env.SINGBOX_BACKUP_DIR || "/etc/sing-box/chiken-backups";
const serviceMode = process.env.CHIKEN_SERVICE_MODE || (process.platform === "win32" ? "mock" : "systemd");
const singboxContainer = process.env.SINGBOX_CONTAINER || "chiken-singbox";
const singboxImage = process.env.SINGBOX_IMAGE || "ghcr.io/sagernet/sing-box:latest";
const singboxConfigVolume = process.env.SINGBOX_CONFIG_VOLUME || "chiken-singbox-config";
fs.mkdirSync(stateDir, { recursive: true });

function readState() {
  if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const state = { id: nanoid(), name: os.hostname(), tags: [] };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return state;
}

function run(cmd, args = []) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, output: `${stdout || ""}${stderr || ""}`.trim(), code: error?.code || 0 });
    });
  });
}

async function service(action) {
  const name = process.env.SINGBOX_SERVICE || "sing-box";
  if (serviceMode === "mock") return { ok: true, output: `mock ${action} ${name}` };
  if (serviceMode === "docker") {
    if (action === "status") {
      const result = await run("docker", ["inspect", "-f", "{{.State.Status}}", singboxContainer]);
      return { ...result, output: result.output === "running" ? "active" : result.output };
    }
    return run("docker", [action, singboxContainer]);
  }
  if (action === "status") return run("systemctl", ["is-active", name]);
  return run("systemctl", [action, name]);
}

async function singboxVersion() {
  if (serviceMode === "docker") {
    const result = await run("docker", ["exec", singboxContainer, "sing-box", "version"]);
    return result.output.split(/\s+/).find((x) => /^\d+\.\d+/.test(x)) || "-";
  }
  const result = await run(process.env.SINGBOX_BIN || "sing-box", ["version"]);
  return result.output.split(/\s+/).find((x) => /^\d+\.\d+/.test(x)) || "-";
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

async function writeConfig(config, restart) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  if (fs.existsSync(configPath)) {
    const backup = path.join(backupDir, `config.${Date.now()}.json`);
    fs.copyFileSync(configPath, backup);
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  const check = serviceMode === "docker"
    ? await run("docker", ["run", "--rm", "-v", `${singboxConfigVolume}:/etc/sing-box`, singboxImage, "check", "-c", configPath])
    : await run(process.env.SINGBOX_BIN || "sing-box", ["check", "-c", configPath]);
  if (!check.ok) return check;
  if (restart) return service("restart");
  return { ok: true, output: "config applied" };
}

async function tailLogs(lines = 200) {
  if (serviceMode === "mock") return { ok: true, output: "mock log: sing-box running" };
  if (serviceMode === "docker") return run("docker", ["logs", "--tail", String(lines), singboxContainer]);
  return run("journalctl", ["-u", process.env.SINGBOX_SERVICE || "sing-box", "-n", String(lines), "--no-pager"]);
}

async function handle(ws, msg) {
  if (msg.command === "service") return { commandId: msg.id, ...(await service(msg.payload.action)) };
  if (msg.command === "read_config") return { commandId: msg.id, ok: true, output: JSON.stringify(readConfig(), null, 2), config: readConfig() };
  if (msg.command === "apply_config") return { commandId: msg.id, ...(await writeConfig(msg.payload.config, msg.payload.restart)) };
  if (msg.command === "tail_logs") {
    const result = await tailLogs(msg.payload.lines);
    for (const line of result.output.split("\n")) ws.send(JSON.stringify({ type: "log", line }));
    return { commandId: msg.id, ok: result.ok, output: `${result.output.split("\n").length} log lines sent` };
  }
  if (msg.command === "preset") {
    if (msg.payload.type === "service") return { commandId: msg.id, ...(await service(msg.payload.action)) };
    if (msg.payload.type === "logs") return { commandId: msg.id, ...(await tailLogs(msg.payload.lines)) };
    if (msg.payload.type === "config") return { commandId: msg.id, ...(await run(process.env.SINGBOX_BIN || "sing-box", ["check", "-c", configPath])) };
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
    ws.send(JSON.stringify({
      type: "hello",
      token,
      agent: {
        ...state,
        host: os.hostname(),
        ip: Object.values(os.networkInterfaces()).flat().find((i) => i && !i.internal && i.family === "IPv4")?.address || "-",
        os: process.platform,
        arch: process.arch,
        singboxVersion: await singboxVersion(),
        singboxStatus: (await service("status")).output || "unknown"
      }
    }));
    setInterval(async () => {
      ws.send(JSON.stringify({ type: "heartbeat", status: { singboxStatus: (await service("status")).output || "unknown" } }));
    }, 15000);
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
