#!/usr/bin/env sh
set -eu

mkdir -p data/sing-box
if [ ! -f data/sing-box/config.json ]; then
  cp templates/docker-singbox-config.json data/sing-box/config.json
fi

if [ ! -f .env ]; then
  TOKEN="ce_$(date +%s)_$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
  {
    echo "CHIKEN_BOOTSTRAP_TOKEN=$TOKEN"
    echo "CHIKEN_TOKEN=$TOKEN"
    echo "CHIKEN_SERVER=ws://127.0.0.1:7788/agent"
    echo "CHIKEN_AGENT_NAME=$(hostname)"
    echo "CHIKEN_AGENT_HOST=$(hostname)"
    echo "CHIKEN_AGENT_IP="
  } > .env
fi

echo "docker files prepared"
