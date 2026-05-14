import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Client as SshClient } from "ssh2";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildConfig, buildForwardConfig, buildForwardRule, forwardCatalog, protocolCatalog } from "./configFactory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const webDist = path.join(root, "dist");
const stateFile = path.join(dataDir, "state.json");
const auditFile = path.join(dataDir, "audit.jsonl");

fs.mkdirSync(dataDir, { recursive: true });

const defaultState = {
  tokens: [],
  apiTokens: [],
  agents: {},
  configVersions: {},
  forwardRules: {},
  sshProfiles: {},
  commands: [
    { id: "status", label: "查询 sing-box 状态", type: "service", action: "status" },
    { id: "restart", label: "重启 sing-box", type: "service", action: "restart" },
    { id: "tail", label: "读取最近日志", type: "logs", lines: 200 },
    { id: "validate", label: "校验当前配置", type: "config", action: "validate" }
  ]
};

const loadState = () => {
  if (!fs.existsSync(stateFile)) return structuredClone(defaultState);
  const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  return { ...structuredClone(defaultState), ...raw };
};

let state = loadState();

if (process.env.CHIKEN_BOOTSTRAP_TOKEN && !state.tokens.some((item) => item.token === process.env.CHIKEN_BOOTSTRAP_TOKEN)) {
  state.tokens.push({ token: process.env.CHIKEN_BOOTSTRAP_TOKEN, createdAt: new Date().toISOString(), used: false, bootstrap: true });
}

if (process.env.CHIKEN_API_TOKEN && !state.apiTokens.some((item) => item.token === process.env.CHIKEN_API_TOKEN)) {
  state.apiTokens.push({ id: "bootstrap", name: "bootstrap", token: process.env.CHIKEN_API_TOKEN, createdAt: new Date().toISOString(), bootstrap: true });
}

const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
const clients = new Map();
const logStreams = new Map();
const commandWaiters = new Map();
const configCommandRefs = new Map();
const forwardCommandRefs = new Map();

function audit(actor, action, target, detail = {}) {
  const row = { id: nanoid(), at: new Date().toISOString(), actor, action, target, detail };
  fs.appendFileSync(auditFile, JSON.stringify(row) + "\n");
  return row;
}

function getAgent(agentId) {
  return state.agents[agentId] || null;
}

function getSshProfile(agentId) {
  const agent = getAgent(agentId);
  const saved = state.sshProfiles?.[agentId] || {};
  return {
    host: String(saved.host || agent?.ip || agent?.host || "").trim(),
    port: Number(saved.port || 22) || 22,
    username: String(saved.username || "root").trim() || "root",
    mode: saved.mode === "privateKey" ? "privateKey" : "password",
    password: saved.password || "",
    privateKey: saved.privateKey || "",
    updatedAt: saved.updatedAt || null
  };
}

function publicSshProfile(agentId) {
  const profile = getSshProfile(agentId);
  return {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    mode: profile.mode,
    hasPassword: Boolean(profile.password),
    hasPrivateKey: Boolean(profile.privateKey),
    ready: profile.mode === "privateKey" ? Boolean(profile.host && profile.privateKey) : Boolean(profile.host && profile.password),
    updatedAt: profile.updatedAt
  };
}

function publicAgent(agent) {
  const ssh = publicSshProfile(agent.id);
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
    registeredAt: agent.registeredAt,
    sshConfigured: ssh.ready,
    sshHost: ssh.host,
    sshPort: ssh.port,
    sshMode: ssh.mode
  };
}

function publicForwardRules(agentId) {
  return (state.forwardRules?.[agentId] || []).map((rule) => ({ ...rule }));
}

function updateConfigVersion(agentId, versionId, patch) {
  const version = (state.configVersions?.[agentId] || []).find((item) => item.id === versionId);
  if (!version) return;
  Object.assign(version, patch);
  saveState();
}

function upsertForwardRule(agentId, patch) {
  state.forwardRules ||= {};
  state.forwardRules[agentId] ||= [];
  const list = state.forwardRules[agentId];
  const index = list.findIndex((item) => item.id === patch.id);
  const current = index >= 0 ? list[index] : null;
  const next = {
    ...current,
    ...patch,
    id: patch.id || current?.id || nanoid(10),
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return next;
}

function removeForwardRule(agentId, ruleId) {
  const list = state.forwardRules?.[agentId] || [];
  state.forwardRules[agentId] = list.filter((item) => item.id !== ruleId);
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

function extractTokenFromRequest(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const headerToken = req.headers["x-api-token"];
  if (headerToken) return String(headerToken).trim();
  try {
    const url = new URL(req.originalUrl || req.url || "/", `http://${req.headers.host || "localhost"}`);
    return String(url.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
}

function validateApiToken(token) {
  const item = (state.apiTokens || []).find((row) => row.token === token && !row.revoked);
  return item || null;
}

function requestAccess(req) {
  const required = process.env.CHIKEN_REQUIRE_API_TOKEN === "1";
  const token = extractTokenFromRequest(req);
  const apiToken = token ? validateApiToken(token) : null;
  return {
    required,
    token,
    apiToken,
    authorized: Boolean(apiToken) || (!required && !token)
  };
}

function requireApiAccess(req, res, next) {
  if (!req.path.startsWith("/api/") || req.path === "/api/health") return next();
  const access = requestAccess(req);
  if (access.token && !access.apiToken) return res.status(401).json({ error: "invalid API token" });
  if (access.authorized) {
    req.apiToken = access.apiToken || null;
    return next();
  }
  return res.status(401).json({ error: "API token required" });
}

function rejectUpgrade(socket, statusCode, message) {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function ensureUpgradeAccess(req, socket) {
  const access = requestAccess(req);
  if (access.token && !access.apiToken) {
    rejectUpgrade(socket, 401, "Invalid API Token");
    return false;
  }
  if (!access.authorized) {
    rejectUpgrade(socket, 401, "API Token Required");
    return false;
  }
  return true;
}

function getSshConnectConfig(agentId, override = {}) {
  const merged = { ...getSshProfile(agentId), ...override };
  if (!merged.host) throw new Error("SSH host is required");
  if (merged.mode === "privateKey") {
    if (!String(merged.privateKey || "").trim()) throw new Error("SSH private key is required");
    return {
      host: merged.host,
      port: Number(merged.port || 22) || 22,
      username: merged.username || "root",
      privateKey: merged.privateKey,
      readyTimeout: 20000,
      keepaliveInterval: 10000
    };
  }
  if (!String(merged.password || "").trim()) throw new Error("SSH password is required");
  return {
    host: merged.host,
    port: Number(merged.port || 22) || 22,
    username: merged.username || "root",
    password: merged.password,
    readyTimeout: 20000,
    keepaliveInterval: 10000
  };
}

function execSshCommand(connectConfig, command) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn
      .on("ready", () => {
        conn.exec(command, (error, stream) => {
          if (error) {
            conn.end();
            return reject(error);
          }
          let stdout = "";
          let stderr = "";
          stream.on("close", (code) => {
            conn.end();
            resolve({
              ok: code === 0,
              code: code || 0,
              output: `${stdout}${stderr}`.trim()
            });
          });
          stream.on("data", (data) => {
            stdout += data.toString();
          });
          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", reject)
      .connect(connectConfig);
  });
}

function attachAgentExecTerminal(ws, agentId) {
  ws.send(JSON.stringify({ type: "output", output: `Connected to ${state.agents[agentId].name || agentId} via agent exec.\n$ ` }));

  ws.on("message", (raw) => {
    const text = raw.toString();
    let command = text;
    try {
      const msg = JSON.parse(text);
      if (msg && typeof msg === "object") command = msg.data ?? msg.command ?? msg.input ?? "";
    } catch {
      command = text;
    }

    command = String(command).trim();
    if (!command) {
      ws.send(JSON.stringify({ type: "output", output: "$ " }));
      return;
    }

    if (["exit", "quit", "logout"].includes(command.toLowerCase())) {
      ws.send(JSON.stringify({ type: "output", output: "terminal closed\n" }));
      ws.close();
      return;
    }

    let commandId = "";
    try {
      commandId = sendCommand(agentId, "exec", { command });
      audit("admin", "terminal_exec", agentId, { commandId, command: command.slice(0, 120), transport: "agent" });
    } catch (error) {
      ws.send(JSON.stringify({ type: "output", output: `${error.message}\n$ ` }));
      return;
    }

    commandWaiters.set(commandId, (result) => {
      ws.send(JSON.stringify({ type: "output", output: `${result.output || ""}\n$ ` }));
      commandWaiters.delete(commandId);
    });

    setTimeout(() => {
      if (!commandWaiters.has(commandId)) return;
      commandWaiters.delete(commandId);
      ws.send(JSON.stringify({ type: "output", output: "command timeout\n$ " }));
    }, 35000);
  });
}

function attachDirectSshTerminal(ws, agentId) {
  let shell = null;
  const pendingWrites = [];
  const conn = new SshClient();

  const flushPending = () => {
    if (!shell) return;
    while (pendingWrites.length) shell.write(pendingWrites.shift());
  };

  const closeAll = () => {
    try {
      shell?.end?.("exit\n");
    } catch {}
    conn.end();
  };

  conn
    .on("ready", () => {
      conn.shell({ term: "xterm-256color", cols: 120, rows: 40 }, (error, stream) => {
        if (error) {
          ws.send(JSON.stringify({ type: "output", output: `${error.message}\n` }));
          ws.close();
          conn.end();
          return;
        }
        shell = stream;
        audit("admin", "ssh_session_open", agentId, { host: getSshProfile(agentId).host });
        ws.send(JSON.stringify({ type: "output", output: `Connected to ${getSshProfile(agentId).username}@${getSshProfile(agentId).host}\n` }));
        flushPending();

        stream.on("data", (data) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "output", output: data.toString() }));
        });
        stream.stderr?.on("data", (data) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "output", output: data.toString() }));
        });
        stream.on("close", () => {
          if (ws.readyState === ws.OPEN) ws.close();
          conn.end();
        });
      });
    })
    .on("error", (error) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", output: `${error.message}\n` }));
        ws.close();
      }
    })
    .on("close", () => {
      if (ws.readyState === ws.OPEN) ws.close();
    });

  conn.connect(getSshConnectConfig(agentId));

  ws.on("message", (raw) => {
    let payload = { type: "input", data: raw.toString() };
    try {
      const parsed = JSON.parse(raw.toString());
      if (parsed && typeof parsed === "object") payload = parsed;
    } catch {}

    if (payload.type === "resize" && shell?.setWindow) {
      shell.setWindow(Number(payload.rows || 40), Number(payload.cols || 120), 0, 0);
      return;
    }

    const data = String(payload.data ?? payload.input ?? "");
    if (!data) return;
    if (shell) shell.write(data);
    else pendingWrites.push(data);
  });

  ws.on("close", () => {
    audit("admin", "ssh_session_close", agentId);
    closeAll();
  });
}

const app = express();
app.use(express.json({ limit: "4mb" }));
app.use(requireApiAccess);

app.get("/api/health", (_, res) => res.json({ ok: true, name: "chiken-easy" }));

app.get("/api/dashboard", (_, res) => {
  const agents = Object.values(state.agents).map(publicAgent);
  res.json({
    total: agents.length,
    online: agents.filter((agent) => agent.connected).length,
    offline: agents.filter((agent) => !agent.connected).length,
    activeSingbox: agents.filter((agent) => agent.singboxStatus === "active").length,
    recent: agents.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 8)
  });
});

app.get("/api/agents", (_, res) => res.json(Object.values(state.agents).map(publicAgent)));

app.get("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  res.json(publicAgent(agent));
});

app.get("/api/agents/:id/ssh-profile", (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  res.json(publicSshProfile(req.params.id));
});

app.put("/api/agents/:id/ssh-profile", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });

  const current = state.sshProfiles?.[req.params.id] || {};
  const next = {
    ...current,
    host: String(req.body?.host || current.host || agent.ip || agent.host || "").trim(),
    port: Number(req.body?.port || current.port || 22) || 22,
    username: String(req.body?.username || current.username || "root").trim() || "root",
    mode: req.body?.mode === "privateKey" ? "privateKey" : "password",
    updatedAt: new Date().toISOString()
  };

  if (req.body?.clearPassword) delete next.password;
  if (req.body?.clearPrivateKey) delete next.privateKey;
  if ("password" in (req.body || {}) && String(req.body.password || "").trim()) next.password = req.body.password;
  if ("privateKey" in (req.body || {}) && String(req.body.privateKey || "").trim()) next.privateKey = req.body.privateKey;

  state.sshProfiles ||= {};
  state.sshProfiles[req.params.id] = next;
  saveState();
  audit("admin", "save_ssh_profile", req.params.id, { host: next.host, port: next.port, mode: next.mode });
  res.json(publicSshProfile(req.params.id));
});

app.post("/api/agents/:id/ssh-profile/test", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const result = await execSshCommand(getSshConnectConfig(req.params.id, req.body || {}), "printf 'ssh ok\\n' && uname -a");
    audit("admin", "test_ssh_profile", req.params.id, { ok: result.ok });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/tokens", (_, res) => {
  const token = `ce_${nanoid(32)}`;
  const item = { token, createdAt: new Date().toISOString(), used: false };
  state.tokens.push(item);
  saveState();
  audit("admin", "create_token", "-", { token: `${token.slice(0, 10)}...` });
  res.json(item);
});

app.get("/api/api-tokens", (_, res) => {
  res.json((state.apiTokens || []).map((item) => ({ ...item, token: `${item.token.slice(0, 10)}...` })));
});

app.post("/api/api-tokens", (req, res) => {
  const item = {
    id: nanoid(),
    name: String(req.body?.name || "api").trim() || "api",
    token: `ck_${nanoid(36)}`,
    createdAt: new Date().toISOString()
  };
  state.apiTokens ||= [];
  state.apiTokens.push(item);
  saveState();
  audit("admin", "create_api_token", "-", { name: item.name });
  res.json(item);
});

app.delete("/api/api-tokens/:id", (req, res) => {
  const item = (state.apiTokens || []).find((token) => token.id === req.params.id);
  if (!item) return res.status(404).json({ error: "token not found" });
  item.revoked = true;
  saveState();
  audit("admin", "revoke_api_token", "-", { name: item.name });
  res.json({ ok: true });
});

app.get("/api/protocols", (_, res) => res.json(protocolCatalog));
app.get("/api/forwards", (_, res) => res.json(forwardCatalog));

app.post("/api/config/render", (req, res) => {
  try {
    res.json({ config: buildConfig(req.body || {}) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/forward/render", (req, res) => {
  try {
    res.json({ config: buildForwardConfig(req.body || {}) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/agents/:id/forwards", (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  res.json(publicForwardRules(req.params.id));
});

app.delete("/api/agents/:id/forwards/:ruleId", (req, res) => {
  const rules = state.forwardRules?.[req.params.id] || [];
  const rule = rules.find((item) => item.id === req.params.ruleId);
  if (!rule) return res.status(404).json({ error: "forward rule not found" });

  try {
    const commandId = sendCommand(req.params.id, "remove_forward_rule", { rule });
    forwardCommandRefs.set(commandId, { agentId: req.params.id, ruleId: rule.id, action: "remove" });
    audit("admin", "remove_forward_rule", req.params.id, { commandId, ruleId: rule.id });
    res.json({ ok: true, commandId, ruleId: rule.id });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/forward/wizard", (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const incoming = req.body || {};
    const existing = (state.forwardRules?.[req.params.id] || []).find(
      (item) => item.id === incoming.id || (!incoming.id && item.engine === incoming.engine && item.network === incoming.network && Number(item.port) === Number(incoming.port))
    );
    const rule = buildForwardRule({ ...incoming, id: existing?.id || incoming.id });
    const savedRule = upsertForwardRule(req.params.id, { ...rule, status: "pending", lastError: "" });
    saveState();
    const commandId = sendCommand(req.params.id, "apply_forward_rule", { rule: savedRule });
    forwardCommandRefs.set(commandId, { agentId: req.params.id, ruleId: savedRule.id, action: "apply" });
    audit("admin", "apply_forward_rule", req.params.id, { commandId, ruleId: savedRule.id, engine: savedRule.engine });
    res.json({ ok: true, commandId, rule: savedRule, preview: buildForwardConfig(savedRule) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/config/wizard", (req, res) => {
  try {
    const config = buildConfig(req.body || {});
    const version = { id: nanoid(), at: new Date().toISOString(), status: "pending", config };
    state.configVersions[req.params.id] ||= [];
    state.configVersions[req.params.id].unshift(version);
    state.configVersions[req.params.id] = state.configVersions[req.params.id].slice(0, 30);
    saveState();
    const commandId = sendCommand(req.params.id, "apply_config", { config, restart: true, versionId: version.id });
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
    audit("admin", "wizard_apply_config", req.params.id, { commandId, versionId: version.id, protocol: req.body?.protocol });
    res.json({ ok: true, commandId, versionId: version.id, config });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/service/:action", (req, res) => {
  const { id, action } = req.params;
  if (!["start", "stop", "restart", "status"].includes(action)) return res.status(400).json({ error: "bad action" });
  try {
    const commandId = sendCommand(id, "service", { action });
    audit("admin", `service_${action}`, id, { commandId });
    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.get("/api/agents/:id/config", (req, res) => {
  try {
    const commandId = sendCommand(req.params.id, "read_config");
    audit("admin", "read_config", req.params.id, { commandId });
    res.json({ ok: true, commandId, config: state.agents[req.params.id]?.lastConfig || null });
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
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
    audit("admin", "apply_config", req.params.id, { commandId, versionId: version.id, restart });
    res.json({ ok: true, commandId, versionId: version.id });
  } catch (error) {
    res.status(409).json({ error: error.message, versionId: version.id });
  }
});

app.get("/api/agents/:id/config/versions", (req, res) => res.json(state.configVersions[req.params.id] || []));

app.post("/api/agents/:id/config/rollback/:versionId", (req, res) => {
  const version = (state.configVersions[req.params.id] || []).find((item) => item.id === req.params.versionId);
  if (!version) return res.status(404).json({ error: "version not found" });
  try {
    const commandId = sendCommand(req.params.id, "apply_config", { config: version.config, restart: true, rollback: true, versionId: version.id });
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
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

app.post("/api/agents/:id/ssh", async (req, res) => {
  const command = String(req.body?.command || "").trim();
  if (!command) return res.status(400).json({ error: "command required" });

  try {
    const sshProfile = publicSshProfile(req.params.id);
    if (sshProfile.ready) {
      const result = await execSshCommand(getSshConnectConfig(req.params.id), command);
      audit("admin", "ssh_exec", req.params.id, { command: command.slice(0, 120), transport: "direct", ok: result.ok });
      return res.json({ ok: result.ok, transport: "ssh", output: result.output });
    }

    const commandId = sendCommand(req.params.id, "exec", { command });
    audit("admin", "ssh_exec", req.params.id, { commandId, command: command.slice(0, 120), transport: "agent" });
    return res.json({ ok: true, transport: "agent", commandId });
  } catch (error) {
    return res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/uninstall", (req, res) => {
  try {
    const commandId = sendCommand(req.params.id, "uninstall_agent", { removeSingbox: Boolean(req.body?.removeSingbox) });
    audit("admin", "uninstall_agent", req.params.id, { commandId, removeSingbox: Boolean(req.body?.removeSingbox) });
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
  try {
    sendCommand(req.params.id, "tail_logs", { lines: Number(req.query.lines || 200), follow: true });
  } catch {}
  req.on("close", () => set.delete(res));
});

app.get("/api/audit", (_, res) => {
  if (!fs.existsSync(auditFile)) return res.json([]);
  const rows = fs
    .readFileSync(auditFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  res.json(rows.reverse().slice(0, 300));
});

if (fs.existsSync(webDist)) app.use(express.static(webDist));
app.get("*", (_, res, next) => {
  const index = path.join(webDist, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const terminalWss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (pathname === "/agent") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return;
  }
  if (pathname === "/terminal") {
    if (!ensureUpgradeAccess(req, socket)) return;
    terminalWss.handleUpgrade(req, socket, head, (ws) => terminalWss.emit("connection", ws, req));
    return;
  }
  socket.destroy();
});

terminalWss.on("connection", (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const agentId = url.searchParams.get("agentId");
  const mode = String(url.searchParams.get("mode") || "ssh");

  if (!agentId || !state.agents[agentId]) {
    ws.send(JSON.stringify({ type: "output", output: "agent not found\n" }));
    ws.close();
    return;
  }

  if (mode === "agent" || !publicSshProfile(agentId).ready) {
    attachAgentExecTerminal(ws, agentId);
    return;
  }

  try {
    attachDirectSshTerminal(ws, agentId);
  } catch (error) {
    ws.send(JSON.stringify({ type: "output", output: `${error.message}\n` }));
    ws.close();
  }
});

wss.on("connection", (ws) => {
  let agentId = "";

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "hello") {
      const token = state.tokens.find((item) => item.token === msg.token && !item.revoked);
      if (!token && process.env.CHIKEN_ALLOW_OPEN_REGISTER !== "1") {
        ws.send(JSON.stringify({ type: "error", error: "invalid token" }));
        ws.close();
        return;
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

      if (configCommandRefs.has(msg.commandId)) {
        const ref = configCommandRefs.get(msg.commandId);
        updateConfigVersion(ref.agentId, ref.versionId, {
          status: msg.ok ? "applied" : "failed",
          lastOutput: String(msg.output || "").slice(0, 2000),
          appliedAt: new Date().toISOString()
        });
        configCommandRefs.delete(msg.commandId);
      }

      if (forwardCommandRefs.has(msg.commandId)) {
        const ref = forwardCommandRefs.get(msg.commandId);
        if (ref.action === "remove") {
          if (msg.ok) removeForwardRule(ref.agentId, ref.ruleId);
          else {
            const current = (state.forwardRules?.[ref.agentId] || []).find((item) => item.id === ref.ruleId);
            if (current) upsertForwardRule(ref.agentId, { ...current, status: "error", lastError: String(msg.output || "") });
          }
        } else {
          const current = (state.forwardRules?.[ref.agentId] || []).find((item) => item.id === ref.ruleId);
          if (current) upsertForwardRule(ref.agentId, { ...current, status: msg.ok ? "active" : "error", lastError: msg.ok ? "" : String(msg.output || "") });
        }
        saveState();
        forwardCommandRefs.delete(msg.commandId);
      }

      if (commandWaiters.has(msg.commandId)) commandWaiters.get(msg.commandId)(msg);
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
