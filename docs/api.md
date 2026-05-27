# API Guide

## Authentication

Most control endpoints accept:

- `Authorization: Bearer ck_xxx`
- or a browser session cookie created by `/api/auth/login` or `/api/auth/session`

Public endpoints:

- `/api/health`
- `/api/public/*`
- `/`
- `/docs/api`
- `/docs/api/openapi.json`

## Core Control APIs

### Health

- `GET /api/health`

### Agents

- `GET /api/agents`
- `GET /api/agents/:id`
- `POST /api/agents/:id/service/:action`
- `POST /api/agents/:id/config/wizard`
- `POST /api/agents/:id/config`
- `POST /api/agents/:id/config/rollback/:versionId`

### Network tuning / BBR

- `GET /api/agents/:id/network/tuning`
- `POST /api/agents/:id/network/tuning/dry-run`
- `POST /api/agents/:id/network/tuning/apply`
- `POST /api/agents/:id/network/tuning/rollback`
- `GET /api/agents/:id/network/tuning/history`

### Forwarding

- `POST /api/agents/:id/forward/wizard`
- `DELETE /api/agents/:id/forwards/:ruleId`
- `POST /api/agents/:id/forward-images/:engine/check`

### WebSSH / SFTP

- `WS /terminal?agentId=...&mode=ssh|agent`
- `GET /api/agents/:id/sftp?path=...`
- `POST /api/agents/:id/sftp/upload`
- `GET /api/agents/:id/sftp/download?path=...`
- `DELETE /api/agents/:id/sftp?path=...`
- `POST /api/sftp/copy-between`

### Node pool / subscriptions

- `GET /api/node-pool`
- `POST /api/node-pool/import`
- `POST /api/node-pool/check`
- `GET /api/node-pool/export?format=...`
- `GET /api/subscriptions`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:id`
- `POST /api/subscriptions/render`
- `GET /sub/:token`

### Memos / files

- `GET /api/memos`
- `POST /api/memos`
- `PUT /api/memos/:id`
- `DELETE /api/memos/:id`
- `POST /api/files/upload`
- `GET /api/files/:id/download`
- `DELETE /api/files/:id`

### Tokens / settings / audit

- `GET /api/api-tokens`
- `POST /api/api-tokens`
- `DELETE /api/api-tokens/:id`
- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/audit`

## Interactive Documentation

- HTML: `/docs/api`
- OpenAPI JSON: `/docs/api/openapi.json`

## Example

```bash
curl -H "Authorization: Bearer ck_xxx" \
  http://panel.example.com:7788/api/agents
```
