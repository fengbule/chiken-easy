import fs from "fs";
import path from "path";
import iconv from "iconv-lite";
import yaml from "js-yaml";

const cwd = process.cwd();
const userProfile = process.env.USERPROFILE || process.env.HOME || "";
const candidates = [
  path.join(userProfile, "Desktop", "mima.txt"),
  path.join(userProfile, "桌面", "mima.txt"),
  "C:\\Users\\fengbule\\Desktop\\mima.txt",
  path.resolve(cwd, "mima.txt"),
  path.resolve(cwd, "..", "mima.txt")
].filter(Boolean);

const LOCAL_DIR = path.join(cwd, ".local");
const OUTPUT = path.join(LOCAL_DIR, "test-servers.json");

const FIELD_ALIASES = new Map([
  ["host", "host"],
  ["ip", "host"],
  ["address", "host"],
  ["server", "host"],
  ["服务器", "host"],
  ["地址", "host"],
  ["port", "port"],
  ["端口", "port"],
  ["user", "user"],
  ["username", "user"],
  ["账号", "user"],
  ["用户", "user"],
  ["password", "password"],
  ["pass", "password"],
  ["密码", "password"],
  ["privatekey", "privateKey"],
  ["private_key", "privateKey"],
  ["key", "privateKey"],
  ["私钥", "privateKey"],
  ["name", "name"],
  ["名称", "name"],
  ["备注", "name"],
  ["remark", "name"],
  ["note", "note"],
  ["说明", "note"]
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function maskHost(host) {
  const text = cleanText(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const parts = text.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  return text ? `${text.slice(0, 3)}***` : "";
}

function findSource() {
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function decodeFile(filePath) {
  const raw = fs.readFileSync(filePath);
  const bom2 = raw.slice(0, 2).toString("hex");
  const bom3 = raw.slice(0, 3).toString("hex");
  if (bom2 === "fffe" || bom2 === "feff") return raw.toString("utf16le");
  if (bom3 === "efbbbf") return raw.toString("utf8");

  const utf8 = raw.toString("utf8");
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (!replacementCount) return utf8;

  const gbk = iconv.decode(raw, "gbk");
  const gbkReplacementCount = (gbk.match(/\uFFFD/g) || []).length;
  return gbkReplacementCount <= replacementCount ? gbk : utf8;
}

function normalizeFieldKey(key) {
  const normalized = cleanText(key)
    .replace(/[：:=]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return FIELD_ALIASES.get(normalized) || "";
}

function isIp(text) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(cleanText(text));
}

function isPort(value) {
  const port = Number(cleanText(value));
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

function looksLikePrivateKey(value) {
  return /BEGIN [A-Z ]+PRIVATE KEY/.test(String(value || ""));
}

function looksLikePassword(text) {
  const value = cleanText(text);
  return Boolean(value) && !isIp(value) && !looksLikePrivateKey(value) && value.length >= 1;
}

function splitHostPort(value) {
  const text = cleanText(value);
  const match = text.match(/^(.+?):(\d+)$/);
  if (!match) return { host: text, port: 22 };
  return { host: cleanText(match[1]), port: Number(match[2]) };
}

function normalizeServer(server, index) {
  const hostPort = !server.host && server.server ? splitHostPort(server.server) : splitHostPort(server.host || server.ip || server.address || server.server || "");
  const host = cleanText(server.host || server.ip || server.address || server.server || hostPort.host);
  const note = cleanText(server.note || server.remark || server.description);
  return {
    id: `server-${index + 1}`,
    name: cleanText(server.name || server.label || `Server ${index + 1}`),
    host,
    port: isPort(server.port) ? Number(server.port) : isPort(hostPort.port) ? Number(hostPort.port) : 22,
    user: cleanText(server.user || server.username || server.account || "root") || "root",
    password: cleanText(server.password || server.pass || ""),
    privateKey: cleanText(server.privateKey || server.key || ""),
    note
  };
}

function dedupeServers(servers) {
  const seen = new Set();
  const output = [];
  for (const server of servers) {
    const key = `${server.host}:${server.port}:${server.user}`;
    if (!server.host || (!server.password && !server.privateKey) || seen.has(key)) continue;
    seen.add(key);
    output.push(server);
  }
  return output;
}

function parseStructured(text) {
  const results = [];
  const trimmed = cleanText(text);
  if (!trimmed) return results;

  for (const loader of [
    () => JSON.parse(trimmed),
    () => yaml.load(trimmed)
  ]) {
    try {
      const value = loader();
      if (Array.isArray(value)) {
        results.push(...value);
        continue;
      }
      if (Array.isArray(value?.servers)) results.push(...value.servers);
      if (Array.isArray(value?.items)) results.push(...value.items);
    } catch {}
  }
  return results;
}

function parseKvBlocks(text) {
  const servers = [];
  let current = {};
  const pushCurrent = () => {
    if (current.host || current.password || current.privateKey) {
      servers.push(current);
      current = {};
    }
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanText(rawLine);
    if (!line) {
      pushCurrent();
      continue;
    }

    if (/^(服务器|server)\s*\d*/i.test(line)) {
      pushCurrent();
      current.name = line.replace(/[：:]/g, "").trim();
      continue;
    }

    const pair = line.match(/^([^:=：]+)\s*[:=：]\s*(.+)$/);
    if (pair) {
      const key = normalizeFieldKey(pair[1]);
      if (key) {
        current[key] = cleanText(pair[2]);
        continue;
      }
    }

    const inline = line.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?\s+(\S+)\s+(.+)$/);
    if (inline) {
      pushCurrent();
      current = {
        host: inline[1],
        port: inline[2] ? Number(inline[2]) : 22,
        user: inline[3],
        password: cleanText(inline[4])
      };
      pushCurrent();
      continue;
    }
  }

  pushCurrent();
  return servers;
}

function parseLooseBlocks(text) {
  const servers = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  let current = {};

  const pushCurrent = () => {
    if (current.host || current.password || current.privateKey) {
      servers.push(current);
      current = {};
    }
  };

  for (const line of lines) {
    if (/^(服务器|server)\s*\d*/i.test(line)) {
      pushCurrent();
      current.name = line.replace(/[：:]/g, "").trim();
      continue;
    }
    if (!current.host && isIp(line)) {
      current.host = line;
      continue;
    }
    if (!current.port && isPort(line)) {
      current.port = Number(line);
      continue;
    }
    if (!current.user && /^[a-z_][a-z0-9._-]*$/i.test(line) && !isIp(line) && !looksLikePassword(current.password)) {
      current.user = line;
      continue;
    }
    if (!current.privateKey && looksLikePrivateKey(line)) {
      current.privateKey = line;
      continue;
    }
    if (!current.password && looksLikePassword(line)) {
      current.password = line;
      pushCurrent();
      continue;
    }
  }

  pushCurrent();
  return servers;
}

const source = findSource();
const report = {
  ok: false,
  source: source || null,
  parsedAt: new Date().toISOString(),
  encoding: "",
  servers: [],
  warnings: [],
  sanitized: []
};

if (source) {
  const text = decodeFile(source);
  report.encoding = /[\u4e00-\u9fa5]/.test(text) ? "utf8_or_gbk" : "utf8";

  const parsed = [
    ...parseStructured(text),
    ...parseKvBlocks(text),
    ...parseLooseBlocks(text)
  ]
    .map((server, index) => normalizeServer(server, index))
    .filter((server) => server.host && (server.password || server.privateKey));

  report.servers = dedupeServers(parsed).slice(0, 3);
  report.sanitized = report.servers.map((server) => ({
    id: server.id,
    name: server.name,
    host: maskHost(server.host),
    port: server.port,
    user: server.user,
    hasPassword: Boolean(server.password),
    hasPrivateKey: Boolean(server.privateKey)
  }));
  report.ok = report.servers.length > 0;
  if (report.servers.length < 3) report.warnings.push(`Expected 3 servers, parsed ${report.servers.length}.`);
} else {
  report.warnings.push("mima.txt not found in supported paths.");
}

fs.mkdirSync(LOCAL_DIR, { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, source: report.source, serverCount: report.servers.length, output: OUTPUT }));
