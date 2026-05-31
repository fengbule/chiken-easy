# Chiken Easy Android

Native Android client for the existing chiken-easy panel. The app talks to the Node/Express server through the real REST and WebSocket APIs in `server/index.js`; it does not reimplement server logic.

## Build

```bash
cd android
./gradlew assembleDebug
```

Requirements:

- JDK 17
- Android SDK with API 35
- Network access for the first Gradle dependency download

On Windows, use `gradlew.bat assembleDebug`.

## Configure

On first launch, enter:

- Panel address, for example `http://192.168.1.100:7788`
- API token, usually `ck_xxx`

The app normalizes the base URL and verifies it with `POST /api/auth/session`. The token is saved with AndroidX Security encrypted preferences. The base URL and non-secret preferences are stored in DataStore.

## Features

- Splash/login session verification
- Dashboard with 5-second auto-refresh
- Server list and detail
- sing-box service actions: `start`, `stop`, `restart`, `status`
- Config read and config version list
- WebSocket terminal at `/terminal?agentId=<id>&mode=ssh|agent`
- Basic SFTP list/upload/download/delete/mkdir/rename
- Node pool list/import/from-agent/check/export/delete
- Subscription list/create/edit/render/delete
- Settings, connection re-verification, logout

HTTP cleartext traffic is allowed for private LAN deployments through `network_security_config.xml`. Production deployments should use HTTPS. The TLS path keeps system and user trust stores enabled and does not globally disable certificate validation.
