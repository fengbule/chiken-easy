# Subscription

## Overview

The subscription subsystem upgrades the original local-node export into a broader node-distribution layer with:

- node pool import
- local node export into node pool
- subscription tokens
- public subscription endpoint
- access logging
- score-based sorting
- health filtering
- multiple output formats

## Node Pool

Supported import sources:

- `vmess://`
- `vless://`
- `trojan://`
- `ss://`
- `hysteria2://`
- `http://`
- `socks://`
- Clash / Mihomo YAML `proxies`
- sing-box outbound JSON
- base64-encoded subscription payloads

Core APIs:

- `GET /api/node-pool`
- `GET /api/node-pool/:id`
- `POST /api/node-pool/import`
- `POST /api/node-pool/from-agent/:id`
- `POST /api/node-pool/from-forward/:agentId/:ruleId`
- `PUT /api/node-pool/:id`
- `DELETE /api/node-pool/:id`
- `POST /api/node-pool/check`
- `GET /api/node-pool/export?format=...`

## Subscription Profiles

Core APIs:

- `GET /api/subscriptions/meta`
- `GET /api/subscriptions`
- `GET /api/subscriptions/:id`
- `POST /api/subscriptions/render`
- `POST /api/subscriptions`
- `PUT /api/subscriptions/:id`
- `DELETE /api/subscriptions/:id`
- `GET /api/subscription-access`
- `GET /sub/:token`

Current profile controls include:

- `enabled`
- `expiresAt`
- `maxAccessCount`
- `accessCount`
- `format`
- `nodeIds`
- `localNodes`
- `onlyHealthy`
- `sortBy`
- `filterTags`
- `filterRegions`
- `hideTags`

## Output Formats

Current supported render targets:

- `base64`
- `raw`
- `clash`
- `mihomo`
- `sing-box`

## Proxy Check

The current `proxy-check` implementation measures:

- TCP reachability
- latency
- last error
- last check time

It then updates:

- `health`
- `score`
- `lastCheckAt`
- `lastError`

## Access Control

Real current behavior:

- missing auth on admin APIs returns `401`
- public `/sub/:token` works without admin auth
- disabled subscription token returns `403 subscription disabled`
- expired subscription token returns `403 subscription expired`
- access count, masked IP, and user-agent are logged

## Real Acceptance Notes

This build has real verified evidence for:

- node import from manual test payloads
- local node import from a real panel-created trojan node
- proxy-check updating node health/score
- output generation for base64, Clash YAML, and sing-box JSON
- access count increment after public fetch
- disabled token rejection
- expired token rejection

## Known Limits

- current proxy check is transport-level, not a full protocol-authenticated egress check for every scheme
- imported `realm`/`gost` forwarding nodes depend on external images being available on the target agent host
