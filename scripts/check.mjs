import fs from "fs";

const files = [
  "server/index.js",
  "agent/index.js",
  "web/src/App.jsx",
  "web/src/style.css",
  "templates/protocols.json"
];

for (const file of files) {
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
}

JSON.parse(fs.readFileSync("templates/protocols.json", "utf8"));
console.log("check ok");
