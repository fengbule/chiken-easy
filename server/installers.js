import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageMeta = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function hereDoc(filePath, content, marker) {
  return `cat > "${filePath}" <<'${marker}'\n${content}\n${marker}\n`;
}

function buildAgentPackageJson() {
  return JSON.stringify(
    {
      name: "chiken-easy-agent-runtime",
      private: true,
      version: packageMeta.version,
      type: "module",
      dependencies: {
        nanoid: packageMeta.dependencies.nanoid,
        ws: packageMeta.dependencies.ws
      }
    },
    null,
    2
  );
}

function buildAgentDockerfile() {
  return [
    "FROM node:24-alpine",
    "WORKDIR /app",
    "RUN apk add --no-cache docker-cli openssl kmod iproute2",
    "COPY package.json ./",
    "RUN npm install --omit=dev",
    "COPY agent ./agent",
    "COPY shared ./shared",
    'CMD ["node", "agent/index.js"]'
  ].join("\n");
}

function buildDockerComposeFile() {
  return [
    "services:",
    "  chiken-singbox:",
    "    image: ghcr.io/sagernet/sing-box:latest",
    "    container_name: chiken-singbox",
    "    restart: unless-stopped",
    "    network_mode: host",
    '    command: ["run", "-c", "/etc/sing-box/config.json"]',
    "    volumes:",
    "      - ./data/sing-box:/etc/sing-box",
    "",
    "  chiken-agent:",
    "    build:",
    "      context: .",
    "      dockerfile: Dockerfile.agent",
    "    image: chiken-easy-agent:latest",
    "    container_name: chiken-agent",
    "    restart: unless-stopped",
    '    command: ["node", "agent/index.js"]',
    "    depends_on:",
    "      - chiken-singbox",
    "    environment:",
    '      CHIKEN_SERVER: "${CHIKEN_SERVER}"',
    '      CHIKEN_TOKEN: "${CHIKEN_TOKEN}"',
    '      CHIKEN_AGENT_NAME: "${CHIKEN_AGENT_NAME:-agent}"',
    '      CHIKEN_AGENT_HOST: "${CHIKEN_AGENT_HOST:-agent}"',
    '      CHIKEN_AGENT_IP: "${CHIKEN_AGENT_IP:-}"',
    '      CHIKEN_SERVICE_MODE: "docker"',
    '      CHIKEN_PROBE_INTERVAL: "${CHIKEN_PROBE_INTERVAL:-5}"',
    '      CHIKEN_NETWORK_TUNING_ENABLED: "${CHIKEN_NETWORK_TUNING_ENABLED:-1}"',
    '      CHIKEN_HOST_ROOT: "/hostfs"',
    '      SINGBOX_CONTAINER: "chiken-singbox"',
    '      SINGBOX_CONFIG_VOLUME: "${PWD}/data/sing-box"',
    '      SINGBOX_CONFIG: "/etc/sing-box/config.json"',
    '      CHIKEN_FORWARDER_DIR: "/app/forwarders"',
    '      CHIKEN_FORWARDER_HOST_DIR: "${PWD}/data/forwarders"',
    '      CHIKEN_NETWORK_TUNING_HELPER_IMAGE: "${CHIKEN_NETWORK_TUNING_HELPER_IMAGE:-chiken-easy-agent:latest}"',
    '      CHIKEN_AGENT_CONTAINER_NAME: "${CHIKEN_AGENT_CONTAINER_NAME:-chiken-agent}"',
    "    volumes:",
    "      - /var/run/docker.sock:/var/run/docker.sock",
    "      - /proc:/host/proc:ro",
    "      - /etc:/host/etc:ro",
    "      - /usr/lib/os-release:/host/usr-lib/os-release:ro",
    "      - /lib/modules:/lib/modules:ro",
    "      - chiken-agent-state:/app/agent-state",
    "      - ./data/sing-box:/etc/sing-box",
    "      - ./data/forwarders:/app/forwarders",
    "      - /:/hostfs:ro",
    "",
    "volumes:",
    "  chiken-agent-state:"
  ].join("\n");
}

function buildDotEnv(bundle) {
  const defaultName = bundle.agentName || "agent";
  const defaultHost = bundle.agentHost || defaultName;
  return [
    `CHIKEN_SERVER=${bundle.wsUrl}`,
    `CHIKEN_TOKEN=${bundle.agentToken}`,
    `CHIKEN_AGENT_NAME=${defaultName}`,
    `CHIKEN_AGENT_HOST=${defaultHost}`,
    "CHIKEN_AGENT_IP=",
    `CHIKEN_PROBE_INTERVAL=${bundle.probeInterval || 5}`,
    "CHIKEN_NETWORK_TUNING_ENABLED=1"
  ].join("\n");
}

function buildServiceInstallScript(bundle) {
  const packageJson = buildAgentPackageJson();
  const agentSource = readProjectFile("agent/index.js");
  const networkTuningSource = readProjectFile("agent/networkTuning.js");
  const networkHelperSource = readProjectFile("agent/networkHelper.js");
  const probeSource = readProjectFile("agent/systemProbe.js");
  const sharedSource = readProjectFile("shared/configFactory.js");
  const defaultName = bundle.agentName || "";
  const defaultHost = bundle.agentHost || "";

  return `#!/usr/bin/env sh
set -eu

DEFAULT_APP_DIR=${shellEscape(bundle.appDir)}
DEFAULT_SERVER=${shellEscape(bundle.wsUrl)}
DEFAULT_TOKEN=${shellEscape(bundle.agentToken)}
DEFAULT_PROBE_INTERVAL=${shellEscape(bundle.probeInterval || 5)}
DEFAULT_AGENT_NAME=${shellEscape(defaultName)}
DEFAULT_AGENT_HOST=${shellEscape(defaultHost)}
FALLBACK_HOSTNAME=\$(hostname)

APP_DIR=\${APP_DIR:-$DEFAULT_APP_DIR}
CHIKEN_SERVER=\${CHIKEN_SERVER:-$DEFAULT_SERVER}
CHIKEN_TOKEN=\${CHIKEN_TOKEN:-$DEFAULT_TOKEN}
CHIKEN_PROBE_INTERVAL=\${CHIKEN_PROBE_INTERVAL:-$DEFAULT_PROBE_INTERVAL}
CHIKEN_AGENT_NAME=\${CHIKEN_AGENT_NAME:-\${DEFAULT_AGENT_NAME:-$FALLBACK_HOSTNAME}}
CHIKEN_AGENT_HOST=\${CHIKEN_AGENT_HOST:-\${DEFAULT_AGENT_HOST:-$FALLBACK_HOSTNAME}}

ensure_runtime() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl ca-certificates openssl nodejs npm
    return 0
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y curl ca-certificates openssl nodejs npm
    return 0
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y curl ca-certificates openssl nodejs npm
    return 0
  fi

  echo "unsupported package manager, please install nodejs, npm and openssl manually" >&2
  exit 2
}

command -v systemctl >/dev/null 2>&1 || {
  echo "systemd is required for service deployment" >&2
  exit 3
}

ensure_runtime
mkdir -p "$APP_DIR/agent" "$APP_DIR/shared" "$APP_DIR/agent-state" /etc/sing-box
${hereDoc("$APP_DIR/package.json", packageJson, "__CHIKEN_PACKAGE__")}
${hereDoc("$APP_DIR/agent/index.js", agentSource, "__CHIKEN_AGENT__")}
${hereDoc("$APP_DIR/agent/networkTuning.js", networkTuningSource, "__CHIKEN_NETWORK_TUNING__")}
${hereDoc("$APP_DIR/agent/networkHelper.js", networkHelperSource, "__CHIKEN_NETWORK_HELPER__")}
${hereDoc("$APP_DIR/agent/systemProbe.js", probeSource, "__CHIKEN_PROBE__")}
${hereDoc("$APP_DIR/shared/configFactory.js", sharedSource, "__CHIKEN_SHARED__")}

cd "$APP_DIR"
npm install --omit=dev

cat >/etc/systemd/system/chiken-agent.service <<EOF
[Unit]
Description=ChikenEasy sing-box agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=CHIKEN_SERVER=$CHIKEN_SERVER
Environment=CHIKEN_TOKEN=$CHIKEN_TOKEN
Environment=CHIKEN_AGENT_NAME=$CHIKEN_AGENT_NAME
Environment=CHIKEN_AGENT_HOST=$CHIKEN_AGENT_HOST
Environment=CHIKEN_PROBE_INTERVAL=$CHIKEN_PROBE_INTERVAL
Environment=CHIKEN_NETWORK_TUNING_ENABLED=\${CHIKEN_NETWORK_TUNING_ENABLED:-1}
Environment=CHIKEN_HOST_ROOT=/
Environment=SINGBOX_CONFIG=/etc/sing-box/config.json
ExecStart=$(command -v node) agent/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now chiken-agent
systemctl status chiken-agent --no-pager || true
`;
}

function buildDockerInstallScript(bundle) {
  const packageJson = buildAgentPackageJson();
  const agentSource = readProjectFile("agent/index.js");
  const networkTuningSource = readProjectFile("agent/networkTuning.js");
  const networkHelperSource = readProjectFile("agent/networkHelper.js");
  const probeSource = readProjectFile("agent/systemProbe.js");
  const sharedSource = readProjectFile("shared/configFactory.js");
  const dockerfile = buildAgentDockerfile();
  const composeFile = buildDockerComposeFile();
  const dotEnv = buildDotEnv(bundle);
  const defaultConfig = readProjectFile("templates/docker-singbox-config.json");

  return `#!/usr/bin/env sh
set -eu

DEFAULT_APP_DIR=${shellEscape(bundle.appDir)}
APP_DIR=\${APP_DIR:-$DEFAULT_APP_DIR}

install_compose_v2() {
  if docker compose version >/dev/null 2>&1; then
    return 0
  fi
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    aarch64|arm64) arch="aarch64" ;;
  esac
  mkdir -p /usr/local/lib/docker/cli-plugins
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$arch" -o /usr/local/lib/docker/cli-plugins/docker-compose || return 1
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    install_compose_v2 || true
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl git docker.io
    apt-get install -y docker-compose-plugin || apt-get install -y docker-compose || true
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y git docker docker-compose-plugin || dnf install -y git docker docker-compose
  elif command -v yum >/dev/null 2>&1; then
    yum install -y git docker docker-compose-plugin || yum install -y git docker docker-compose
  else
    echo "unsupported package manager" >&2
    exit 2
  fi

  systemctl enable --now docker || service docker start || true
  install_compose_v2 || true
}

ensure_docker
mkdir -p "$APP_DIR/agent" "$APP_DIR/shared" "$APP_DIR/data/sing-box" "$APP_DIR/data/forwarders"
${hereDoc("$APP_DIR/package.json", packageJson, "__CHIKEN_PACKAGE__")}
${hereDoc("$APP_DIR/agent/index.js", agentSource, "__CHIKEN_AGENT__")}
${hereDoc("$APP_DIR/agent/networkTuning.js", networkTuningSource, "__CHIKEN_NETWORK_TUNING__")}
${hereDoc("$APP_DIR/agent/networkHelper.js", networkHelperSource, "__CHIKEN_NETWORK_HELPER__")}
${hereDoc("$APP_DIR/agent/systemProbe.js", probeSource, "__CHIKEN_PROBE__")}
${hereDoc("$APP_DIR/shared/configFactory.js", sharedSource, "__CHIKEN_SHARED__")}
${hereDoc("$APP_DIR/Dockerfile.agent", dockerfile, "__CHIKEN_DOCKERFILE__")}
${hereDoc("$APP_DIR/docker-compose.agent.yml", composeFile, "__CHIKEN_COMPOSE__")}
${hereDoc("$APP_DIR/.env", dotEnv, "__CHIKEN_ENV__")}

if [ ! -f "$APP_DIR/data/sing-box/config.json" ]; then
${hereDoc("$APP_DIR/data/sing-box/config.json", defaultConfig, "__CHIKEN_SINGBOX__")}
fi

cd "$APP_DIR"
docker compose -f docker-compose.agent.yml up -d --build
docker compose -f docker-compose.agent.yml ps || true
`;
}

export function resolvePublicBaseUrl(req) {
  if (process.env.CHIKEN_PUBLIC_BASE_URL) return String(process.env.CHIKEN_PUBLIC_BASE_URL).replace(/\/+$/, "");

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(req.headers.host || "").trim() || "127.0.0.1:7788";
  const proto = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export function resolvePublicWsUrl(req) {
  if (process.env.CHIKEN_PUBLIC_WS_URL) return String(process.env.CHIKEN_PUBLIC_WS_URL).trim();
  const baseUrl = resolvePublicBaseUrl(req);
  const wsProto = baseUrl.startsWith("https://") ? "wss://" : "ws://";
  return `${wsProto}${baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/agent`;
}

export function createInstallBundle(state, agentId, options = {}) {
  const mode = options.mode === "docker" ? "docker" : "service";
  const defaultAppDir = mode === "docker" ? "/opt/chiken-easy-docker" : "/opt/chiken-easy";
  const now = Date.now();
  const agentToken = `ce_${nanoid(32)}`;
  const bundleId = nanoid(18);

  state.tokens ||= [];
  state.installBundles ||= {};
  state.tokens.push({ token: agentToken, createdAt: new Date(now).toISOString(), used: false, deploy: true, target: agentId });

  const bundle = {
    id: bundleId,
    agentId,
    mode,
    appDir: String(options.appDir || defaultAppDir).trim() || defaultAppDir,
    wsUrl: String(options.wsUrl || "").trim(),
    agentToken,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    agentName: String(options.agentName || "").trim(),
    agentHost: String(options.agentHost || "").trim(),
    probeInterval: Math.max(3, Math.min(30, Number(options.probeInterval || 5) || 5))
  };

  state.installBundles[bundleId] = bundle;
  return bundle;
}

export function pruneInstallBundles(state) {
  state.installBundles ||= {};
  const now = Date.now();
  for (const [bundleId, bundle] of Object.entries(state.installBundles)) {
    if (Date.parse(bundle.expiresAt || 0) <= now) {
      delete state.installBundles[bundleId];
    }
  }
}

export function buildInstallCommand(baseUrl, bundleId) {
  const url = new URL("/install/agent.sh", baseUrl);
  url.searchParams.set("bundle", bundleId);
  return `curl -fsSL ${shellEscape(url.toString())} | bash`;
}

export function buildAgentInstallScript(bundle) {
  return bundle.mode === "docker" ? buildDockerInstallScript(bundle) : buildServiceInstallScript(bundle);
}
