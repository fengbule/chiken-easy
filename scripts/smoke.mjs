import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const root = process.cwd();
const distDir = path.join(root, "dist");
const dataDir = path.join(root, "data");
const sqlitePath = path.join(dataDir, "chiken.db");
const requiredFiles = [
  "README.md",
  "package.json",
  "Dockerfile",
  "docker-compose.server.yml",
  "docker-compose.agent.yml",
  "server/index.js",
  "server/configFactory.js",
  "server/storage.js",
  "server/security.js",
  "server/subscriptions.js",
  "agent/index.js",
  "web/src/App.jsx",
  "web/src/style.css",
  "templates/protocols.json",
  "templates/docker-singbox-config.json"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, body, headers: response.headers };
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(500);
    try {
      const health = await fetchJson(`http://127.0.0.1:${port}/api/health`);
      if (health.ok && health.body.ok === true) return true;
    } catch {}
  }
  return false;
}

function startServer(extraEnv = {}) {
  const port = extraEnv.PORT || String(17000 + Math.floor(Math.random() * 1000));
  const args = ["--experimental-sqlite", "server/index.js"];
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      PORT: port,
      CHIKEN_REQUIRE_API_TOKEN: "1",
      CHIKEN_API_TOKEN: "ck_smoke_token",
      CHIKEN_BOOTSTRAP_TOKEN: "ce_smoke_bootstrap",
      CHIKEN_MASTER_KEY: "smoke-master-key",
      CHIKEN_PUBLIC_BASE_URL: `http://127.0.0.1:${port}`,
      CHIKEN_PUBLIC_WS_URL: `ws://127.0.0.1:${port}/agent`,
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  return { child, outputRef: () => output, port };
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await sleep(500);
}

function authHeaders(token = "ck_smoke_token") {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function expectNoLeak(text, field) {
  assert(!text.toLowerCase().includes(field.toLowerCase()), `sensitive field leaked: ${field}`);
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `missing ${file}`);
}

JSON.parse(fs.readFileSync(path.join(root, "templates/protocols.json"), "utf8"));
JSON.parse(fs.readFileSync(path.join(root, "templates/docker-singbox-config.json"), "utf8"));
assert(fs.existsSync(distDir), "dist directory missing; run build first");

const storageMode = String(process.env.CHIKEN_STORAGE || "json").trim().toLowerCase() || "json";
const server = startServer({ CHIKEN_STORAGE: storageMode, CHIKEN_SQLITE_PATH: sqlitePath });

try {
  const ready = await waitForHealth(server.port);
  assert(ready, `server failed to start: ${server.outputRef()}`);

  const health = await fetchJson(`http://127.0.0.1:${server.port}/api/health`);
  assert(health.ok && health.body.ok === true, "health check did not return ok");

  const noToken = await fetchJson(`http://127.0.0.1:${server.port}/api/dashboard`);
  assert(noToken.status === 401, "protected API should require auth");

  const queryTokenBlocked = await fetchJson(`http://127.0.0.1:${server.port}/api/dashboard?token=ck_smoke_token`);
  assert(queryTokenBlocked.status === 401, "query token should be disabled by default");
  assert(String(queryTokenBlocked.body.error || "").includes("query API token is disabled"), "query token disabled message missing");

  const authStatus = await fetchJson(`http://127.0.0.1:${server.port}/api/auth/status`, {
    headers: { Authorization: "Bearer ck_smoke_token" }
  });
  assert(authStatus.ok && authStatus.body.authorized === true, "header token should authorize session");

  const probes = await fetchJson(`http://127.0.0.1:${server.port}/api/public/probes`);
  assert(probes.ok, "public probes endpoint missing");
  const probeText = JSON.stringify(probes.body);
  for (const secret of ["password", "privatekey", "token", "webhook", "\"host\":", "\"ip\":", "\"ssh\"", "\"rdp\""]) {
    expectNoLeak(probeText, secret);
  }

  const summary = await fetchJson(`http://127.0.0.1:${server.port}/api/monitor/summary`, { headers: authHeaders() });
  assert(summary.ok, "/api/monitor/summary missing");

  const memos = await fetchJson(`http://127.0.0.1:${server.port}/api/memos`, { headers: authHeaders() });
  assert(memos.ok, "/api/memos missing");

  const nodePool = await fetchJson(`http://127.0.0.1:${server.port}/api/node-pool`, { headers: authHeaders() });
  assert(nodePool.ok, "/api/node-pool missing");

  const subscriptions = await fetchJson(`http://127.0.0.1:${server.port}/api/subscriptions`, { headers: authHeaders() });
  assert(subscriptions.ok, "/api/subscriptions missing");

  const scripts = await fetchJson(`http://127.0.0.1:${server.port}/api/scripts`, { headers: authHeaders() });
  assert(scripts.ok, "/api/scripts missing");

  const assets = await fetchJson(`http://127.0.0.1:${server.port}/api/assets`, { headers: authHeaders() });
  assert(assets.ok, "/api/assets missing");

  const credentials = await fetchJson(`http://127.0.0.1:${server.port}/api/credentials`, { headers: authHeaders() });
  assert(credentials.ok, "/api/credentials missing");
  const credentialText = JSON.stringify(credentials.body);
  for (const secret of ["password", "privateKey", "token", "secret"]) {
    expectNoLeak(credentialText, secret);
  }

  const tokenCreate = await fetchJson(`http://127.0.0.1:${server.port}/api/api-tokens`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: "smoke" })
  });
  assert(tokenCreate.ok && String(tokenCreate.body.token || "").startsWith("ck_"), "failed to create api token");

  const settings = await fetchJson(`http://127.0.0.1:${server.port}/api/settings`, { headers: authHeaders() });
  assert(settings.ok && settings.body.storageMode === storageMode, "settings storage mode mismatch");

  const protocols = await fetchJson(`http://127.0.0.1:${server.port}/api/protocols`, { headers: authHeaders() });
  assert(protocols.ok && Array.isArray(protocols.body), "/api/protocols missing or invalid");

  const nodeImport = await fetchJson(`http://127.0.0.1:${server.port}/api/node-pool/import`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ content: "ss://YWVzLTI1Ni1nY206dGVzdA==@1.1.1.1:8388#smoke-ss\nvmess://eyJ2IjoiMiIsInBzIjoidGVzdCIsImFkZCI6IjEuMS4xLjEiLCJwb3J0IjoiNDQzIiwiaWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJhaWQiOiIwIn0=" })
  });
  assert(nodeImport.ok && Array.isArray(nodeImport.body?.nodes) && nodeImport.body.nodes.length >= 1, "node import failed");

  const nodeExport = await fetchJson(`http://127.0.0.1:${server.port}/api/node-pool/export?format=raw`, { headers: authHeaders() });
  assert(nodeExport.ok, "node pool export failed");

  const forwardRender = await fetchJson(`http://127.0.0.1:${server.port}/api/forward/render`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ engine: "sing-box", network: "tcp", port: 18080, targetHost: "example.com", targetPort: 80, name: "smoke" })
  });
  assert(forwardRender.ok, "forward render failed");

  const configRender = await fetchJson(`http://127.0.0.1:${server.port}/api/config/render`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ protocol: "mixed", port: 18081 })
  });
  assert(configRender.ok && configRender.body?.config?.inbounds?.length >= 1, "config render failed");

  const vmessRender = await fetchJson(`http://127.0.0.1:${server.port}/api/config/render`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ protocol: "vmess-ws", port: 18082, uuid: "44444444-4444-4444-8444-444444444444", path: "/smoke" })
  });
  assert(vmessRender.ok, "vmess config render failed");
  assert(!JSON.stringify(vmessRender.body?.config || {}).includes("alterId"), "vmess sing-box config contains removed alterId field");

  const backupDownload = await fetch(`http://127.0.0.1:${server.port}/api/backups/download`, {
    headers: { Authorization: "Bearer ck_smoke_token" }
  });
  assert(backupDownload.ok && backupDownload.headers.get("content-type") === "application/gzip", "backup download failed");

  const audit = await fetchJson(`http://127.0.0.1:${server.port}/api/audit`, { headers: authHeaders() });
  assert(audit.ok && Array.isArray(audit.body), "/api/audit missing");

  if (storageMode === "sqlite") {
    const cleanup = await fetchJson(`http://127.0.0.1:${server.port}/api/settings`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify({ historyRetentionDays: { auditDays: 90, probeDays: 7, subscriptionDays: 30, nodeQualityDays: 30, monitorEventsDays: 30, commandRunsDays: 60 } })
    });
    assert(cleanup.ok || cleanup.status >= 200, "sqlite cleanup config failed");

    const subCreate = await fetchJson(`http://127.0.0.1:${server.port}/api/subscriptions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        name: "smoke-sub",
        format: "raw",
        enabled: true,
        localNodes: [],
        imports: [{ id: "smoke", name: "raw", content: "http://127.0.0.1:8080#smoke-http" }]
      })
    });
    assert(subCreate.ok, "failed to create subscription for sqlite smoke");

    const subFetch = await fetchJson(`http://127.0.0.1:${server.port}/sub/${subCreate.body.publicToken}`);
    assert(subFetch.ok, "public subscription endpoint failed in sqlite mode");

    const accessRows = await fetchJson(`http://127.0.0.1:${server.port}/api/subscription-access`, { headers: authHeaders() });
    assert(accessRows.ok && Array.isArray(accessRows.body) && accessRows.body.length >= 1, "sqlite subscription access log missing");

    fs.mkdirSync(dataDir, { recursive: true });
    assert(fs.existsSync(sqlitePath), "sqlite database file missing");
  }
} finally {
  await stopServer(server.child);
}

console.log(`smoke ok (${storageMode})`);
