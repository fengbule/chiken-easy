#!/usr/bin/env sh
set -eu

if command -v docker >/dev/null 2>&1; then
  exit 0
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

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "docker installed but compose is unavailable" >&2
  exit 3
fi
