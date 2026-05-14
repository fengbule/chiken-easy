#!/usr/bin/env sh
set -eu

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

if command -v docker >/dev/null 2>&1; then
  install_compose_v2 || true
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
install_compose_v2 || true

if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "docker installed but compose is unavailable" >&2
  exit 3
fi
