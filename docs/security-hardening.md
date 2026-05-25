# Security Hardening

## Storage and Secret Handling

- `server/storage.js` now sits between the app and `data/state.json`
- writes use atomic temp-file replace
- recent backups are retained before overwrite
- failed writes do not destroy the previous state file
- empty or corrupt state files fall back safely

Sensitive values eligible for at-rest encryption with `CHIKEN_MASTER_KEY`:

- SSH passwords
- SSH private keys
- API tokens
- subscription source credentials
- webhook URL
- Telegram bot token

If `CHIKEN_MASTER_KEY` is missing:

- the app still runs for backward compatibility
- settings expose a warning
- secrets remain compatible but are not protected at rest

## Password Hashes

- legacy `sha256(salt:password)` admin hashes are still accepted
- successful legacy login automatically upgrades the stored hash to `scrypt`
- new password material uses `scrypt`

## API Token Policy

- `Authorization: Bearer ck_xxx` remains supported
- query token mode is disabled by default
- `?token=ck_xxx` only works when `CHIKEN_ALLOW_QUERY_TOKEN=1`
- when query token mode is disabled, the API returns a clear `401` error instead of failing silently
- UI now uses session cookies to keep SSE, downloads, and terminal access working without query tokens

## Public Data Redaction

Public probe APIs do not expose:

- host
- IP
- SSH credentials
- private keys
- tokens
- webhook values

Authenticated internal APIs still show operational host and IP fields where needed, but credentials are redacted or represented as `hasPassword` / `hasPrivateKey` flags.

## Audit Coverage

The current build audits all major dangerous or sensitive actions, including:

- login success and failure
- token create and delete
- agent register and agent offline
- SSH connect and SSH session close
- SFTP list, upload, download, rename, mkdir, delete
- config read, deliver, rollback
- forward create and delete
- node import, node update, node delete
- proxy check
- subscription create, update, delete, access
- file upload, download, delete
- credential create, test, use, revoke
- script create, update, delete, run
- batch command execution
- notification tests

## Recommended Production Settings

```env
CHIKEN_REQUIRE_API_TOKEN=1
CHIKEN_ALLOW_QUERY_TOKEN=0
CHIKEN_MASTER_KEY=<long-random-secret>
CHIKEN_STORAGE=json
```

Also recommended:

- keep `.local/`, `mima.txt`, `.env*`, `*.pem`, `*.key`, and `data/` out of git
- terminate TLS in front of the panel when exposed publicly
- rotate bootstrap and API tokens after initial provisioning
- avoid enabling query token mode unless a very specific automation path requires it
