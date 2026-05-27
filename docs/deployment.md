# Deployment Guide

This project supports:

- systemd deployment for the control plane
- systemd deployment for remote agents
- Docker Compose deployment for the control plane
- Docker Compose deployment for remote agents

## Server: systemd

Run from a checked-out repository:

```bash
sudo APP_DIR=/opt/chiken-easy bash scripts/install-server.sh
```

This will:

- install Node.js, npm, and openssl if needed
- copy the repo into `APP_DIR`
- run `npm install`
- build the admin SPA
- generate a default `.env` if missing
- create and start `chiken-server.service`

## Server: Docker Compose

Run from a checked-out repository:

```bash
sudo APP_DIR=/opt/chiken-easy bash scripts/install-server-docker.sh
```

This will:

- install Docker and Compose if needed
- prepare `.env`
- ensure `CHIKEN_API_TOKEN`, `CHIKEN_MASTER_KEY`, and `CHIKEN_NETWORK_TUNING_ENABLED`
- build and start `docker-compose.server.yml`

## Agent: systemd

Set the required env vars, then run:

```bash
sudo CHIKEN_SERVER=ws://panel.example.com:7788/agent \
sudo CHIKEN_TOKEN=ce_xxx \
bash scripts/install-agent.sh
```

## Agent: generated one-click install

Use the admin API or admin UI:

- `POST /api/agents/:id/install-command`

That returns a temporary one-click install command and bundle-backed script URL.

## Agent: Docker Compose

Prepare Docker on the remote host:

```bash
sudo bash scripts/install-docker.sh
```

Then use the generated Docker mode install command from the admin UI or API.

## Public And Admin URLs

- Public probes: `/`
- Admin SPA: `/admin`
- API docs: `/docs/api`
- OpenAPI JSON: `/docs/api/openapi.json`

## Notes

- JS and CSS should stay hashed in built output
- `index.html` should be `no-cache`
- if a page looks stale after deployment, try `Ctrl+F5` first
