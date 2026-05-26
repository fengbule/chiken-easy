import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import { decryptSecret, encryptSecret, hasMasterKey, sanitizeSensitiveText } from "./security.js";

const STATE_FILE = "state.json";
const AUDIT_FILE = "audit.jsonl";
const SQLITE_FILE = "chiken.db";
const DEFAULT_BACKUP_LIMIT = Math.max(2, Number(process.env.CHIKEN_STATE_BACKUP_LIMIT || 8) || 8);
const SQLITE_PATH = process.env.CHIKEN_SQLITE_PATH || path.join("data", SQLITE_FILE);
const STORAGE_MODE = String(process.env.CHIKEN_STORAGE || "json").trim().toLowerCase() || "json";

const SENSITIVE_PATHS = [
  ["sshProfiles", "*", "password"],
  ["sshProfiles", "*", "privateKey"],
  ["credentials", "*", "password"],
  ["credentials", "*", "privateKey"],
  ["settings", "telegramToken"],
  ["settings", "webhookUrl"],
  ["agentTokens", "*", "token"],
  ["subscriptionSources", "*", "username"],
  ["subscriptionSources", "*", "password"],
  ["subscriptionSources", "*", "url"],
  ["apiTokens", "*", "token"]
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function mergeObjects(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? clone(base) : clone(patch);
  if (!base || typeof base !== "object") return patch === undefined ? base : clone(patch);
  if (!patch || typeof patch !== "object") return patch === undefined ? clone(base) : clone(patch);
  const next = { ...clone(base) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object" && !Array.isArray(base[key])) {
      next[key] = mergeObjects(base[key], value);
      continue;
    }
    next[key] = clone(value);
  }
  return next;
}

function pathMatches(rule, pathParts) {
  if (rule.length !== pathParts.length) return false;
  return rule.every((part, index) => part === "*" || part === pathParts[index]);
}

function walkSecrets(target, pathParts, transform) {
  if (Array.isArray(target)) {
    return target.map((item, index) => walkSecrets(item, [...pathParts, String(index)], transform));
  }
  if (!target || typeof target !== "object") return target;
  const next = { ...target };
  for (const [key, value] of Object.entries(next)) {
    const currentPath = [...pathParts, key];
    if (SENSITIVE_PATHS.some((rule) => pathMatches(rule, currentPath.map((segment, idx) => (Number.isInteger(Number(segment)) && rule[idx] === "*" ? "*" : segment))))) {
      next[key] = transform(value);
      continue;
    }
    next[key] = walkSecrets(value, currentPath, transform);
  }
  return next;
}

function maybeEncryptSecrets(state, masterKey) {
  return walkSecrets(state, [], (value) => encryptSecret(value, masterKey));
}

function maybeDecryptSecrets(state, masterKey) {
  return walkSecrets(state, [], (value) => {
    try {
      return decryptSecret(value, masterKey);
    } catch {
      return value;
    }
  });
}

function normalizeJsonField(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function toJsonText(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeStorageMode(mode) {
  return mode === "sqlite" ? "sqlite" : "json";
}

export function atomicWrite(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${nanoid(6)}.tmp`;
  fs.writeFileSync(tmpFile, content);
  fs.renameSync(tmpFile, filePath);
}

export function backupState(dataDir, stateFilePath, maxBackups = DEFAULT_BACKUP_LIMIT) {
  ensureDir(dataDir);
  if (!fs.existsSync(stateFilePath)) return [];
  const backupDir = path.join(dataDir, "backups");
  ensureDir(backupDir);
  const target = path.join(backupDir, `state.${Date.now()}.json`);
  fs.copyFileSync(stateFilePath, target);
  const files = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith("state.") && name.endsWith(".json"))
    .sort()
    .reverse();
  for (const stale of files.slice(maxBackups)) {
    fs.rmSync(path.join(backupDir, stale), { force: true });
  }
  return files.slice(0, maxBackups).map((name) => path.join(backupDir, name));
}

function appendAuditJsonl(auditFilePath, row) {
  ensureDir(path.dirname(auditFilePath));
  fs.appendFileSync(auditFilePath, `${JSON.stringify(row)}\n`);
}

function queryAuditJsonl(auditFilePath, options = {}) {
  const { limit = 300, action, target, actor } = options;
  if (!fs.existsSync(auditFilePath)) return [];
  return fs
    .readFileSync(auditFilePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => (!action || row.action === action) && (!target || row.target === target) && (!actor || row.actor === actor))
    .reverse()
    .slice(0, limit);
}

function openSqlite(sqlitePath) {
  ensureDir(path.dirname(sqlitePath));
  const db = new DatabaseSync(sqlitePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      at TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      detail_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs(at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target);

    CREATE TABLE IF NOT EXISTS probe_samples (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      online INTEGER NOT NULL,
      sample_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_probe_samples_agent_at ON probe_samples(agent_id, collected_at DESC);

    CREATE TABLE IF NOT EXISTS subscription_access_logs (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      token_masked TEXT,
      ip_masked TEXT,
      user_agent TEXT,
      format TEXT,
      at TEXT NOT NULL,
      detail_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_subscription_access_logs_profile_at ON subscription_access_logs(profile_id, at DESC);

    CREATE TABLE IF NOT EXISTS node_quality_history (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL,
      protocol TEXT,
      agent_id TEXT,
      ok INTEGER NOT NULL,
      score INTEGER,
      latency_ms REAL,
      exit_ip TEXT,
      exit_country TEXT,
      error TEXT,
      checked_at TEXT NOT NULL,
      detail_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_node_quality_history_node_at ON node_quality_history(node_id, checked_at DESC);
  `);
  return db;
}

function listRows(statement, params = {}) {
  if (Array.isArray(params)) return statement.all(...params).map((row) => ({ ...row }));
  if (params && typeof params === "object") return statement.all(params).map((row) => ({ ...row }));
  return statement.all(params).map((row) => ({ ...row }));
}

function migrateLegacyAudit(auditFilePath, db) {
  if (!fs.existsSync(auditFilePath)) return;
  const count = db.prepare("SELECT COUNT(*) AS count FROM audit_logs").get()?.count || 0;
  if (count > 0) return;
  for (const row of queryAuditJsonl(auditFilePath, { limit: 1000000 }).reverse()) {
    db.prepare(
      "INSERT OR IGNORE INTO audit_logs (id, at, actor, action, target, detail_json) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(row.id || nanoid(), row.at || nowIso(), row.actor || "-", row.action || "-", row.target || "-", toJsonText(row.detail || {}));
  }
}

export function migrateState(rawState, defaults = {}) {
  const merged = mergeObjects(defaults, rawState || {});
  merged.tokens ||= [];
  merged.apiTokens ||= [];
  merged.agents ||= {};
  merged.configVersions ||= {};
  merged.forwardRules ||= {};
  merged.nodeProfiles ||= {};
  merged.subscriptionProfiles ||= {};
  merged.sshProfiles ||= {};
  merged.installBundles ||= {};
  merged.monitorHistory ||= {};
  merged.monitorAgg ||= {};
  merged.monitorEvents ||= [];
  merged.credentials ||= {};
  merged.assets ||= {};
  merged.memos ||= {};
  merged.files ||= {};
  merged.nodePool ||= {};
  merged.subscriptionSources ||= {};
  merged.subscriptionAccessLogs ||= [];
  merged.proxyChecks ||= {};
  merged.scriptLibrary ||= {};
  merged.commandRuns ||= {};
  merged.settings ||= {};
  merged.auth ||= { admin: null, allowQueryToken: false };
  merged.storageMeta ||= { mode: sanitizeStorageMode(STORAGE_MODE), migratedAt: nowIso() };
  return merged;
}

export function loadState({ dataDir, defaults = {}, masterKey } = {}) {
  const rootDir = dataDir || path.resolve("data");
  ensureDir(rootDir);
  const stateFilePath = path.join(rootDir, STATE_FILE);
  if (!fs.existsSync(stateFilePath)) return migrateState(defaults, defaults);
  const text = fs.readFileSync(stateFilePath, "utf8").trim();
  if (!text) return migrateState(defaults, defaults);
  try {
    const raw = JSON.parse(text);
    const migrated = migrateState(raw, defaults);
    return maybeDecryptSecrets(migrated, masterKey);
  } catch {
    const brokenCopy = `${stateFilePath}.broken.${Date.now()}`;
    try {
      fs.copyFileSync(stateFilePath, brokenCopy);
    } catch {}
    return migrateState(defaults, defaults);
  }
}

export function saveState(state, { dataDir, masterKey, backupLimit = DEFAULT_BACKUP_LIMIT } = {}) {
  const rootDir = dataDir || path.resolve("data");
  ensureDir(rootDir);
  const stateFilePath = path.join(rootDir, STATE_FILE);
  backupState(rootDir, stateFilePath, backupLimit);
  const payload = maybeEncryptSecrets(migrateState(state), masterKey);
  atomicWrite(stateFilePath, `${JSON.stringify(payload, null, 2)}\n`);
  return stateFilePath;
}

function createSqliteAdapter({ dataDir, auditFilePath, sqlitePath }) {
  const db = openSqlite(sqlitePath);
  migrateLegacyAudit(auditFilePath, db);

  const statements = {
    insertAudit: db.prepare(
      "INSERT OR REPLACE INTO audit_logs (id, at, actor, action, target, detail_json) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    queryAuditBase: db.prepare(
      "SELECT id, at, actor, action, target, detail_json FROM audit_logs ORDER BY at DESC LIMIT ?"
    ),
    insertProbeSample: db.prepare(
      "INSERT OR REPLACE INTO probe_samples (id, agent_id, collected_at, online, sample_json) VALUES (?, ?, ?, ?, ?)"
    ),
    selectProbeSamples: db.prepare(
      "SELECT id, agent_id, collected_at, online, sample_json FROM probe_samples WHERE agent_id = ? ORDER BY collected_at DESC LIMIT ?"
    ),
    insertSubscriptionAccess: db.prepare(
      "INSERT OR REPLACE INTO subscription_access_logs (id, profile_id, token_masked, ip_masked, user_agent, format, at, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    selectSubscriptionAccess: db.prepare(
      "SELECT id, profile_id, token_masked, ip_masked, user_agent, format, at, detail_json FROM subscription_access_logs WHERE profile_id = ? ORDER BY at DESC LIMIT ?"
    ),
    selectSubscriptionAccessAll: db.prepare(
      "SELECT id, profile_id, token_masked, ip_masked, user_agent, format, at, detail_json FROM subscription_access_logs ORDER BY at DESC LIMIT ?"
    ),
    insertNodeQualityHistory: db.prepare(
      "INSERT OR REPLACE INTO node_quality_history (id, node_id, protocol, agent_id, ok, score, latency_ms, exit_ip, exit_country, error, checked_at, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    selectNodeQualityHistory: db.prepare(
      "SELECT id, node_id, protocol, agent_id, ok, score, latency_ms, exit_ip, exit_country, error, checked_at, detail_json FROM node_quality_history WHERE node_id = ? ORDER BY checked_at DESC LIMIT ?"
    )
  };

  function queryAudit(options = {}) {
    const { limit = 300, action, target, actor } = options;
    const rows = listRows(statements.queryAuditBase, [limit * 5]).filter(
      (row) => (!action || row.action === action) && (!target || row.target === target) && (!actor || row.actor === actor)
    );
    return rows.slice(0, limit).map((row) => ({
      id: row.id,
      at: row.at,
      actor: row.actor,
      action: row.action,
      target: row.target,
      detail: normalizeJsonField(row.detail_json) || {}
    }));
  }

  return {
    mode: "sqlite",
    path: sqlitePath,
    db,
    appendAudit(row) {
      statements.insertAudit.run(row.id, row.at, row.actor, row.action, row.target, toJsonText(row.detail || {}));
      appendAuditJsonl(auditFilePath, row);
      return row;
    },
    queryAudit,
    writeProbeSample(agentId, sample) {
      const row = {
        id: sample.id || nanoid(),
        agentId,
        collectedAt: sample.updatedAt || sample.collectedAt || nowIso(),
        online: sample.online ? 1 : 0,
        sample
      };
      statements.insertProbeSample.run(row.id, row.agentId, row.collectedAt, row.online, toJsonText(row.sample));
      return row;
    },
    queryProbeHistory(agentId, options = {}) {
      const limit = Math.max(1, Number(options.limit || 500) || 500);
      return listRows(statements.selectProbeSamples, [agentId, limit]).map((row) => normalizeJsonField(row.sample_json) || {
        id: row.id,
        updatedAt: row.collected_at,
        online: Boolean(row.online)
      });
    },
    writeSubscriptionAccess(row) {
      statements.insertSubscriptionAccess.run(
        row.id || nanoid(),
        row.profileId,
        row.token || row.tokenMasked || "",
        row.ip || row.ipMasked || "",
        row.userAgent || "",
        row.format || "",
        row.at || nowIso(),
        toJsonText(row.detail || {})
      );
      return row;
    },
    querySubscriptionAccess(options = {}) {
      const limit = Math.max(1, Number(options.limit || 200) || 200);
      const rows = options.profileId
        ? listRows(statements.selectSubscriptionAccess, [options.profileId, limit])
        : listRows(statements.selectSubscriptionAccessAll, [limit]);
      return rows.map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        token: row.token_masked,
        ip: row.ip_masked,
        userAgent: row.user_agent,
        format: row.format,
        at: row.at,
        detail: normalizeJsonField(row.detail_json) || {}
      }));
    },
    writeNodeQualityHistory(row) {
      statements.insertNodeQualityHistory.run(
        row.id || nanoid(),
        row.nodeId,
        row.protocol || "",
        row.agentId || "",
        row.ok ? 1 : 0,
        Number.isFinite(Number(row.score)) ? Number(row.score) : null,
        Number.isFinite(Number(row.latencyMs)) ? Number(row.latencyMs) : null,
        row.exitIp || "",
        row.exitCountry || "",
        row.error || "",
        row.checkedAt || row.at || nowIso(),
        toJsonText(row.detail || row)
      );
      return row;
    },
    queryNodeQualityHistory(nodeId, options = {}) {
      const limit = Math.max(1, Number(options.limit || 100) || 100);
      return listRows(statements.selectNodeQualityHistory, [nodeId, limit]).map((row) => ({
        id: row.id,
        nodeId: row.node_id,
        protocol: row.protocol,
        agentId: row.agent_id,
        ok: Boolean(row.ok),
        score: row.score,
        latencyMs: row.latency_ms,
        exitIp: row.exit_ip,
        exitCountry: row.exit_country,
        error: row.error,
        checkedAt: row.checked_at,
        detail: normalizeJsonField(row.detail_json) || {}
      }));
    }
  };
}

function createJsonAdapter(auditFilePath) {
  return {
    mode: "json",
    path: null,
    appendAudit(row) {
      appendAuditJsonl(auditFilePath, row);
      return row;
    },
    queryAudit: (options = {}) => queryAuditJsonl(auditFilePath, options),
    writeProbeSample() {
      return null;
    },
    queryProbeHistory() {
      return [];
    },
    writeSubscriptionAccess() {
      return null;
    },
    querySubscriptionAccess() {
      return [];
    },
    writeNodeQualityHistory() {
      return null;
    },
    queryNodeQualityHistory() {
      return [];
    }
  };
}

export function appendAudit(auditFilePath, actor, action, target, detail = {}) {
  const row = {
    id: nanoid(),
    at: nowIso(),
    actor,
    action,
    target,
    detail: JSON.parse(JSON.stringify(detail))
  };
  appendAuditJsonl(auditFilePath, row);
  return row;
}

export function queryAudit(auditFilePath, options = {}) {
  return queryAuditJsonl(auditFilePath, options);
}

export function createStorage({ rootDir, defaults = {}, masterKey } = {}) {
  const dataDir = rootDir || path.resolve("data");
  const stateFilePath = path.join(dataDir, STATE_FILE);
  const auditFilePath = path.join(dataDir, AUDIT_FILE);
  const sqlitePath = path.isAbsolute(SQLITE_PATH) ? SQLITE_PATH : path.resolve(SQLITE_PATH);
  const storageMode = sanitizeStorageMode(STORAGE_MODE);
  const warnings = [];

  if (!hasMasterKey(masterKey)) warnings.push("CHIKEN_MASTER_KEY is not set.");

  const eventStore = storageMode === "sqlite" ? createSqliteAdapter({ dataDir, auditFilePath, sqlitePath }) : createJsonAdapter(auditFilePath);

  return {
    mode: storageMode,
    dataDir,
    stateFilePath,
    auditFilePath,
    sqlitePath: storageMode === "sqlite" ? sqlitePath : null,
    warnings,
    loadState: () => loadState({ dataDir, defaults, masterKey }),
    saveState: (state) => saveState(state, { dataDir, masterKey }),
    migrateState: (raw) => migrateState(raw, defaults),
    atomicWrite,
    backupState: () => backupState(dataDir, stateFilePath),
    appendAudit(actor, action, target, detail = {}) {
      const row = {
        id: nanoid(),
        at: nowIso(),
        actor,
        action,
        target,
        detail: JSON.parse(JSON.stringify(detail))
      };
      return eventStore.appendAudit(row);
    },
    queryAudit: (options = {}) => eventStore.queryAudit(options),
    writeProbeSample: (agentId, sample) => eventStore.writeProbeSample(agentId, clone(sample)),
    queryProbeHistory: (agentId, options = {}) => eventStore.queryProbeHistory(agentId, options),
    writeSubscriptionAccess: (row) => eventStore.writeSubscriptionAccess(clone(row)),
    querySubscriptionAccess: (options = {}) => eventStore.querySubscriptionAccess(options),
    writeNodeQualityHistory: (row) => eventStore.writeNodeQualityHistory(clone(row)),
    queryNodeQualityHistory: (nodeId, options = {}) => eventStore.queryNodeQualityHistory(nodeId, options),
    summarizeWarnings: () => warnings.map((line) => sanitizeSensitiveText(line))
  };
}
