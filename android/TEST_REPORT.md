# Android Test Report

Date: 2026-05-31

## Scope

Added an independent native Android project under `android/` for the existing chiken-easy panel. The implementation uses Kotlin, Jetpack Compose, Material 3, ViewModel + StateFlow, Jetpack Navigation, Retrofit/OkHttp/Moshi, OkHttp WebSocket, DataStore, and AndroidX Security encrypted token storage.

## Local Build Environment

The machine initially did not have Java, Gradle, Node, or Android SDK available in PATH:

- `java -version`: command not found
- `where gradle`: not found
- `node scripts/parse-mima.mjs`: command not found because `node` is not in PATH
- `ANDROID_HOME` / `ANDROID_SDK_ROOT`: not set

For verification only, portable tools were installed under `C:\Cline1\tools` and kept outside the repository:

- Temurin JDK 17
- Android command-line tools
- Android SDK platform 35
- Android SDK Build Tools 35.0.0 and 34.0.0

The project includes a standard Gradle Wrapper script, `gradle-wrapper.properties`, and `gradle-wrapper.jar`.

## Build And Test Results

Commands executed with `JAVA_HOME`, `ANDROID_HOME`, and `ANDROID_SDK_ROOT` pointing at the portable toolchain:

- `cd android && .\gradlew.bat testDebugUnitTest`: passed
- `cd android && .\gradlew.bat assembleDebug`: passed

Output APK:

- `android/app/build/outputs/apk/debug/app-debug.apk`

## API Integration Coverage

Implemented real API bindings based on `server/index.js`:

- `POST /api/auth/session`
- `GET /api/dashboard`
- `GET /api/agents`
- `GET /api/agents/{id}`
- `POST /api/agents/{id}/service/{action}`
- `GET /api/agents/{id}/config`
- `GET /api/agents/{id}/config/versions`
- `/terminal` WebSocket with `Authorization: Bearer <token>` handshake header
- SFTP endpoints under `/api/agents/{id}/sftp`
- Node pool endpoints under `/api/node-pool`
- Subscription endpoints under `/api/subscriptions`
- `GET /api/settings`

Tokens are never placed in WebSocket URLs.

## Live Server Verification

`mima.txt` was not copied into the repository and no secret values were written to this report. The repository helper was run with the local Node binary at `C:\Cline1\tools\node-v24.16.0-win-x64\node.exe` because `node` is not in PATH.

`scripts/parse-mima.mjs` parsed 3 local test servers into `.local/test-servers.json`. That file is ignored and was not copied into `android/`.

Live panel checks were performed with `.local/deploy-secrets.json`; the output below is sanitized:

- `POST /api/auth/session`: 200 OK
- `GET /api/dashboard`: 200 OK, total 3, online 3
- `GET /api/agents`: 200 OK, count 3, connected 3
- `GET /api/agents/{id}`: 200 OK
- `POST /api/agents/{id}/service/status`: 200 OK, command accepted
- `GET /api/agents/{id}/sftp?path=/root`: 200 OK, entries returned
- `/terminal?agentId=<id>&mode=agent` WebSocket: connected and received a message

## Unit Tests Added

- Base URL normalization
- In-memory token storage wrapper
- API error parser

Run locally:

```bash
cd android
./gradlew testDebugUnitTest assembleDebug
```
