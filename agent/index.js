import WebSocket from "ws";
import os from "os";
import fs from "fs";
import path from "path";
import { exec, execFile } from "child_process";
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

fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(forwardDir, { recursive: true });

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
          singboxStatus: (await service("status")).output || "unknown"
        }
      })
    );

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
