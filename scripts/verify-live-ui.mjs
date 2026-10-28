import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright-core";

// Mutates only uniquely prefixed temporary SFTP files; uses a provisioned agent.
const base = process.env.CHIKEN_TEST_BASE;
const token = process.env.CHIKEN_TEST_TOKEN;
if (!base || !token) throw Error("Set CHIKEN_TEST_BASE and CHIKEN_TEST_TOKEN (do not log the token).");
const results = [];
const prefix = `chiken-test-${Date.now()}`;
const headers = { Authorization: `Bearer ${token}` };
let browser;
let id;
let file;
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...headers, ...(options.body instanceof FormData ? {} : options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }, signal: AbortSignal.timeout(45000) });
  const body = await response.text();
  assert.ok(response.ok, `${options.method || "GET"} ${path.split("?")[0]}: HTTP ${response.status}`);
  return response.headers.get("content-type")?.includes("application/json") ? JSON.parse(body) : body;
}
function passed(name) { results.push({ name, ok: true }); console.log(`PASS ${name}`); }
try {
  assert.equal((await fetch(base + "/api/agents")).status, 401);
  passed("public management API requires authentication");
  const agents = await request("/api/agents");
  const agent = agents.find((item) => item.connected);
  assert.ok(agent?.metrics && agent.singboxStatus === "active");
  id = agent.id;
  passed("real agent, metrics and sing-box service online");
  const ssh = await request(`/api/agents/${id}/ssh-profile/test`, { method: "POST", body: "{}" });
  assert.ok(ssh.ok);
  passed("SSH public-key connection");
  const form = new FormData();
  const name = `${prefix}-中文文件.bin`;
  const data = "中文文件验收\n\u0000binary\n";
  form.append("directory", "/workspace");
  form.append("file", new Blob([data]), name);
  const upload = await request(`/api/agents/${id}/sftp/upload`, { method: "POST", body: form });
  file = upload.path;
  assert.equal(file, `/workspace/${name}`);
  const listing = await request(`/api/agents/${id}/sftp?path=/workspace`);
  assert.ok(listing.entries.some((entry) => entry.name === name));
  const download = await fetch(`${base}/api/agents/${id}/sftp/download?path=${encodeURIComponent(file)}`, { headers });
  assert.equal(download.status, 200);
  assert.equal(await download.text(), data);
  assert.ok(download.headers.get("content-disposition").includes("filename*=UTF-8''"));
  passed("SFTP binary upload, Chinese filename, list and download round-trip");
  const traversal = await fetch(`${base}/api/agents/${id}/sftp?path=${encodeURIComponent("/workspace/../etc")}`, { headers });
  assert.equal(traversal.status, 400);
  passed("SFTP traversal rejected before normalization");
  await request(`/api/agents/${id}/sftp?path=${encodeURIComponent(file)}`, { method: "DELETE" });
  file = null;
  passed("SFTP test file cleanup");

  browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [];
  const apiErrors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (new URL(response.url()).pathname.startsWith("/api/") && response.status() >= 400) apiErrors.push(`${response.request().method()} ${new URL(response.url()).pathname}: ${response.status()}`); });
  await page.addInitScript((key) => {
    localStorage.setItem("chiken_api_token", key);
    const Native = window.WebSocket;
    window.__terminalMessages = [];
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes("/terminal")) {
          window.__testTerminalSocket = this;
          this.addEventListener("message", (event) => { try { window.__terminalMessages.push(JSON.parse(event.data)); } catch {} });
        }
      }
    };
  }, token);
  await page.goto(base + "/admin");
  await page.getByRole("heading", { name: /工作台.*Overview/ }).waitFor();
  await page.getByRole("button", { name: agent.name, exact: true }).first().waitFor();
  await fs.mkdir(".local/ui-live", { recursive: true });
  await page.screenshot({ path: ".local/ui-live/desktop.png", fullPage: true });
  const navigation = page.getByRole("navigation", { name: "主导航" });
  for (const name of ["服务器", "监控告警", "文件传输", "节点配置", "节点池", "订阅聚合", "端口转发", "资产 / 凭据 / 脚本", "Memos / 文件", "审计日志", "设置"]) {
    await navigation.getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(700);
    assert.ok(await page.locator("#main-content").innerText(), `empty page: ${name}`);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.waitForTimeout(80);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow: ${name} at ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 1050 });
  }
  passed("11 management pages render with no viewport overflow, desktop + mobile");
  await navigation.getByRole("button", { name: "工作台", exact: true }).click();
  await page.getByRole("button", { name: `打开 ${agent.name} 的终端`, exact: true }).click();
  await page.locator(".terminal-shell .xterm").waitFor();
  await page.waitForFunction(() => window.__terminalMessages.some((m) => m.status === "connected"));
  // Distinguish command output from local terminal echo.
  await page.evaluate(() => window.__testTerminalSocket.send(JSON.stringify({ type: "input", data: "printf 'CHIKEN_%s_OK\\n' LIVE\r" })));
  await page.waitForFunction(() => window.__terminalMessages.some((m) => m.output?.includes("CHIKEN_LIVE_OK")));
  await page.screenshot({ path: ".local/ui-live/terminal.png", fullPage: true });
  passed("browser WebSocket terminal executes a real SSH command");
  await navigation.getByRole("button", { name: "工作台", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.screenshot({ path: ".local/ui-live/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("navigation", { name: "移动端导航" }).getByRole("button", { name: "文件传输", exact: true }).click();
  await page.waitForTimeout(800);
  assert.ok(!await page.locator("dialog").isVisible());
  passed("real mobile navigation and file manager");
  assert.deepEqual(errors, [], "browser runtime errors");
  assert.deepEqual(apiErrors, [], "browser API errors");
  passed("zero browser exceptions and zero failed management API requests");
} finally {
  if (file && id) await request(`/api/agents/${id}/sftp?path=${encodeURIComponent(file)}`, { method: "DELETE" });
  await browser?.close();
  await fs.mkdir(".local/ui-live", { recursive: true });
  await fs.writeFile(".local/ui-live/results.json", JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
}
