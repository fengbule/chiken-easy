import fs from "fs";

const files = [
  "server/index.js",
  "server/installers.js",
  "server/security.js",
  "server/storage.js",
  "server/nodePool.js",
  "agent/index.js",
  "agent/systemProbe.js",
  "shared/configFactory.js",
  "web/src/App.jsx",
  "web/src/api.js",
  "web/src/utils.js",
  "web/src/style.css",
  "web/src/components/Layout.jsx",
  "web/src/components/StatusBadge.jsx",
  "web/src/components/ConfirmButton.jsx",
  "web/src/components/CopyButton.jsx",
  "web/src/components/EmptyState.jsx",
  "web/src/pages/Dashboard.jsx",
  "web/src/pages/SettingsPage.jsx",
  "web/src/pages/MonitorPage.jsx",
  "web/src/pages/NodePoolPage.jsx",
  "web/src/pages/MemosPage.jsx",
  "web/src/pages/WorkspacePage.jsx",
  "web/src/pages/ConsolePage.jsx",
  "web/src/pages/Audit.jsx",
  "web/src/pages/Tutorial.jsx",
  "templates/protocols.json",
  "templates/docker-singbox-config.json",
  "Dockerfile",
  "docker-compose.server.yml",
  "docker-compose.agent.yml",
  "scripts/install-docker.sh",
  "scripts/parse-mima.mjs",
  "scripts/smoke.mjs",
  "server/configFactory.js",
  "docs/node-config-guide.md",
  ".env.example",
  "docs/capability-baseline.md",
  "docs/security-hardening.md",
  "docs/monitor.md",
  "docs/memos.md",
  "docs/subscription.md",
  "docs/server-workspace.md",
  "docs/test-report-final.md"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
}

JSON.parse(fs.readFileSync("templates/protocols.json", "utf8"));
JSON.parse(fs.readFileSync("templates/docker-singbox-config.json", "utf8"));
console.log("check ok");
