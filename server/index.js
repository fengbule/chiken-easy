import crypto from "crypto";
import express from "express";
import multer from "multer";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Client as SshClient } from "ssh2";
import { nanoid } from "nanoid";
import { fileURLToPath } from "url";
import { buildConfig, buildForwardConfig, buildForwardRule, forwardCatalog, protocolCatalog } from "./configFactory.js";
import { buildAgentInstallScript, buildInstallCommand, createInstallBundle, pruneInstallBundles, resolvePublicBaseUrl, resolvePublicWsUrl } from "./installers.js";
import { buildNodeProfile, buildSubscriptionProfile, defaultSubscriptionTemplateId, listSubscriptionNodes, renderSubscription, subscriptionTemplateCatalog } from "./subscriptions.js";
import { createStorage } from "./storage.js";
import {
  createLegacyPasswordHash,
  createPasswordHash,
  decryptSecret,
  encryptSecret,
  hasMasterKey,
  hashApiToken,
  maskIp,
  maskSecret,
  redactObject,
  sanitizeSensitiveText,
  verifyPassword
} from "./security.js";
import { exportNodePool, importNodesFromContent, scoreNode, upsertNodePool } from "./nodePool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const webDist = path.join(root, "dist");
const uploadDir = path.join(dataDir, "uploads");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const SESSION_COOKIE = "chiken_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const rawHistoryHours = Math.max(1, Number(process.env.CHIKEN_MONITOR_RAW_HOURS || 24) || 24);
const aggregatedDays = Math.max(1, Number(process.env.CHIKEN_MONITOR_AGG_DAYS || 7) || 7);
const uploadMaxBytes = Math.max(1024 * 1024, (Number(process.env.CHIKEN_UPLOAD_MAX_MB || 20) || 20) * 1024 * 1024);
const proxyCheckUrl = cleanText(process.env.CHIKEN_PROXY_CHECK_URL || "https://www.gstatic.com/generate_204") || "https://www.gstatic.com/generate_204";
const stateFlushMs = Math.max(250, Number(process.env.CHIKEN_STATE_FLUSH_MS || 1500) || 1500);
const allowedUploadTypes = new Set(
  String(process.env.CHIKEN_UPLOAD_TYPES || "image/png,image/jpeg,image/webp,text/plain,application/pdf")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

const defaultState = {
  tokens: [],
  apiTokens: [],
  agents: {},
  configVersions: {},
  forwardRules: {},
  nodeProfiles: {},
  subscriptionProfiles: {},
  sshProfiles: {},
  installBundles: {},
  credentials: {},
  assets: {},
  monitorHistory: {},
  monitorAgg: {},
  monitorEvents: [],
  memos: {},
  files: {},
  nodePool: {},
  subscriptionSources: {},
  subscriptionAccessLogs: [],
  proxyChecks: {},
  scriptLibrary: {},
  commandRuns: {},
  settings: {
    publicProbeRefreshSec: 10,
    alerts: {
      enabled: true,
      cpuThreshold: 90,
      memoryThreshold: 90,
      diskThreshold: 90,
      trafficThreshold: 0,
      cooldownMinutes: 30
    },
    telegramToken: "",
    telegramChatId: "",
    webhookUrl: "",
    queryTokenHintDismissed: false
  },
  auth: {
    admin: null
  },
  commands: [
    { id: "status", label: "Check sing-box status", type: "service", action: "status" },
    { id: "restart", label: "Restart sing-box", type: "service", action: "restart" },
    { id: "tail", label: "Tail recent logs", type: "logs", lines: 200 },
    { id: "validate", label: "Validate current config", type: "config", action: "validate" }
  ]
};

const storage = createStorage({
  rootDir: dataDir,
  defaults: defaultState,
  masterKey: process.env.CHIKEN_MASTER_KEY
});

let state = storage.loadState();
const logStreams = new Map();
const commandWaiters = new Map();
const configCommandRefs = new Map();
const forwardCommandRefs = new Map();
const browserSessions = new Map();
const clients = new Map();
let stateSaveTimer = null;
let stateSavePending = false;

function cleanText(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function saveState() {
  storage.saveState(state);
}

function flushScheduledStateSave() {
  if (stateSaveTimer) {
    clearTimeout(stateSaveTimer);
    stateSaveTimer = null;
  }
  if (!stateSavePending) return;
  stateSavePending = false;
  saveState();
}

function scheduleStateSave(delayMs = stateFlushMs) {
  stateSavePending = true;
  if (stateSaveTimer) return;
  stateSaveTimer = setTimeout(() => {
    flushScheduledStateSave();
  }, Math.max(0, Number(delayMs) || 0));
  stateSaveTimer.unref?.();
}

function parseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function ensureCollection(rootObject, key, factory) {
  rootObject[key] ||= factory();
  return rootObject[key];
}

function safeFileName(name) {
  return cleanText(name).replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "file";
}

function normalizeRemotePath(value) {
  const input = cleanText(value || "/");
  if (input.includes("\0")) throw new Error("invalid path");
  return path.posix.normalize(input.startsWith("/") ? input : `/${input}`);
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const pairs = header.split(";").map((item) => item.trim()).filter(Boolean);
  const cookies = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    cookies[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1));
  }
  return cookies;
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookieValue);
    return;
  }
  if (Array.isArray(current)) {
    res.setHeader("Set-Cookie", [...current, cookieValue]);
    return;
  }
  res.setHeader("Set-Cookie", [current, cookieValue]);
}

function setSessionCookie(res, sessionId) {
  appendSetCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  appendSetCookie(res, `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function sanitizeAuditDetail(detail) {
  if (Array.isArray(detail)) return detail.map((item) => sanitizeAuditDetail(item));
  if (detail && typeof detail === "object") {
    const redacted = redactObject(detail);
    const output = {};
    for (const [key, value] of Object.entries(redacted)) output[key] = sanitizeAuditDetail(value);
    return output;
  }
  if (typeof detail === "string") return sanitizeSensitiveText(detail);
  return detail;
}

function audit(actor, action, target, detail = {}) {
  return storage.appendAudit(actor, action, target, sanitizeAuditDetail(detail));
}

function normalizeAdminRecord(record) {
  if (!record) return null;
  if (record.passwordHash && !record.passwordHash.startsWith("scrypt$") && !record.passwordHash.startsWith("legacy_sha256$") && record.salt) {
    return { ...record, passwordHash: `legacy_sha256$${record.salt}$${record.passwordHash}` };
  }
  return record;
}

function ensureAdminAuth() {
  state.auth ||= { admin: null };
  state.auth.admin = normalizeAdminRecord(state.auth.admin);
  if (process.env.CHIKEN_ADMIN_PASSWORD_HASH) {
    state.auth.admin = {
      username: cleanText(process.env.CHIKEN_ADMIN_USERNAME || state.auth.admin?.username || "admin") || "admin",
      passwordHash: cleanText(process.env.CHIKEN_ADMIN_PASSWORD_HASH),
      updatedAt: nowIso()
    };
    return;
  }
  if (process.env.CHIKEN_ADMIN_PASSWORD && (!state.auth.admin?.passwordHash || process.env.CHIKEN_FORCE_ADMIN_PASSWORD === "1")) {
    state.auth.admin = {
      username: cleanText(process.env.CHIKEN_ADMIN_USERNAME || state.auth.admin?.username || "admin") || "admin",
      passwordHash: createPasswordHash(process.env.CHIKEN_ADMIN_PASSWORD),
      updatedAt: nowIso()
    };
  }
}

function persistBootstrapTokens() {
  if (process.env.CHIKEN_BOOTSTRAP_TOKEN && !state.tokens.some((item) => item.token === process.env.CHIKEN_BOOTSTRAP_TOKEN && !item.revoked)) {
    state.tokens.push({
      token: process.env.CHIKEN_BOOTSTRAP_TOKEN,
      createdAt: nowIso(),
      used: false,
      bootstrap: true
    });
  }

  if (process.env.CHIKEN_API_TOKEN && !state.apiTokens.some((item) => item.token === process.env.CHIKEN_API_TOKEN && !item.revoked)) {
    state.apiTokens.push({
      id: "bootstrap",
      name: "bootstrap",
      token: process.env.CHIKEN_API_TOKEN,
      tokenHash: hashApiToken(process.env.CHIKEN_API_TOKEN),
      createdAt: nowIso(),
      bootstrap: true
    });
  }
}

ensureAdminAuth();
pruneInstallBundles(state);
persistBootstrapTokens();
saveState();

function createBrowserSession(subject) {
  const sessionId = nanoid(32);
  browserSessions.set(sessionId, {
    id: sessionId,
    ...subject,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return sessionId;
}

function getBrowserSession(sessionId) {
  const current = browserSessions.get(sessionId);
  if (!current) return null;
  if (current.expiresAt <= Date.now()) {
    browserSessions.delete(sessionId);
    return null;
  }
  return current;
}

function validateApiToken(rawToken) {
  const token = cleanText(rawToken);
  if (!token) return null;
  return (state.apiTokens || []).find((item) => !item.revoked && (item.token === token || item.tokenHash === hashApiToken(token))) || null;
}

function validateAgentToken(rawToken) {
  const token = cleanText(rawToken);
  if (!token) return null;
  return (state.tokens || []).find((item) => !item.revoked && item.token === token) || null;
}

function requestAccess(req) {
  const cookies = parseCookies(req);
  const session = getBrowserSession(cookies[SESSION_COOKIE]);
  const authHeader = cleanText(req.headers.authorization);
  const headerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : cleanText(req.headers["x-api-token"]);
  const queryToken = cleanText(new URL(req.originalUrl || req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams.get("token"));
  const token = headerToken || queryToken;
  const required = process.env.CHIKEN_REQUIRE_API_TOKEN === "1";
  const queryAllowed = process.env.CHIKEN_ALLOW_QUERY_TOKEN === "1";
  const queryRejected = Boolean(queryToken && !headerToken && !queryAllowed);
  const apiToken = queryRejected ? null : validateApiToken(token);
  return {
    required,
    session,
    apiToken,
    token,
    queryRejected,
    authorized: Boolean(session) || Boolean(apiToken) || (!required && !token)
  };
}

function requireApiAccess(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path === "/api/health") return next();
  if (req.path.startsWith("/api/public/")) return next();
  if (req.path.startsWith("/api/auth/")) return next();

  const access = requestAccess(req);
  if (access.queryRejected) return res.status(401).json({ error: "query API token is disabled" });
  if (access.token && !access.apiToken && !access.session) return res.status(401).json({ error: "invalid API token" });
  if (!access.authorized) return res.status(401).json({ error: "API token required" });

  if (access.apiToken && !access.session) {
    setSessionCookie(res, createBrowserSession({ type: "apiToken", tokenId: access.apiToken.id || access.apiToken.name }));
  }
  req.apiAccess = access;
  next();
}

function rejectUpgrade(socket, statusCode, message) {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function ensureUpgradeAccess(req, socket) {
  const access = requestAccess(req);
  if (access.queryRejected) {
    rejectUpgrade(socket, 401, "Query Token Disabled");
    return false;
  }
  if (access.token && !access.apiToken && !access.session) {
    rejectUpgrade(socket, 401, "Invalid API Token");
    return false;
  }
  if (!access.authorized) {
    rejectUpgrade(socket, 401, "API Token Required");
    return false;
  }
  req.apiAccess = access;
  return true;
}

function getAuditRows(options = {}) {
  return storage.queryAudit(options);
}

function getAsset(agentId) {
  return state.assets?.[agentId] || null;
}

function ensureAssetFromAgent(agent) {
  if (!agent) return null;
  state.assets ||= {};
  const current = state.assets[agent.id];
  const next = {
    id: agent.id,
    agentId: agent.id,
    displayName: current?.displayName || agent.name || agent.id,
    host: current?.host || agent.ip || agent.host || "",
    ip: current?.ip || agent.ip || "",
    port: Number(current?.port || 22) || 22,
    username: current?.username || "root",
    authType: current?.authType || "password",
    credentialId: current?.credentialId || "",
    group: current?.group || "",
    tags: current?.tags || [],
    provider: current?.provider || "",
    region: current?.region || "",
    expireAt: current?.expireAt || "",
    price: current?.price || "",
    bandwidthLimit: current?.bandwidthLimit || "",
    note: current?.note || "",
    jumpHost: current?.jumpHost || "",
    public: current?.public ?? true,
    publicName: current?.publicName || current?.displayName || agent.name || agent.id,
    publicGroup: current?.publicGroup || current?.group || "",
    publicRegion: current?.publicRegion || current?.region || "",
    publicFlag: current?.publicFlag || "",
    sort: Number(current?.sort || 0) || 0,
    totalTrafficLimit: current?.totalTrafficLimit || "",
    alertEnabled: current?.alertEnabled ?? true,
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  state.assets[agent.id] = next;
  return next;
}

function getCredential(id) {
  return state.credentials?.[id] || null;
}

function getAgent(agentId) {
  return state.agents?.[agentId] || null;
}

function getMergedAgentAsset(agent) {
  const asset = ensureAssetFromAgent(agent);
  return { ...(asset || {}), ...(agent || {}), metrics: agent?.metrics || null };
}

function resolveSshProfile(agentId) {
  const agent = getAgent(agentId);
  const saved = state.sshProfiles?.[agentId] || {};
  const credential = saved.credentialId ? getCredential(saved.credentialId) : null;
  return {
    host: cleanText(saved.host || credential?.host || agent?.ip || agent?.host),
    port: Number(saved.port || credential?.port || 22) || 22,
    username: cleanText(saved.username || credential?.username || "root") || "root",
    mode: cleanText(saved.mode || credential?.mode) === "privateKey" ? "privateKey" : "password",
    password: cleanText(saved.password || credential?.password),
    privateKey: cleanText(saved.privateKey || credential?.privateKey),
    credentialId: cleanText(saved.credentialId),
    updatedAt: saved.updatedAt || credential?.updatedAt || null
  };
}

function publicSshProfile(agentId) {
  const profile = resolveSshProfile(agentId);
  return {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    mode: profile.mode,
    credentialId: profile.credentialId,
    hasPassword: Boolean(profile.password),
    hasPrivateKey: Boolean(profile.privateKey),
    ready: profile.mode === "privateKey" ? Boolean(profile.host && profile.privateKey) : Boolean(profile.host && profile.password),
    updatedAt: profile.updatedAt
  };
}

function getSshConnectConfig(agentId, override = {}) {
  const merged = { ...resolveSshProfile(agentId), ...override };
  if (!cleanText(merged.host)) throw new Error("SSH host is required");
  if (merged.mode === "privateKey") {
    if (!cleanText(merged.privateKey)) throw new Error("SSH private key is required");
    return {
      host: merged.host,
      port: Number(merged.port || 22) || 22,
      username: merged.username || "root",
      privateKey: merged.privateKey,
      readyTimeout: 20000,
      keepaliveInterval: 10000
    };
  }
  if (!cleanText(merged.password)) throw new Error("SSH password is required");
  return {
    host: merged.host,
    port: Number(merged.port || 22) || 22,
    username: merged.username || "root",
    password: merged.password,
    readyTimeout: 20000,
    keepaliveInterval: 10000
  };
}

function execSshCommand(connectConfig, command, options = {}) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn
      .on("ready", () => {
        conn.exec(command, options.execOptions || {}, (error, stream) => {
          if (error) {
            conn.end();
            return reject(error);
          }
          let stdout = "";
          let stderr = "";
          if (options.stdin) stream.end(options.stdin);
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

function withSftp(agentId, override, task) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn
      .on("ready", () => {
        conn.sftp((error, sftp) => {
          if (error) {
            conn.end();
            return reject(error);
          }
          Promise.resolve(task(sftp))
            .then((result) => {
              conn.end();
              resolve(result);
            })
            .catch((taskError) => {
              conn.end();
              reject(taskError);
            });
        });
      })
      .on("error", reject)
      .connect(getSshConnectConfig(agentId, override));
  });
}

function readSftpStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function sftpWriteFile(sftp, remotePath, buffer) {
  return new Promise((resolve, reject) => {
    sftp.open(remotePath, "w", (openError, handle) => {
      if (openError) return reject(openError);
      sftp.write(handle, buffer, 0, buffer.length, 0, (writeError) => {
        if (writeError) {
          sftp.close(handle, () => reject(writeError));
          return;
        }
        sftp.close(handle, (closeError) => (closeError ? reject(closeError) : resolve()));
      });
    });
  });
}

function sftpStat(sftp, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(remotePath, (error, stats) => (error ? reject(error) : resolve(stats)));
  });
}

function sendCommand(agentId, command, payload = {}) {
  const ws = clients.get(agentId);
  if (!ws || ws.readyState !== ws.OPEN) throw new Error("agent offline");
  const id = nanoid();
  ws.send(JSON.stringify({ id, command, payload }));
  return id;
}

function sendCommandAwait(agentId, command, payload = {}, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    let commandId = "";
    try {
      commandId = sendCommand(agentId, command, payload);
    } catch (error) {
      return reject(error);
    }
    commandWaiters.set(commandId, (result) => {
      if (timer) clearTimeout(timer);
      commandWaiters.delete(commandId);
      resolve(result);
    });
    timer = setTimeout(() => {
      commandWaiters.delete(commandId);
      reject(new Error("agent command timeout"));
    }, timeoutMs);
  });
}

function pushLog(agentId, line) {
  const sinks = logStreams.get(agentId);
  if (!sinks) return;
  for (const res of sinks) res.write(`data: ${JSON.stringify(line)}\n\n`);
}

function metricSampleFromAgent(agent, onlineOverride) {
  const metrics = agent?.metrics || {};
  return {
    online: typeof onlineOverride === "boolean" ? onlineOverride : Boolean(clients.has(agent?.id)),
    cpuUsage: Number(metrics.cpu?.usage || 0),
    cpuCores: Number(metrics.cpu?.cores || 0),
    load1: Number(metrics.cpu?.load1 || 0),
    load5: Number(metrics.cpu?.load5 || 0),
    load15: Number(metrics.cpu?.load15 || 0),
    memoryTotal: Number(metrics.memory?.total || 0),
    memoryUsed: Number(metrics.memory?.used || 0),
    memoryUsage: Number(metrics.memory?.usage || 0),
    swapTotal: Number(metrics.memory?.swapTotal || 0),
    swapUsed: Number(metrics.memory?.swapUsed || 0),
    swapUsage: Number(metrics.memory?.swapUsage || 0),
    diskTotal: Number(metrics.disk?.total || 0),
    diskUsed: Number(metrics.disk?.used || 0),
    diskUsage: Number(metrics.disk?.usage || 0),
    rxSpeed: Number(metrics.network?.rxRate || 0),
    txSpeed: Number(metrics.network?.txRate || 0),
    rxBytes: Number(metrics.network?.rxTotal || 0),
    txBytes: Number(metrics.network?.txTotal || 0),
    uptime: Number(metrics.uptimeSec || 0),
    processCount: Number(metrics.processCount || 0),
    updatedAt: cleanText(metrics.collectedAt || nowIso())
  };
}

function monitorBucketKey(iso) {
  return cleanText(iso).slice(0, 13);
}

function pruneMonitorData(agentId) {
  const rawCutoff = Date.now() - rawHistoryHours * 60 * 60 * 1000;
  const aggCutoff = Date.now() - aggregatedDays * 24 * 60 * 60 * 1000;
  state.monitorHistory[agentId] = (state.monitorHistory[agentId] || []).filter((item) => Date.parse(item.updatedAt || 0) >= rawCutoff);
  const currentAgg = state.monitorAgg[agentId] || {};
  for (const [bucket, value] of Object.entries(currentAgg)) {
    if (Date.parse(value.updatedAt || 0) < aggCutoff) delete currentAgg[bucket];
  }
  state.monitorAgg[agentId] = currentAgg;
}

function appendMonitorEvent(event) {
  state.monitorEvents ||= [];
  state.monitorEvents.unshift(event);
  state.monitorEvents = state.monitorEvents.slice(0, 500);
}

async function sendNotification(title, message) {
  const webhookUrl = cleanText(state.settings?.webhookUrl);
  const telegramToken = cleanText(state.settings?.telegramToken);
  const telegramChatId = cleanText(state.settings?.telegramChatId);
  const payload = { title, message, at: nowIso() };
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {}
  }
  if (telegramToken && telegramChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: `${title}\n${message}`
        })
      });
    } catch {}
  }
}

function maybeTriggerAlert(agent, sample) {
  const settings = state.settings?.alerts || {};
  if (settings.enabled === false) return;
  const asset = ensureAssetFromAgent(agent);
  if (asset && asset.alertEnabled === false) return;
  const cooldownMinutes = Math.max(1, Number(settings.cooldownMinutes || 30) || 30);
  const cooldownKey = `${agent.id}:${monitorBucketKey(sample.updatedAt)}`;
  state.settings.alertCooldowns ||= {};
  const cooldowns = state.settings.alertCooldowns;

  const checks = [
    { key: "cpu", active: sample.cpuUsage >= Number(settings.cpuThreshold || 90), text: `CPU high on ${asset.publicName || agent.name}: ${sample.cpuUsage}%` },
    { key: "memory", active: sample.memoryUsage >= Number(settings.memoryThreshold || 90), text: `Memory high on ${asset.publicName || agent.name}: ${sample.memoryUsage}%` },
    { key: "disk", active: sample.diskUsage >= Number(settings.diskThreshold || 90), text: `Disk high on ${asset.publicName || agent.name}: ${sample.diskUsage}%` }
  ];

  for (const check of checks) {
    if (!check.active) continue;
    const stamp = cooldowns[`${cooldownKey}:${check.key}`];
    if (stamp && Date.now() - stamp < cooldownMinutes * 60 * 1000) continue;
    cooldowns[`${cooldownKey}:${check.key}`] = Date.now();
    const event = {
      id: nanoid(),
      agentId: agent.id,
      type: `${check.key}_threshold`,
      severity: "warning",
      message: check.text,
      public: Boolean(asset.public),
      updatedAt: nowIso()
    };
    appendMonitorEvent(event);
    void sendNotification("ChikenEasy alert", check.text);
  }
}

function recordMonitorSample(agentId, onlineOverride) {
  const agent = getAgent(agentId);
  if (!agent) return;
  state.monitorHistory ||= {};
  state.monitorAgg ||= {};
  state.monitorHistory[agentId] ||= [];
  state.monitorAgg[agentId] ||= {};

  const sample = metricSampleFromAgent(agent, onlineOverride);
  state.monitorHistory[agentId].push(sample);

  const bucket = monitorBucketKey(sample.updatedAt);
  const aggregate = state.monitorAgg[agentId][bucket] || {
    bucket,
    count: 0,
    updatedAt: sample.updatedAt,
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0,
    rxSpeed: 0,
    txSpeed: 0,
    uptime: 0
  };
  aggregate.count += 1;
  aggregate.updatedAt = sample.updatedAt;
  aggregate.cpuUsage += sample.cpuUsage;
  aggregate.memoryUsage += sample.memoryUsage;
  aggregate.diskUsage += sample.diskUsage;
  aggregate.rxSpeed += sample.rxSpeed;
  aggregate.txSpeed += sample.txSpeed;
  aggregate.uptime = sample.uptime;
  state.monitorAgg[agentId][bucket] = aggregate;

  pruneMonitorData(agentId);
  maybeTriggerAlert(agent, sample);
  storage.writeProbeSample(agentId, { id: nanoid(), agentId, ...sample });
}

function buildMonitorHistory(agentId) {
  const raw = state.monitorHistory?.[agentId] || [];
  const agg = Object.values(state.monitorAgg?.[agentId] || {})
    .map((bucket) => ({
      updatedAt: bucket.updatedAt,
      cpuUsage: bucket.count ? Math.round((bucket.cpuUsage / bucket.count) * 100) / 100 : 0,
      memoryUsage: bucket.count ? Math.round((bucket.memoryUsage / bucket.count) * 100) / 100 : 0,
      diskUsage: bucket.count ? Math.round((bucket.diskUsage / bucket.count) * 100) / 100 : 0,
      rxSpeed: bucket.count ? Math.round((bucket.rxSpeed / bucket.count) * 100) / 100 : 0,
      txSpeed: bucket.count ? Math.round((bucket.txSpeed / bucket.count) * 100) / 100 : 0,
      uptime: bucket.uptime
    }))
    .sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)));
  return { raw, aggregated: agg };
}

function agentSummary(agent) {
  const asset = ensureAssetFromAgent(agent);
  const ssh = publicSshProfile(agent.id);
  return {
    id: agent.id,
    name: agent.name,
    host: agent.host,
    ip: agent.ip,
    arch: agent.arch,
    os: agent.os,
    tags: asset.tags || agent.tags || [],
    group: asset.group || "",
    region: asset.region || "",
    provider: asset.provider || "",
    singboxVersion: agent.singboxVersion || "-",
    singboxStatus: agent.singboxStatus || "unknown",
    connected: clients.has(agent.id),
    lastSeen: agent.lastSeen,
    registeredAt: agent.registeredAt,
    certFingerprint: agent.certFingerprint || "-",
    sshConfigured: ssh.ready,
    sshHost: ssh.host,
    sshPort: ssh.port,
    sshMode: ssh.mode,
    metrics: agent.metrics || null
  };
}

function detailAgent(agent) {
  const asset = ensureAssetFromAgent(agent);
  return {
    ...agentSummary(agent),
    asset,
    metricsHistory: buildMonitorHistory(agent.id),
    lastConfig: agent.lastConfig || null,
    memos: Object.values(state.memos || {}).filter((memo) => memo.agentId === agent.id)
  };
}

function publicProbeCard(agent) {
  const asset = ensureAssetFromAgent(agent);
  const sample = metricSampleFromAgent(agent);
  return {
    id: agent.id,
    name: asset.publicName || asset.displayName || agent.name || agent.id,
    group: asset.publicGroup || asset.group || "",
    region: asset.publicRegion || asset.region || "",
    flag: asset.publicFlag || "",
    sort: Number(asset.sort || 0) || 0,
    online: Boolean(clients.has(agent.id)),
    price: asset.price || "",
    expireAt: asset.expireAt || "",
    tags: asset.tags || [],
    metrics: sample
  };
}

function listPublicProbes() {
  return Object.values(state.agents || {})
    .filter((agent) => ensureAssetFromAgent(agent).public !== false)
    .map(publicProbeCard)
    .sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0) || String(left.name).localeCompare(String(right.name)));
}

function normalizeCredential(input = {}, current = {}) {
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    name: cleanText(input.name) || current.name || "credential",
    type: cleanText(input.type || current.type || "ssh") || "ssh",
    host: cleanText(input.host || current.host),
    port: Number(input.port || current.port || 22) || 22,
    username: cleanText(input.username || current.username || "root") || "root",
    mode: cleanText(input.mode || current.mode) === "privateKey" ? "privateKey" : "password",
    password: cleanText(input.password || current.password),
    privateKey: cleanText(input.privateKey || current.privateKey),
    note: cleanText(input.note || current.note),
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso(),
    revokedAt: current.revokedAt || null
  };
}

function publicCredential(credential) {
  return {
    id: credential.id,
    name: credential.name,
    type: credential.type,
    host: credential.host,
    port: credential.port,
    username: credential.username,
    mode: credential.mode,
    note: credential.note,
    hasPassword: Boolean(credential.password),
    hasPrivateKey: Boolean(credential.privateKey),
    revokedAt: credential.revokedAt || null,
    createdAt: credential.createdAt,
    updatedAt: credential.updatedAt
  };
}

function normalizeAsset(input = {}, current = {}) {
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    agentId: cleanText(input.agentId || current.agentId),
    displayName: cleanText(input.displayName || current.displayName || input.name) || "server",
    host: cleanText(input.host || current.host),
    ip: cleanText(input.ip || current.ip),
    port: Number(input.port || current.port || 22) || 22,
    username: cleanText(input.username || current.username || "root") || "root",
    authType: cleanText(input.authType || current.authType || "password") || "password",
    credentialId: cleanText(input.credentialId || current.credentialId),
    group: cleanText(input.group || current.group),
    tags: Array.isArray(input.tags) ? input.tags.map((item) => cleanText(item)).filter(Boolean) : current.tags || [],
    provider: cleanText(input.provider || current.provider),
    region: cleanText(input.region || current.region),
    expireAt: cleanText(input.expireAt || current.expireAt),
    price: cleanText(input.price || current.price),
    bandwidthLimit: cleanText(input.bandwidthLimit || current.bandwidthLimit),
    note: cleanText(input.note || current.note),
    jumpHost: cleanText(input.jumpHost || current.jumpHost),
    public: input.public !== undefined ? Boolean(input.public) : current.public ?? true,
    publicName: cleanText(input.publicName || current.publicName || input.displayName || current.displayName),
    publicGroup: cleanText(input.publicGroup || current.publicGroup || input.group || current.group),
    publicRegion: cleanText(input.publicRegion || current.publicRegion || input.region || current.region),
    publicFlag: cleanText(input.publicFlag || current.publicFlag),
    sort: Number(input.sort || current.sort || 0) || 0,
    totalTrafficLimit: cleanText(input.totalTrafficLimit || current.totalTrafficLimit),
    alertEnabled: input.alertEnabled !== undefined ? Boolean(input.alertEnabled) : current.alertEnabled ?? true,
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function publicAsset(asset) {
  return clone(asset);
}

function normalizeMemo(input = {}, current = {}) {
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    title: cleanText(input.title || current.title) || "memo",
    content: String(input.content ?? current.content ?? "").trim(),
    tags: Array.isArray(input.tags) ? input.tags.map((item) => cleanText(item)).filter(Boolean) : current.tags || [],
    pinned: input.pinned !== undefined ? Boolean(input.pinned) : current.pinned ?? false,
    archived: input.archived !== undefined ? Boolean(input.archived) : current.archived ?? false,
    visibility: ["private", "public", "link"].includes(cleanText(input.visibility || current.visibility)) ? cleanText(input.visibility || current.visibility) : "private",
    agentId: cleanText(input.agentId || current.agentId),
    nodeId: cleanText(input.nodeId || current.nodeId),
    forwardRuleId: cleanText(input.forwardRuleId || current.forwardRuleId),
    attachments: Array.isArray(current.attachments) ? current.attachments : [],
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function publicMemo(memo) {
  return {
    ...memo,
    attachments: (memo.attachments || []).map((id) => publicFile(state.files?.[id]).file)
  };
}

function normalizeScript(input = {}, current = {}) {
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    name: cleanText(input.name || current.name) || "script",
    content: String(input.content ?? current.content ?? "").trim(),
    category: cleanText(input.category || current.category),
    tags: Array.isArray(input.tags) ? input.tags.map((item) => cleanText(item)).filter(Boolean) : current.tags || [],
    timeoutMs: Math.max(1000, Number(input.timeoutMs || current.timeoutMs || 30000) || 30000),
    createdAt: current.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

function normalizeSubscriptionToken(input = {}, current = {}) {
  const profile = buildSubscriptionProfile(input, current);
  return {
    ...profile,
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : current.enabled ?? true,
    expiresAt: cleanText(input.expiresAt || current.expiresAt),
    maxAccessCount: Number(input.maxAccessCount || current.maxAccessCount || 0) || 0,
    accessCount: Number(current.accessCount || 0) || 0,
    lastAccessIp: cleanText(current.lastAccessIp),
    lastUserAgent: cleanText(current.lastUserAgent),
    format: cleanText(input.format || current.format || "clash") || "clash",
    nodeIds: Array.isArray(input.nodeIds) ? input.nodeIds.map((item) => cleanText(item)).filter(Boolean) : current.nodeIds || [],
    onlyHealthy: input.onlyHealthy !== undefined ? Boolean(input.onlyHealthy) : current.onlyHealthy ?? false,
    hideTags: input.hideTags !== undefined ? Boolean(input.hideTags) : current.hideTags ?? false,
    sortBy: cleanText(input.sortBy || current.sortBy || "name") || "name",
    filterTags: Array.isArray(input.filterTags) ? input.filterTags.map((item) => cleanText(item)).filter(Boolean) : current.filterTags || [],
    filterRegions: Array.isArray(input.filterRegions) ? input.filterRegions.map((item) => cleanText(item)).filter(Boolean) : current.filterRegions || []
  };
}

function publicSubscriptionProfile(req, profile, includeContent = false) {
  const base = {
    id: profile.id,
    name: profile.name,
    template: profile.template || defaultSubscriptionTemplateId,
    publicToken: profile.publicToken,
    url: new URL(`/sub/${profile.publicToken}`, resolvePublicBaseUrl(req)).toString(),
    localNodes: profile.localNodes || [],
    imports: includeContent
      ? (profile.imports || []).map((item) => ({ ...item }))
      : (profile.imports || []).map((item) => ({ id: item.id, name: item.name, updatedAt: item.updatedAt })),
    format: profile.format || "clash",
    nodeIds: profile.nodeIds || [],
    enabled: profile.enabled !== false,
    expiresAt: profile.expiresAt || "",
    maxAccessCount: profile.maxAccessCount || 0,
    accessCount: profile.accessCount || 0,
    lastAccessIp: profile.lastAccessIp ? maskIp(profile.lastAccessIp) : "",
    lastUserAgent: profile.lastUserAgent || "",
    onlyHealthy: Boolean(profile.onlyHealthy),
    sortBy: profile.sortBy || "name",
    filterTags: profile.filterTags || [],
    filterRegions: profile.filterRegions || [],
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || null
  };
  return {
    ...base,
    localNodeCount: base.localNodes.length,
    importCount: base.imports.length,
    nodeCount: base.nodeIds.length
  };
}

function toNodePoolNodeFromLocalProfile(profile) {
  if (!profile) return null;
  return {
    id: `${profile.agentId}-local`,
    name: profile.name,
    protocol:
      profile.protocol === "vmess-ws"
        ? "vmess"
        : profile.protocol === "vless-reality"
          ? "vless"
          : profile.protocol === "shadowsocks"
            ? "ss"
            : profile.protocol,
    address: profile.server,
    port: profile.port,
    uuid: profile.uuid,
    password: profile.password,
    tls: ["trojan", "hysteria2", "vless-reality"].includes(profile.protocol),
    reality: profile.protocol === "vless-reality" ? { publicKey: profile.publicKey, shortId: profile.shortId, serverName: profile.serverName } : null,
    ws: profile.protocol === "vmess-ws" ? { path: profile.path } : null,
    ss: profile.protocol === "shadowsocks" ? { method: profile.method } : null,
    source: "local-node",
    sourceId: profile.agentId,
    tags: [],
    group: "",
    region: "",
    enabled: true,
    health: "unknown",
    score: 50,
    createdAt: profile.updatedAt,
    updatedAt: profile.updatedAt
  };
}

function selectNodesForSubscription(profile) {
  const selected = [];
  for (const nodeId of profile.nodeIds || []) {
    const node = state.nodePool?.[nodeId];
    if (node) selected.push(clone(node));
  }
  for (const agentId of profile.localNodes || []) {
    const node = toNodePoolNodeFromLocalProfile(state.nodeProfiles?.[agentId]);
    if (node) selected.push(node);
  }

  let filtered = selected.filter((node) => node.enabled !== false);
  if (profile.filterTags?.length) filtered = filtered.filter((node) => profile.filterTags.some((tag) => (node.tags || []).includes(tag)));
  if (profile.filterRegions?.length) filtered = filtered.filter((node) => profile.filterRegions.includes(node.region));
  if (profile.onlyHealthy) filtered = filtered.filter((node) => node.health === "healthy");
  filtered = filtered.filter((node) => {
    const expiredAt = cleanText(node.expireAt || node.expiresAt || node.metadata?.expireAt || "");
    if (!expiredAt) return true;
    const timestamp = Date.parse(expiredAt);
    return Number.isNaN(timestamp) || timestamp >= Date.now();
  });

  if (profile.sortBy === "score") filtered.sort((left, right) => Number(right.score || 0) - Number(left.score || 0));
  else if (profile.sortBy === "updatedAt") filtered.sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  else filtered.sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
  return filtered;
}

function renderSubscriptionOutput(profile, formatOverride) {
  const format = cleanText(formatOverride || profile.format || "clash");
  const selectedNodes = selectNodesForSubscription(profile);
  if ((profile.imports || []).length && (format === "clash" || format === "mihomo") && !selectedNodes.length) {
    return renderSubscription(profile, state, { template: profile.template });
  }

  if ((profile.imports || []).length) {
    for (const item of profile.imports) {
      const result = importNodesFromContent(item.content, { source: "import", sourceId: item.id });
      selectedNodes.push(...result.nodes);
    }
  }

  const normalizedFormat =
    format === "base64" || format === "v2rayN" ? "base64" : format === "raw" ? "raw" : format === "sing-box" ? "sing-box" : format === "mihomo" ? "mihomo" : "clash";
  const rendered = exportNodePool(selectedNodes, normalizedFormat);
  return {
    body: rendered.body,
    uriContent: rendered.raw,
    uriBase64: normalizedFormat === "base64" ? rendered.body : Buffer.from(rendered.raw || "").toString("base64"),
    contentType: rendered.contentType,
    templateId: profile.template || defaultSubscriptionTemplateId,
    warnings: [],
    proxyCount: selectedNodes.length,
    importCount: (profile.imports || []).length,
    localNodeCount: (profile.localNodes || []).length
  };
}

function normalizeFileRecord(input = {}, current = {}) {
  return {
    id: current.id || cleanText(input.id) || nanoid(10),
    name: cleanText(input.name || current.name) || "file",
    diskName: cleanText(input.diskName || current.diskName),
    mimeType: cleanText(input.mimeType || current.mimeType),
    size: Number(input.size || current.size || 0) || 0,
    memoId: cleanText(input.memoId || current.memoId),
    visibility: ["private", "public", "link"].includes(cleanText(input.visibility || current.visibility)) ? cleanText(input.visibility || current.visibility) : "private",
    tags: Array.isArray(input.tags) ? input.tags.map((item) => cleanText(item)).filter(Boolean) : current.tags || [],
    uploadedAt: current.uploadedAt || nowIso(),
    updatedAt: nowIso()
  };
}

function publicFile(file) {
  if (!file) return { file: null };
  const refCount = Object.values(state.memos || {}).filter((memo) => (memo.attachments || []).includes(file.id)).length;
  return {
    file: {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      memoId: file.memoId,
      visibility: file.visibility,
      tags: file.tags || [],
      uploadedAt: file.uploadedAt,
      updatedAt: file.updatedAt,
      refCount
    }
  };
}

function saveUploadedFile(file, options = {}) {
  const record = normalizeFileRecord({
    name: file.originalname,
    diskName: `${nanoid(8)}-${safeFileName(file.originalname)}`,
    mimeType: file.mimetype,
    size: file.size,
    memoId: options.memoId,
    visibility: options.visibility,
    tags: options.tags
  });
  fs.writeFileSync(path.join(uploadDir, record.diskName), file.buffer);
  state.files ||= {};
  state.files[record.id] = record;
  return record;
}

function listFiles(filters = {}) {
  return Object.values(state.files || {})
    .filter((file) => !filters.memoId || file.memoId === filters.memoId)
    .filter((file) => !filters.tag || (file.tags || []).includes(filters.tag))
    .filter((file) => !filters.type || file.mimeType.startsWith(filters.type))
    .map((file) => publicFile(file).file)
    .sort((left, right) => String(right.uploadedAt || "").localeCompare(String(left.uploadedAt || "")));
}

function normalizeSettings(input = {}) {
  const current = state.settings || {};
  return {
    ...current,
    publicProbeRefreshSec: Number(input.publicProbeRefreshSec || current.publicProbeRefreshSec || 10) || 10,
    alerts: {
      ...current.alerts,
      ...(input.alerts || {}),
      enabled: input.alerts?.enabled !== undefined ? Boolean(input.alerts.enabled) : current.alerts?.enabled ?? true,
      cpuThreshold: Number(input.alerts?.cpuThreshold || current.alerts?.cpuThreshold || 90) || 90,
      memoryThreshold: Number(input.alerts?.memoryThreshold || current.alerts?.memoryThreshold || 90) || 90,
      diskThreshold: Number(input.alerts?.diskThreshold || current.alerts?.diskThreshold || 90) || 90,
      trafficThreshold: Number(input.alerts?.trafficThreshold || current.alerts?.trafficThreshold || 0) || 0,
      cooldownMinutes: Number(input.alerts?.cooldownMinutes || current.alerts?.cooldownMinutes || 30) || 30
    },
    telegramToken: cleanText(input.telegramToken || current.telegramToken),
    telegramChatId: cleanText(input.telegramChatId || current.telegramChatId),
    webhookUrl: cleanText(input.webhookUrl || current.webhookUrl)
  };
}

function publicSettings() {
  return {
    publicProbeRefreshSec: state.settings?.publicProbeRefreshSec || 10,
    alerts: state.settings?.alerts || {},
    hasTelegramToken: Boolean(cleanText(state.settings?.telegramToken)),
    telegramChatId: cleanText(state.settings?.telegramChatId),
    hasWebhookUrl: Boolean(cleanText(state.settings?.webhookUrl)),
    queryTokenEnabled: process.env.CHIKEN_ALLOW_QUERY_TOKEN === "1",
    masterKeySet: hasMasterKey(process.env.CHIKEN_MASTER_KEY),
    storageMode: storage.mode,
    warnings: storage.summarizeWarnings()
  };
}

function publicNode(node) {
  return {
    ...redactObject(node, { revealFlags: false }),
    id: node.id,
    name: node.name,
    protocol: node.protocol,
    address: node.address,
    port: node.port,
    source: node.source,
    sourceId: node.sourceId,
    tags: node.tags || [],
    group: node.group || "",
    region: node.region || "",
    enabled: node.enabled !== false,
    health: node.health || "unknown",
    score: Number(node.score || 0) || 0,
    lastCheckAt: node.lastCheckAt || null,
    lastError: node.lastError || "",
    lastCheckStatus: node.metadata?.proxyCheck?.ok === true ? "ok" : node.metadata?.proxyCheck?.unsupported ? "unsupported" : node.metadata?.proxyCheck?.notImplemented ? "not_implemented" : node.lastCheckAt ? "failed" : "idle",
    metadata: node.metadata || {},
    createdAt: node.createdAt,
    updatedAt: node.updatedAt
  };
}

async function tcpCheck(address, port, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 5000) || 5000);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const socket = net.createConnection({ host: address, port: Number(port) || 0 });
    let settled = false;
    const finish = (ok, error = "") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        ok,
        latency: Date.now() - startedAt,
        error
      });
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", (error) => finish(false, error.message));
  });
}

async function checkNode(node, options = {}) {
  const protocol = cleanText(node.protocol).toLowerCase();
  const agentId = cleanText(options.agentId);
  if (agentId) {
    try {
      const result = await sendCommandAwait(
        agentId,
        "proxy_check",
        {
          nodeId: node.id,
          url: cleanText(options.url || proxyCheckUrl),
          timeoutMs: options.timeoutMs,
          node: {
            id: node.id,
            protocol,
            address: node.address,
            port: node.port,
            auth: node.auth,
            password: node.password,
            ss: node.ss,
            method: node.ss?.method,
            metadata: node.metadata
          }
        },
        Math.max(30000, Number(options.timeoutMs || 20000) + 20000)
      );
      return {
        id: nanoid(),
        at: result.checkedAt || nowIso(),
        ok: Boolean(result.ok),
        latency: Number(result.latencyMs || result.latency || 0) || 0,
        latencyMs: Number(result.latencyMs || result.latency || 0) || 0,
        error: cleanText(result.error || result.output),
        address: node.address,
        port: node.port,
        protocol,
        checkedBy: agentId,
        statusCode: Number(result.statusCode || 0) || 0,
        exitIp: cleanText(result.exitIp),
        exitCountry: cleanText(result.exitCountry),
        unsupported: Boolean(result.unsupported),
        notImplemented: Boolean(result.notImplemented),
        checkedAt: result.checkedAt || nowIso(),
        agentId,
        nodeId: node.id
      };
    } catch (error) {
      return {
        id: nanoid(),
        at: nowIso(),
        ok: false,
        latency: 0,
        latencyMs: 0,
        error: cleanText(error.message),
        address: node.address,
        port: node.port,
        protocol,
        checkedBy: agentId,
        statusCode: 0,
        exitIp: "",
        exitCountry: "",
        unsupported: false,
        notImplemented: false,
        checkedAt: nowIso(),
        agentId,
        nodeId: node.id
      };
    }
  }

  const test = await tcpCheck(node.address, node.port, options);
  return {
    id: nanoid(),
    at: nowIso(),
    ok: test.ok,
    latency: test.latency,
    latencyMs: test.latency,
    error: test.error,
    address: node.address,
    port: node.port,
    protocol,
    checkedBy: cleanText(options.checkedBy) || "server",
    statusCode: 0,
    exitIp: "",
    exitCountry: "",
    unsupported: false,
    notImplemented: false,
    checkedAt: nowIso(),
    agentId: cleanText(options.agentId),
    nodeId: node.id
  };
}

function recordNodeCheck(nodeId, result) {
  const current = state.nodePool?.[nodeId];
  if (!current) return;
  state.proxyChecks ||= {};
  state.proxyChecks[nodeId] ||= [];
  state.proxyChecks[nodeId].push(result);
  state.proxyChecks[nodeId] = state.proxyChecks[nodeId].slice(-30);
  current.lastCheckAt = result.at;
  current.lastError = result.error || "";
  current.health = result.ok ? "healthy" : result.unsupported || result.notImplemented ? "unknown" : "offline";
  current.metadata ||= {};
  current.metadata.proxyCheck = {
    ok: Boolean(result.ok),
    protocol: result.protocol,
    latencyMs: Number(result.latencyMs || result.latency || 0) || 0,
    exitIp: cleanText(result.exitIp),
    exitCountry: cleanText(result.exitCountry),
    statusCode: Number(result.statusCode || 0) || 0,
    error: cleanText(result.error),
    checkedAt: result.checkedAt || result.at || nowIso(),
    agentId: cleanText(result.agentId || result.checkedBy),
    nodeId,
    unsupported: Boolean(result.unsupported),
    notImplemented: Boolean(result.notImplemented)
  };
  current.score = scoreNode(current, state.proxyChecks[nodeId]);
  current.updatedAt = nowIso();
  storage.writeNodeQualityHistory({
    id: result.id,
    nodeId,
    protocol: result.protocol,
    agentId: result.agentId || result.checkedBy,
    ok: result.ok,
    score: current.score,
    latencyMs: result.latencyMs || result.latency,
    exitIp: result.exitIp,
    exitCountry: result.exitCountry,
    error: result.error,
    checkedAt: result.checkedAt || result.at || nowIso(),
    detail: result
  });
}

function runTemplateVariables(content, variables = {}) {
  let output = String(content || "");
  for (const [key, value] of Object.entries(variables || {})) {
    output = output.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return output;
}

async function executeAgentCommand(agentId, command, options = {}) {
  const ssh = publicSshProfile(agentId);
  if (ssh.ready) {
    const result = await execSshCommand(getSshConnectConfig(agentId), command, options);
    audit("admin", "remote_command", agentId, { transport: "ssh", ok: result.ok, command: command.slice(0, 120) });
    return { ...result, transport: "ssh" };
  }
  const result = await sendCommandAwait(agentId, "exec", { command }, options.timeoutMs || 40000);
  audit("admin", "remote_command", agentId, { transport: "agent", ok: result.ok, command: command.slice(0, 120) });
  return { ok: result.ok, output: result.output, transport: "agent" };
}

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const results = [];
  const size = Math.max(1, Number(limit || 1) || 1);
  const runners = Array.from({ length: Math.min(size, queue.length || size) }).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      results.push(await worker(next));
    }
  });
  await Promise.all(runners);
  return results;
}

function publicCommandRun(run) {
  return clone(run);
}

function buildDashboard() {
  const agents = Object.values(state.agents || {}).map(agentSummary);
  const onlineMetrics = agents.filter((item) => item.connected && item.metrics);
  const averageCpu = onlineMetrics.length ? onlineMetrics.reduce((sum, item) => sum + Number(item.metrics?.cpu?.usage || 0), 0) / onlineMetrics.length : 0;
  const totalRxRate = onlineMetrics.reduce((sum, item) => sum + Number(item.metrics?.network?.rxRate || 0), 0);
  const totalTxRate = onlineMetrics.reduce((sum, item) => sum + Number(item.metrics?.network?.txRate || 0), 0);
  return {
    total: agents.length,
    online: agents.filter((item) => item.connected).length,
    offline: agents.filter((item) => !item.connected).length,
    activeSingbox: agents.filter((item) => item.singboxStatus === "active").length,
    averageCpu: Math.round(averageCpu * 100) / 100,
    totalRxRate,
    totalTxRate,
    recent: agents.sort((left, right) => String(right.lastSeen || "").localeCompare(String(left.lastSeen || ""))).slice(0, 8),
    securityWarnings: storage.summarizeWarnings()
  };
}

function registerSubscriptionAccess(profile, req) {
  profile.accessCount = Number(profile.accessCount || 0) + 1;
  profile.lastAccessIp = cleanText(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "");
  profile.lastUserAgent = cleanText(req.headers["user-agent"] || "");
  state.subscriptionAccessLogs ||= [];
  const row = {
    id: nanoid(),
    profileId: profile.id,
    token: maskSecret(profile.publicToken),
    ip: maskIp(profile.lastAccessIp),
    userAgent: profile.lastUserAgent,
    format: profile.format || "clash",
    at: nowIso()
  };
  state.subscriptionAccessLogs.unshift(row);
  state.subscriptionAccessLogs = state.subscriptionAccessLogs.slice(0, 500);
  storage.writeSubscriptionAccess(row);
  audit("public", "subscription_access", profile.id, { token: maskSecret(profile.publicToken), ip: profile.lastAccessIp, format: profile.format || "clash" });
}

function buildSubscriptionStatus(profile) {
  if (profile.enabled === false) return { ok: false, error: "subscription disabled" };
  if (profile.expiresAt && Date.parse(profile.expiresAt) && Date.parse(profile.expiresAt) < Date.now()) return { ok: false, error: "subscription expired" };
  if (profile.maxAccessCount && Number(profile.accessCount || 0) >= Number(profile.maxAccessCount || 0)) return { ok: false, error: "subscription access limit exceeded" };
  return { ok: true, error: "" };
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
    tags: Array.isArray(patch.tags) ? patch.tags.map((item) => cleanText(item)).filter(Boolean) : current?.tags || [],
    note: cleanText(patch.note || current?.note),
    createdAt: current?.createdAt || nowIso(),
    updatedAt: nowIso()
  };
  if (index >= 0) list[index] = next;
  else list.unshift(next);
  return next;
}

function removeForwardRule(agentId, ruleId) {
  const list = state.forwardRules?.[agentId] || [];
  state.forwardRules[agentId] = list.filter((item) => item.id !== ruleId);
}

function updateConfigVersion(agentId, versionId, patch) {
  const version = (state.configVersions?.[agentId] || []).find((item) => item.id === versionId);
  if (!version) return;
  Object.assign(version, patch);
  saveState();
}

function attachAgentExecTerminal(ws, agentId) {
  const prompt = "$ ";
  let currentLine = "";
  let busy = false;

  const emit = (output) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "output", output }));
  };

  const renderPrompt = () => emit(prompt);

  const runCommand = (command) => {
    let commandId = "";
    busy = true;
    try {
      commandId = sendCommand(agentId, "exec", { command });
      audit("admin", "remote_command", agentId, { commandId, command: command.slice(0, 120), transport: "agent" });
    } catch (error) {
      busy = false;
      emit(`${error.message}\r\n${prompt}`);
      return;
    }

    commandWaiters.set(commandId, (result) => {
      commandWaiters.delete(commandId);
      busy = false;
      emit(`${result.output ? `${result.output}\r\n` : ""}${prompt}`);
    });

    setTimeout(() => {
      if (!commandWaiters.has(commandId)) return;
      commandWaiters.delete(commandId);
      busy = false;
      emit(`command timeout\r\n${prompt}`);
    }, 35000);
  };

  emit(`Connected to ${state.agents[agentId]?.name || agentId} via agent exec.\r\n${prompt}`);

  ws.on("message", (raw) => {
    let payload = { type: "input", data: raw.toString() };
    try {
      const parsed = JSON.parse(raw.toString());
      if (parsed && typeof parsed === "object") payload = parsed;
    } catch {}

    if (payload.type === "resize") return;
    const data = String(payload.data ?? payload.input ?? "").replace(/\r\n/g, "\n");
    if (!data) return;

    for (const char of data) {
      if (busy) {
        if (char === "\u0003") emit("^C\r\n");
        continue;
      }

      if (char === "\r" || char === "\n") {
        emit("\r\n");
        const command = currentLine.trim();
        currentLine = "";
        if (!command) {
          renderPrompt();
          continue;
        }
        if (["exit", "quit", "logout"].includes(command.toLowerCase())) {
          emit("terminal closed\r\n");
          ws.close();
          return;
        }
        runCommand(command);
        continue;
      }

      if (char === "\u0003") {
        currentLine = "";
        emit("^C\r\n");
        renderPrompt();
        continue;
      }

      if (char === "\u0008" || char === "\u007f") {
        if (!currentLine) continue;
        currentLine = currentLine.slice(0, -1);
        emit("\b \b");
        continue;
      }

      if (char >= " " || char === "\t") {
        currentLine += char;
        emit(char);
      }
    }
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
        audit("admin", "ssh_connect", agentId, { host: resolveSshProfile(agentId).host });
        ws.send(JSON.stringify({ type: "output", output: `Connected to ${resolveSshProfile(agentId).username}@${resolveSshProfile(agentId).host}\n` }));
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadMaxBytes },
  fileFilter: (_, file, callback) => {
    if (!allowedUploadTypes.size || allowedUploadTypes.has(file.mimetype)) callback(null, true);
    else callback(new Error(`file type not allowed: ${file.mimetype}`));
  }
});

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(requireApiAccess);

app.get("/api/health", (_, res) => res.json({ ok: true, name: "chiken-easy", storage: storage.mode }));

app.get("/api/auth/status", (req, res) => {
  const access = requestAccess(req);
  res.json({
    authorized: access.authorized,
    hasToken: Boolean(access.apiToken),
    hasSession: Boolean(access.session),
    queryTokenEnabled: process.env.CHIKEN_ALLOW_QUERY_TOKEN === "1",
    settings: publicSettings()
  });
});

app.post("/api/auth/login", (req, res) => {
  const username = cleanText(req.body?.username || "admin") || "admin";
  const password = String(req.body?.password || "");
  const admin = normalizeAdminRecord(state.auth?.admin);
  if (!admin?.passwordHash || username !== cleanText(admin.username || "admin")) {
    audit("anonymous", "login_failure", "-", { username });
    return res.status(401).json({ error: "invalid credentials" });
  }
  const result = verifyPassword(password, admin.passwordHash);
  if (!result.ok) {
    audit("anonymous", "login_failure", "-", { username });
    return res.status(401).json({ error: "invalid credentials" });
  }
  if (result.needsUpgrade) {
    state.auth.admin.passwordHash = createPasswordHash(password);
    state.auth.admin.updatedAt = nowIso();
    saveState();
  }
  setSessionCookie(res, createBrowserSession({ type: "admin", username }));
  audit("admin", "login_success", "-", { username });
  return res.json({ ok: true, username });
});

app.post("/api/auth/session", (req, res) => {
  const access = requestAccess(req);
  const bodyToken = cleanText(req.body?.token);
  const apiToken = access.apiToken || validateApiToken(bodyToken);
  if (apiToken) {
    setSessionCookie(res, createBrowserSession({ type: "apiToken", tokenId: apiToken.id || apiToken.name }));
    audit("admin", "login_success", "-", { mode: "apiToken" });
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: "valid API token required" });
});

app.delete("/api/auth/session", (_, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/settings", (_, res) => {
  res.json(publicSettings());
});

app.put("/api/settings", (req, res) => {
  state.settings = normalizeSettings(req.body || {});
  saveState();
  audit("admin", "update_settings", "-", { alerts: state.settings.alerts });
  res.json(publicSettings());
});

app.post("/api/settings/notifications/test", async (_, res) => {
  await sendNotification("ChikenEasy notification test", "This is a test message from the control panel.");
  audit("admin", "notification_test", "-", {});
  res.json({ ok: true });
});

app.get("/api/dashboard", (_, res) => {
  res.json(buildDashboard());
});

app.get("/api/public/probes", (_, res) => {
  res.json(listPublicProbes());
});

app.get("/api/public/probes/history", (req, res) => {
  const agent = getAgent(req.query.agentId);
  if (!agent || ensureAssetFromAgent(agent).public === false) return res.status(404).json({ error: "public probe not found" });
  res.json(buildMonitorHistory(agent.id));
});

app.get("/api/public/events", (_, res) => {
  res.json(
    (state.monitorEvents || [])
      .filter((item) => item.public !== false)
      .slice(0, 100)
      .map((item) => ({ ...item }))
  );
});

app.get("/api/monitor/summary", (_, res) => {
  const probes = listPublicProbes();
  const online = probes.filter((item) => item.online);
  res.json({
    total: probes.length,
    online: online.length,
    offline: probes.length - online.length,
    groups: Array.from(new Set(probes.map((item) => item.group).filter(Boolean))).length,
    regions: Array.from(new Set(probes.map((item) => item.region).filter(Boolean))).length,
    totalTraffic: probes.reduce((sum, item) => sum + Number(item.metrics?.rxBytes || 0) + Number(item.metrics?.txBytes || 0), 0),
    totalRxSpeed: probes.reduce((sum, item) => sum + Number(item.metrics?.rxSpeed || 0), 0),
    totalTxSpeed: probes.reduce((sum, item) => sum + Number(item.metrics?.txSpeed || 0), 0),
    recentEvents: (state.monitorEvents || []).slice(0, 20)
  });
});

app.get("/api/agents", (_, res) => res.json(Object.values(state.agents || {}).map(agentSummary)));

app.get("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  return res.json(detailAgent(agent));
});

app.get("/api/agents/:id/probe/history", (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  res.json(buildMonitorHistory(req.params.id));
});

app.get("/api/assets", (_, res) => {
  res.json(Object.values(state.assets || {}).map(publicAsset).sort((left, right) => String(left.displayName).localeCompare(String(right.displayName))));
});

app.post("/api/assets", (req, res) => {
  const asset = normalizeAsset(req.body || {});
  state.assets ||= {};
  state.assets[asset.id] = asset;
  saveState();
  audit("admin", "asset_create", asset.id, { displayName: asset.displayName });
  res.json(publicAsset(asset));
});

app.put("/api/assets/:id", (req, res) => {
  const current = state.assets?.[req.params.id];
  if (!current) return res.status(404).json({ error: "asset not found" });
  const asset = normalizeAsset({ ...req.body, id: current.id }, current);
  state.assets[asset.id] = asset;
  saveState();
  audit("admin", "asset_update", asset.id, { displayName: asset.displayName });
  res.json(publicAsset(asset));
});

app.delete("/api/assets/:id", (req, res) => {
  const current = state.assets?.[req.params.id];
  if (!current) return res.status(404).json({ error: "asset not found" });
  delete state.assets[req.params.id];
  saveState();
  audit("admin", "asset_delete", req.params.id, { displayName: current.displayName });
  res.json({ ok: true });
});

app.get("/api/credentials", (_, res) => {
  res.json(Object.values(state.credentials || {}).filter((item) => !item.revokedAt).map(publicCredential));
});

app.post("/api/credentials", (req, res) => {
  const credential = normalizeCredential(req.body || {});
  state.credentials ||= {};
  state.credentials[credential.id] = credential;
  saveState();
  audit("admin", "credential_create", credential.id, { name: credential.name, mode: credential.mode });
  res.json(publicCredential(credential));
});

app.post("/api/credentials/:id/test", async (req, res) => {
  const credential = getCredential(req.params.id);
  if (!credential || credential.revokedAt) return res.status(404).json({ error: "credential not found" });
  try {
    const result = await execSshCommand(getSshConnectConfig("-", credential), "printf 'credential ok\\n' && uname -a");
    audit("admin", "credential_use", credential.id, { ok: result.ok, mode: credential.mode });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete("/api/credentials/:id", (req, res) => {
  const credential = getCredential(req.params.id);
  if (!credential || credential.revokedAt) return res.status(404).json({ error: "credential not found" });
  credential.revokedAt = nowIso();
  saveState();
  audit("admin", "credential_revoke", credential.id, { name: credential.name });
  res.json({ ok: true });
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
    host: cleanText(req.body?.host || current.host || agent.ip || agent.host),
    port: Number(req.body?.port || current.port || 22) || 22,
    username: cleanText(req.body?.username || current.username || "root") || "root",
    mode: req.body?.mode === "privateKey" ? "privateKey" : "password",
    credentialId: cleanText(req.body?.credentialId || current.credentialId),
    updatedAt: nowIso()
  };
  if (req.body?.clearPassword) delete next.password;
  if (req.body?.clearPrivateKey) delete next.privateKey;
  if ("password" in (req.body || {}) && cleanText(req.body.password)) next.password = req.body.password;
  if ("privateKey" in (req.body || {}) && cleanText(req.body.privateKey)) next.privateKey = req.body.privateKey;
  state.sshProfiles ||= {};
  state.sshProfiles[req.params.id] = next;
  saveState();
  audit("admin", "ssh_connect", req.params.id, { host: next.host, port: next.port, mode: next.mode });
  res.json(publicSshProfile(req.params.id));
});

app.post("/api/agents/:id/ssh-profile/test", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const result = await execSshCommand(getSshConnectConfig(req.params.id, req.body || {}), "printf 'ssh ok\\n' && uname -a");
    audit("admin", "ssh_connect", req.params.id, { ok: result.ok });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/install-command", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });

  pruneInstallBundles(state);
  const baseUrl = resolvePublicBaseUrl(req);
  const bundle = createInstallBundle(state, req.params.id, {
    mode: req.body?.mode,
    appDir: req.body?.appDir,
    wsUrl: resolvePublicWsUrl(req),
    agentName: req.body?.agentName || agent.name,
    agentHost: req.body?.agentHost || agent.host,
    probeInterval: req.body?.probeInterval
  });
  saveState();
  const scriptUrl = new URL("/install/agent.sh", baseUrl);
  scriptUrl.searchParams.set("bundle", bundle.id);
  audit("admin", "token_create", req.params.id, { mode: bundle.mode, expiresAt: bundle.expiresAt });
  res.json({
    ok: true,
    mode: bundle.mode,
    appDir: bundle.appDir,
    expiresAt: bundle.expiresAt,
    wsUrl: bundle.wsUrl,
    scriptUrl: scriptUrl.toString(),
    command: buildInstallCommand(baseUrl, bundle.id)
  });
});

app.post("/api/agents/:id/deploy", async (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  if (!publicSshProfile(req.params.id).ready) return res.status(400).json({ error: "SSH profile is required before deployment" });

  pruneInstallBundles(state);
  const baseUrl = resolvePublicBaseUrl(req);
  const bundle = createInstallBundle(state, req.params.id, {
    mode: req.body?.mode,
    appDir: req.body?.appDir,
    wsUrl: resolvePublicWsUrl(req),
    agentName: req.body?.agentName || agent.name,
    agentHost: req.body?.agentHost || agent.host,
    probeInterval: req.body?.probeInterval
  });
  saveState();

  try {
    const result = await execSshCommand(getSshConnectConfig(req.params.id), "sh -s", { stdin: buildAgentInstallScript(bundle) });
    audit("admin", "agent_register", req.params.id, { mode: bundle.mode, ok: result.ok });
    res.json({
      ok: result.ok,
      mode: bundle.mode,
      appDir: bundle.appDir,
      wsUrl: bundle.wsUrl,
      command: buildInstallCommand(baseUrl, bundle.id),
      output: result.output
    });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/tokens", (_, res) => {
  const token = `ce_${nanoid(32)}`;
  const item = { token, createdAt: nowIso(), used: false };
  state.tokens.push(item);
  saveState();
  audit("admin", "token_create", "-", { token: maskSecret(token) });
  res.json(item);
});

app.get("/api/api-tokens", (_, res) => {
  res.json(
    (state.apiTokens || [])
      .filter((item) => !item.revoked)
      .map((item) => ({
        id: item.id,
        name: item.name,
        token: `${cleanText(item.token).slice(0, 10)}...`,
        createdAt: item.createdAt,
        bootstrap: Boolean(item.bootstrap)
      }))
  );
});

app.post("/api/api-tokens", (req, res) => {
  const token = `ck_${nanoid(36)}`;
  const item = {
    id: nanoid(),
    name: cleanText(req.body?.name || "api") || "api",
    token,
    tokenHash: hashApiToken(token),
    createdAt: nowIso()
  };
  state.apiTokens ||= [];
  state.apiTokens.push(item);
  saveState();
  audit("admin", "token_create", "-", { name: item.name });
  res.json({ ...item, token });
});

app.delete("/api/api-tokens/:id", (req, res) => {
  const item = (state.apiTokens || []).find((token) => token.id === req.params.id);
  if (!item) return res.status(404).json({ error: "token not found" });
  item.revoked = true;
  saveState();
  audit("admin", "token_delete", "-", { name: item.name });
  res.json({ ok: true });
});

app.get("/api/subscriptions/meta", (_, res) => {
  res.json({
    templates: subscriptionTemplateCatalog,
    nodes: listSubscriptionNodes(state),
    nodePool: Object.values(state.nodePool || {}).map(publicNode)
  });
});

app.get("/api/subscriptions", (req, res) => {
  const rows = Object.values(state.subscriptionProfiles || {})
    .map((profile) => publicSubscriptionProfile(req, profile))
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")));
  res.json(rows);
});

app.get("/api/subscriptions/:id", (req, res) => {
  const profile = state.subscriptionProfiles?.[req.params.id];
  if (!profile) return res.status(404).json({ error: "subscription not found" });
  res.json(publicSubscriptionProfile(req, profile, true));
});

app.post("/api/subscriptions/render", (req, res) => {
  try {
    const current = state.subscriptionProfiles?.[req.body?.id] || {};
    const profile = normalizeSubscriptionToken(req.body || {}, current);
    const rendered = renderSubscriptionOutput(profile, req.body?.format);
    res.json({
      ...rendered,
      profile: publicSubscriptionProfile(req, profile, true)
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/subscriptions", (req, res) => {
  try {
    const profile = normalizeSubscriptionToken(req.body || {});
    state.subscriptionProfiles ||= {};
    state.subscriptionProfiles[profile.id] = profile;
    saveState();
    audit("admin", "subscription_create", profile.id, { format: profile.format, localNodes: profile.localNodes.length, nodeIds: profile.nodeIds.length });
    res.json(publicSubscriptionProfile(req, profile, true));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/subscriptions/:id", (req, res) => {
  const current = state.subscriptionProfiles?.[req.params.id];
  if (!current) return res.status(404).json({ error: "subscription not found" });
  try {
    const profile = normalizeSubscriptionToken({ ...req.body, id: current.id }, current);
    if (req.body?.regenerateToken) profile.publicToken = nanoid(18);
    state.subscriptionProfiles[profile.id] = profile;
    saveState();
    audit("admin", "subscription_update", profile.id, { regenerateToken: Boolean(req.body?.regenerateToken), format: profile.format });
    res.json(publicSubscriptionProfile(req, profile, true));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/subscriptions/:id", (req, res) => {
  const profile = state.subscriptionProfiles?.[req.params.id];
  if (!profile) return res.status(404).json({ error: "subscription not found" });
  delete state.subscriptionProfiles[req.params.id];
  saveState();
  audit("admin", "subscription_delete", req.params.id, { name: profile.name });
  res.json({ ok: true });
});

app.get("/api/subscription-access", (_, res) => {
  const sqliteRows = storage.querySubscriptionAccess({ limit: 200 });
  res.json(sqliteRows.length ? sqliteRows : (state.subscriptionAccessLogs || []).slice(0, 200));
});

app.get("/api/subscription-sources", (_, res) => {
  res.json(Object.values(state.subscriptionSources || {}).map((item) => redactObject(item)));
});

app.post("/api/subscription-sources", (req, res) => {
  const current = {};
  const source = {
    id: nanoid(10),
    name: cleanText(req.body?.name) || "source",
    url: cleanText(req.body?.url),
    username: cleanText(req.body?.username),
    password: cleanText(req.body?.password),
    removeMissing: Boolean(req.body?.removeMissing),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  state.subscriptionSources ||= {};
  state.subscriptionSources[source.id] = source;
  saveState();
  audit("admin", "subscription_source_create", source.id, { name: source.name });
  res.json(redactObject(source));
});

app.post("/api/subscription-sources/:id/sync", async (req, res) => {
  const source = state.subscriptionSources?.[req.params.id];
  if (!source) return res.status(404).json({ error: "source not found" });
  try {
    const headers = {};
    if (source.username || source.password) {
      headers.Authorization = `Basic ${Buffer.from(`${source.username}:${source.password}`).toString("base64")}`;
    }
    const response = await fetch(source.url, { headers });
    const content = await response.text();
    const imported = importNodesFromContent(content, { source: "subscription-source", sourceId: source.id });
    const next = upsertNodePool(state.nodePool || {}, imported.nodes, { removeMissing: source.removeMissing, sourceId: source.id });
    state.nodePool = next.pool;
    source.updatedAt = nowIso();
    saveState();
    audit("admin", "node_import", source.id, { count: imported.nodes.length, warnings: imported.warnings.length });
    res.json({ ok: true, count: imported.nodes.length, warnings: imported.warnings, changed: next.changed });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/node-pool", (_, res) => {
  res.json(Object.values(state.nodePool || {}).map(publicNode));
});

app.get("/api/node-pool/:id", (req, res) => {
  const node = state.nodePool?.[req.params.id];
  if (!node) return res.status(404).json({ error: "node not found" });
  const quality = storage.queryNodeQualityHistory(req.params.id, { limit: 50 });
  res.json({ ...publicNode(node), checks: state.proxyChecks?.[req.params.id] || [], qualityHistory: quality });
});

app.post("/api/node-pool/import", (req, res) => {
  const imported = importNodesFromContent(req.body?.content || "", { source: req.body?.source || "manual", sourceId: req.body?.sourceId || "" });
  const next = upsertNodePool(state.nodePool || {}, imported.nodes, {
    removeMissing: Boolean(req.body?.removeMissing),
    sourceId: req.body?.sourceId || ""
  });
  state.nodePool = next.pool;
  saveState();
  audit("admin", "node_import", "-", { count: imported.nodes.length, warnings: imported.warnings.length });
  res.json({ ok: true, nodes: Object.values(state.nodePool || {}).map(publicNode), warnings: imported.warnings, changed: next.changed });
});

app.post("/api/node-pool/from-agent/:id", (req, res) => {
  const profile = state.nodeProfiles?.[req.params.id];
  if (!profile) return res.status(404).json({ error: "local node profile not found" });
  const next = upsertNodePool(state.nodePool || {}, [toNodePoolNodeFromLocalProfile(profile)], {});
  state.nodePool = next.pool;
  saveState();
  audit("admin", "node_import", req.params.id, { source: "local-node" });
  res.json({ ok: true, changed: next.changed });
});

app.post("/api/node-pool/from-forward/:agentId/:ruleId", (req, res) => {
  const rule = (state.forwardRules?.[req.params.agentId] || []).find((item) => item.id === req.params.ruleId);
  if (!rule) return res.status(404).json({ error: "forward rule not found" });
  const agent = getAgent(req.params.agentId);
  const node = {
    name: rule.name,
    protocol: "mixed",
    address: agent?.ip || agent?.host || "127.0.0.1",
    port: rule.port,
    source: "forward-rule",
    sourceId: rule.id,
    tags: rule.tags || [],
    group: "",
    region: ensureAssetFromAgent(agent || { id: req.params.agentId, name: req.params.agentId }).region || "",
    enabled: true
  };
  const next = upsertNodePool(state.nodePool || {}, [node], {});
  state.nodePool = next.pool;
  saveState();
  audit("admin", "node_import", rule.id, { source: "forward-rule" });
  res.json({ ok: true, changed: next.changed });
});

app.put("/api/node-pool/:id", (req, res) => {
  const current = state.nodePool?.[req.params.id];
  if (!current) return res.status(404).json({ error: "node not found" });
  state.nodePool[req.params.id] = {
    ...current,
    ...req.body,
    id: current.id,
    updatedAt: nowIso()
  };
  saveState();
  audit("admin", "node_update", req.params.id, { name: state.nodePool[req.params.id].name });
  res.json(publicNode(state.nodePool[req.params.id]));
});

app.delete("/api/node-pool/:id", (req, res) => {
  const current = state.nodePool?.[req.params.id];
  if (!current) return res.status(404).json({ error: "node not found" });
  delete state.nodePool[req.params.id];
  saveState();
  audit("admin", "node_delete", req.params.id, { name: current.name });
  res.json({ ok: true });
});

app.post("/api/node-pool/check", async (req, res) => {
  const ids = Array.isArray(req.body?.nodeIds) ? req.body.nodeIds.map((item) => cleanText(item)).filter(Boolean) : [];
  const nodes = ids.length ? ids.map((id) => state.nodePool?.[id]).filter(Boolean) : Object.values(state.nodePool || {});
  const checkedBy = cleanText(req.body?.checkedBy || "server");
  const agentId = cleanText(req.body?.agentId || (checkedBy === "server" ? "" : checkedBy));
  const results = [];
  for (const node of nodes) {
    const result = await checkNode(node, {
      checkedBy: checkedBy || "server",
      agentId,
      timeoutMs: req.body?.timeoutMs,
      url: req.body?.url || proxyCheckUrl
    });
    recordNodeCheck(node.id, result);
    results.push({ nodeId: node.id, ...result });
  }
  saveState();
  audit("admin", "proxy_check", "-", { count: results.length, agentId, url: req.body?.url || proxyCheckUrl });
  res.json({ ok: true, results });
});

app.get("/api/node-pool/export", (req, res) => {
  const format = cleanText(req.query.format || "base64") || "base64";
  const exportResult = exportNodePool(Object.values(state.nodePool || {}), format);
  res.setHeader("Content-Type", exportResult.contentType);
  res.send(exportResult.body);
});

app.get("/api/protocols", (_, res) => res.json(protocolCatalog));
app.get("/api/forwards", (_, res) => res.json(forwardCatalog));

app.post("/api/agents/:id/forward-images/:engine/check", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  const engine = cleanText(req.params.engine).toLowerCase();
  if (!["realm", "gost"].includes(engine)) return res.status(400).json({ error: "unsupported forward engine" });
  try {
    const result = await sendCommandAwait(req.params.id, "forward_image_probe", { engine }, 240000);
    audit("admin", "forward_image_probe", req.params.id, { engine, ok: result.ok, image: result.image, pulled: Boolean(result.pulled) });
    res.json({
      ok: Boolean(result.ok),
      engine,
      image: cleanText(result.image),
      present: Boolean(result.present),
      pulled: Boolean(result.pulled),
      error: result.ok ? "" : cleanText(result.output || result.error),
      output: cleanText(result.output)
    });
  } catch (error) {
    audit("admin", "forward_image_probe", req.params.id, { engine, ok: false, error: error.message });
    res.status(409).json({ error: error.message });
  }
});

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
  res.json((state.forwardRules?.[req.params.id] || []).map((item) => ({ ...item })));
});

app.delete("/api/agents/:id/forwards/:ruleId", (req, res) => {
  const rules = state.forwardRules?.[req.params.id] || [];
  const rule = rules.find((item) => item.id === req.params.ruleId);
  if (!rule) return res.status(404).json({ error: "forward rule not found" });
  try {
    const commandId = sendCommand(req.params.id, "remove_forward_rule", { rule });
    forwardCommandRefs.set(commandId, { agentId: req.params.id, ruleId: rule.id, action: "remove" });
    audit("admin", "forward_delete", req.params.id, { commandId, ruleId: rule.id });
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
    const savedRule = upsertForwardRule(req.params.id, {
      ...rule,
      tags: Array.isArray(incoming.tags) ? incoming.tags : existing?.tags || [],
      note: incoming.note || existing?.note || "",
      status: "pending",
      lastError: ""
    });
    saveState();
    const commandId = sendCommand(req.params.id, "apply_forward_rule", { rule: savedRule });
    forwardCommandRefs.set(commandId, { agentId: req.params.id, ruleId: savedRule.id, action: "apply" });
    audit("admin", "forward_create", req.params.id, { commandId, ruleId: savedRule.id, engine: savedRule.engine });
    res.json({ ok: true, commandId, rule: savedRule, preview: buildForwardConfig(savedRule) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/config/wizard", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  try {
    const config = buildConfig(req.body || {});
    const version = { id: nanoid(), at: nowIso(), status: "pending", config };
    state.configVersions[req.params.id] ||= [];
    state.configVersions[req.params.id].unshift(version);
    state.configVersions[req.params.id] = state.configVersions[req.params.id].slice(0, 30);
    state.nodeProfiles ||= {};
    state.nodeProfiles[req.params.id] = buildNodeProfile(agent, req.body || {}, version.id);
    saveState();
    const commandId = sendCommand(req.params.id, "apply_config", { config, restart: true, versionId: version.id });
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
    audit("admin", "config_deliver", req.params.id, { commandId, versionId: version.id, protocol: req.body?.protocol });
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
    audit("admin", "config_read", req.params.id, { commandId });
    res.json({ ok: true, commandId, config: state.agents[req.params.id]?.lastConfig || null });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/config", (req, res) => {
  const { config, restart = true } = req.body || {};
  if (!config || typeof config !== "object") return res.status(400).json({ error: "config object required" });
  const version = { id: nanoid(), at: nowIso(), status: "pending", config };
  state.configVersions[req.params.id] ||= [];
  state.configVersions[req.params.id].unshift(version);
  state.configVersions[req.params.id] = state.configVersions[req.params.id].slice(0, 30);
  saveState();
  try {
    const commandId = sendCommand(req.params.id, "apply_config", { config, restart, versionId: version.id });
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
    audit("admin", "config_deliver", req.params.id, { commandId, versionId: version.id, restart });
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
    audit("admin", "config_rollback", req.params.id, { commandId, versionId: version.id });
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
    audit("admin", "remote_command", req.params.id, { commandId, preset: preset.id });
    res.json({ ok: true, commandId });
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/ssh", async (req, res) => {
  const command = cleanText(req.body?.command);
  if (!command) return res.status(400).json({ error: "command required" });
  try {
    const result = await executeAgentCommand(req.params.id, command);
    res.json(result);
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
});

app.post("/api/agents/:id/uninstall", (req, res) => {
  try {
    const commandId = sendCommand(req.params.id, "uninstall_agent", { removeSingbox: Boolean(req.body?.removeSingbox) });
    audit("admin", "agent_uninstall", req.params.id, { commandId, removeSingbox: Boolean(req.body?.removeSingbox) });
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

app.get("/api/agents/:id/sftp", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const remotePath = normalizeRemotePath(req.query.path || "/");
    const rows = await withSftp(req.params.id, {}, (sftp) => new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (error, entries) => {
        if (error) return reject(error);
        resolve(
          (entries || []).map((item) => ({
            name: item.filename,
            longname: item.longname,
            size: Number(item.attrs?.size || 0),
            modifiedAt: item.attrs?.mtime ? new Date(item.attrs.mtime * 1000).toISOString() : null,
            isDirectory: item.longname?.startsWith("d") || false
          }))
        );
      });
    }));
    audit("admin", "sftp_list", req.params.id, { path: remotePath, count: rows.length });
    res.json({ path: remotePath, entries: rows });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/sftp/upload", upload.single("file"), async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  if (!req.file) return res.status(400).json({ error: "file required" });
  try {
    const directory = normalizeRemotePath(req.body?.directory || "/tmp");
    const remotePath = normalizeRemotePath(path.posix.join(directory, safeFileName(req.file.originalname)));
    await withSftp(req.params.id, {}, (sftp) => sftpWriteFile(sftp, remotePath, req.file.buffer));
    audit("admin", "sftp_upload", req.params.id, { path: remotePath, size: req.file.size });
    res.json({ ok: true, path: remotePath, size: req.file.size });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/agents/:id/sftp/download", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const remotePath = normalizeRemotePath(req.query.path || "/tmp/test.txt");
    const buffer = await withSftp(req.params.id, {}, async (sftp) => readSftpStream(sftp.createReadStream(remotePath)));
    audit("admin", "sftp_download", req.params.id, { path: remotePath, size: buffer.length });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${path.posix.basename(remotePath)}"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/agents/:id/sftp", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const remotePath = normalizeRemotePath(req.query.path || req.body?.path || "");
    await withSftp(req.params.id, {}, (sftp) => new Promise((resolve, reject) => {
      sftp.unlink(remotePath, (error) => (error ? reject(error) : resolve()));
    }));
    audit("admin", "sftp_delete", req.params.id, { path: remotePath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/sftp/mkdir", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const remotePath = normalizeRemotePath(req.body?.path || "");
    await withSftp(req.params.id, {}, (sftp) => new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (error) => (error ? reject(error) : resolve()));
    }));
    audit("admin", "sftp_mkdir", req.params.id, { path: remotePath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/sftp/rename", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const oldPath = normalizeRemotePath(req.body?.oldPath || "");
    const newPath = normalizeRemotePath(req.body?.newPath || "");
    await withSftp(req.params.id, {}, (sftp) => new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (error) => (error ? reject(error) : resolve()));
    }));
    audit("admin", "sftp_rename", req.params.id, { oldPath, newPath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/sftp/transfer", async (req, res) => {
  const sourceAgentId = cleanText(req.body?.sourceAgentId);
  const targetAgentId = cleanText(req.body?.targetAgentId);
  if (!getAgent(sourceAgentId)) return res.status(404).json({ error: "source agent not found" });
  if (!getAgent(targetAgentId)) return res.status(404).json({ error: "target agent not found" });
  try {
    const sourcePath = normalizeRemotePath(req.body?.sourcePath || "");
    const targetPath = normalizeRemotePath(req.body?.targetPath || "");
    const maxBytes = Math.max(1024 * 1024, (Number(process.env.CHIKEN_SFTP_TRANSFER_MAX_MB || 64) || 64) * 1024 * 1024);
    const buffer = await withSftp(sourceAgentId, {}, async (sftp) => {
      const stats = await sftpStat(sftp, sourcePath);
      const size = Number(stats?.size || 0);
      if (stats?.isDirectory?.()) throw new Error("source path is a directory");
      if (size > maxBytes) throw new Error(`file exceeds transfer limit (${Math.round(maxBytes / 1024 / 1024)} MB)`);
      return readSftpStream(sftp.createReadStream(sourcePath));
    });
    await withSftp(targetAgentId, {}, (sftp) => sftpWriteFile(sftp, targetPath, buffer));
    audit("admin", "sftp_transfer", `${sourceAgentId}->${targetAgentId}`, { sourcePath, targetPath, size: buffer.length });
    res.json({ ok: true, sourceAgentId, targetAgentId, sourcePath, targetPath, size: buffer.length });
  } catch (error) {
    audit("admin", "sftp_transfer", `${sourceAgentId}->${targetAgentId}`, { ok: false, error: error.message });
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/memos", (req, res) => {
  const query = cleanText(req.query.q).toLowerCase();
  const tag = cleanText(req.query.tag);
  const agentId = cleanText(req.query.agentId);
  const rows = Object.values(state.memos || {})
    .filter((memo) => !query || [memo.title, memo.content, ...(memo.tags || [])].join(" ").toLowerCase().includes(query))
    .filter((memo) => !tag || (memo.tags || []).includes(tag))
    .filter((memo) => !agentId || memo.agentId === agentId)
    .sort((left, right) => Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) || String(right.updatedAt).localeCompare(String(left.updatedAt)));
  res.json(rows.map(publicMemo));
});

app.post("/api/memos", (req, res) => {
  const memo = normalizeMemo(req.body || {});
  state.memos ||= {};
  state.memos[memo.id] = memo;
  saveState();
  audit("admin", "memo_create", memo.id, { title: memo.title });
  res.json(publicMemo(memo));
});

app.put("/api/memos/:id", (req, res) => {
  const current = state.memos?.[req.params.id];
  if (!current) return res.status(404).json({ error: "memo not found" });
  const memo = normalizeMemo({ ...req.body, id: current.id }, current);
  state.memos[memo.id] = memo;
  saveState();
  audit("admin", "memo_update", memo.id, { title: memo.title });
  res.json(publicMemo(memo));
});

app.delete("/api/memos/:id", (req, res) => {
  const current = state.memos?.[req.params.id];
  if (!current) return res.status(404).json({ error: "memo not found" });
  delete state.memos[req.params.id];
  saveState();
  audit("admin", "memo_delete", req.params.id, { title: current.title });
  res.json({ ok: true });
});

app.get("/api/files", (req, res) => {
  res.json(listFiles({ memoId: cleanText(req.query.memoId), tag: cleanText(req.query.tag), type: cleanText(req.query.type) }));
});

app.post("/api/files/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "file required" });
  const tags = cleanText(req.body?.tags)
    .split(",")
    .map((item) => cleanText(item))
    .filter(Boolean);
  const record = saveUploadedFile(req.file, {
    memoId: cleanText(req.body?.memoId),
    visibility: cleanText(req.body?.visibility || "private"),
    tags
  });
  if (record.memoId && state.memos?.[record.memoId]) {
    state.memos[record.memoId].attachments ||= [];
    state.memos[record.memoId].attachments.push(record.id);
    state.memos[record.memoId].updatedAt = nowIso();
  }
  saveState();
  audit("admin", "file_upload", record.id, { memoId: record.memoId, size: record.size });
  res.json(publicFile(record).file);
});

app.get("/api/files/:id/download", (req, res) => {
  const record = state.files?.[req.params.id];
  if (!record) return res.status(404).json({ error: "file not found" });
  const fullPath = path.join(uploadDir, record.diskName);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "file missing on disk" });
  audit("admin", "file_download", req.params.id, { memoId: record.memoId });
  res.download(fullPath, record.name);
});

app.delete("/api/files/:id", (req, res) => {
  const record = state.files?.[req.params.id];
  if (!record) return res.status(404).json({ error: "file not found" });
  const fullPath = path.join(uploadDir, record.diskName);
  fs.rmSync(fullPath, { force: true });
  for (const memo of Object.values(state.memos || {})) {
    memo.attachments = (memo.attachments || []).filter((item) => item !== req.params.id);
  }
  delete state.files[req.params.id];
  saveState();
  audit("admin", "file_delete", req.params.id, { memoId: record.memoId });
  res.json({ ok: true });
});

app.get("/api/scripts", (_, res) => {
  res.json(Object.values(state.scriptLibrary || {}).sort((left, right) => String(left.name).localeCompare(String(right.name))));
});

app.post("/api/scripts", (req, res) => {
  const script = normalizeScript(req.body || {});
  state.scriptLibrary ||= {};
  state.scriptLibrary[script.id] = script;
  saveState();
  audit("admin", "script_create", script.id, { name: script.name });
  res.json(script);
});

app.put("/api/scripts/:id", (req, res) => {
  const current = state.scriptLibrary?.[req.params.id];
  if (!current) return res.status(404).json({ error: "script not found" });
  const script = normalizeScript({ ...req.body, id: current.id }, current);
  state.scriptLibrary[script.id] = script;
  saveState();
  audit("admin", "script_update", script.id, { name: script.name });
  res.json(script);
});

app.delete("/api/scripts/:id", (req, res) => {
  const current = state.scriptLibrary?.[req.params.id];
  if (!current) return res.status(404).json({ error: "script not found" });
  delete state.scriptLibrary[req.params.id];
  saveState();
  audit("admin", "script_delete", req.params.id, { name: current.name });
  res.json({ ok: true });
});

app.post("/api/scripts/:id/run", async (req, res) => {
  const script = state.scriptLibrary?.[req.params.id];
  if (!script) return res.status(404).json({ error: "script not found" });
  const agentId = cleanText(req.body?.agentId);
  if (!getAgent(agentId)) return res.status(404).json({ error: "agent not found" });
  try {
    const command = runTemplateVariables(script.content, req.body?.variables || {});
    const result = await executeAgentCommand(agentId, command, { timeoutMs: script.timeoutMs });
    const run = {
      id: nanoid(),
      scriptId: script.id,
      agentId,
      command,
      output: result.output,
      ok: result.ok,
      at: nowIso()
    };
    state.commandRuns ||= {};
    state.commandRuns[run.id] = run;
    saveState();
    audit("admin", "remote_command", agentId, { scriptId: script.id, ok: result.ok });
    res.json(run);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/scripts/run-batch", async (req, res) => {
  const agentIds = Array.isArray(req.body?.agentIds) ? req.body.agentIds.map((item) => cleanText(item)).filter(Boolean) : [];
  const script = req.body?.scriptId ? state.scriptLibrary?.[req.body.scriptId] : null;
  const commandText = script ? runTemplateVariables(script.content, req.body?.variables || {}) : String(req.body?.command || "").trim();
  if (!commandText) return res.status(400).json({ error: "command or script required" });

  const results = await mapWithConcurrency(agentIds, req.body?.concurrency || 2, async (agentId) => {
    try {
      const result = await executeAgentCommand(agentId, commandText, { timeoutMs: Number(req.body?.timeoutMs || script?.timeoutMs || 30000) || 30000 });
      return { agentId, ok: result.ok, output: result.output, transport: result.transport };
    } catch (error) {
      return { agentId, ok: false, output: error.message, transport: "error" };
    }
  });

  const run = {
    id: nanoid(),
    agentIds,
    scriptId: script?.id || "",
    command: commandText,
    results,
    createdAt: nowIso()
  };
  state.commandRuns ||= {};
  state.commandRuns[run.id] = run;
  saveState();
  audit("admin", "batch_command", "-", { count: agentIds.length, scriptId: script?.id || "", ok: results.filter((item) => item.ok).length });
  res.json(run);
});

app.get("/api/command-runs", (_, res) => {
  res.json(Object.values(state.commandRuns || {}).sort((left, right) => String(right.createdAt || right.at || "").localeCompare(String(left.createdAt || left.at || ""))).map(publicCommandRun));
});

app.get("/api/audit", (req, res) => {
  res.json(getAuditRows({ limit: Number(req.query.limit || 300) || 300, action: cleanText(req.query.action), target: cleanText(req.query.target), actor: cleanText(req.query.actor) }));
});

app.get("/install/agent.sh", (req, res) => {
  pruneInstallBundles(state);
  const bundleId = cleanText(req.query.bundle);
  const bundle = state.installBundles?.[bundleId];
  if (!bundle) return res.status(404).type("text/plain").send("install bundle not found or expired");
  res.type("text/x-shellscript").send(buildAgentInstallScript(bundle));
});

app.get("/sub/:token", (req, res) => {
  const profile = Object.values(state.subscriptionProfiles || {}).find((item) => item.publicToken === req.params.token);
  if (!profile) return res.status(404).type("text/plain").send("subscription not found");
  const status = buildSubscriptionStatus(profile);
  if (!status.ok) return res.status(403).type("text/plain").send(status.error);
  try {
    const rendered = renderSubscriptionOutput(profile, req.query.format);
    registerSubscriptionAccess(profile, req);
    saveState();
    res.setHeader("Content-Type", rendered.contentType || "text/plain; charset=utf-8");
    res.send(rendered.body);
  } catch (error) {
    res.status(400).type("text/plain").send(error.message);
  }
});

if (fs.existsSync(webDist)) app.use(express.static(webDist));
app.get("*", (_, res, next) => {
  const index = path.join(webDist, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  return next();
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
  const mode = cleanText(url.searchParams.get("mode") || "ssh") || "ssh";

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
    const msg = parseJson(raw.toString(), {});
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "hello") {
      const token = validateAgentToken(msg.token);
      if (!token && process.env.CHIKEN_ALLOW_OPEN_REGISTER !== "1") {
        ws.send(JSON.stringify({ type: "error", error: "invalid token" }));
        ws.close();
        return;
      }

      agentId = msg.agent.id || nanoid();
      const previousConnected = Boolean(clients.has(agentId));
      state.agents[agentId] = {
        ...(state.agents[agentId] || {}),
        ...msg.agent,
        id: agentId,
        registeredAt: state.agents[agentId]?.registeredAt || nowIso(),
        lastSeen: nowIso()
      };
      ensureAssetFromAgent(state.agents[agentId]);
      recordMonitorSample(agentId, true);
      if (token) token.used = true;
      clients.set(agentId, ws);
      scheduleStateSave();
      if (!previousConnected) {
        appendMonitorEvent({
          id: nanoid(),
          agentId,
          type: "agent_online",
          severity: "info",
          message: `${state.agents[agentId].name || agentId} is online`,
          public: Boolean(ensureAssetFromAgent(state.agents[agentId]).public),
          updatedAt: nowIso()
        });
      }
      audit("agent", "agent_register", agentId, { host: msg.agent.host, ip: msg.agent.ip });
      ws.send(JSON.stringify({ type: "welcome", id: agentId }));
      return;
    }

    if (!agentId) return;

    if (msg.type === "heartbeat") {
      Object.assign(state.agents[agentId], msg.status, { lastSeen: nowIso() });
      recordMonitorSample(agentId, true);
      scheduleStateSave();
    }

    if (msg.type === "log") pushLog(agentId, { at: nowIso(), line: sanitizeSensitiveText(msg.line) });

    if (msg.type === "command_result") {
      audit("agent", "command_result", agentId, { commandId: msg.commandId, ok: msg.ok, output: String(msg.output || "").slice(0, 500) });

      if (configCommandRefs.has(msg.commandId)) {
        const ref = configCommandRefs.get(msg.commandId);
        updateConfigVersion(ref.agentId, ref.versionId, {
          status: msg.ok ? "applied" : "failed",
          lastOutput: String(msg.output || "").slice(0, 2000),
          appliedAt: nowIso()
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
          if (current) {
            upsertForwardRule(ref.agentId, {
              ...current,
              status: msg.ok ? "active" : "error",
              lastError: msg.ok ? "" : String(msg.output || ""),
              image: cleanText(msg.image || current.image),
              imageError: msg.ok ? "" : cleanText(msg.output || msg.error)
            });
          }
        }
        scheduleStateSave();
        forwardCommandRefs.delete(msg.commandId);
      }

      if (msg.command === "proxy_check" && msg.nodeId) {
        recordNodeCheck(msg.nodeId, {
          id: nanoid(),
          at: msg.checkedAt || nowIso(),
          ok: msg.ok,
          latency: Number(msg.latencyMs || msg.latency || 0) || 0,
          latencyMs: Number(msg.latencyMs || msg.latency || 0) || 0,
          error: cleanText(msg.error || msg.output),
          checkedBy: agentId,
          protocol: cleanText(msg.protocol),
          statusCode: Number(msg.statusCode || 0) || 0,
          exitIp: cleanText(msg.exitIp),
          exitCountry: cleanText(msg.exitCountry),
          unsupported: Boolean(msg.unsupported),
          notImplemented: Boolean(msg.notImplemented),
          checkedAt: msg.checkedAt || nowIso(),
          agentId,
          nodeId: msg.nodeId
        });
        scheduleStateSave();
      }

      if (commandWaiters.has(msg.commandId)) commandWaiters.get(msg.commandId)(msg);
      if (msg.log) pushLog(agentId, { at: nowIso(), line: sanitizeSensitiveText(msg.log) });
    }

    if (msg.type === "config") {
      state.agents[agentId].lastConfig = msg.config;
      state.agents[agentId].lastSeen = nowIso();
      scheduleStateSave();
      audit("agent", "config_read", agentId, { bytes: JSON.stringify(msg.config || {}).length });
      pushLog(agentId, { at: nowIso(), line: `[config] ${sanitizeSensitiveText(JSON.stringify(msg.config || {}))}` });
    }
  });

  ws.on("close", () => {
    if (!agentId) return;
    clients.delete(agentId);
    if (state.agents[agentId]) {
      state.agents[agentId].lastSeen = nowIso();
      recordMonitorSample(agentId, false);
    }
    appendMonitorEvent({
      id: nanoid(),
      agentId,
      type: "agent_offline",
      severity: "warning",
      message: `${state.agents[agentId]?.name || agentId} is offline`,
      public: Boolean(getAsset(agentId)?.public ?? true),
      updatedAt: nowIso()
    });
    scheduleStateSave();
    audit("agent", "agent_offline", agentId);
  });
});

const port = Number(process.env.PORT || 7788);
server.listen(port, () => console.log(`chiken-easy server listening on :${port}`));
