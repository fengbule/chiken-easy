import fs from "fs";
import path from "path";
import net from "net";
import { Client as SshClient } from "ssh2";
import WebSocket from "ws";

const cwd = process.cwd();
const localServersPath = path.join(cwd, ".local", "test-servers.json");
const localSecretsPath = path.join(cwd, ".local", "deploy-secrets.json");
const localRemoteReportPath = path.join(cwd, ".local", "remote-verify.json");
const localKeyDir = path.join(cwd, ".local", "keys");

function cleanText(value) {
  return String(value ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskIp(value) {
  const text = cleanText(value);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return text ? `${text.slice(0, 3)}***` : "";
}

function safeOutput(value, max = 320) {
  return cleanText(value).replace(/\s+/g, " ").slice(0, max);
}

function classifySshError(message = "") {
  const text = String(message || "").toLowerCase();
  if (text.includes("timed out") || text.includes("timeout")) return "tcp_timeout";
  if (text.includes("all configured authentication methods failed") || text.includes("authentication failure")) return "auth_failed";
  if (text.includes("handshake")) return "ssh_handshake_failed";
  if (text.includes("permission denied")) return "permission_denied";
  if (text.includes("docker")) return "docker_missing";
  if (text.includes("econnrefused")) return "command_failed";
  return "unknown";
}

function createResult(role, kind, name, ok, detail = {}) {
  return { role, kind, name, ok, ...detail };
}

async function api(url, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { ok: response.ok, status: response.status, body, headers: response.headers };
}

function tcpPortCheck(server, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, reason = "", extra = {}) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, reason, ...extra });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, "tcp_timeout"));
    socket.once("error", (error) => finish(false, cleanText(error.message) || "unknown"));
    socket.connect(Number(server.port || 22), server.host);
  });
}

function sshBannerCheck(server, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    let banner = "";
    const finish = (ok, reason = "", extra = {}) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, reason, ...extra });
    };
    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => finish(false, "ssh_handshake_failed"));
    socket.once("error", (error) => finish(false, cleanText(error.message) || "unknown"));
    socket.on("data", (chunk) => {
      banner += chunk.toString();
      if (banner.includes("\n")) finish(true, "", { banner: banner.split(/\r?\n/)[0] });
    });
    socket.connect(Number(server.port || 22), server.host);
  });
}

function ensurePrivateKeyFile(server, role) {
  if (!cleanText(server.privateKey)) return null;
  fs.mkdirSync(localKeyDir, { recursive: true });
  const keyPath = path.join(localKeyDir, `${role}.pem`);
  fs.writeFileSync(keyPath, `${server.privateKey.replace(/\r\n/g, "\n")}\n`, { mode: 0o600 });
  return keyPath;
}

function connectConfig(server, role) {
  const keyPath = ensurePrivateKeyFile(server, role);
  const config = {
    host: server.host,
    port: Number(server.port || 22) || 22,
    username: server.user || "root",
    readyTimeout: 20000,
    hostVerifier: () => true
  };
  if (keyPath) config.privateKey = fs.readFileSync(keyPath, "utf8");
  else config.password = server.password;
  return config;
}

function sshExec(server, role, command, options = {}) {
  return new Promise((resolve) => {
    const conn = new SshClient();
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        conn.end();
      } catch {}
      resolve(result);
    };

    conn
      .on("ready", () => {
        conn.exec(command, options.execOptions || {}, (error, stream) => {
          if (error) return finish({ ok: false, reason: "command_failed", output: error.message, code: 1 });
          let stdout = "";
          let stderr = "";
          if (options.stdin) stream.end(options.stdin);
          stream.on("close", (code) => {
            finish({
              ok: code === 0,
              reason: code === 0 ? "" : command.includes("docker") ? "docker_missing" : "command_failed",
              output: `${stdout}${stderr}`.trim(),
              code: code || 0
            });
          });
          stream.on("data", (chunk) => {
            stdout += chunk.toString();
          });
          stream.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
          });
        });
      })
      .on("error", (error) => {
        finish({ ok: false, reason: classifySshError(error.message), output: cleanText(error.message), code: 1 });
      })
      .connect(connectConfig(server, role));
  });
}

function summarizeServer(server, index) {
  return {
    index: index + 1,
    host: maskIp(server.host),
    port: Number(server.port || 22) || 22,
    user: cleanText(server.user || "root") || "root",
    authType: cleanText(server.privateKey ? "privateKey" : "password"),
    hasPassword: Boolean(cleanText(server.password)),
    hasPrivateKey: Boolean(cleanText(server.privateKey))
  };
}

async function verifyServer(server, role) {
  const checks = [];

  const tcp = await tcpPortCheck(server);
  checks.push(createResult(role, "ssh", "tcp", tcp.ok, { reason: tcp.reason || "", suggestion: tcp.ok ? "" : "Confirm the SSH port and firewall rules are reachable." }));
  if (!tcp.ok) return checks;

  const banner = await sshBannerCheck(server);
  checks.push(createResult(role, "ssh", "banner", banner.ok, { reason: banner.reason || "", banner: banner.banner || "", suggestion: banner.ok ? "" : "Check whether the SSH service is responding correctly." }));
  if (!banner.ok) return checks;

  const authProbe = await sshExec(server, role, "printf ok");
  checks.push(createResult(role, "ssh", "auth", authProbe.ok, { reason: authProbe.reason || "", output: safeOutput(authProbe.output), suggestion: authProbe.ok ? "" : "Check the password or private key and root login policy." }));
  if (!authProbe.ok) return checks;

  for (const command of ["pwd", "uname -a", "docker ps --format '{{.Names}}'"]) {
    const result = await sshExec(server, role, command);
    checks.push(createResult(role, "ssh", command, result.ok, {
      reason: result.reason || "",
      output: safeOutput(result.output),
      suggestion: result.ok ? "" : command.includes("docker") ? "Confirm Docker is installed and the current user can run docker ps." : "Check remote shell execution permissions."
    }));
  }

  return checks;
}

function maskShort(value) {
  const text = cleanText(value);
  return text ? `${text.slice(0, 6)}***` : "";
}

async function waitFor(predicate, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 60000) || 60000);
  const intervalMs = Math.max(200, Number(options.intervalMs || 2000) || 2000);
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    lastValue = await predicate();
    if (lastValue?.ok) return lastValue;
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
  return lastValue;
}

async function waitForAgentsOnline(baseUrl, token, expected = 3) {
  const result = await waitFor(async () => {
    const response = await api(`${baseUrl}/api/agents`, token);
    const rows = Array.isArray(response.body) ? response.body : [];
    const connected = rows.filter((item) => item.connected).length;
    return { ok: response.ok && connected >= expected, count: rows.length, connected, rows };
  }, { timeoutMs: 120000, intervalMs: 3000 });
  return result || { ok: false, count: 0, connected: 0, rows: [] };
}

async function verifySftp(baseUrl, token, agent) {
  const role = agent.name || agent.id;
  const directory = `/tmp/chiken-verify-${agent.id}`;
  const remotePath = `${directory}/probe.txt`;
  const fileBody = Buffer.from(`remote-verify ${agent.id} ${Date.now()}\n`, "utf8");

  const mkdirResponse = await api(`${baseUrl}/api/agents/${agent.id}/sftp/mkdir`, token, {
    method: "POST",
    body: JSON.stringify({ path: directory })
  });
  const mkdirOk = mkdirResponse.ok || String(mkdirResponse.body?.error || "").toLowerCase().includes("failure");

  const boundary = `----remote-verify-${Date.now()}`;
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="directory"\r\n\r\n${directory}\r\n`, "utf8"),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="probe.txt"\r\nContent-Type: text/plain\r\n\r\n`, "utf8"),
    fileBody,
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  ]);
  const uploadRaw = await fetch(`${baseUrl}/api/agents/${agent.id}/sftp/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(multipartBody.length)
    },
    body: multipartBody
  });
  const uploadText = await uploadRaw.text();
  let uploadBody = uploadText;
  try {
    uploadBody = cleanText(uploadText).startsWith("{") ? JSON.parse(uploadText) : uploadText;
  } catch {}
  const uploadResponse = { ok: uploadRaw.ok, status: uploadRaw.status, body: uploadBody };
  const listResponse = await api(`${baseUrl}/api/agents/${agent.id}/sftp?path=${encodeURIComponent(directory)}`, token);
  const downloadResponse = await fetch(`${baseUrl}/api/agents/${agent.id}/sftp/download?path=${encodeURIComponent(remotePath)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const downloadText = await downloadResponse.text();
  const deleteResponse = await api(`${baseUrl}/api/agents/${agent.id}/sftp?path=${encodeURIComponent(remotePath)}`, token, {
    method: "DELETE",
    body: JSON.stringify({ path: remotePath })
  });

  return [
    createResult(role, "sftp", "mkdir", mkdirOk, {
      status: mkdirResponse.status,
      reason: mkdirOk ? "" : cleanText(mkdirResponse.body?.error || mkdirResponse.body)
    }),
    createResult(role, "sftp", "upload", uploadResponse.ok, {
      status: uploadResponse.status,
      reason: uploadResponse.ok ? "" : cleanText(uploadResponse.body?.error || uploadResponse.body)
    }),
    createResult(role, "sftp", "list", listResponse.ok && Array.isArray(listResponse.body?.entries) && listResponse.body.entries.some((item) => item.name === "probe.txt"), {
      status: listResponse.status,
      reason: listResponse.ok ? "" : cleanText(listResponse.body?.error || listResponse.body)
    }),
    createResult(role, "sftp", "download", downloadResponse.ok && downloadText === fileBody.toString("utf8"), {
      status: downloadResponse.status,
      reason: downloadResponse.ok ? "" : safeOutput(downloadText)
    }),
    createResult(role, "sftp", "delete", deleteResponse.ok, {
      status: deleteResponse.status,
      reason: deleteResponse.ok ? "" : cleanText(deleteResponse.body?.error || deleteResponse.body)
    })
  ];
}

async function ensureScript(baseUrl, token, name, content, timeoutMs = 30000) {
  const scriptsResponse = await api(`${baseUrl}/api/scripts`, token);
  const current = Array.isArray(scriptsResponse.body) ? scriptsResponse.body.find((item) => item.name === name) : null;
  if (current) return current;
  const created = await api(`${baseUrl}/api/scripts`, token, {
    method: "POST",
    body: JSON.stringify({ name, content, timeoutMs, category: "acceptance", tags: ["acceptance"] })
  });
  if (!created.ok) throw new Error(cleanText(created.body?.error || created.body || "failed to create script"));
  return created.body;
}

async function verifyBatchCommand(baseUrl, token, agents) {
  const script = await ensureScript(baseUrl, token, "uptime script", "uptime", 30000);
  const run = await api(`${baseUrl}/api/scripts/run-batch`, token, {
    method: "POST",
    body: JSON.stringify({
      scriptId: script.id,
      agentIds: agents.map((item) => item.id),
      concurrency: 2,
      timeoutMs: 30000
    })
  });
  const ok = run.ok && Array.isArray(run.body?.results) && run.body.results.length === agents.length && run.body.results.every((item) => item.ok);
  return createResult("panel", "script", "batch_uptime", ok, {
    reason: run.ok ? "" : cleanText(run.body?.error || run.body),
    results: Array.isArray(run.body?.results)
      ? run.body.results.map((item) => ({ agentId: item.agentId, ok: item.ok, output: safeOutput(item.output) }))
      : []
  });
}

async function verifySubscription(baseUrl, token) {
  const nodes = await api(`${baseUrl}/api/node-pool`, token);
  const usable = Array.isArray(nodes.body) ? nodes.body.filter((item) => item.protocol === "http" || item.protocol === "ss").slice(0, 2) : [];
  if (!usable.length) {
    return [createResult("panel", "subscription", "create", false, { reason: "no eligible nodes for subscription test" })];
  }
  const name = `rv-sub-${Date.now()}`;
  const created = await api(`${baseUrl}/api/subscriptions`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      format: "base64",
      enabled: true,
      nodeIds: usable.map((item) => item.id),
      localNodes: [],
      onlyHealthy: false,
      sortBy: "score"
    })
  });
  if (!created.ok) {
    return [createResult("panel", "subscription", "create", false, { reason: cleanText(created.body?.error || created.body) })];
  }

  const profile = created.body;
  const fetchBase64 = await fetch(`${profile.url}?format=base64`);
  const base64Body = await fetchBase64.text();
  const fetchClash = await fetch(`${profile.url}?format=clash`);
  const clashBody = await fetchClash.text();
  const fetchSingbox = await fetch(`${profile.url}?format=sing-box`);
  const singboxBody = await fetchSingbox.text();
  const access = await api(`${baseUrl}/api/subscription-access`, token);

  return [
    createResult("panel", "subscription", "base64", fetchBase64.ok && Boolean(cleanText(base64Body)), {
      status: fetchBase64.status,
      reason: fetchBase64.ok ? "" : safeOutput(base64Body)
    }),
    createResult("panel", "subscription", "clash", fetchClash.ok && clashBody.includes("proxies:"), {
      status: fetchClash.status,
      reason: fetchClash.ok ? "" : safeOutput(clashBody)
    }),
    createResult("panel", "subscription", "sing_box", fetchSingbox.ok && singboxBody.includes("\"outbounds\""), {
      status: fetchSingbox.status,
      reason: fetchSingbox.ok ? "" : safeOutput(singboxBody)
    }),
    createResult("panel", "subscription", "access_log", access.ok && Array.isArray(access.body) && access.body.some((row) => row.profileId === profile.id), {
      status: access.status,
      reason: access.ok ? "" : cleanText(access.body?.error || access.body)
    })
  ];
}

async function waitForForwardState(baseUrl, token, agentId, ruleId, expectedStatus, timeoutMs = 45000) {
  return waitFor(async () => {
    const listResponse = await api(`${baseUrl}/api/agents/${agentId}/forwards`, token);
    const rule = Array.isArray(listResponse.body) ? listResponse.body.find((item) => item.id === ruleId) : null;
    if (expectedStatus === "removed") {
      return {
        ok: !rule,
        rule,
        list: listResponse.body
      };
    }
    return {
      ok: Boolean(rule && rule.status === expectedStatus),
      rule,
      list: listResponse.body
    };
  }, { timeoutMs, intervalMs: 3000 });
}

async function verifyForwardRule(baseUrl, token, agent, server, engine, network, port, targetHost, targetPort) {
  const name = `rv-${engine}-${network}-${Date.now()}`;
  const createResponse = await api(`${baseUrl}/api/agents/${agent.id}/forward/wizard`, token, {
    method: "POST",
    body: JSON.stringify({
      name,
      engine,
      network,
      port,
      targetHost,
      targetPort,
      tags: ["remote-verify"],
      note: "remote verify"
    })
  });
  if (!createResponse.ok) {
    return [
      createResult(agent.name || agent.id, "forward", `${engine}_${network}_create`, false, {
        reason: cleanText(createResponse.body?.error || createResponse.body)
      })
    ];
  }

  const ruleId = createResponse.body?.rule?.id;
  const activeState = await waitForForwardState(baseUrl, token, agent.id, ruleId, "active");
  const activeRule = activeState?.rule;
  const active = Boolean(activeRule && activeRule.status === "active");

  const requestCommand =
    network === "udp"
      ? `python3 - <<'PY'\nimport socket\npayload=b'\\x12\\x34\\x01\\x00\\x00\\x01\\x00\\x00\\x00\\x00\\x00\\x00\\x07example\\x03com\\x00\\x00\\x01\\x00\\x01'\ns=socket.socket(socket.AF_INET, socket.SOCK_DGRAM)\ns.settimeout(8)\ns.sendto(payload, ('127.0.0.1', ${port}))\nreply,_=s.recvfrom(1024)\nprint('udp_ok', len(reply))\nPY`
      : `python3 - <<'PY'\nimport socket\ns=socket.create_connection(('127.0.0.1', ${port}), timeout=10)\ns.sendall(b'GET / HTTP/1.0\\r\\nHost: example.com\\r\\n\\r\\n')\nreply=s.recv(256)\nprint(reply.decode('latin1', 'ignore'))\ns.close()\nPY`;
  const requestExec = active ? await sshExec(server, agent.name || agent.id, requestCommand) : { ok: false, reason: "command_failed", output: activeRule?.lastError || "forward inactive" };
  const requestOk =
    requestExec.ok &&
    (network === "udp" ? /udp_ok/i.test(requestExec.output) : /HTTP\/1\.[01]\s+\d{3}|<!doctype html|<html/i.test(requestExec.output));

  const deleteResponse = await api(`${baseUrl}/api/agents/${agent.id}/forwards/${ruleId}`, token, { method: "DELETE" });
  const removedState = await waitForForwardState(baseUrl, token, agent.id, ruleId, "removed");
  const removed = Boolean(removedState?.ok);
  const containerName = activeRule?.containerName || `chiken-forward-${cleanText(ruleId).toLowerCase()}`;
  const containerInspect = await sshExec(server, agent.name || agent.id, `docker ps -a --format '{{.Names}}' | grep -Fx '${containerName}' || true`);
  const containerGone = !cleanText(containerInspect.output);

  return [
    createResult(agent.name || agent.id, "forward", `${engine}_${network}_active`, active, {
      reason: active ? "" : cleanText(activeRule?.lastError || activeState?.rule?.lastError || "forward did not become active")
    }),
    createResult(agent.name || agent.id, "forward", `${engine}_${network}_request`, requestOk, {
      reason: requestOk ? "" : safeOutput(requestExec.output || requestExec.reason),
      output: safeOutput(requestExec.output)
    }),
    createResult(agent.name || agent.id, "forward", `${engine}_${network}_delete`, deleteResponse.ok && removed && containerGone, {
      reason: deleteResponse.ok && removed && containerGone ? "" : safeOutput(deleteResponse.body?.error || containerInspect.output || "forward cleanup incomplete")
    })
  ];
}

async function fetchNodePool(baseUrl, token) {
  const response = await api(`${baseUrl}/api/node-pool`, token);
  return Array.isArray(response.body) ? response.body : [];
}

async function importLocalNode(baseUrl, token, agentId) {
  const response = await api(`${baseUrl}/api/node-pool/from-agent/${agentId}`, token, {
    method: "POST"
  });
  if (!response.ok) throw new Error(cleanText(response.body?.error || response.body || "failed to import local node"));
  const nodes = await fetchNodePool(baseUrl, token);
  const node = nodes.find((item) => item.id === `${agentId}-local`);
  if (!node) throw new Error(`local node ${agentId}-local not found`);
  return node;
}

async function applyConfigWizard(baseUrl, token, agent, body) {
  const response = await api(`${baseUrl}/api/agents/${agent.id}/config/wizard`, token, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return {
    ok: response.ok && Boolean(cleanText(response.body?.versionId)),
    status: response.status,
    body: response.body
  };
}

async function captureRestorePoint(baseUrl, token, agentId) {
  const versions = await api(`${baseUrl}/api/agents/${agentId}/config/versions`, token);
  const version = Array.isArray(versions.body) ? versions.body.find((item) => item.status === "applied") || versions.body[0] : null;
  return cleanText(version?.id);
}

async function restoreConfigVersion(baseUrl, token, agentId, versionId) {
  if (!cleanText(versionId)) return { ok: false, reason: "restore_version_missing" };
  const response = await api(`${baseUrl}/api/agents/${agentId}/config/rollback/${versionId}`, token, {
    method: "POST"
  });
  return {
    ok: response.ok,
    reason: response.ok ? "" : cleanText(response.body?.error || response.body),
    body: response.body
  };
}

async function findNode(baseUrl, token, predicate) {
  const nodes = await fetchNodePool(baseUrl, token);
  return nodes.find(predicate) || null;
}

async function runNodeCheck(baseUrl, token, checkerAgentId, nodeIds) {
  const response = await api(`${baseUrl}/api/node-pool/check`, token, {
    method: "POST",
    body: JSON.stringify({
      nodeIds,
      agentId: checkerAgentId,
      checkedBy: checkerAgentId,
      timeoutMs: 20000
    })
  });
  if (!response.ok) throw new Error(cleanText(response.body?.error || response.body || "proxy check failed"));
  return Array.isArray(response.body?.results) ? response.body.results : [];
}

function proxyResultToCheck(name, result) {
  return createResult("panel", "proxy-check", name, Boolean(result?.ok), {
    reason: cleanText(result?.error),
    protocol: result?.protocol,
    latencyMs: result?.latencyMs,
    statusCode: result?.statusCode || 0,
    exitIp: maskIp(result?.exitIp),
    checkedAt: result?.checkedAt || ""
  });
}

async function verifyMemos(baseUrl, token, agentId = "") {
  const create = await api(`${baseUrl}/api/memos`, token, {
    method: "POST",
    body: JSON.stringify({
      title: `rv memo ${Date.now()}`,
      content: "remote verify memo",
      tags: ["acceptance", "remote-verify"],
      agentId,
      visibility: "private"
    })
  });
  if (!create.ok) {
    return [createResult("panel", "memos", "create", false, { reason: cleanText(create.body?.error || create.body) })];
  }

  const memoId = create.body?.id;
  const update = await api(`${baseUrl}/api/memos/${memoId}`, token, {
    method: "PUT",
    body: JSON.stringify({
      ...create.body,
      title: `${create.body.title} updated`,
      content: "remote verify memo updated"
    })
  });
  const list = await api(`${baseUrl}/api/memos?agentId=${encodeURIComponent(agentId)}`, token);
  const deleteResp = await api(`${baseUrl}/api/memos/${memoId}`, token, { method: "DELETE" });
  const afterDelete = await api(`${baseUrl}/api/memos?agentId=${encodeURIComponent(agentId)}`, token);

  return [
    createResult("panel", "memos", "create", create.ok && Boolean(memoId), {
      reason: create.ok ? "" : cleanText(create.body?.error || create.body)
    }),
    createResult("panel", "memos", "update", update.ok && cleanText(update.body?.title).includes("updated"), {
      reason: update.ok ? "" : cleanText(update.body?.error || update.body)
    }),
    createResult("panel", "memos", "list", list.ok && Array.isArray(list.body) && list.body.some((row) => row.id === memoId), {
      reason: list.ok ? "" : cleanText(list.body?.error || list.body)
    }),
    createResult("panel", "memos", "delete", deleteResp.ok && afterDelete.ok && Array.isArray(afterDelete.body) && !afterDelete.body.some((row) => row.id === memoId), {
      reason: deleteResp.ok ? "" : cleanText(deleteResp.body?.error || deleteResp.body)
    })
  ];
}

async function verifyTerminalWebSocket(baseUrl, token, agentId) {
  const target = new URL(baseUrl);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  target.pathname = "/terminal";
  target.search = `?agentId=${encodeURIComponent(agentId)}&mode=ssh`;

  return new Promise((resolve) => {
    const ws = new WebSocket(target.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      resolve(createResult("panel", "webssh", "terminal_connect", false, { reason: "terminal timeout" }));
    }, 20000);

    ws.on("message", (raw) => {
      const text = raw.toString();
      if (text.includes("Connected to") || text.includes("\"type\":\"output\"")) {
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        resolve(createResult("panel", "webssh", "terminal_connect", true, { reason: "" }));
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timer);
      resolve(createResult("panel", "webssh", "terminal_connect", false, { reason: cleanText(error.message) }));
    });

    ws.on("close", () => {
      clearTimeout(timer);
    });
  });
}

async function verifyNetworkTuning(baseUrl, token, agents) {
  const results = [];
  const statusRows = [];

  for (const agent of agents) {
    const status = await api(`${baseUrl}/api/agents/${agent.id}/network/tuning`, token);
    const current = status.body?.status?.current || {};
    statusRows.push({
      agentId: agent.id,
      congestionControl: cleanText(current.congestionControl),
      qdisc: cleanText(current.defaultQdisc),
      bbr: Boolean(status.body?.status?.support?.bbr),
      bbr2: Boolean(status.body?.status?.support?.bbr2),
      fq: Boolean(status.body?.status?.support?.fq)
    });
    results.push(
      createResult(agent.name || agent.id, "network-tuning", "status", status.ok && Boolean(status.body?.status), {
        reason: status.ok ? "" : cleanText(status.body?.error || status.body),
        current: {
          congestionControl: cleanText(current.congestionControl),
          qdisc: cleanText(current.defaultQdisc)
        }
      })
    );
  }

  for (const agent of agents) {
    const dryRun = await api(`${baseUrl}/api/agents/${agent.id}/network/tuning/dry-run`, token, {
      method: "POST",
      body: JSON.stringify({ profile: "enable-bbr" })
    });
    results.push(
      createResult(agent.name || agent.id, "network-tuning", "dry_run_bbr", dryRun.ok && Boolean(dryRun.body?.plan), {
        reason: dryRun.ok ? cleanText(dryRun.body?.output) : cleanText(dryRun.body?.error || dryRun.body),
        supported: Boolean(dryRun.body?.plan?.supported)
      })
    );
  }

  const candidate = agents.find((agent) => {
    if (cleanText(agent.name).toLowerCase() === "main") return false;
    const row = statusRows.find((item) => item.agentId === agent.id);
    return row && row.bbr && row.fq;
  });

  if (!candidate) {
    results.push(
      createResult("panel", "network-tuning", "single_host_apply_skip", true, {
        reason: "no non-critical agent with explicit BBR + fq support was available for a safe live apply test"
      })
    );
    return results;
  }

  const apply = await api(`${baseUrl}/api/agents/${candidate.id}/network/tuning/apply`, token, {
    method: "POST",
    body: JSON.stringify({ profile: "enable-bbr" })
  });
  const applyOk =
    apply.ok &&
    apply.body?.ok === true &&
    cleanText(apply.body?.after?.congestionControl) === "bbr" &&
    cleanText(apply.body?.after?.qdisc) === "fq";
  results.push(
    createResult(candidate.name || candidate.id, "network-tuning", "enable_bbr_single_host", applyOk, {
      reason: applyOk ? "" : cleanText(apply.body?.output || apply.body?.error || "enable-bbr failed"),
      after: apply.body?.after || null
    })
  );

  const history = await api(`${baseUrl}/api/agents/${candidate.id}/network/tuning/history`, token);
  const hasAudit = history.ok && Array.isArray(history.body) && history.body.some((row) => row.action === "network_tuning_apply");
  results.push(
    createResult(candidate.name || candidate.id, "network-tuning", "audit_after_apply", hasAudit, {
      reason: hasAudit ? "" : "network tuning apply history not found"
    })
  );

  const rollback = await api(`${baseUrl}/api/agents/${candidate.id}/network/tuning/rollback`, token, {
    method: "POST",
    body: JSON.stringify({})
  });
  results.push(
    createResult(candidate.name || candidate.id, "network-tuning", "rollback_single_host", rollback.ok && rollback.body?.ok === true, {
      reason: rollback.ok ? cleanText(rollback.body?.output) : cleanText(rollback.body?.error || rollback.body),
      after: rollback.body?.after || null
    })
  );

  const postRollback = await api(`${baseUrl}/api/agents/${candidate.id}/network/tuning`, token);
  const restored =
    postRollback.ok &&
    cleanText(postRollback.body?.status?.current?.congestionControl) === cleanText(rollback.body?.after?.congestionControl) &&
    cleanText(postRollback.body?.status?.current?.defaultQdisc) === cleanText(rollback.body?.after?.qdisc);
  results.push(
    createResult(candidate.name || candidate.id, "network-tuning", "post_rollback_status", restored, {
      reason: restored ? "" : "post-rollback inspection does not match rollback result"
    })
  );

  return results;
}

async function verifyManagedProxyChecks(baseUrl, token, sourceAgent, checkerAgent) {
  const results = [];
  const restoreVersionId = await captureRestorePoint(baseUrl, token, sourceAgent.id);

  try {
    const mixedPort = 19079;
    const mixedApply = await applyConfigWizard(baseUrl, token, sourceAgent, {
      protocol: "mixed",
      port: mixedPort,
      exportName: "remote-verify-mixed",
      exportHost: sourceAgent.publicHost || sourceAgent.ip || sourceAgent.host
    });
    results.push(createResult(sourceAgent.name || sourceAgent.id, "config", "mixed_apply", mixedApply.ok, {
      reason: mixedApply.ok ? "" : cleanText(mixedApply.body?.error || mixedApply.body)
    }));
    if (mixedApply.ok) {
      await sleep(5000);
      const mixedNode = await importLocalNode(baseUrl, token, sourceAgent.id);
      await api(`${baseUrl}/api/node-pool/${mixedNode.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          address: sourceAgent.publicHost || sourceAgent.ip || sourceAgent.host,
          port: mixedPort,
          enabled: true
        })
      });
      const checks = await runNodeCheck(baseUrl, token, checkerAgent.id, [mixedNode.id]);
      results.push(proxyResultToCheck("mixed_protocol", checks[0]));
    }

    const ssPort = 19080;
    const ssPassword = `rv-ss-${Date.now()}`;
    const ssApply = await applyConfigWizard(baseUrl, token, sourceAgent, {
      protocol: "shadowsocks",
      port: ssPort,
      password: ssPassword,
      method: "aes-256-gcm",
      exportName: "remote-verify-ss",
      exportHost: sourceAgent.publicHost || sourceAgent.ip || sourceAgent.host
    });
    results.push(createResult(sourceAgent.name || sourceAgent.id, "config", "shadowsocks_apply", ssApply.ok, {
      reason: ssApply.ok ? "" : cleanText(ssApply.body?.error || ssApply.body)
    }));
    if (ssApply.ok) {
      await sleep(5000);
      const ssNode = await importLocalNode(baseUrl, token, sourceAgent.id);
      await api(`${baseUrl}/api/node-pool/${ssNode.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          address: sourceAgent.publicHost || sourceAgent.ip || sourceAgent.host,
          port: ssPort,
          enabled: true
        })
      });
      const checks = await runNodeCheck(baseUrl, token, checkerAgent.id, [ssNode.id]);
      results.push(proxyResultToCheck("ss_protocol", checks[0]));
    }

    const unsupportedSource = await findNode(baseUrl, token, (item) => item.protocol === "vless" || item.protocol === "trojan" || item.protocol === "hysteria2");
    if (unsupportedSource) {
      const checks = await runNodeCheck(baseUrl, token, checkerAgent.id, [unsupportedSource.id]);
      const result = checks[0];
      results.push(createResult("panel", "proxy-check", "vless_unsupported", Boolean(result?.unsupported || result?.notImplemented), {
        reason: cleanText(result?.error),
        protocol: result?.protocol,
        unsupported: Boolean(result?.unsupported),
        notImplemented: Boolean(result?.notImplemented)
      }));
    } else {
      results.push(createResult("panel", "proxy-check", "vless_unsupported", true, {
        reason: "no unsupported protocol node found for explicit live check"
      }));
    }

    const eligibleNodes = (await fetchNodePool(baseUrl, token)).filter((item) => item.enabled !== false && item.health === "healthy");
    results.push(createResult("panel", "proxy-check", "subscription_filter_ready", eligibleNodes.length >= 1, {
      reason: eligibleNodes.length ? "" : "no healthy node available after proxy check",
      nodeIds: eligibleNodes.map((item) => item.id)
    }));
  } finally {
    const restored = await restoreConfigVersion(baseUrl, token, sourceAgent.id, restoreVersionId);
    results.push(createResult(sourceAgent.name || sourceAgent.id, "config", "restore_previous", restored.ok, {
      reason: restored.reason || ""
    }));
    if (restored.ok) await sleep(5000);
  }

  return results;
}

async function verifyForwardImage(baseUrl, token, agentId, engine) {
  const response = await api(`${baseUrl}/api/agents/${agentId}/forward-images/${engine}/check`, token, { method: "POST" });
  return createResult(agentId, "forward-image", engine, response.ok && response.body?.ok === true, {
    reason: response.ok ? cleanText(response.body?.error) : cleanText(response.body?.error || response.body),
    image: maskShort(response.body?.image),
    pulled: Boolean(response.body?.pulled),
    present: Boolean(response.body?.present)
  });
}

async function verifyRealityServer(baseUrl, token, agent, server, clientServer) {
  const keypair = await sshExec(server, agent.name || agent.id, "docker exec chiken-singbox sh -lc 'sing-box generate reality-keypair'");
  if (!keypair.ok) {
    return [createResult(agent.name || agent.id, "reality", "keypair", false, { reason: safeOutput(keypair.output) })];
  }
  const privateKey = cleanText((keypair.output.match(/PrivateKey:\s*(\S+)/) || [])[1]);
  const publicKey = cleanText((keypair.output.match(/PublicKey:\s*(\S+)/) || [])[1]);
  const shortId = "0123456789abcdef";
  const sni = "www.cloudflare.com";
  const port = 19443;
  const requestBody = {
    protocol: "vless-reality",
    port,
    uuid: "11111111-1111-1111-1111-111111111111",
    privateKey,
    publicKey,
    shortId,
    serverName: sni,
    clientFingerprint: "chrome",
    flow: "xtls-rprx-vision",
    exportName: "remote-verify-reality",
    exportHost: agent.publicHost || agent.ip || agent.host
  };
  const applyResponse = await api(`${baseUrl}/api/agents/${agent.id}/config/wizard`, token, {
    method: "POST",
    body: JSON.stringify(requestBody)
  });
  const applyOk = applyResponse.ok && cleanText(applyResponse.body?.versionId);
  const serverChecks = [];
  serverChecks.push(createResult(agent.name || agent.id, "reality", "apply", Boolean(applyOk), {
    reason: applyResponse.ok ? "" : cleanText(applyResponse.body?.error || applyResponse.body),
    publicKey: maskShort(publicKey),
    shortId: maskShort(shortId),
    sni,
    utls: "chrome",
    port
  }));
  if (!applyOk) return serverChecks;

  await sleep(5000);
  const validate = await sshExec(server, agent.name || agent.id, "docker exec chiken-singbox sh -lc 'sing-box check -c /etc/sing-box/config.json'");
  const listen = await sshExec(server, agent.name || agent.id, `ss -ltnp | grep ':${port} ' || true`);
  const logs = await sshExec(server, agent.name || agent.id, "docker logs --tail 80 chiken-singbox 2>&1");
  const configRead = await sshExec(server, agent.name || agent.id, "docker exec chiken-singbox sh -lc 'cat /etc/sing-box/config.json'");
  const configHasReality = /"reality"\s*:\s*\{|"type"\s*:\s*"vless"/.test(configRead.output);

  serverChecks.push(createResult(agent.name || agent.id, "reality", "config_validate", validate.ok, {
    reason: validate.ok ? "" : safeOutput(validate.output),
    output: safeOutput(validate.output)
  }));
  serverChecks.push(createResult(agent.name || agent.id, "reality", "listen", Boolean(cleanText(listen.output)), {
    reason: cleanText(listen.output) ? "" : "listen_not_found",
    output: safeOutput(listen.output)
  }));
  serverChecks.push(createResult(agent.name || agent.id, "reality", "logs", logs.ok, {
    reason: logs.ok ? "" : "log_fetch_failed",
    output: safeOutput(logs.output)
  }));
  serverChecks.push(createResult(agent.name || agent.id, "reality", "config_contains_reality", configHasReality, {
    reason: configHasReality ? "" : "reality fields not found in active sing-box config"
  }));

  if (clientServer) {
    const tmpConfigB64 = Buffer.from(JSON.stringify({
      log: { level: "warn" },
      inbounds: [
        {
          type: "mixed",
          tag: "mixed-in",
          listen: "127.0.0.1",
          listen_port: 11080
        }
      ],
      outbounds: [
        {
          type: "vless",
          tag: "proxy",
          server: server.host,
          server_port: port,
          uuid: requestBody.uuid,
          flow: requestBody.flow,
          tls: {
            enabled: true,
            server_name: sni,
            insecure: false,
            utls: {
              enabled: true,
              fingerprint: requestBody.clientFingerprint
            },
            reality: {
              enabled: true,
              public_key: publicKey,
              short_id: shortId
            }
          }
        },
        { type: "direct", tag: "direct" }
      ],
      route: { final: "proxy" }
    }, null, 2)).toString("base64");
    const clientCommand = `sh -lc 'docker run -d --rm --network host --name chiken-reality-probe --entrypoint sh ghcr.io/sagernet/sing-box:latest -lc \"echo ${tmpConfigB64} | base64 -d >/tmp/reality.json && sing-box run -c /tmp/reality.json\" >/tmp/chiken-reality-container.id 2>/tmp/chiken-reality-container.err && sleep 4 && if command -v curl >/dev/null 2>&1; then curl -x http://127.0.0.1:11080 -I https://www.gstatic.com/generate_204 -m 20 -sS -o /tmp/chiken-reality-body -D -; else wget -e use_proxy=yes -e https_proxy=http://127.0.0.1:11080 -S --spider -T 20 https://www.gstatic.com/generate_204 2>&1; fi; status=$?; echo ---RUNTIME---; docker logs --tail 80 chiken-reality-probe 2>&1 || true; docker rm -f chiken-reality-probe >/dev/null 2>&1 || true; exit $status'`;
    const clientProbe = await sshExec(clientServer, "agent-3", clientCommand, { execOptions: { pty: true } });
    const endToEndOk = clientProbe.ok && (/HTTP\/[0-9.]+\s+204/i.test(clientProbe.output) || /status code 204/i.test(clientProbe.output)) && !/invalid connection|panic|failed|error:/i.test(clientProbe.output);
    serverChecks.push(createResult("agent-3", "reality", "client_probe", endToEndOk, {
      reason: endToEndOk ? "" : safeOutput(clientProbe.output),
      output: safeOutput(clientProbe.output)
    }));
  } else {
    serverChecks.push(createResult("agent-3", "reality", "client_probe", false, {
      reason: "client server unavailable for end-to-end probe"
    }));
  }

  return serverChecks;
}

async function verifyAudit(baseUrl, token, expectedActions = []) {
  const auditResponse = await api(`${baseUrl}/api/audit?limit=120`, token);
  const rows = Array.isArray(auditResponse.body) ? auditResponse.body : [];
  return expectedActions.map((action) =>
    createResult("panel", "audit", action, rows.some((row) => row.action === action), {
      count: rows.filter((row) => row.action === action).length
    })
  );
}

async function verifyDockerComposeConfig(servers) {
  const results = [];
  if (servers[0]) {
    const serverConfig = await sshExec(servers[0], "main", "cd /opt/chiken-easy && docker compose -f docker-compose.server.yml config");
    results.push(createResult("main", "docker-compose", "server_config", serverConfig.ok, {
      reason: serverConfig.ok ? "" : safeOutput(serverConfig.output),
      output: safeOutput(serverConfig.output)
    }));
  }
  if (servers[1]) {
    const agent2Config = await sshExec(servers[1], "agent-2", "cd /opt/chiken-easy && docker compose -f docker-compose.agent.yml config");
    results.push(createResult("agent-2", "docker-compose", "agent_config", agent2Config.ok, {
      reason: agent2Config.ok ? "" : safeOutput(agent2Config.output),
      output: safeOutput(agent2Config.output)
    }));
  }
  if (servers[2]) {
    const agent3Config = await sshExec(servers[2], "agent-3", "cd /opt/chiken-easy && docker compose -f docker-compose.agent.yml config");
    results.push(createResult("agent-3", "docker-compose", "agent_config", agent3Config.ok, {
      reason: agent3Config.ok ? "" : safeOutput(agent3Config.output),
      output: safeOutput(agent3Config.output)
    }));
  }
  return results;
}

async function main() {
  if (!fs.existsSync(localServersPath)) throw new Error(".local/test-servers.json not found");
  if (!fs.existsSync(localSecretsPath)) throw new Error(".local/deploy-secrets.json not found");

  const serverReport = JSON.parse(fs.readFileSync(localServersPath, "utf8"));
  const secrets = JSON.parse(fs.readFileSync(localSecretsPath, "utf8"));
  const servers = (serverReport.servers || []).slice(0, 3);
  const roles = ["main", "agent-2", "agent-3"];
  const summary = {
    at: nowIso(),
    ok: true,
    mimaParsed: Boolean(serverReport.ok),
    source: cleanText(serverReport.source),
    serverSummary: servers.map(summarizeServer),
    api: {},
    checks: []
  };

  const baseUrl = cleanText(secrets.baseUrl);
  const apiToken = cleanText(secrets.apiToken);
  if (!baseUrl || !apiToken) throw new Error("deploy secrets missing baseUrl or apiToken");

  const health = await api(`${baseUrl}/api/health`, apiToken);
  summary.api.health = health.status;
  summary.checks.push(createResult("panel", "api", "health", health.ok, { status: health.status }));

  const agentsOnline = await waitForAgentsOnline(baseUrl, apiToken, Math.min(3, servers.length));
  const agentRows = agentsOnline.rows || [];
  summary.api.agents = agentRows.length;
  summary.checks.push(createResult("panel", "api", "agents_online", agentsOnline.ok, {
    count: agentRows.length,
    connected: agentsOnline.connected
  }));

  const settings = await api(`${baseUrl}/api/settings`, apiToken);
  summary.api.settings = {
    queryTokenEnabled: Boolean(settings.body?.queryTokenEnabled),
    masterKeySet: Boolean(settings.body?.masterKeySet),
    storageMode: cleanText(settings.body?.storageMode)
  };
  summary.checks.push(createResult("panel", "api", "settings", settings.ok, summary.api.settings));

  for (const [index, server] of servers.entries()) {
    const checks = await verifyServer(server, roles[index]);
    summary.checks.push(...checks);
  }

  const roleByName = new Map(agentRows.map((item) => [item.name, item]));
  const mainAgent = roleByName.get("main") || agentRows.find((item) => item.name === "main") || agentRows[0];
  const checkerAgent = roleByName.get("agent-2") || agentRows.find((item) => item.id !== mainAgent?.id) || mainAgent;
  const clientAgent = roleByName.get("agent-3") || agentRows.find((item) => item.id !== mainAgent?.id && item.id !== checkerAgent?.id) || checkerAgent;

  if (mainAgent && servers[0]) {
    mainAgent.publicHost = servers[0].host;
  }
  if (checkerAgent && servers[1]) {
    checkerAgent.publicHost = servers[1].host;
  }
  if (clientAgent && servers[2]) {
    clientAgent.publicHost = servers[2].host;
  }

  const serverByAgentId = new Map([
    [roleByName.get("main")?.id, servers[0]],
    [roleByName.get("agent-2")?.id, servers[1]],
    [roleByName.get("agent-3")?.id, servers[2]]
  ]);

  for (const agent of agentRows) {
    const sftpChecks = await verifySftp(baseUrl, apiToken, agent);
    summary.checks.push(...sftpChecks);
  }

  summary.checks.push(await verifyBatchCommand(baseUrl, apiToken, agentRows));
  summary.checks.push(...(await verifySubscription(baseUrl, apiToken)));
  summary.checks.push(...(await verifyMemos(baseUrl, apiToken, mainAgent?.id || agentRows[0]?.id || "")));
  if (mainAgent?.id) summary.checks.push(await verifyTerminalWebSocket(baseUrl, apiToken, mainAgent.id));

  if (mainAgent && checkerAgent) {
    const proxyChecks = await verifyManagedProxyChecks(baseUrl, apiToken, mainAgent, checkerAgent);
    summary.checks.push(...proxyChecks);

    const networkTuningChecks = await verifyNetworkTuning(baseUrl, apiToken, agentRows.slice(0, 3));
    summary.checks.push(...networkTuningChecks);

    const realityChecks = await verifyRealityServer(
      baseUrl,
      apiToken,
      mainAgent,
      serverByAgentId.get(mainAgent.id) || servers[0],
      serverByAgentId.get(clientAgent?.id) || servers[2]
    );
    summary.checks.push(...realityChecks);

    summary.checks.push(await verifyForwardImage(baseUrl, apiToken, mainAgent.id, "realm"));
    summary.checks.push(await verifyForwardImage(baseUrl, apiToken, mainAgent.id, "gost"));

    if (servers[0]) {
      summary.checks.push(...(await verifyForwardRule(baseUrl, apiToken, mainAgent, servers[0], "sing-box", "tcp", 19180, "example.com", 80)));
      summary.checks.push(...(await verifyForwardRule(baseUrl, apiToken, mainAgent, servers[0], "sing-box", "udp", 19153, "1.1.1.1", 53)));
      summary.checks.push(...(await verifyForwardRule(baseUrl, apiToken, mainAgent, servers[0], "realm", "tcp", 19181, "example.com", 80)));
      summary.checks.push(...(await verifyForwardRule(baseUrl, apiToken, mainAgent, servers[0], "gost", "tcp", 19182, "example.com", 80)));
    }
  }

  summary.checks.push(...(await verifyDockerComposeConfig(servers)));

  const auditChecks = await verifyAudit(baseUrl, apiToken, [
    "subscription_access",
    "batch_command",
    "memo_create",
    "memo_update",
    "memo_delete",
    "sftp_upload",
    "sftp_download",
    "sftp_delete",
    "proxy_check",
    "forward_create",
    "forward_delete"
  ]);
  summary.checks.push(...auditChecks);

  summary.ok = summary.checks.every((item) => item.ok);
  fs.mkdirSync(path.dirname(localRemoteReportPath), { recursive: true });
  fs.writeFileSync(localRemoteReportPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: summary.ok,
    output: localRemoteReportPath,
    servers: summary.serverSummary,
    checks: summary.checks.map((item) => ({
      role: item.role,
      kind: item.kind,
      name: item.name,
      ok: item.ok,
      reason: item.reason || ""
    }))
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exit(1);
});
