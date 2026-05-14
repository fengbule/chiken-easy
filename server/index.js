import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const webDist = path.join(root, "dist");
const stateFile = path.join(dataDir, "state.json");
const auditFile = path.join(dataDir, "audit.jsonl");

fs.mkdirSync(dataDir, { recursive: true });

const defaultState = {
  tokens: [],
  agents: {},
  configVersions: {},
  commands: [
    { id: "status", label: "查询 sing-box 状态", type: "service", action: "status" },
    { id: "restart", label: "重启 sing-box", type: "service", action: "restart" },
    { id: "tail", label: "读取最近日志", type: "logs", lines: 200 },
    { id: "validate", label: "校验当前配置", type: "config", action: "validate" }
  ]
};

const loadState = () => {
  if (!fs.existsSync(stateFile)) return structuredClone(defaultState);
  return { ...structuredClone(defaultState), ...JSON.parse(fs.readFileSync(stateFile, "utf8")) };
};

let state = loadState();
if (process.env.CHIKEN_BOOTSTRAP_TOKEN && !state.tokens.some((item) => item.token === process.env.CHIKEN_BOOTSTRAP_TOKEN)) {
  state.tokens.push({ token: process.env.CHIKEN_BOOTSTRAP_TOKEN, createdAt: new Date().toISOString(), used: false, bootstrap: true });
}
const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const clients = new Map();
const logStreams = new Map();

function audit(actor, action, target, detail = {}) {
  const row = { id: nanoid(), at: new Date().toISOString(), actor, action, target, detail };
  fs.appendFileSync(auditFile, JSON.stringify(row) + "\n");
  return row;
}

function publicAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    host: agent.host,
    ip: agent.ip,
    arch: agent.arch,
    os: agent.os,
    tags: agent.tags || [],
    singboxVersion: agent.singboxVersion || "-",
    singboxStatus: agent.singboxStatus || "unknown",
    connected: clients.has(agent.id),
    lastSeen: agent.lastSeen,
    certFingerprint: agent.certFingerprint || "-",
    registeredAt: agent.registeredAt
  };
}

function sendCommand(agentId, command, payload = {}) {
  const ws = clients.get(agentId);
  if (!ws || ws.readyState !== ws.OPEN) throw new Error("agent offline");
  const id = nanoid();
  ws.send(JSON.stringify({ id, command, payload }));
  return id;
}

function pushLog(agentId, line) {
  const sinks = logStreams.get(agentId);
  if (!sinks) return;
  for (const res of sinks) res.write(`data: ${JSON.stringify(line)}\n\n`);
}

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_, res) => res.json({ ok: true, name: "chiken-easy" }));

app.get("/api/dashboard", (_, res) => {
  const agents = Object.values(state.agents).map(publicAgent);
  res.json({
    total: agents.length,
    online: agents.filter((a) => a.connected).length,
    offline: agents.filter((a) => !a.connected).length,
    activeSingbox: agents.filter((a) => a.singboxStatus === "active").length,
    recent: agents.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 8)
  });
});

app.get("/api/agents", (_, res) => res.json(Object.values(state.agents).map(publicAgent)));
app.get("/api/agents/:id", (req, res) => {
  const agent = state.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: "agent not found" });
  res.json(publicAgent(agent));
});

app.post("/api/tokens", (_, res) => {
  const token = `ce_${nanoid(32)}`;
  const item = { token, createdAt: new Date().toISOString(), used: false };
  state.tokens.push(item);
  saveState();
  audit("admin", "create_token", "-", { token: token.slice(0, 10) + "..." });
  res.json(item);
});

app.post("/api/agents/:id/service/:action", (req, res) => {
  const { id, action } = req.params;
  if (!["start", "stop", "restart", "status"].includes(action)) return res.status(400).json({ error: "bad action" });
  try {
    const commandId = sendCommand(id, "service", { action });
    audit("admin", `service_${action}`, id, { commandId });
    res.json({ ok: true, commandId, config: state.agents[req.params.id]?.lastConfig || null });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.get("/api/agents/:id/config", (req, res) => {
  try {
    const commandId = sendCommand(req.params.id, "read_config");
    audit("admin", "read_config", req.params.id, { commandId });
    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/config", (req, res) => {
  const { config, restart = true } = req.body;
  if (!config || typeof config !== "object") return res.status(400).json({ error: "config object required" });
  const version = { id: nanoid(), at: new Date().toISOString(), status: "pending", config };
  state.configVersions[req.params.id] ||= [];
  state.configVersions[req.params.id].unshift(version);
  state.configVersions[req.params.id] = state.configVersions[req.params.id].slice(0, 30);
  saveState();
  try {
    const commandId = sendCommand(req.params.id, "apply_config", { config, restart, versionId: version.id });
    audit("admin", "apply_config", req.params.id, { commandId, versionId: version.id, restart });
    res.json({ ok: true, commandId, versionId: version.id });
  } catch (error) {
    res.status(409).json({ error: error.message, versionId: version.id });
  }
});

app.get("/api/agents/:id/config/versions", (req, res) => res.json(state.configVersions[req.params.id] || []));

app.post("/api/agents/:id/config/rollback/:versionId", (req, res) => {
  const version = (state.configVersions[req.params.id] || []).find((v) => v.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: "version not found" });
  try {
    const commandId = sendCommand(req.params.id, "apply_config", { config: version.config, restart: true, rollback: true });
    audit("admin", "rollback_config", req.params.id, { commandId, versionId: version.id });
    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/commands/:commandId", (req, res) => {
  const preset = state.commands.find((item) => item.id === req.params.commandId);
  if (!preset) return res.status(404).json({ error: "command not found" });
  try {
    const commandId = sendCommand(req.params.id, "preset", preset);
    audit("admin", "run_preset", req.params.id, { commandId, preset: preset.id });
    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.get("/api/agents/:id/logs/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const set = logStreams.get(req.params.id) || new Set();
  set.add(res);
  logStreams.set(req.params.id, set);
  try { sendCommand(req.params.id, "tail_logs", { lines: Number(req.query.lines || 200), follow: true }); } catch {}
  req.on("close", () => set.delete(res));
});

app.get("/api/audit", (_, res) => {
  if (!fs.existsSync(auditFile)) return res.json([]);
  const rows = fs.readFileSync(auditFile, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  res.json(rows.reverse().slice(0, 300));
});

if (fs.existsSync(webDist)) app.use(express.static(webDist));
app.get("*", (_, res, next) => {
  const index = path.join(webDist, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/agent" });

wss.on("connection", (ws, req) => {
  let agentId = "";
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === "hello") {
      const token = state.tokens.find((item) => item.token === msg.token && !item.revoked);
      if (!token && process.env.CHIKEN_ALLOW_OPEN_REGISTER !== "1") {
        ws.send(JSON.stringify({ type: "error", error: "invalid token" }));
        return ws.close();
      }
      agentId = msg.agent.id || nanoid();
      state.agents[agentId] = {
        ...(state.agents[agentId] || {}),
        ...msg.agent,
        id: agentId,
        registeredAt: state.agents[agentId]?.registeredAt || new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      if (token) token.used = true;
      clients.set(agentId, ws);
      saveState();
      audit("agent", "agent_online", agentId, { host: msg.agent.host, ip: msg.agent.ip });
      ws.send(JSON.stringify({ type: "welcome", id: agentId }));
      return;
    }
    if (!agentId) return;
    if (msg.type === "heartbeat") {
      Object.assign(state.agents[agentId], msg.status, { lastSeen: new Date().toISOString() });
      saveState();
    }
    if (msg.type === "log") pushLog(agentId, { at: new Date().toISOString(), line: msg.line });
    if (msg.type === "command_result") {
      audit("agent", "command_result", agentId, { commandId: msg.commandId, ok: msg.ok, output: String(msg.output || "").slice(0, 1000) });
      if (msg.log) pushLog(agentId, { at: new Date().toISOString(), line: msg.log });
    }
    if (msg.type === "config") {
      state.agents[agentId].lastConfig = msg.config;
      state.agents[agentId].lastSeen = new Date().toISOString();
      saveState();
      audit("agent", "config_read", agentId, { bytes: JSON.stringify(msg.config || {}).length });
      pushLog(agentId, { at: new Date().toISOString(), line: `[config] ${JSON.stringify(msg.config)}` });
    }
  });
  ws.on("close", () => {
    if (!agentId) return;
    clients.delete(agentId);
    if (state.agents[agentId]) state.agents[agentId].lastSeen = new Date().toISOString();
    saveState();
    audit("agent", "agent_offline", agentId);
  });
});

const port = Number(process.env.PORT || 7788);
server.listen(port, () => console.log(`chiken-easy server listening on :${port}`));
