import fs from "fs";

const files = [
  "server/index.js",
  "server/installers.js",
  "agent/index.js",
  "agent/systemProbe.js",
  "shared/configFactory.js",
  "web/src/App.jsx",
  "web/src/style.css",
  "templates/protocols.json",
  "templates/docker-singbox-config.json",
  "Dockerfile",
  "docker-compose.server.yml",
  "docker-compose.agent.yml",
  "scripts/install-docker.sh",
  "server/configFactory.js",
  "docs/node-config-guide.md"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
}

JSON.parse(fs.readFileSync("templates/protocols.json", "utf8"));
JSON.parse(fs.readFileSync("templates/docker-singbox-config.json", "utf8"));
console.log("check ok");
