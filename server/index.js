import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { Client as SshClient } from "ssh2";
import { nanoid } from "nanoid";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import { buildConfig, buildForwardConfig, buildForwardRule, forwardCatalog, protocolCatalog } from "./configFactory.js";
import {
  buildPanelNode,
  createSubscriptionToken,
  parseNodeImport,
  publicNode,
  publicSubscriptionToken,
  renderSubscription,
  normalizeSubscriptionGroup,
  normalizeSubscriptionSource,
  normalizeSubscriptionToken,
  routeTemplates,
  selectSubscriptionNodes,
  summarizeSubscriptionNodes,
  validateSubscriptionOutputs,
  upsertNode
} from "./subscriptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataDir = path.join(root, "data");
const webDist = path.join(root, "dist");
const stateFile = path.join(dataDir, "state.json");
const auditFile = path.join(dataDir, "audit.jsonl");
const memoFileDir = path.join(dataDir, "memos", "files");

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(memoFileDir, { recursive: true });

const builtinCommands = [
  { id: "status", label: "查询 sing-box 状态", type: "service", action: "status", builtin: true },
  { id: "restart", label: "重启 sing-box", type: "service", action: "restart", builtin: true },
  { id: "tail", label: "读取最近日志", type: "logs", lines: 200, builtin: true },
  { id: "validate", label: "校验当前配置", type: "config", action: "validate", builtin: true },
  { id: "uptime", label: "查看系统负载", type: "shell", command: "uptime", builtin: true }
];

const defaultState = {
  tokens: [],
  apiTokens: [],
  agents: {},
  configVersions: {},
  forwardRules: {},
  sshProfiles: {},
  rdpProfiles: {},
  credentials: [],
  commands: builtinCommands,
  adminUsers: [],
  sessions: [],
  probeTasks: [],
  probeResults: {},
  probeProfiles: {},
  trafficCounters: {},
  monitorSettings: {
    site: {
      name: "Chiken Monitor",
      subtitle: "Chiken Monitor",
      description: "轻量服务器监控与节点管理面板",
      footer: "Powered by chiken-easy"
    },
    theme: {
      mode: "light",
      cardDensity: "standard",
      accent: "green",
      showHeaderActions: true
    },
    login: {
      title: "Chiken Monitor",
      sessionDays: 7,
      allowPasswordLogin: true
    },
    notifications: {
      offlineEnabled: false,
      loadEnabled: false,
      cpuThreshold: 90,
      memoryThreshold: 90,
      diskThreshold: 90,
      webhookUrl: "",
      channel: "webhook",
      telegramBotToken: "",
      telegramChatId: "",
      telegramApiBase: "https://api.telegram.org",
      cooldownMinutes: 10
    },
    general: {
      publicRefreshSeconds: 5,
      adminRefreshSeconds: 5,
      publicHideIp: true,
      publicDefaultGroup: "全部"
    }
  },
  nodePool: [],
  subscriptionTokens: [],
  subscriptionSources: [],
  subscriptionGroups: [],
  subscriptionAccessLog: [],
  memos: [],
  memoFiles: []
};

const clients = new Map();
const logStreams = new Map();
const eventStreams = new Set();
const publicProbeStreams = new Set();
const commandWaiters = new Map();
const configCommandRefs = new Map();
const forwardCommandRefs = new Map();
const notificationState = new Map();

function normalizeCommands(commands = []) {
  const custom = Array.isArray(commands) ? commands.filter((item) => item && !builtinCommands.some((builtin) => builtin.id === item.id)) : [];
  return [...builtinCommands, ...custom];
}

function cleanText(value, fallback = "", max = 200) {
  const text = String(value ?? fallback ?? "").trim();
  return text.slice(0, max);
}

function mergeMonitorSettings(input = {}) {
  const base = structuredClone(defaultState.monitorSettings);
  const next = {
    site: { ...base.site, ...(input.site || {}) },
    theme: { ...base.theme, ...(input.theme || {}) },
    login: { ...base.login, ...(input.login || {}) },
    notifications: { ...base.notifications, ...(input.notifications || {}) },
    general: { ...base.general, ...(input.general || {}) }
  };
  next.site.name = cleanText(next.site.name, "Chiken Monitor", 80) || "Chiken Monitor";
  next.site.subtitle = cleanText(next.site.subtitle, "Chiken Monitor", 80) || "Chiken Monitor";
  next.site.description = cleanText(next.site.description, "", 200);
  next.site.footer = cleanText(next.site.footer, "", 120);
  next.theme.mode = ["light", "dark", "system"].includes(next.theme.mode) ? next.theme.mode : "light";
  next.theme.cardDensity = ["compact", "standard", "relaxed"].includes(next.theme.cardDensity) ? next.theme.cardDensity : "standard";
  next.theme.accent = cleanText(next.theme.accent, "green", 30) || "green";
  next.theme.showHeaderActions = next.theme.showHeaderActions !== false;
  next.login.title = cleanText(next.login.title, "Chiken Monitor", 80) || "Chiken Monitor";
  next.login.sessionDays = Math.max(1, Math.min(30, Number(next.login.sessionDays || 7) || 7));
  next.login.allowPasswordLogin = next.login.allowPasswordLogin !== false;
  next.notifications.offlineEnabled = Boolean(next.notifications.offlineEnabled);
  next.notifications.loadEnabled = Boolean(next.notifications.loadEnabled);
  next.notifications.cpuThreshold = Math.max(1, Math.min(100, Number(next.notifications.cpuThreshold || 90) || 90));
  next.notifications.memoryThreshold = Math.max(1, Math.min(100, Number(next.notifications.memoryThreshold || 90) || 90));
  next.notifications.diskThreshold = Math.max(1, Math.min(100, Number(next.notifications.diskThreshold || 90) || 90));
  next.notifications.webhookUrl = cleanText(next.notifications.webhookUrl, "", 400);
  next.notifications.channel = ["webhook", "telegram", "both"].includes(next.notifications.channel) ? next.notifications.channel : "webhook";
  next.notifications.telegramBotToken = cleanText(next.notifications.telegramBotToken, "", 180);
  next.notifications.telegramChatId = cleanText(next.notifications.telegramChatId, "", 120);
  next.notifications.telegramApiBase = cleanText(next.notifications.telegramApiBase, "https://api.telegram.org", 220) || "https://api.telegram.org";
  next.notifications.cooldownMinutes = Math.max(1, Math.min(1440, Number(next.notifications.cooldownMinutes || 10) || 10));
  next.general.publicRefreshSeconds = Math.max(3, Math.min(120, Number(next.general.publicRefreshSeconds || 5) || 5));
  next.general.adminRefreshSeconds = Math.max(3, Math.min(120, Number(next.general.adminRefreshSeconds || 5) || 5));
  next.general.publicHideIp = next.general.publicHideIp !== false;
  next.general.publicDefaultGroup = cleanText(next.general.publicDefaultGroup, "全部", 40) || "全部";
  return next;
}

function loadState() {
  if (!fs.existsSync(stateFile)) return structuredClone(defaultState);
  const raw = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  return {
    ...structuredClone(defaultState),
    ...raw,
    forwardRules: raw.forwardRules || {},
    sshProfiles: raw.sshProfiles || {},
    rdpProfiles: raw.rdpProfiles || {},
    credentials: raw.credentials || [],
    commands: normalizeCommands(raw.commands),
    adminUsers: raw.adminUsers || [],
    sessions: raw.sessions || [],
    probeTasks: raw.probeTasks || [],
    probeResults: raw.probeResults || {},
    probeProfiles: raw.probeProfiles || {},
    trafficCounters: raw.trafficCounters || {},
    monitorSettings: mergeMonitorSettings(raw.monitorSettings || {}),
    nodePool: raw.nodePool || [],
    subscriptionTokens: raw.subscriptionTokens || [],
    subscriptionSources: raw.subscriptionSources || [],
    subscriptionGroups: raw.subscriptionGroups || [],
    subscriptionAccessLog: raw.subscriptionAccessLog || [],
    memos: raw.memos || [],
    memoFiles: raw.memoFiles || []
  };
}

let state = loadState();

function hashPassword(password, salt = nanoid(16)) {
  const hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return { salt, hash };
}

function verifyPassword(password, record) {
  if (!record?.salt || !record?.hash) return false;
  return hashPassword(password, record.salt).hash === record.hash;
}

function ensureDefaultAdmin() {
  state.adminUsers ||= [];
  if (state.adminUsers.length) return;
  const username = String(process.env.CHIKEN_ADMIN_USER || "admin").trim() || "admin";
  const password = String(process.env.CHIKEN_ADMIN_PASSWORD || "chiken-easy").trim() || "chiken-easy";
  const passwordHash = hashPassword(password);
  state.adminUsers.push({ id: nanoid(), username, ...passwordHash, createdAt: new Date().toISOString(), bootstrap: true });
  saveState();
}

function ensureDefaultSubscriptionToken() {
  state.subscriptionTokens ||= [];
  if (state.subscriptionTokens.some((item) => item.enabled !== false)) return;
  state.subscriptionTokens.push(createSubscriptionToken("默认订阅"));
  saveState();
}

function publicSubscriptionWithStats(token, req) {
  const selected = selectSubscriptionNodes(state.nodePool || [], token, state.subscriptionGroups || []);
  return {
    ...publicSubscriptionToken(token, req),
    nodeCount: selected.length,
    summary: summarizeSubscriptionNodes(selected)
  };
}

async function syncSubscriptionSource(source) {
  let text = String(source.text || "");
  if (source.url) {
    const response = await fetch(source.url, { redirect: "follow" });
    if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
    text += `\n${await response.text()}`;
  }
  const imported = parseNodeImport(text, source.name).map((node) => ({
    ...node,
    sourceId: source.id,
    sourceName: source.name,
    tags: [...new Set([...(node.tags || []), ...(source.tags || [])])]
  }));
  state.nodePool ||= [];
  const saved = imported.map((node) => upsertNode(state.nodePool, node));
  let removed = 0;
  if (source.replaceExisting !== false) {
    const savedRaw = new Set(saved.map((node) => node.raw));
    const before = state.nodePool.length;
    state.nodePool = state.nodePool.filter((node) => node.sourceId !== source.id || savedRaw.has(node.raw));
    removed = before - state.nodePool.length;
  }
  source.lastSyncAt = new Date().toISOString();
  source.lastImportCount = saved.length;
  source.lastRemoveCount = removed;
  source.lastError = "";
  source.updatedAt = new Date().toISOString();
  return { saved, removed };
}

if (process.env.CHIKEN_BOOTSTRAP_TOKEN && !state.tokens.some((item) => item.token === process.env.CHIKEN_BOOTSTRAP_TOKEN)) {
  state.tokens.push({ token: process.env.CHIKEN_BOOTSTRAP_TOKEN, createdAt: new Date().toISOString(), used: false, bootstrap: true });
}

if (process.env.CHIKEN_API_TOKEN && !state.apiTokens.some((item) => item.token === process.env.CHIKEN_API_TOKEN)) {
  state.apiTokens.push({ id: "bootstrap", name: "bootstrap", token: process.env.CHIKEN_API_TOKEN, createdAt: new Date().toISOString(), bootstrap: true });
}

ensureDefaultAdmin();
ensureDefaultSubscriptionToken();

function saveState() {
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function emitEvent(type, payload = {}) {
  const message = `data: ${JSON.stringify({ type, payload, at: new Date().toISOString() })}\n\n`;
  for (const res of eventStreams) res.write(message);
}

function emitPublicProbeEvent() {
  if (!publicProbeStreams.size) return;
  const message = `data: ${JSON.stringify({ type: "probes", payload: publicProbePayload(), at: new Date().toISOString() })}\n\n`;
  for (const res of publicProbeStreams) res.write(message);
}

function audit(actor, action, target, detail = {}) {
  const row = { id: nanoid(), at: new Date().toISOString(), actor, action, target, detail };
  fs.appendFileSync(auditFile, JSON.stringify(row) + "\n");
  emitEvent("audit", row);
  return row;
}

function notificationSettings() {
  state.monitorSettings = mergeMonitorSettings(state.monitorSettings || {});
  return state.monitorSettings.notifications || defaultState.monitorSettings.notifications;
}

function shouldNotify(key, cooldownMinutes = 10) {
  const lastAt = notificationState.get(key) || 0;
  if (Date.now() - lastAt < cooldownMinutes * 60 * 1000) return false;
  notificationState.set(key, Date.now());
  return true;
}

function clearNotifyKey(key) {
  notificationState.delete(key);
}

async function sendTelegramNotification(settings, title, message) {
  if (!settings.telegramBotToken || !settings.telegramChatId) throw new Error("Telegram bot token/chat id is required");
  const base = String(settings.telegramApiBase || "https://api.telegram.org").replace(/\/+$/, "");
  const url = `${base}/bot${encodeURIComponent(settings.telegramBotToken)}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: settings.telegramChatId,
      text: `*${title}*\n${message}`,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    })
  });
  if (!response.ok) throw new Error(`Telegram failed: ${response.status} ${await response.text()}`);
  return { ok: true, channel: "telegram" };
}

async function sendWebhookNotification(settings, title, message, payload = {}) {
  if (!settings.webhookUrl) throw new Error("Webhook URL is required");
  const response = await fetch(settings.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, message, ...payload, at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Webhook failed: ${response.status} ${await response.text()}`);
  return { ok: true, channel: "webhook" };
}

async function sendNotification(title, message, payload = {}, force = false) {
  const settings = notificationSettings();
  const results = [];
  const errors = [];
  const channel = settings.channel || "webhook";
  const tasks = [];
  if (channel === "webhook" || channel === "both") tasks.push(() => sendWebhookNotification(settings, title, message, payload));
  if (channel === "telegram" || channel === "both") tasks.push(() => sendTelegramNotification(settings, title, message));
  if (!tasks.length) throw new Error("notification channel is not configured");
  for (const task of tasks) {
    try {
      results.push(await task());
    } catch (error) {
      errors.push(error.message);
    }
  }
  audit("system", force ? "notification_test" : "notification_send", payload.agentId || "-", { title, channels: results.map((row) => row.channel), errors });
  if (!results.length && errors.length) throw new Error(errors.join("; "));
  return { ok: Boolean(results.length), results, errors };
}

function loadAlertsForAgent(agentId, agent = {}) {
  const settings = notificationSettings();
  if (!settings.loadEnabled) return [];
  const probe = agent.probe || {};
  const rows = [
    ["cpu", "CPU", probe.cpu?.usage, settings.cpuThreshold],
    ["memory", "Memory", probe.memory?.usage, settings.memoryThreshold],
    ["disk", "Disk", probe.disk?.usage, settings.diskThreshold]
  ];
  return rows
    .filter(([, , value, threshold]) => Number.isFinite(Number(value)) && Number(value) >= Number(threshold))
    .map(([key, label, value, threshold]) => ({ key: `${agentId}:load:${key}`, label, value: Number(value), threshold: Number(threshold) }));
}

async function evaluateAgentNotifications(agentId, previous = {}, next = {}) {
  const settings = notificationSettings();
  const name = next.name || previous.name || agentId;
  const cooldown = settings.cooldownMinutes || 10;
  const wasOnline = clients.has(agentId) || previous.connected;
  if (settings.offlineEnabled && previous.lastSeen && wasOnline && !clients.has(agentId)) {
    const key = `${agentId}:offline`;
    if (shouldNotify(key, cooldown)) {
      await sendNotification("Chiken Monitor 离线告警", `${name} 已离线，最后心跳 ${previous.lastSeen || "-"}`, { agentId, type: "offline" }).catch((error) => audit("system", "notification_error", agentId, { error: error.message }));
    }
  }
  if (clients.has(agentId)) clearNotifyKey(`${agentId}:offline`);

  for (const alert of loadAlertsForAgent(agentId, next)) {
    if (!shouldNotify(alert.key, cooldown)) continue;
    await sendNotification("Chiken Monitor 负载告警", `${name} ${alert.label} ${alert.value.toFixed(1)}% 已超过阈值 ${alert.threshold}%`, { agentId, type: "load", metric: alert.label, value: alert.value, threshold: alert.threshold }).catch((error) => audit("system", "notification_error", agentId, { error: error.message }));
  }
}

function arrayFromInput(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function memoTags(content = "", tags = []) {
  const fromContent = [...String(content || "").matchAll(/(^|\s)#([\p{L}\p{N}_-]{1,48})/gu)].map((match) => match[2]);
  return [...new Set([...arrayFromInput(tags), ...fromContent])];
}

function safeFileName(value = "file") {
  const fallback = "file";
  const parsed = path.basename(String(value || fallback)).replace(/[<>:"/\\|?*\x00-\x1F]+/g, "_").trim();
  return (parsed || fallback).slice(0, 180);
}

function memoFilePath(file) {
  const target = path.resolve(memoFileDir, file.storedName || "");
  if (!target.startsWith(path.resolve(memoFileDir))) throw new Error("invalid file path");
  return target;
}

function publicMemoFile(file, req) {
  return {
    id: file.id,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: Number(file.size || 0),
    createdAt: file.createdAt,
    url: `${req.protocol}://${req.get("host")}/api/memos/files/${file.id}/download`
  };
}

function publicMemo(memo, req) {
  const files = (state.memoFiles || []).filter((file) => (memo.fileIds || []).includes(file.id));
  return {
    id: memo.id,
    content: memo.content || "",
    tags: memo.tags || [],
    visibility: memo.visibility || "private",
    pinned: Boolean(memo.pinned),
    archived: Boolean(memo.archived),
    fileIds: memo.fileIds || [],
    files: files.map((file) => publicMemoFile(file, req)),
    createdAt: memo.createdAt,
    updatedAt: memo.updatedAt
  };
}

function memoStats() {
  const active = (state.memos || []).filter((memo) => !memo.archived);
  const files = state.memoFiles || [];
  const tags = {};
  for (const memo of active) for (const tag of memo.tags || []) tags[tag] = (tags[tag] || 0) + 1;
  return {
    total: state.memos?.length || 0,
    active: active.length,
    pinned: active.filter((memo) => memo.pinned).length,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
    tags
  };
}

function getAgent(agentId) {
  return state.agents[agentId] || null;
}

function maskSecret(value) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= 6) return "*".repeat(text.length);
  return `${text.slice(0, 3)}***${text.slice(-2)}`;
}

function getCredential(credentialId, type) {
  const record = (state.credentials || []).find((item) => item.id === credentialId && !item.revoked);
  if (!record) return null;
  if (type && record.type !== type) return null;
  return record;
}

function publicCredential(record) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    host: record.host || "",
    port: record.port || "",
    username: record.username || "",
    domain: record.domain || "",
    hasPassword: Boolean(record.password),
    hasPrivateKey: Boolean(record.privateKey),
    note: record.note || "",
    updatedAt: record.updatedAt || record.createdAt,
    revoked: Boolean(record.revoked)
  };
}

function publicCredentials(type) {
  return (state.credentials || []).filter((item) => !item.revoked && (!type || item.type === type)).map(publicCredential);
}

function getSshProfile(agentId) {
  const agent = getAgent(agentId);
  const saved = state.sshProfiles?.[agentId] || {};
  const credential = getCredential(saved.credentialId, "ssh");
  const merged = {
    host: String(saved.host || credential?.host || agent?.ip || agent?.host || "").trim(),
    port: Number(saved.port || credential?.port || 22) || 22,
    username: String(saved.username || credential?.username || "root").trim() || "root",
    mode: saved.mode === "privateKey" || credential?.privateKey ? "privateKey" : "password",
    password: saved.password || credential?.password || "",
    privateKey: saved.privateKey || credential?.privateKey || "",
    credentialId: saved.credentialId || "",
    updatedAt: saved.updatedAt || credential?.updatedAt || null
  };
  return merged;
}

function publicSshProfile(agentId) {
  const profile = getSshProfile(agentId);
  const credential = getCredential(profile.credentialId, "ssh");
  return {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    mode: profile.mode,
    credentialId: profile.credentialId || "",
    credentialName: credential?.name || "",
    hasPassword: Boolean(profile.password),
    hasPrivateKey: Boolean(profile.privateKey),
    ready: profile.mode === "privateKey" ? Boolean(profile.host && profile.privateKey) : Boolean(profile.host && profile.password),
    updatedAt: profile.updatedAt
  };
}

function getRdpProfile(agentId) {
  const agent = getAgent(agentId);
  const saved = state.rdpProfiles?.[agentId] || {};
  const credential = getCredential(saved.credentialId, "rdp");
  return {
    host: String(saved.host || credential?.host || agent?.ip || agent?.host || "").trim(),
    port: Number(saved.port || credential?.port || 3389) || 3389,
    username: String(saved.username || credential?.username || "Administrator").trim() || "Administrator",
    password: saved.password || credential?.password || "",
    domain: String(saved.domain || credential?.domain || "").trim(),
    width: Number(saved.width || 1600) || 1600,
    height: Number(saved.height || 900) || 900,
    colorDepth: Number(saved.colorDepth || 32) || 32,
    credentialId: saved.credentialId || "",
    updatedAt: saved.updatedAt || credential?.updatedAt || null
  };
}

function publicRdpProfile(agentId) {
  const profile = getRdpProfile(agentId);
  const credential = getCredential(profile.credentialId, "rdp");
  return {
    host: profile.host,
    port: profile.port,
    username: profile.username,
    domain: profile.domain,
    width: profile.width,
    height: profile.height,
    colorDepth: profile.colorDepth,
    credentialId: profile.credentialId || "",
    credentialName: credential?.name || "",
    hasPassword: Boolean(profile.password),
    ready: Boolean(profile.host && profile.username),
    updatedAt: profile.updatedAt
  };
}

function finiteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function publicProbe(probe = {}) {
  probe ||= {};
  return {
    updatedAt: probe.updatedAt || null,
    uptime: finiteNumber(probe.uptime),
    load: Array.isArray(probe.load) ? probe.load.map((item) => finiteNumber(item, 0)).slice(0, 3) : [],
    cpu: {
      usage: finiteNumber(probe.cpu?.usage),
      cores: finiteNumber(probe.cpu?.cores),
      model: String(probe.cpu?.model || "")
    },
    memory: {
      total: finiteNumber(probe.memory?.total, 0),
      used: finiteNumber(probe.memory?.used, 0),
      free: finiteNumber(probe.memory?.free, 0),
      usage: finiteNumber(probe.memory?.usage)
    },
    swap: probe.swap
      ? {
          total: finiteNumber(probe.swap.total, 0),
          used: finiteNumber(probe.swap.used, 0),
          free: finiteNumber(probe.swap.free, 0),
          usage: finiteNumber(probe.swap.usage)
        }
      : null,
    disk: probe.disk
      ? {
          mount: String(probe.disk.mount || "/"),
          total: finiteNumber(probe.disk.total, 0),
          used: finiteNumber(probe.disk.used, 0),
          free: finiteNumber(probe.disk.free, 0),
          usage: finiteNumber(probe.disk.usage)
        }
      : null,
    network: probe.network
      ? {
          rxBytes: finiteNumber(probe.network.rxBytes, 0),
          txBytes: finiteNumber(probe.network.txBytes, 0),
          rawRxBytes: finiteNumber(probe.network.rawRxBytes, finiteNumber(probe.network.rxBytes, 0)),
          rawTxBytes: finiteNumber(probe.network.rawTxBytes, finiteNumber(probe.network.txBytes, 0)),
          totalRxBytes: finiteNumber(probe.network.totalRxBytes, finiteNumber(probe.network.rxBytes, 0)),
          totalTxBytes: finiteNumber(probe.network.totalTxBytes, finiteNumber(probe.network.txBytes, 0)),
          rxSpeed: finiteNumber(probe.network.rxSpeed),
          txSpeed: finiteNumber(probe.network.txSpeed),
          rxDelta: finiteNumber(probe.network.rxDelta, 0),
          txDelta: finiteNumber(probe.network.txDelta, 0),
          sampleInterval: finiteNumber(probe.network.sampleInterval, 0),
          speedUpdatedAt: probe.network.speedUpdatedAt || probe.network.updatedAt || probe.updatedAt || null,
          interfaces: finiteNumber(probe.network.interfaces, 0)
        }
      : null,
    process: {
      count: finiteNumber(probe.process?.count)
    }
  };
}

function applyTrafficAccounting(agentId, status = {}) {
  const network = status?.probe?.network;
  if (!network) return status;
  const rawRx = finiteNumber(network.rawRxBytes ?? network.rxBytes, 0) || 0;
  const rawTx = finiteNumber(network.rawTxBytes ?? network.txBytes, 0) || 0;
  state.trafficCounters ||= {};
  const previous = state.trafficCounters[agentId] || {};
  let totalRx = finiteNumber(previous.totalRxBytes, null);
  let totalTx = finiteNumber(previous.totalTxBytes, null);
  let rxDelta = finiteNumber(network.rxDelta, null);
  let txDelta = finiteNumber(network.txDelta, null);
  let sampleInterval = finiteNumber(network.sampleInterval, null);
  const now = Date.now();

  if (totalRx === null || totalTx === null) {
    const existing = state.agents?.[agentId]?.probe?.network || {};
    totalRx = finiteNumber(existing.totalRxBytes ?? existing.rxBytes, rawRx) || 0;
    totalTx = finiteNumber(existing.totalTxBytes ?? existing.txBytes, rawTx) || 0;
  } else if (Number.isFinite(previous.lastRxBytes) && Number.isFinite(previous.lastTxBytes)) {
    rxDelta = rawRx >= previous.lastRxBytes ? rawRx - previous.lastRxBytes : rawRx;
    txDelta = rawTx >= previous.lastTxBytes ? rawTx - previous.lastTxBytes : rawTx;
    totalRx += rxDelta;
    totalTx += txDelta;
  }
  totalRx = Math.max(totalRx, rawRx);
  totalTx = Math.max(totalTx, rawTx);
  if (!Number.isFinite(sampleInterval) || sampleInterval <= 0) {
    const previousAt = Date.parse(previous.updatedAt || "");
    sampleInterval = Number.isFinite(previousAt) ? Math.max(1, (now - previousAt) / 1000) : 0;
  }
  const calculatedRxSpeed = sampleInterval > 0 && Number.isFinite(rxDelta) ? Math.max(0, rxDelta) / sampleInterval : finiteNumber(network.rxSpeed, 0);
  const calculatedTxSpeed = sampleInterval > 0 && Number.isFinite(txDelta) ? Math.max(0, txDelta) / sampleInterval : finiteNumber(network.txSpeed, 0);

  state.trafficCounters[agentId] = {
    totalRxBytes: totalRx,
    totalTxBytes: totalTx,
    lastRxBytes: rawRx,
    lastTxBytes: rawTx,
    lastRxDelta: Number.isFinite(rxDelta) ? rxDelta : 0,
    lastTxDelta: Number.isFinite(txDelta) ? txDelta : 0,
    sampleInterval,
    updatedAt: new Date().toISOString()
  };
  status.probe.network = {
    ...network,
    rawRxBytes: rawRx,
    rawTxBytes: rawTx,
    rxBytes: totalRx,
    txBytes: totalTx,
    totalRxBytes: totalRx,
    totalTxBytes: totalTx,
    rxDelta: Number.isFinite(rxDelta) ? rxDelta : 0,
    txDelta: Number.isFinite(txDelta) ? txDelta : 0,
    sampleInterval,
    rxSpeed: Math.round(calculatedRxSpeed * 10) / 10,
    txSpeed: Math.round(calculatedTxSpeed * 10) / 10,
    speedUpdatedAt: new Date().toISOString()
  };
  return status;
}

function normalizeProbeProfile(input = {}, current = {}) {
  const tags = Array.isArray(input.tags)
    ? input.tags
    : String(input.tags ?? current.tags ?? "").split(",");
  const trafficLimitGb = finiteNumber(input.trafficLimitGb ?? current.trafficLimitGb, null);
  const displayOrder = finiteNumber(input.displayOrder ?? current.displayOrder, 0) || 0;
  return {
    displayName: String(input.displayName ?? current.displayName ?? "").trim().slice(0, 80),
    region: String(input.region ?? current.region ?? "").trim().slice(0, 40),
    group: String(input.group ?? current.group ?? "").trim().slice(0, 40),
    flag: String(input.flag ?? current.flag ?? "").trim().slice(0, 8),
    osLabel: String(input.osLabel ?? current.osLabel ?? "").trim().slice(0, 40),
    price: String(input.price ?? current.price ?? "").trim().slice(0, 40),
    billing: String(input.billing ?? current.billing ?? "").trim().slice(0, 40),
    expireText: String(input.expireText ?? current.expireText ?? "").trim().slice(0, 40),
    note: String(input.note ?? current.note ?? "").trim().slice(0, 120),
    tags: tags.map((item) => String(item).trim()).filter(Boolean).slice(0, 8),
    trafficLimitGb: trafficLimitGb && trafficLimitGb > 0 ? trafficLimitGb : null,
    displayOrder,
    hidden: Boolean(input.hidden ?? current.hidden)
  };
}

function publicProbeProfile(agentId, agent = {}) {
  const profile = state.probeProfiles?.[agentId] || {};
  return {
    displayName: profile.displayName || agent.name || agentId,
    region: profile.region || "",
    group: profile.group || "默认",
    flag: profile.flag || "",
    osLabel: profile.osLabel || "",
    price: profile.price || "",
    billing: profile.billing || "",
    expireText: profile.expireText || "",
    note: profile.note || "",
    tags: profile.tags || [],
    trafficLimitGb: profile.trafficLimitGb || null,
    displayOrder: Number(profile.displayOrder || 0) || 0,
    hidden: Boolean(profile.hidden)
  };
}

function publicAgent(agent) {
  const ssh = publicSshProfile(agent.id);
  const rdp = publicRdpProfile(agent.id);
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
    sshMode: ssh.mode,
    rdpConfigured: rdp.ready,
    rdpHost: rdp.host,
    rdpPort: rdp.port,
    probeProfile: publicProbeProfile(agent.id, agent),
    probe: publicProbe(agent.probe)
  };
}

function average(rows) {
  const values = rows.map((item) => Number(item)).filter(Number.isFinite);
  if (!values.length) return null;
  return Math.round((values.reduce((sum, item) => sum + item, 0) / values.length) * 10) / 10;
}

function dashboardSummary(agents) {
  return {
    avgCpu: average(agents.map((agent) => agent.probe?.cpu?.usage)),
    avgMemory: average(agents.map((agent) => agent.probe?.memory?.usage)),
    avgDisk: average(agents.map((agent) => agent.probe?.disk?.usage)),
    rxSpeed: agents.reduce((sum, agent) => sum + (Number(agent.probe?.network?.rxSpeed) || 0), 0),
    txSpeed: agents.reduce((sum, agent) => sum + (Number(agent.probe?.network?.txSpeed) || 0), 0),
    rxBytes: agents.reduce((sum, agent) => sum + (Number(agent.probe?.network?.rxBytes) || 0), 0),
    txBytes: agents.reduce((sum, agent) => sum + (Number(agent.probe?.network?.txBytes) || 0), 0),
    regions: new Set(agents.map((agent) => agent.probeProfile?.region || agent.profile?.region).filter(Boolean)).size
  };
}

function publicProbeAgent(agent) {
  const row = publicAgent(agent);
  return {
    id: row.id,
    name: row.name,
    os: row.os,
    arch: row.arch,
    tags: row.tags,
    connected: row.connected,
    singboxStatus: row.singboxStatus,
    lastSeen: row.lastSeen,
    profile: row.probeProfile,
    probe: row.probe
  };
}

function publicProbePayload() {
  const agents = Object.values(state.agents)
    .map(publicProbeAgent)
    .filter((agent) => !agent.profile?.hidden)
    .sort((a, b) => (Number(a.profile?.displayOrder || 0) - Number(b.profile?.displayOrder || 0)) || String(a.profile?.displayName || a.name).localeCompare(String(b.profile?.displayName || b.name)));
  return {
    total: agents.length,
    online: agents.filter((agent) => agent.connected).length,
    offline: agents.filter((agent) => !agent.connected).length,
    summary: dashboardSummary(agents),
    settings: {
      site: state.monitorSettings?.site || defaultState.monitorSettings.site,
      theme: state.monitorSettings?.theme || defaultState.monitorSettings.theme,
      general: state.monitorSettings?.general || defaultState.monitorSettings.general
    },
    agents
  };
}

function publicProbeTasks() {
  return (state.probeTasks || []).map((task) => ({
    ...task,
    lastResults: Object.values(state.probeResults?.[task.id] || {}).sort((a, b) => String(b.at).localeCompare(String(a.at))),
    lastResult: Object.values(state.probeResults?.[task.id] || {}).sort((a, b) => String(b.at).localeCompare(String(a.at)))[0] || null
  }));
}

function normalizeProbeTask(input = {}) {
  const type = String(input.type || "tcp").trim().toLowerCase();
  if (!["icmp", "tcp", "http"].includes(type)) throw new Error("unsupported probe type");
  const target = String(input.target || "").trim();
  if (!target) throw new Error("target is required");
  const interval = Math.max(10, Math.min(3600, Number(input.interval || 60) || 60));
  return {
    id: String(input.id || nanoid(10)),
    name: String(input.name || `${type}:${target}`).trim(),
    type,
    target,
    port: type === "tcp" ? Number(input.port || 80) || 80 : undefined,
    method: type === "http" ? String(input.method || "GET").toUpperCase() : undefined,
    timeout: Math.max(1000, Math.min(30000, Number(input.timeout || 5000) || 5000)),
    interval,
    agentId: String(input.agentId || "").trim(),
    enabled: input.enabled !== false,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function dispatchProbeTask(task, forced = false) {
  if (!task.enabled && !forced) return null;
  const agentIds = task.agentId ? [task.agentId] : Array.from(clients.keys());
  const sent = [];
  for (const agentId of agentIds) {
    if (!clients.has(agentId)) continue;
    try {
      const commandId = sendCommand(agentId, "probe_task", { task: { ...task, forced } });
      sent.push({ agentId, commandId });
    } catch {}
  }
  return sent;
}

function publicForwardRules(agentId) {
  return (state.forwardRules?.[agentId] || []).map((rule) => ({ ...rule }));
}

function updateConfigVersion(agentId, versionId, patch) {
  const version = (state.configVersions?.[agentId] || []).find((item) => item.id === versionId);
  if (!version) return;
  Object.assign(version, patch);
  saveState();
  emitEvent("config-version", { agentId, versionId, patch });
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
  emitEvent("forward-rule", { agentId, rule: next });
  return next;
}

function removeForwardRule(agentId, ruleId) {
  const list = state.forwardRules?.[agentId] || [];
  state.forwardRules[agentId] = list.filter((item) => item.id !== ruleId);
  emitEvent("forward-rule-removed", { agentId, ruleId });
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
  const apiToken = (state.apiTokens || []).find((row) => row.token === token && !row.revoked);
  if (apiToken) return { type: "api-token", ...apiToken };
  const session = (state.sessions || []).find((row) => row.token === token && !row.revoked && Date.parse(row.expiresAt || "") > Date.now());
  if (session) return { type: "session", ...session };
  return null;
}

function waitForCommandResult(commandId, timeoutMs = 90000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      commandWaiters.delete(commandId);
      resolve({ ok: false, output: "command timeout" });
    }, timeoutMs);
    commandWaiters.set(commandId, (msg) => {
      clearTimeout(timer);
      commandWaiters.delete(commandId);
      resolve(msg);
    });
  });
}

function requestAccess(req) {
  const required = process.env.CHIKEN_REQUIRE_API_TOKEN !== "0";
  const token = extractTokenFromRequest(req);
  const apiToken = token ? validateApiToken(token) : null;
  return {
    required,
    token,
    apiToken,
    authorized: Boolean(apiToken) || (!required && !token)
  };
}

function isPublicApiPath(pathname) {
  return pathname === "/api/health" || pathname === "/api/auth/login" || pathname === "/api/public/probes" || pathname === "/api/public/events";
}

function requireApiAccess(req, res, next) {
  if (!req.path.startsWith("/api/") || isPublicApiPath(req.path)) return next();
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

function connectSsh(connectConfig) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    conn.on("ready", () => resolve(conn)).on("error", reject).connect(connectConfig);
  });
}

async function execSshCommand(connectConfig, command) {
  const conn = await connectSsh(connectConfig);
  try {
    return await new Promise((resolve, reject) => {
      conn.exec(command, (error, stream) => {
        if (error) return reject(error);
        let stdout = "";
        let stderr = "";
        stream.on("close", (code) => {
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
    });
  } finally {
    conn.end();
  }
}

async function withSftp(connectConfig, handler) {
  const conn = await connectSsh(connectConfig);
  try {
    const sftp = await new Promise((resolve, reject) => {
      conn.sftp((error, stream) => {
        if (error) return reject(error);
        resolve(stream);
      });
    });
    return await handler(sftp, conn);
  } finally {
    conn.end();
  }
}

function normalizeRemotePath(inputPath = ".") {
  const value = String(inputPath || ".").trim();
  if (!value) return ".";
  if (value === "/") return "/";
  if (value.startsWith("/")) return path.posix.normalize(value);
  return path.posix.normalize(value);
}

function resolveRemotePath(basePath, name) {
  const target = normalizeRemotePath(basePath || ".");
  if (!name) return target;
  return target === "/" ? `/${name}` : path.posix.join(target, name);
}

function formatFileMode(item) {
  const longname = String(item.longname || "");
  return longname.startsWith("d") ? "dir" : "file";
}

async function listRemoteDirectory(connectConfig, dirPath) {
  return withSftp(connectConfig, async (sftp) => {
    const cwd = normalizeRemotePath(dirPath || ".");
    const rows = await new Promise((resolve, reject) => {
      sftp.readdir(cwd, (error, list) => {
        if (error) return reject(error);
        resolve(list || []);
      });
    });
    const parent = cwd === "/" || cwd === "." ? null : path.posix.dirname(cwd);
    return {
      path: cwd,
      parent: parent === "." ? "/" : parent,
      items: rows
        .filter((item) => item.filename !== "." && item.filename !== "..")
        .map((item) => ({
          name: item.filename,
          path: resolveRemotePath(cwd, item.filename),
          type: formatFileMode(item),
          size: Number(item.attrs?.size || 0),
          mtime: item.attrs?.mtime ? new Date(item.attrs.mtime * 1000).toISOString() : null,
          mode: item.longname || ""
        }))
        .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
    };
  });
}

function testTcp(host, port, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: Number(port) }, () => {
      socket.end();
      resolve({ ok: true, output: `tcp connect ok: ${host}:${port}` });
    });
    socket.setTimeout(timeout);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`tcp timeout: ${host}:${port}`));
    });
    socket.on("error", reject);
  });
}

function buildRdpFile(profile, agent) {
  const fullAddress = `${profile.host}:${profile.port}`;
  const user = profile.domain ? `${profile.domain}\\${profile.username}` : profile.username;
  return [
    `full address:s:${fullAddress}`,
    `username:s:${user}`,
    `screen mode id:i:2`,
    `desktopwidth:i:${profile.width}`,
    `desktopheight:i:${profile.height}`,
    `session bpp:i:${profile.colorDepth}`,
    `compression:i:1`,
    "prompt for credentials:i:1",
    "administrative session:i:0",
    "redirectclipboard:i:1",
    "redirectprinters:i:0",
    "redirectsmartcards:i:0",
    "redirectcomports:i:0",
    "redirectposdevices:i:0",
    "autoreconnection enabled:i:1",
    `alternate shell:s:`,
    `remoteapplicationprogram:s:`,
    `remoteapplicationmode:i:0`,
    `drivestoredirect:s:*`,
    `workspace id:s:${agent?.name || profile.host}`
  ].join("\r\n");
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function runLibraryCommand(agentId, preset) {
  if (preset.type === "service" || preset.type === "logs" || preset.type === "config") {
    const commandId = sendCommand(agentId, "preset", preset);
    audit("admin", "run_preset", agentId, { commandId, preset: preset.id });
    return { ok: true, transport: "agent", commandId };
  }

  if (preset.type === "shell") {
    const command = String(preset.command || "").trim();
    if (!command) throw new Error("command text is required");
    const sshProfile = publicSshProfile(agentId);
    if (sshProfile.ready) {
      const result = await execSshCommand(getSshConnectConfig(agentId), command);
      audit("admin", "run_preset", agentId, { preset: preset.id, transport: "ssh", ok: result.ok });
      return { ...result, transport: "ssh" };
    }
    const commandId = sendCommand(agentId, "exec", { command });
    audit("admin", "run_preset", agentId, { preset: preset.id, commandId, transport: "agent" });
    return { ok: true, transport: "agent", commandId };
  }

  throw new Error(`unsupported command type: ${preset.type}`);
}

function attachAgentExecTerminal(ws, agentId) {
  ws.send(JSON.stringify({ type: "output", output: `Connected to ${state.agents[agentId].name || agentId} via agent exec.\n$ ` }));

  ws.on("message", (raw) => {
    const text = raw.toString();
    let command = text;
    try {
      const msg = JSON.parse(text);
      if (msg && typeof msg === "object") command = msg.data ?? msg.command ?? msg.input ?? "";
    } catch {}

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
app.use(express.json({ limit: "20mb" }));
app.use(requireApiAccess);

app.get("/api/health", (_, res) => res.json({ ok: true, name: "chiken-easy" }));

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = (state.adminUsers || []).find((row) => row.username === username && !row.revoked);
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ error: "用户名或密码错误" });
  const token = `sess_${nanoid(36)}`;
  const sessionDays = Math.max(1, Math.min(30, Number(state.monitorSettings?.login?.sessionDays || 7) || 7));
  const session = {
    id: nanoid(),
    token,
    userId: user.id,
    username: user.username,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + sessionDays * 86400 * 1000).toISOString()
  };
  state.sessions ||= [];
  state.sessions.unshift(session);
  state.sessions = state.sessions.filter((row) => !row.revoked && Date.parse(row.expiresAt || "") > Date.now()).slice(0, 30);
  saveState();
  audit("admin", "login", "-", { username });
  res.json({ token, username: user.username, expiresAt: session.expiresAt });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ username: req.apiToken?.username || req.apiToken?.name || "admin", type: req.apiToken?.type || "api-token" });
});

app.post("/api/auth/logout", (req, res) => {
  if (req.apiToken?.type === "session") {
    const session = (state.sessions || []).find((row) => row.id === req.apiToken.id);
    if (session) {
      session.revoked = true;
      session.updatedAt = new Date().toISOString();
      saveState();
    }
  }
  res.json({ ok: true });
});

app.get("/api/memos", (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  const tag = String(req.query.tag || "").trim();
  const visibility = String(req.query.visibility || "").trim();
  const includeArchived = req.query.archived === "1";
  let rows = [...(state.memos || [])];
  if (!includeArchived) rows = rows.filter((memo) => !memo.archived);
  if (query) rows = rows.filter((memo) => [memo.content, ...(memo.tags || [])].join(" ").toLowerCase().includes(query));
  if (tag) rows = rows.filter((memo) => (memo.tags || []).includes(tag));
  if (visibility) rows = rows.filter((memo) => memo.visibility === visibility);
  rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
  res.json({ memos: rows.map((memo) => publicMemo(memo, req)), files: (state.memoFiles || []).map((file) => publicMemoFile(file, req)), stats: memoStats() });
});

app.post("/api/memos", (req, res) => {
  const content = cleanText(req.body?.content, "", 20000);
  if (!content && !arrayFromInput(req.body?.fileIds).length) return res.status(400).json({ error: "content or files required" });
  const validFiles = new Set((state.memoFiles || []).map((file) => file.id));
  const memo = {
    id: nanoid(12),
    content,
    tags: memoTags(content, req.body?.tags),
    visibility: ["private", "workspace", "public"].includes(req.body?.visibility) ? req.body.visibility : "private",
    pinned: Boolean(req.body?.pinned),
    archived: false,
    fileIds: arrayFromInput(req.body?.fileIds).filter((id) => validFiles.has(id)),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.memos ||= [];
  state.memos.unshift(memo);
  saveState();
  audit("admin", "create_memo", memo.id, { files: memo.fileIds.length, tags: memo.tags });
  res.json(publicMemo(memo, req));
});

app.put("/api/memos/:id", (req, res) => {
  const memo = (state.memos || []).find((row) => row.id === req.params.id);
  if (!memo) return res.status(404).json({ error: "memo not found" });
  const validFiles = new Set((state.memoFiles || []).map((file) => file.id));
  if ("content" in (req.body || {})) memo.content = cleanText(req.body.content, "", 20000);
  if ("visibility" in (req.body || {}) && ["private", "workspace", "public"].includes(req.body.visibility)) memo.visibility = req.body.visibility;
  if ("pinned" in (req.body || {})) memo.pinned = Boolean(req.body.pinned);
  if ("archived" in (req.body || {})) memo.archived = Boolean(req.body.archived);
  if ("fileIds" in (req.body || {})) memo.fileIds = arrayFromInput(req.body.fileIds).filter((id) => validFiles.has(id));
  memo.tags = memoTags(memo.content, req.body?.tags ?? memo.tags);
  memo.updatedAt = new Date().toISOString();
  saveState();
  audit("admin", "update_memo", memo.id, { pinned: memo.pinned, archived: memo.archived });
  res.json(publicMemo(memo, req));
});

app.delete("/api/memos/:id", (req, res) => {
  const memo = (state.memos || []).find((row) => row.id === req.params.id);
  if (!memo) return res.status(404).json({ error: "memo not found" });
  state.memos = (state.memos || []).filter((row) => row.id !== req.params.id);
  saveState();
  audit("admin", "delete_memo", memo.id, { files: memo.fileIds?.length || 0 });
  res.json({ ok: true });
});

app.post("/api/memos/files", express.raw({ type: "*/*", limit: "200mb" }), (req, res) => {
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (!buffer.length) return res.status(400).json({ error: "empty file" });
  const name = safeFileName(req.query.name || req.get("x-file-name") || "file");
  const type = cleanText(req.query.type || req.get("content-type") || "application/octet-stream", "application/octet-stream", 160);
  const id = nanoid(16);
  const ext = path.extname(name).slice(0, 16);
  const file = {
    id,
    name,
    type,
    size: buffer.length,
    storedName: `${id}${ext}`,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(memoFilePath(file), buffer);
  state.memoFiles ||= [];
  state.memoFiles.unshift(file);
  saveState();
  audit("admin", "upload_memo_file", id, { name, size: file.size, type });
  res.json(publicMemoFile(file, req));
});

app.get("/api/memos/files/:id/download", (req, res) => {
  const file = (state.memoFiles || []).find((row) => row.id === req.params.id);
  if (!file) return res.status(404).send("file not found");
  const target = memoFilePath(file);
  if (!fs.existsSync(target)) return res.status(404).send("file missing");
  res.setHeader("Content-Type", file.type || "application/octet-stream");
  res.setHeader("Content-Length", String(file.size || fs.statSync(target).size));
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name || "file")}`);
  fs.createReadStream(target).pipe(res);
});

app.delete("/api/memos/files/:id", (req, res) => {
  const file = (state.memoFiles || []).find((row) => row.id === req.params.id);
  if (!file) return res.status(404).json({ error: "file not found" });
  const inUse = (state.memos || []).some((memo) => (memo.fileIds || []).includes(file.id));
  if (inUse && req.query.force !== "1") return res.status(409).json({ error: "file is attached to a memo" });
  try {
    const target = memoFilePath(file);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {}
  state.memoFiles = (state.memoFiles || []).filter((row) => row.id !== file.id);
  for (const memo of state.memos || []) memo.fileIds = (memo.fileIds || []).filter((id) => id !== file.id);
  saveState();
  audit("admin", "delete_memo_file", file.id, { name: file.name });
  res.json({ ok: true });
});

app.put("/api/auth/password", (req, res) => {
  if (req.apiToken?.type !== "session") return res.status(403).json({ error: "请使用账号密码登录后修改密码" });
  const oldPassword = String(req.body?.oldPassword || "");
  const newPassword = String(req.body?.newPassword || "");
  if (newPassword.length < 8) return res.status(400).json({ error: "新密码至少 8 位" });
  const user = (state.adminUsers || []).find((row) => row.id === req.apiToken.userId && !row.revoked);
  if (!user || !verifyPassword(oldPassword, user)) return res.status(401).json({ error: "旧密码错误" });
  Object.assign(user, hashPassword(newPassword), { updatedAt: new Date().toISOString() });
  for (const session of state.sessions || []) {
    if (session.userId === user.id && session.id !== req.apiToken.id) session.revoked = true;
  }
  saveState();
  audit("admin", "change_password", "-", { username: user.username });
  res.json({ ok: true });
});

app.get("/api/admin/settings", (_, res) => {
  state.monitorSettings = mergeMonitorSettings(state.monitorSettings || {});
  res.json(state.monitorSettings);
});

app.put("/api/admin/settings", (req, res) => {
  state.monitorSettings = mergeMonitorSettings({ ...(state.monitorSettings || {}), ...(req.body || {}) });
  saveState();
  emitPublicProbeEvent();
  audit("admin", "update_monitor_settings", "-", { sections: Object.keys(req.body || {}) });
  res.json(state.monitorSettings);
});

app.post("/api/admin/notifications/test", async (req, res) => {
  try {
    const title = cleanText(req.body?.title, "Chiken Monitor 测试通知", 120) || "Chiken Monitor 测试通知";
    const message = cleanText(req.body?.message, "这是一条来自探针管理的测试通知。", 500) || "这是一条来自探针管理的测试通知。";
    const result = await sendNotification(title, message, { type: "test" }, true);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/admin/sessions", (_, res) => {
  const rows = (state.sessions || []).map((session) => ({
    id: session.id,
    username: session.username,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revoked: Boolean(session.revoked)
  }));
  res.json(rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100));
});

app.delete("/api/admin/sessions/:id", (req, res) => {
  const session = (state.sessions || []).find((row) => row.id === req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });
  session.revoked = true;
  session.updatedAt = new Date().toISOString();
  saveState();
  audit("admin", "revoke_session", req.params.id, { username: session.username });
  res.json({ ok: true });
});

app.get("/api/public/probes", (_, res) => res.json(publicProbePayload()));

app.get("/api/public/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  publicProbeStreams.add(res);
  res.write(`data: ${JSON.stringify({ type: "probes", payload: publicProbePayload(), at: new Date().toISOString() })}\n\n`);
  req.on("close", () => publicProbeStreams.delete(res));
});

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  eventStreams.add(res);
  res.write(`data: ${JSON.stringify({ type: "hello", payload: { ok: true }, at: new Date().toISOString() })}\n\n`);
  req.on("close", () => eventStreams.delete(res));
});

app.get("/api/dashboard", (_, res) => {
  const agents = Object.values(state.agents).map(publicAgent);
  res.json({
    total: agents.length,
    online: agents.filter((agent) => agent.connected).length,
    offline: agents.filter((agent) => !agent.connected).length,
    activeSingbox: agents.filter((agent) => agent.singboxStatus === "active").length,
    summary: dashboardSummary(agents),
    recent: agents.sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).slice(0, 8)
  });
});

app.get("/api/agents", (_, res) => res.json(Object.values(state.agents).map(publicAgent)));

app.get("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  res.json(publicAgent(agent));
});

app.put("/api/agents/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  agent.name = name.slice(0, 80);
  agent.updatedAt = new Date().toISOString();
  saveState();
  emitEvent("agent", { action: "renamed", agent: publicAgent(agent) });
  emitPublicProbeEvent();
  audit("admin", "rename_agent", req.params.id, { name: agent.name });
  res.json(publicAgent(agent));
});

app.get("/api/probe-settings", (_, res) => {
  const rows = Object.values(state.agents).map((agent) => ({
    agent: publicAgent(agent),
    profile: publicProbeProfile(agent.id, agent)
  }));
  res.json(rows.sort((a, b) => (Number(a.profile.displayOrder || 0) - Number(b.profile.displayOrder || 0)) || String(a.profile.displayName).localeCompare(String(b.profile.displayName))));
});

app.put("/api/probe-settings/:id", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  state.probeProfiles ||= {};
  const profile = normalizeProbeProfile(req.body || {}, state.probeProfiles[req.params.id] || {});
  state.probeProfiles[req.params.id] = { ...profile, updatedAt: new Date().toISOString() };
  saveState();
  emitEvent("probe-profile", { agentId: req.params.id, profile: publicProbeProfile(req.params.id, agent) });
  emitPublicProbeEvent();
  audit("admin", "update_probe_profile", req.params.id, { displayName: profile.displayName, region: profile.region, hidden: profile.hidden });
  res.json({ agent: publicAgent(agent), profile: publicProbeProfile(req.params.id, agent) });
});

app.get("/api/node-pool", (req, res) => {
  ensureDefaultSubscriptionToken();
  res.json({
    nodes: (state.nodePool || []).map(publicNode),
    subscriptions: (state.subscriptionTokens || []).map((token) => publicSubscriptionWithStats(token, req)),
    sources: state.subscriptionSources || [],
    groups: state.subscriptionGroups || [],
    routeTemplates: Object.values(routeTemplates),
    summary: summarizeSubscriptionNodes(state.nodePool || []),
    accessLog: (state.subscriptionAccessLog || []).slice(0, 100)
  });
});

app.post("/api/node-pool/import", async (req, res) => {
  try {
    let text = String(req.body?.text || "");
    const url = String(req.body?.url || "").trim();
    const sourceName = String(req.body?.sourceName || (url ? new URL(url).hostname : "manual")).trim() || "manual";
    if (url) {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
      text += `\n${await response.text()}`;
    }
    const imported = parseNodeImport(text, sourceName);
    state.nodePool ||= [];
    const saved = imported.map((node) => upsertNode(state.nodePool, node));
    saveState();
    audit("admin", "import_nodes", "-", { sourceName, count: saved.length, url: url ? new URL(url).hostname : "" });
    res.json({ imported: saved.length, nodes: saved.map(publicNode) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/node-pool/:id", (req, res) => {
  const node = (state.nodePool || []).find((row) => row.id === req.params.id);
  if (!node) return res.status(404).json({ error: "node not found" });
  if ("name" in (req.body || {})) node.name = String(req.body.name || node.name).trim() || node.name;
  if ("enabled" in (req.body || {})) node.enabled = req.body.enabled !== false;
  if ("sourceName" in (req.body || {})) node.sourceName = String(req.body.sourceName || node.sourceName || "").trim();
  if ("tags" in (req.body || {})) {
    node.tags = Array.isArray(req.body.tags)
      ? req.body.tags.map((item) => String(item).trim()).filter(Boolean)
      : String(req.body.tags || "").split(",").map((item) => item.trim()).filter(Boolean);
  }
  if ("groupIds" in (req.body || {})) {
    node.groupIds = Array.isArray(req.body.groupIds)
      ? req.body.groupIds.map((item) => String(item).trim()).filter(Boolean)
      : String(req.body.groupIds || "").split(",").map((item) => item.trim()).filter(Boolean);
  }
  node.updatedAt = new Date().toISOString();
  saveState();
  audit("admin", "update_node", node.id, { name: node.name, enabled: node.enabled !== false });
  res.json(publicNode(node));
});

app.delete("/api/node-pool/:id", (req, res) => {
  const before = state.nodePool || [];
  const node = before.find((row) => row.id === req.params.id);
  if (!node) return res.status(404).json({ error: "node not found" });
  state.nodePool = before.filter((row) => row.id !== req.params.id);
  saveState();
  audit("admin", "delete_node", req.params.id, { name: node.name });
  res.json({ ok: true });
});

app.get("/api/subscriptions", (req, res) => {
  ensureDefaultSubscriptionToken();
  res.json((state.subscriptionTokens || []).map((token) => publicSubscriptionWithStats(token, req)));
});

app.post("/api/subscriptions", (req, res) => {
  state.subscriptionTokens ||= [];
  const token = normalizeSubscriptionToken(req.body || { name: "Subscription" });
  state.subscriptionTokens.unshift(token);
  saveState();
  audit("admin", "create_subscription", token.id, { name: token.name });
  res.json(publicSubscriptionWithStats(token, req));
});

app.put("/api/subscriptions/:id", (req, res) => {
  const current = (state.subscriptionTokens || []).find((row) => row.id === req.params.id);
  if (!current) return res.status(404).json({ error: "subscription not found" });
  Object.assign(current, normalizeSubscriptionToken(req.body || {}, current));
  saveState();
  audit("admin", "update_subscription", current.id, { name: current.name, format: current.format });
  res.json(publicSubscriptionWithStats(current, req));
});

app.get("/api/subscriptions/:id/preview", (req, res) => {
  const token = (state.subscriptionTokens || []).find((row) => row.id === req.params.id);
  if (!token) return res.status(404).json({ error: "subscription not found" });
  const nodes = selectSubscriptionNodes(state.nodePool || [], token, state.subscriptionGroups || []);
  const format = String(req.query.format || token.format || "raw");
  const rendered = renderSubscription(nodes, format, token.profile || {});
  res.json({
    subscription: publicSubscriptionWithStats(token, req),
    summary: summarizeSubscriptionNodes(nodes),
    nodes: nodes.map(publicNode),
    format,
    contentType: rendered.contentType,
    body: rendered.body.slice(0, 12000),
    truncated: rendered.body.length > 12000
  });
});

app.get("/api/subscriptions/:id/diagnostics", (req, res) => {
  const token = (state.subscriptionTokens || []).find((row) => row.id === req.params.id);
  if (!token) return res.status(404).json({ error: "subscription not found" });
  const nodes = selectSubscriptionNodes(state.nodePool || [], token, state.subscriptionGroups || []);
  res.json(validateSubscriptionOutputs(nodes, token));
});

app.delete("/api/subscriptions/:id", (req, res) => {
  const before = state.subscriptionTokens || [];
  const item = before.find((row) => row.id === req.params.id);
  if (!item) return res.status(404).json({ error: "subscription not found" });
  state.subscriptionTokens = before.filter((row) => row.id !== req.params.id);
  saveState();
  audit("admin", "delete_subscription", req.params.id, { name: item.name });
  res.json({ ok: true });
});

app.post("/api/subscription-sources", async (req, res) => {
  try {
    const source = normalizeSubscriptionSource(req.body || {});
    state.subscriptionSources ||= [];
    state.subscriptionSources.unshift(source);
    let result = { saved: [], removed: 0 };
    if (req.body?.syncNow !== false) result = await syncSubscriptionSource(source);
    saveState();
    audit("admin", "create_subscription_source", source.id, { name: source.name, count: result.saved.length, removed: result.removed });
    res.json({ source, imported: result.saved.length, removed: result.removed, nodes: result.saved.map(publicNode) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/subscription-sources/:id", (req, res) => {
  const source = (state.subscriptionSources || []).find((row) => row.id === req.params.id);
  if (!source) return res.status(404).json({ error: "source not found" });
  Object.assign(source, normalizeSubscriptionSource(req.body || {}, source));
  saveState();
  audit("admin", "update_subscription_source", source.id, { name: source.name });
  res.json(source);
});

app.post("/api/subscription-sources/:id/sync", async (req, res) => {
  const source = (state.subscriptionSources || []).find((row) => row.id === req.params.id);
  if (!source) return res.status(404).json({ error: "source not found" });
  try {
    const result = await syncSubscriptionSource(source);
    saveState();
    audit("admin", "sync_subscription_source", source.id, { count: result.saved.length, removed: result.removed });
    res.json({ source, imported: result.saved.length, removed: result.removed, nodes: result.saved.map(publicNode) });
  } catch (error) {
    source.lastError = error.message;
    source.updatedAt = new Date().toISOString();
    saveState();
    res.status(400).json({ error: error.message, source });
  }
});

app.delete("/api/subscription-sources/:id", (req, res) => {
  const before = state.subscriptionSources || [];
  const source = before.find((row) => row.id === req.params.id);
  if (!source) return res.status(404).json({ error: "source not found" });
  state.subscriptionSources = before.filter((row) => row.id !== req.params.id);
  saveState();
  audit("admin", "delete_subscription_source", req.params.id, { name: source.name });
  res.json({ ok: true });
});

app.post("/api/subscription-groups", (req, res) => {
  const group = normalizeSubscriptionGroup(req.body || {});
  state.subscriptionGroups ||= [];
  state.subscriptionGroups.unshift(group);
  saveState();
  audit("admin", "create_subscription_group", group.id, { name: group.name });
  res.json(group);
});

app.put("/api/subscription-groups/:id", (req, res) => {
  const group = (state.subscriptionGroups || []).find((row) => row.id === req.params.id);
  if (!group) return res.status(404).json({ error: "group not found" });
  Object.assign(group, normalizeSubscriptionGroup(req.body || {}, group));
  saveState();
  audit("admin", "update_subscription_group", group.id, { name: group.name });
  res.json(group);
});

app.delete("/api/subscription-groups/:id", (req, res) => {
  const before = state.subscriptionGroups || [];
  const group = before.find((row) => row.id === req.params.id);
  if (!group) return res.status(404).json({ error: "group not found" });
  state.subscriptionGroups = before.filter((row) => row.id !== req.params.id);
  saveState();
  audit("admin", "delete_subscription_group", req.params.id, { name: group.name });
  res.json({ ok: true });
});

app.get("/api/probe-tasks", (_, res) => res.json(publicProbeTasks()));

app.post("/api/probe-tasks", (req, res) => {
  try {
    const task = normalizeProbeTask(req.body || {});
    state.probeTasks ||= [];
    state.probeTasks.unshift(task);
    state.probeTasks = state.probeTasks.slice(0, 200);
    saveState();
    const sent = dispatchProbeTask(task, true) || [];
    audit("admin", "create_probe_task", task.id, { type: task.type, target: task.target, sent: sent.length });
    res.json({ task, sent });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/probe-tasks/:id", (req, res) => {
  const current = (state.probeTasks || []).find((task) => task.id === req.params.id);
  if (!current) return res.status(404).json({ error: "probe task not found" });
  try {
    const next = normalizeProbeTask({ ...current, ...(req.body || {}), id: current.id, createdAt: current.createdAt });
    Object.assign(current, next);
    saveState();
    audit("admin", "update_probe_task", current.id, { type: current.type, target: current.target });
    res.json(current);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/probe-tasks/:id/run", (req, res) => {
  const task = (state.probeTasks || []).find((row) => row.id === req.params.id);
  if (!task) return res.status(404).json({ error: "probe task not found" });
  const sent = dispatchProbeTask(task, true) || [];
  audit("admin", "run_probe_task", task.id, { sent: sent.length });
  res.json({ ok: true, sent });
});

app.delete("/api/probe-tasks/:id", (req, res) => {
  const before = state.probeTasks || [];
  state.probeTasks = before.filter((task) => task.id !== req.params.id);
  if (state.probeResults) delete state.probeResults[req.params.id];
  saveState();
  audit("admin", "delete_probe_task", req.params.id);
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
    host: String(req.body?.host || current.host || agent.ip || agent.host || "").trim(),
    port: Number(req.body?.port || current.port || 22) || 22,
    username: String(req.body?.username || current.username || "root").trim() || "root",
    mode: req.body?.mode === "privateKey" ? "privateKey" : "password",
    credentialId: String(req.body?.credentialId || "").trim(),
    updatedAt: new Date().toISOString()
  };

  if (req.body?.clearPassword) delete next.password;
  if (req.body?.clearPrivateKey) delete next.privateKey;
  if ("password" in (req.body || {}) && String(req.body.password || "").trim()) next.password = req.body.password;
  if ("privateKey" in (req.body || {}) && String(req.body.privateKey || "").trim()) next.privateKey = req.body.privateKey;

  state.sshProfiles ||= {};
  state.sshProfiles[req.params.id] = next;
  saveState();
  emitEvent("ssh-profile", { agentId: req.params.id, profile: publicSshProfile(req.params.id) });
  audit("admin", "save_ssh_profile", req.params.id, { host: next.host, port: next.port, mode: next.mode, credentialId: next.credentialId || "" });
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

app.get("/api/agents/:id/rdp-profile", (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  res.json(publicRdpProfile(req.params.id));
});

app.put("/api/agents/:id/rdp-profile", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  const current = state.rdpProfiles?.[req.params.id] || {};
  const next = {
    ...current,
    host: String(req.body?.host || current.host || agent.ip || agent.host || "").trim(),
    port: Number(req.body?.port || current.port || 3389) || 3389,
    username: String(req.body?.username || current.username || "Administrator").trim() || "Administrator",
    domain: String(req.body?.domain || current.domain || "").trim(),
    width: Number(req.body?.width || current.width || 1600) || 1600,
    height: Number(req.body?.height || current.height || 900) || 900,
    colorDepth: Number(req.body?.colorDepth || current.colorDepth || 32) || 32,
    credentialId: String(req.body?.credentialId || "").trim(),
    updatedAt: new Date().toISOString()
  };
  if (req.body?.clearPassword) delete next.password;
  if ("password" in (req.body || {}) && String(req.body.password || "").trim()) next.password = req.body.password;
  state.rdpProfiles ||= {};
  state.rdpProfiles[req.params.id] = next;
  saveState();
  emitEvent("rdp-profile", { agentId: req.params.id, profile: publicRdpProfile(req.params.id) });
  audit("admin", "save_rdp_profile", req.params.id, { host: next.host, port: next.port, credentialId: next.credentialId || "" });
  res.json(publicRdpProfile(req.params.id));
});

app.post("/api/agents/:id/rdp-profile/test", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const profile = { ...getRdpProfile(req.params.id), ...(req.body || {}) };
    const result = await testTcp(profile.host, profile.port);
    audit("admin", "test_rdp_profile", req.params.id, { ok: result.ok });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/agents/:id/rdp-file", (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  const profile = getRdpProfile(req.params.id);
  if (!profile.host || !profile.username) return res.status(400).json({ error: "rdp profile is incomplete" });
  const content = buildRdpFile(profile, agent);
  res.setHeader("Content-Type", "application/rdp");
  res.setHeader("Content-Disposition", `attachment; filename="${agent.name || agent.id}.rdp"`);
  res.send(content);
});

app.get("/api/credentials", (req, res) => res.json(publicCredentials(String(req.query.type || "").trim() || undefined)));

app.post("/api/credentials", (req, res) => {
  const type = String(req.body?.type || "").trim();
  if (!["ssh", "rdp"].includes(type)) return res.status(400).json({ error: "credential type must be ssh or rdp" });
  const item = {
    id: nanoid(),
    name: String(req.body?.name || `${type}-${Date.now()}`).trim() || `${type}-${Date.now()}`,
    type,
    host: String(req.body?.host || "").trim(),
    port: Number(req.body?.port || (type === "rdp" ? 3389 : 22)) || (type === "rdp" ? 3389 : 22),
    username: String(req.body?.username || (type === "rdp" ? "Administrator" : "root")).trim(),
    password: String(req.body?.password || ""),
    privateKey: String(req.body?.privateKey || ""),
    domain: String(req.body?.domain || "").trim(),
    note: String(req.body?.note || "").trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.credentials ||= [];
  state.credentials.unshift(item);
  saveState();
  emitEvent("credential", { action: "created", record: publicCredential(item) });
  audit("admin", "create_credential", "-", { id: item.id, type: item.type, name: item.name, host: item.host });
  res.json(publicCredential(item));
});

app.put("/api/credentials/:id", (req, res) => {
  const item = (state.credentials || []).find((row) => row.id === req.params.id && !row.revoked);
  if (!item) return res.status(404).json({ error: "credential not found" });
  item.name = String(req.body?.name || item.name).trim() || item.name;
  item.host = String(req.body?.host || item.host || "").trim();
  item.port = Number(req.body?.port || item.port || (item.type === "rdp" ? 3389 : 22)) || (item.type === "rdp" ? 3389 : 22);
  item.username = String(req.body?.username || item.username || "").trim();
  item.domain = String(req.body?.domain || item.domain || "").trim();
  item.note = String(req.body?.note || item.note || "").trim();
  if ("password" in (req.body || {})) item.password = String(req.body.password || "");
  if ("privateKey" in (req.body || {})) item.privateKey = String(req.body.privateKey || "");
  item.updatedAt = new Date().toISOString();
  saveState();
  emitEvent("credential", { action: "updated", record: publicCredential(item) });
  audit("admin", "update_credential", "-", { id: item.id, type: item.type, name: item.name });
  res.json(publicCredential(item));
});

app.delete("/api/credentials/:id", (req, res) => {
  const item = (state.credentials || []).find((row) => row.id === req.params.id && !row.revoked);
  if (!item) return res.status(404).json({ error: "credential not found" });
  item.revoked = true;
  item.updatedAt = new Date().toISOString();
  for (const [agentId, profile] of Object.entries(state.sshProfiles || {})) {
    if (profile.credentialId === item.id) state.sshProfiles[agentId].credentialId = "";
  }
  for (const [agentId, profile] of Object.entries(state.rdpProfiles || {})) {
    if (profile.credentialId === item.id) state.rdpProfiles[agentId].credentialId = "";
  }
  saveState();
  emitEvent("credential", { action: "deleted", id: item.id });
  audit("admin", "delete_credential", "-", { id: item.id, type: item.type, name: item.name });
  res.json({ ok: true });
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

app.get("/api/commands", (_, res) => res.json(state.commands || []));

app.post("/api/commands", (req, res) => {
  const type = String(req.body?.type || "").trim();
  if (!["shell", "service", "logs", "config"].includes(type)) return res.status(400).json({ error: "invalid command type" });
  const item = {
    id: nanoid(10),
    label: String(req.body?.label || "").trim() || "未命名命令",
    type,
    command: String(req.body?.command || "").trim(),
    action: String(req.body?.action || "").trim(),
    lines: Number(req.body?.lines || 200) || 200,
    builtin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  state.commands = [...normalizeCommands(state.commands), item];
  saveState();
  emitEvent("command", { action: "created", record: item });
  audit("admin", "create_command", "-", { id: item.id, type: item.type, label: item.label });
  res.json(item);
});

app.put("/api/commands/:id", (req, res) => {
  const item = (state.commands || []).find((row) => row.id === req.params.id);
  if (!item) return res.status(404).json({ error: "command not found" });
  if (item.builtin) return res.status(400).json({ error: "builtin command cannot be edited" });
  item.label = String(req.body?.label || item.label).trim() || item.label;
  item.type = String(req.body?.type || item.type).trim() || item.type;
  item.command = String(req.body?.command || item.command || "").trim();
  item.action = String(req.body?.action || item.action || "").trim();
  item.lines = Number(req.body?.lines || item.lines || 200) || 200;
  item.updatedAt = new Date().toISOString();
  saveState();
  emitEvent("command", { action: "updated", record: item });
  audit("admin", "update_command", "-", { id: item.id, label: item.label });
  res.json(item);
});

app.delete("/api/commands/:id", (req, res) => {
  const item = (state.commands || []).find((row) => row.id === req.params.id);
  if (!item) return res.status(404).json({ error: "command not found" });
  if (item.builtin) return res.status(400).json({ error: "builtin command cannot be deleted" });
  state.commands = normalizeCommands((state.commands || []).filter((row) => row.id !== req.params.id));
  saveState();
  emitEvent("command", { action: "deleted", id: req.params.id });
  audit("admin", "delete_command", "-", { id: req.params.id, label: item.label });
  res.json({ ok: true });
});

app.post("/api/agents/:id/commands/:commandId", async (req, res) => {
  const preset = (state.commands || []).find((item) => item.id === req.params.commandId);
  if (!preset) return res.status(404).json({ error: "command not found" });
  try {
    const result = await runLibraryCommand(req.params.id, preset);
    res.json(result);
  } catch (error) {
    res.status(409).json({ error: error.message });
  }
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
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  try {
    const config = buildConfig(req.body || {});
    const version = { id: nanoid(), at: new Date().toISOString(), status: "pending", config };
    state.configVersions[req.params.id] ||= [];
    state.configVersions[req.params.id].unshift(version);
    state.configVersions[req.params.id] = state.configVersions[req.params.id].slice(0, 30);
    const panelNode = buildPanelNode(agent, req.body || {});
    if (panelNode) {
      state.nodePool ||= [];
      upsertNode(state.nodePool, panelNode);
    }
    saveState();
    const commandId = sendCommand(req.params.id, "apply_config", { config, restart: true, versionId: version.id });
    configCommandRefs.set(commandId, { agentId: req.params.id, versionId: version.id });
    audit("admin", "wizard_apply_config", req.params.id, { commandId, versionId: version.id, protocol: req.body?.protocol, node: panelNode?.id || "" });
    res.json({ ok: true, commandId, versionId: version.id, config, node: panelNode ? publicNode(panelNode) : null });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/agents/:id/protocol-smoke", async (req, res) => {
  const agent = getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  const requested = Array.isArray(req.body?.protocols) && req.body.protocols.length
    ? req.body.protocols.map(String)
    : ["vmess-ws", "vless-reality", "trojan", "hysteria2", "shadowsocks", "mixed"];
  const basePort = Math.max(20000, Math.min(60000, Number(req.body?.basePort || 36000) || 36000));
  const readId = sendCommand(agent.id, "read_config");
  const readResult = await waitForCommandResult(readId, 30000);
  const previousConfig = readResult.config || null;
  const rows = [];
  const at = new Date().toISOString();
  let realityKeys = { privateKey: req.body?.privateKey || "", publicKey: req.body?.publicKey || "" };

  if (requested.includes("vless-reality") && !realityKeys.privateKey) {
    try {
      const keyId = sendCommand(agent.id, "exec", { command: "docker exec chiken-singbox sing-box generate reality-keypair 2>/dev/null || sing-box generate reality-keypair" });
      const keyResult = await waitForCommandResult(keyId, 30000);
      const privateKey = String(keyResult.output || "").match(/PrivateKey:\s*([A-Za-z0-9_-]+)/i)?.[1] || "";
      const publicKey = String(keyResult.output || "").match(/PublicKey:\s*([A-Za-z0-9_-]+)/i)?.[1] || "";
      if (privateKey) realityKeys = { privateKey, publicKey };
    } catch {}
  }

  for (const [index, protocol] of requested.entries()) {
    const port = basePort + index;
    const input = {
      protocol,
      port,
      listen: "::",
      tag: `smoke-${protocol}-${port}`,
      nodeName: `Smoke ${protocol}`,
      publicHost: agent.ip || agent.host || "127.0.0.1",
      uuid: "11111111-1111-4111-8111-111111111111",
      path: "/smoke",
      password: `smoke-${port}`,
      method: "aes-256-gcm",
      serverName: "www.cloudflare.com",
      serverPort: 443,
      privateKey: realityKeys.privateKey || "CHANGE_ME_REALITY_PRIVATE_KEY",
      publicKey: realityKeys.publicKey || "",
      shortId: "0123456789abcdef"
    };
    try {
      const config = buildConfig(input);
      const commandId = sendCommand(agent.id, "apply_config", { config, restart: true });
      const result = await waitForCommandResult(commandId, 120000);
      const statusId = sendCommand(agent.id, "service", { action: "status" });
      const status = await waitForCommandResult(statusId, 30000);
      rows.push({ protocol, port, ok: Boolean(result.ok && status.ok), output: String(result.output || status.output || "").slice(0, 1000), status: String(status.output || "").slice(0, 200) });
    } catch (error) {
      rows.push({ protocol, port, ok: false, output: error.message });
    }
  }

  if (previousConfig) {
    try {
      const restoreId = sendCommand(agent.id, "apply_config", { config: previousConfig, restart: true });
      const restore = await waitForCommandResult(restoreId, 120000);
      rows.push({ protocol: "restore", ok: Boolean(restore.ok), output: String(restore.output || "").slice(0, 1000) });
    } catch (error) {
      rows.push({ protocol: "restore", ok: false, output: error.message });
    }
  }

  const report = { agentId: agent.id, agentName: agent.name, at, ok: rows.filter((row) => row.protocol !== "restore").every((row) => row.ok), rows };
  audit("admin", "protocol_smoke", agent.id, report);
  res.json(report);
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

app.get("/api/files/agents/:id/list", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  try {
    const data = await listRemoteDirectory(getSshConnectConfig(req.params.id), String(req.query.path || "."));
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/files/agents/:id/upload", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  const parentPath = normalizeRemotePath(req.body?.path || ".");
  const fileName = String(req.body?.name || "").trim();
  const base64 = String(req.body?.contentBase64 || "");
  if (!fileName || !base64) return res.status(400).json({ error: "name and contentBase64 are required" });
  try {
    const remotePath = resolveRemotePath(parentPath, fileName);
    const command = `mkdir -p ${shellQuote(path.posix.dirname(remotePath))} && printf %s ${shellQuote(base64)} | base64 -d > ${shellQuote(remotePath)}`;
    const result = await execSshCommand(getSshConnectConfig(req.params.id), command);
    if (!result.ok) throw new Error(result.output || "upload failed");
    audit("admin", "upload_file", req.params.id, { path: remotePath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/files/agents/:id/mkdir", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  const remotePath = normalizeRemotePath(req.body?.path || ".");
  try {
    await withSftp(getSshConnectConfig(req.params.id), async (sftp) => {
      await new Promise((resolve, reject) => {
        sftp.mkdir(remotePath, (error) => (error ? reject(error) : resolve()));
      });
    });
    audit("admin", "mkdir_remote", req.params.id, { path: remotePath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/files/agents/:id/item", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  const remotePath = normalizeRemotePath(req.query.path || ".");
  const type = String(req.query.type || "file");
  try {
    await withSftp(getSshConnectConfig(req.params.id), async (sftp) => {
      await new Promise((resolve, reject) => {
        const done = (error) => (error ? reject(error) : resolve());
        if (type === "dir") sftp.rmdir(remotePath, done);
        else sftp.unlink(remotePath, done);
      });
    });
    audit("admin", "delete_remote_item", req.params.id, { path: remotePath, type });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/files/agents/:id/download", async (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: "agent not found" });
  const remotePath = normalizeRemotePath(req.query.path || ".");
  try {
    const conn = await connectSsh(getSshConnectConfig(req.params.id));
    conn.sftp(async (error, sftp) => {
      if (error) {
        conn.end();
        res.status(400).json({ error: error.message });
        return;
      }

      const name = path.posix.basename(remotePath);
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      const readStream = sftp.createReadStream(remotePath);
      readStream.on("error", (streamError) => {
        conn.end();
        if (!res.headersSent) res.status(400).json({ error: streamError.message });
      });
      res.on("close", () => conn.end());
      try {
        await pipeline(readStream, res);
      } catch {}
      conn.end();
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/files/transfer", async (req, res) => {
  const { sourceAgentId, sourcePath, targetAgentId, targetPath } = req.body || {};
  if (!getAgent(sourceAgentId) || !getAgent(targetAgentId)) return res.status(404).json({ error: "agent not found" });
  const sourceRemotePath = normalizeRemotePath(sourcePath || ".");
  const targetRemotePath = normalizeRemotePath(targetPath || ".");
  try {
    const tempPath = path.join(os.tmpdir(), `chiken-transfer-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const sourceConn = await connectSsh(getSshConnectConfig(sourceAgentId));
    try {
      const sourceSftp = await new Promise((resolve, reject) => sourceConn.sftp((error, sftp) => (error ? reject(error) : resolve(sftp))));
      await new Promise((resolve, reject) => sourceSftp.fastGet(sourceRemotePath, tempPath, (error) => (error ? reject(error) : resolve())));
    } finally {
      sourceConn.end();
    }
    try {
      const base64 = fs.readFileSync(tempPath, "base64");
      const command = `mkdir -p ${shellQuote(path.posix.dirname(targetRemotePath))} && printf %s ${shellQuote(base64)} | base64 -d > ${shellQuote(targetRemotePath)}`;
      const result = await execSshCommand(getSshConnectConfig(targetAgentId), command);
      if (!result.ok) throw new Error(result.output || "transfer failed");
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
    audit("admin", "transfer_file", "-", { sourceAgentId, sourcePath: sourceRemotePath, targetAgentId, targetPath: targetRemotePath });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
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

app.get("/sub/:token", (req, res) => {
  const token = (state.subscriptionTokens || []).find((item) => item.token === req.params.token && item.enabled !== false);
  if (!token) return res.status(404).send("subscription not found");
  if (token.expiresAt && Date.parse(token.expiresAt) < Date.now()) return res.status(403).send("subscription expired");
  if (Number(token.maxAccess || 0) > 0 && Number(token.accessCount || 0) >= Number(token.maxAccess || 0)) return res.status(403).send("subscription access limit reached");
  const nodes = selectSubscriptionNodes(state.nodePool || [], token, state.subscriptionGroups || []);
  const format = String(req.query.format || token.format || "base64");
  const { contentType, body } = renderSubscription(nodes, format, token.profile || {});
  token.accessCount = Number(token.accessCount || 0) + 1;
  token.lastAccessAt = new Date().toISOString();
  state.subscriptionAccessLog ||= [];
  state.subscriptionAccessLog.unshift({
    id: nanoid(10),
    tokenId: token.id,
    tokenName: token.name,
    format,
    nodeCount: nodes.length,
    at: token.lastAccessAt,
    userAgent: String(req.get("user-agent") || "").slice(0, 160)
  });
  state.subscriptionAccessLog = state.subscriptionAccessLog.slice(0, 500);
  saveState();
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "no-store");
  res.send(body);
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

setInterval(() => {
  for (const task of state.probeTasks || []) {
    if (!task.enabled) continue;
    const last = state.probeResults?.[task.id];
    const lastAt = Date.parse(last?.at || "");
    if (Number.isFinite(lastAt) && Date.now() - lastAt < (Number(task.interval || 60) || 60) * 1000) continue;
    dispatchProbeTask(task);
  }
}, 5000);

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
      clearNotifyKey(`${agentId}:offline`);
      emitEvent("agent", { action: "online", agent: publicAgent(state.agents[agentId]) });
      emitPublicProbeEvent();
      audit("agent", "agent_online", agentId, { host: msg.agent.host, ip: msg.agent.ip });
      ws.send(JSON.stringify({ type: "welcome", id: agentId }));    
      return;
    }

    if (!agentId) return;

    if (msg.type === "heartbeat") {
      const previous = structuredClone(state.agents[agentId] || {});
      const status = applyTrafficAccounting(agentId, msg.status || {});
      Object.assign(state.agents[agentId], status, { lastSeen: new Date().toISOString() });
      saveState();
      emitEvent("agent", { action: "heartbeat", agent: publicAgent(state.agents[agentId]) });
      emitPublicProbeEvent();
      evaluateAgentNotifications(agentId, previous, state.agents[agentId]).catch((error) => audit("system", "notification_error", agentId, { error: error.message }));
    }

    if (msg.type === "log") pushLog(agentId, { at: new Date().toISOString(), line: msg.line });

    if (msg.type === "command_result") {
      audit("agent", "command_result", agentId, { commandId: msg.commandId, ok: msg.ok, output: String(msg.output || "").slice(0, 1000) });

      if (msg.probeResult?.taskId) {
        state.probeResults ||= {};
        state.probeResults[msg.probeResult.taskId] ||= {};
        state.probeResults[msg.probeResult.taskId][agentId] = {
          ...msg.probeResult,
          agentId,
          agentName: state.agents[agentId]?.name || agentId,
          at: new Date().toISOString()
        };
        saveState();
        emitEvent("probe-result", state.probeResults[msg.probeResult.taskId][agentId]);
      }

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
      emitEvent("agent-config", { agentId, bytes: JSON.stringify(msg.config || {}).length });
      audit("agent", "config_read", agentId, { bytes: JSON.stringify(msg.config || {}).length });
      pushLog(agentId, { at: new Date().toISOString(), line: `[config] ${JSON.stringify(msg.config)}` });
    }
  });

  ws.on("close", () => {
    if (!agentId) return;
    const previous = structuredClone(state.agents[agentId] || {});
    clients.delete(agentId);
    if (state.agents[agentId]) state.agents[agentId].lastSeen = new Date().toISOString();
    saveState();
    emitEvent("agent", { action: "offline", agent: publicAgent(state.agents[agentId]) });
    emitPublicProbeEvent();
    audit("agent", "agent_offline", agentId);
    evaluateAgentNotifications(agentId, previous, state.agents[agentId] || previous).catch((error) => audit("system", "notification_error", agentId, { error: error.message }));
  });
});

const port = Number(process.env.PORT || 7788);
server.listen(port, () => console.log(`chiken-easy server listening on :${port}`));
