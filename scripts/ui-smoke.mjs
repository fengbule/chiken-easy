import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

// Deterministic browser regression fixtures, never used by the deployed application.
const base = "http://127.0.0.1:17991";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "17991",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let browser;
const failures = [];
const agents = Array.from({ length: 12 }, (_, i) => ({
  id: `ui-${i}`,
  name: `测试节点-${String(i + 1).padStart(2, "0")}`,
  host: `fixture-${i}`,
  ip: `192.0.2.${i + 1}`,
  connected: i % 4 !== 0,
  tags: i === 11 ? ["边缘计算"] : [],
  singboxStatus: "active",
  singboxVersion: "test",
  lastSeen: new Date().toISOString(),
  metrics: {
    cpu: { usage: i * 6 },
    memory: { usage: 32 },
    disk: { usage: 24 },
    network: { rxRate: 12345, txRate: 6789 },
  },
}));
let failAgents = false;
let failSettings = true;
let checks = 0;
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
async function noOverflow(page, width) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForTimeout(100);
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `viewport overflow at ${width}px`,
  );
}
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (attempt === 59) throw Error("UI preview failed to start");
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.platform === "win32" ? { channel: "chrome" } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/agents")
      return route.fulfill({
        status: failAgents ? 503 : 200,
        json: failAgents ? { error: "测试连接中断" } : agents,
      });
    if (pathname === "/api/settings")
      return route.fulfill({
        status: failSettings ? 503 : 200,
        json: failSettings
          ? { error: "测试设置故障" }
          : { alerts: {}, storageMode: "json", publicProbeRefreshSec: 10 },
      });
    if (pathname === "/api/auth/status")
      return route.fulfill({ json: { authorized: true } });
    if (/^\/api\/agents\/ui-\d+$/.test(pathname))
      return route.fulfill({ json: agents.find((agent) => pathname.endsWith(`/${agent.id}`)) });
    if (pathname.endsWith("/ssh-profile"))
      return route.fulfill({ json: { ready: false } });
    return route.fulfill({ json: [] });
  });
  await page.goto(`${base}/admin`);
  await page.getByRole("heading", { name: /工作台.*Overview/ }).waitFor();
  await page.locator(".inventory-table tbody tr").first().waitFor();
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 12,
    "dashboard must include nodes beyond eight",
  );
  check(
    (await page
      .locator(".inventory-table tbody tr")
      .first()
      .getAttribute("class")) === "server-disconnected",
    "offline nodes should appear first",
  );
  check(
    await page
      .locator(".server-disconnected .inventory-row-actions button")
      .first()
      .isDisabled(),
    "offline terminal must be disabled",
  );
  await page.getByRole("textbox", { name: "搜索服务器" }).fill("边缘计算");
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 1,
    "tag search should match a node beyond eight",
  );
  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.getByRole("button", { name: /^离线\s*3$/ }).click();
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 3,
    "offline filter count",
  );
  await page.getByRole("button", { name: /^在线\s*9$/ }).click();
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 9,
    "online filter count",
  );
  await page
    .getByRole("textbox", { name: "搜索服务器" })
    .fill("does-not-exist");
  await page.getByRole("heading", { name: "没有匹配的服务器" }).waitFor();
  await page.getByRole("button", { name: "重置筛选" }).click();
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 12,
    "reset should clear both filters",
  );
  await page.getByLabel("排序方式").selectOption("cpu");
  check(
    (await page.locator(".server-name").first().textContent()).includes("12"),
    "CPU descending order",
  );
  await page.getByLabel("排序方式").selectOption("attention");
  await fs.mkdir(".local/ui", { recursive: true });
  await page.screenshot({ path: ".local/ui/desktop.png", fullPage: true });
  for (const width of [1440, 1280, 1024, 768, 390, 375])
    await noOverflow(page, width);
  await page.screenshot({ path: ".local/ui/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page
    .getByRole("navigation", { name: "移动端导航" })
    .getByRole("button", { name: "服务器", exact: true })
    .click();
  check(
    !(await page.locator("dialog").isVisible()),
    "mobile drawer closes after navigation",
  );
  await page.getByRole("heading", { name: /服务器.*Servers/ }).waitFor();
  await noOverflow(page, 375);
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.keyboard.press("Escape");
  check(
    await page
      .getByRole("button", { name: "打开导航" })
      .evaluate((el) => document.activeElement === el),
    "Escape restores menu focus",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  failAgents = true;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.locator(".inventory-table tbody tr").count()) === 12,
    "refresh errors preserve last known data",
  );
  failAgents = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "设置", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  check(
    (await page.getByRole("alert").textContent()).includes("无法加载设置"),
    "settings failure should not render a blank page",
  );
  failSettings = false;
  await page.getByRole("button", { name: "重新加载" }).click();
  await page.getByRole("button", { name: "保存设置" }).waitFor();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "工作台", exact: true }).click();
  await page.getByRole("button", { name: "打开 测试节点-02 的终端", exact: true }).click();
  await page.locator(".terminal-shell").waitFor();
  check(await page.getByRole("heading", { name: "SSH - 测试节点-02", exact: true }).isVisible(), "terminal shortcut must open terminal, not file manager");
  check(failures.length === 0, `browser exceptions: ${failures.join("; ")}`);
  console.log(
    `UI smoke passed: ${checks} assertions, desktop + mobile, search/filter/sort/error recovery.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
