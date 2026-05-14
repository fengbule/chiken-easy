import fs from "fs";

const files = [
  "server/index.js",
  "agent/index.js",
  "web/src/App.jsx",
  "web/src/style.css",
  "templates/protocols.json",
  "templates/docker-singbox-config.json",
  "Dockerfile",
  "docker-compose.server.yml",
  "docker-compose.agent.yml"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
}

JSON.parse(fs.readFileSync("templates/protocols.json", "utf8"));
JSON.parse(fs.readFileSync("templates/docker-singbox-config.json", "utf8"));
console.log("check ok");
