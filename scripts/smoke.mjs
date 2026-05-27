import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import WebSocket from "ws";

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
  "scripts/install-server.sh",
  "scripts/install-server-docker.sh",
  "server/index.js",
  "server/configFactory.js",
  "server/storage.js",
  "server/security.js",
  "server/subscriptions.js",
  "agent/index.js",
  "agent/networkHelper.js",
  "agent/networkTuning.js",
  "web/src/App.jsx",
  "web/src/style.css",
  "docs/api.md",
  "docs/deployment.md",
  "docs/network-tuning.md",
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
  const child = spawn(process.execPath, ["server/index.js"], {
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

function connectAgent(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("agent connect timeout"));
    }, 10000);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "hello",
          token: "ce_smoke_bootstrap",
          agent: {
            id: "smoke-agent",
            name: "smoke-agent",
            host: "smoke-agent",
            ip: "127.0.0.1",
            os: process.platform,
            arch: process.arch,
            singboxVersion: "-",
            singboxStatus: "unknown",
            metrics: null
          }
        })
      );
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.command === "network_tuning") {
        const profile = String(msg.payload?.profile || "");
        const baseStatus = {
          system: {
            platform: "linux",
            distro: "Ubuntu 24.04",
            kernel: "6.8.0-smoke",
            arch: "x86_64",
            isRoot: true,
            serviceMode: "mock",
            sysctl: {
              procRoot: "/proc",
              configPath: "/etc/sysctl.d/99-chiken-network.conf",
              writable: true
            }
          },
          current: {
            congestionControl: "cubic",
            availableCongestionControls: ["cubic", "bbr"],
            defaultQdisc: "fq_codel",
            persisted: false,
            managedProfile: ""
          },
          support: {
            bbr: true,
            bbr2: false,
            fq: true,
            cubic: true,
            canModify: true,
            profiles: ["enable-bbr", "enable-bbr2", "set-cubic", "remove-chiken-tuning"]
          },
          recommendation: {
            profile: "enable-bbr",
            title: "BBR is the safer first trial",
            reason: "smoke mock",
            canApply: true
          },
          risks: ["smoke mock"]
        };
        const response = {
          type: "command_result",
          commandId: msg.id,
          ok: true,
          output: "smoke network tuning ok",
          status: baseStatus
        };
        if (msg.payload?.action === "dry-run") {
          response.profile = profile;
          response.before = {
            congestionControl: "cubic",
            qdisc: "fq_codel",
            availableCongestionControls: ["cubic", "bbr"],
            persisted: false,
            managedProfile: ""
          };
          response.after = response.before;
          response.plan = {
            ok: true,
            profile,
            supported: true,
            target: {
              congestionControl: profile === "enable-bbr" ? "bbr" : "cubic",
              defaultQdisc: profile === "enable-bbr" ? "fq" : "fq_codel"
            },
            steps: ["smoke dry-run"]
          };
        }
        ws.send(JSON.stringify(response));
        return;
      }
      if (msg.type === "welcome") {
        clearTimeout(timer);
        resolve(ws);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
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
let agentWs = null;

try {
  const ready = await waitForHealth(server.port);
  assert(ready, `server failed to start: ${server.outputRef()}`);
  agentWs = await connectAgent(server.port);

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
  const publicSummary = await fetchJson(`http://127.0.0.1:${server.port}/api/public/summary`);
  assert(publicSummary.ok, "public summary endpoint missing");
  const publicPage = await fetchJson(`http://127.0.0.1:${server.port}/`, {});
  assert(publicPage.ok && String(publicPage.body).includes("Public Probes"), "public probe page missing");
  const apiDocs = await fetchJson(`http://127.0.0.1:${server.port}/docs/api`, {});
  assert(apiDocs.ok && String(apiDocs.body).includes("Endpoint Catalog"), "api docs page missing");
  const openApi = await fetchJson(`http://127.0.0.1:${server.port}/docs/api/openapi.json`);
  assert(openApi.ok && openApi.body.openapi, "openapi endpoint missing");
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

  const tuningStatus = await fetchJson(`http://127.0.0.1:${server.port}/api/agents/smoke-agent/network/tuning`, { headers: authHeaders() });
  assert(tuningStatus.ok && tuningStatus.body.status, "network tuning status endpoint missing");

  const tuningDryRun = await fetchJson(`http://127.0.0.1:${server.port}/api/agents/smoke-agent/network/tuning/dry-run`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ profile: "enable-bbr" })
  });
  assert(tuningDryRun.status === 200, "network tuning dry-run endpoint missing");
  assert(tuningDryRun.body.plan, "network tuning dry-run should return a plan");

  const tuningHistory = await fetchJson(`http://127.0.0.1:${server.port}/api/agents/smoke-agent/network/tuning/history`, { headers: authHeaders() });
  assert(tuningHistory.ok && Array.isArray(tuningHistory.body), "network tuning history endpoint missing");

  if (storageMode === "sqlite") {
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
  try {
    agentWs?.close();
  } catch {}
  await stopServer(server.child);
}

console.log(`smoke ok (${storageMode})`);
