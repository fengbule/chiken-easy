# Monitor

## Overview

The monitor module keeps the original public probe concept but upgrades it into a lightweight monitoring surface with:

- public probe cards
- monitor summary
- recent public events
- per-agent history
- retention policy controls
- alert threshold settings

## Data Collected

Each sample can include:

- `online`
- `cpuUsage`
- `cpuCores`
- `load1`
- `load5`
- `load15`
- `memoryTotal`
- `memoryUsed`
- `memoryUsage`
- `swapTotal`
- `swapUsed`
- `swapUsage`
- `diskTotal`
- `diskUsed`
- `diskUsage`
- `rxSpeed`
- `txSpeed`
- `rxBytes`
- `txBytes`
- `uptime`
- `processCount`
- `updatedAt`

## Retention

- raw history is retained for `CHIKEN_MONITOR_RAW_HOURS`
- aggregated history is retained for `CHIKEN_MONITOR_AGG_DAYS`
- defaults are `24` raw hours and `7` aggregated days

## API

- `GET /api/monitor/summary`
- `GET /api/agents/:id/probe/history`
- `GET /api/public/probes`
- `GET /api/public/probes/history?agentId=...`
- `GET /api/public/events`
- `GET /api/settings`
- `PUT /api/settings`
- `POST /api/settings/notifications/test`

## Alert Controls

Current settings support:

- alerts enabled toggle
- CPU threshold
- memory threshold
- disk threshold
- traffic threshold
- cooldown minutes
- webhook target
- Telegram target

Notification transport is best-effort:

- webhook POST
- Telegram `sendMessage`

## Public Safety

Public probe pages only expose sanitized display metadata such as:

- public name
- public group
- public region
- flag emoji
- operating-system distribution such as Ubuntu or Debian when the Agent can read host `/etc/os-release`
- tags
- metrics

They do not expose operational host/IP credentials.

Agent OS detection checks the mounted host filesystem first (`CHIKEN_HOST_ROOT`, `/hostfs`, `/host`) and falls back to the container OS if host metadata is unavailable. Public flags prefer asset `publicFlag`; if empty, the server maps common region strings such as US, Hong Kong, Japan, Singapore, Germany, and the UK to flag emoji and falls back to `🌐`.

## Real Acceptance Notes

The current build has been exercised against three real test hosts:

- all three agents reported CPU, memory, disk, network, and uptime
- public probe endpoints returned sanitized data
- history and events endpoints produced live records
- settings API reflected query-token default disable state after the final hardening pass
