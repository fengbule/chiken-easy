#!/usr/bin/env sh
set -eu

APP_DIR=${APP_DIR:-/opt/chiken-easy}
SERVER=${CHIKEN_SERVER:?set CHIKEN_SERVER, for example wss://panel.example.com/agent}
TOKEN=${CHIKEN_TOKEN:?set CHIKEN_TOKEN from panel}

mkdir -p "$APP_DIR"
cp -r agent shared package.json package-lock.json "$APP_DIR" 2>/dev/null || cp -r agent shared package.json "$APP_DIR"
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
Environment=CHIKEN_SERVER=$SERVER
Environment=CHIKEN_TOKEN=$TOKEN
Environment=CHIKEN_PROBE_INTERVAL=${CHIKEN_PROBE_INTERVAL:-5}
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
systemctl status chiken-agent --no-pager
