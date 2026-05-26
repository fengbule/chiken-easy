# Release Hardening Plan

## Passed In The Previous Round

- Control plane and agent compose deployment worked on three real hosts.
- `/api/health`, protected APIs, session-cookie auth, and query-token disable-by-default behavior were verified.
- Public monitor pages, probe history, events, memos, files, subscriptions, SSH, SFTP, scripts, and batch commands were exercised on real servers.
- `npm run check` and the first-round smoke path passed locally.

## Incomplete Or Limited In The Previous Round

1. `SQLite` was only reserved in the storage abstraction.
2. `Realm` and `GOST` real forwarding checks failed because image pulls timed out on remote hosts.
3. `proxy-check` was mostly TCP reachability and latency.
4. `VLESS Reality` was not re-run end-to-end in the final acceptance pass.
5. `web/src/App.jsx` remained too heavy for a release branch.

## Risk Levels

- High: forwarding image availability, because it blocks real `Realm`/`GOST` acceptance.
- High: protocol-aware proxy checks, because score-based subscription output depends on trustworthy health data.
- Medium: SQLite, because event history growth needs a more durable backend without replacing `state.json`.
- Medium: VLESS Reality re-validation, because it affects a supported protocol and release confidence.
- Medium: frontend entry weight, because future fixes become risky if the single file keeps growing.

## This Round Strategy

1. Keep JSON state as the main compatibility path and add minimal usable SQLite event/history storage beside it.
2. Add `Realm`/`GOST` image preflight checks, configurable image env vars, and readable API/UI errors.
3. Upgrade `proxy-check` to protocol-level MVP for `ss`, `http`, `socks`, and `mixed`, while explicitly marking unsupported protocols.
4. Re-run local dual-mode smoke checks and add `remote-verify` for structured real-host acceptance.
5. Reduce `App.jsx` risk by extracting shared API, utilities, and layout/status components without a large UI rewrite.

## Explicitly Out Of Scope In This Round

- Replacing `state.json` as the primary configuration store.
- Full protocol-level proxy checks for `trojan`, `vless`, `vmess`, and `hysteria2`.
- Large navigation or state-management framework changes in the frontend.
- GitHub Release creation or tag creation.

## Release Checklist

- `npm install`
- `npm run check`
- `CHIKEN_STORAGE=json npm run smoke`
- `CHIKEN_STORAGE=sqlite npm run smoke`
- `docker compose -f docker-compose.server.yml config`
- `docker compose -f docker-compose.agent.yml config`
- `node scripts/parse-mima.mjs`
- `node scripts/remote-verify.mjs`
- verify `.gitignore` still excludes `.local/`, `mima.txt`, `.env*`, `*.pem`, `*.key`, `data/`, `node_modules/`, `dist/`
- verify staged files contain no secrets
- commit with `release: harden integrated chiken stack`
- push only if key local and remote validation passes
