# Phase 1 spike: running the airplane-mode test

Two phones (a Pixel and an iPhone) on the same Wi-Fi as the Mac running the API.

## 1. Start the API

```bash
cd api && docker compose up -d && bin/rails db:prepare && bin/rails s -b 0.0.0.0
```

Find the Mac's LAN IP with `ipconfig getifaddr en0`.

## 2. Install the app on each phone

The app uses native modules (MapLibre, SQLite, camera), so it needs a dev build. Expo Go won't work.

- **Pixel:** enable USB debugging, plug it in, run `cd mobile && npx expo run:android --device`. This needs a JDK 17.
- **iPhone:** plug it in, run `cd mobile && npx expo run:ios --device`. This needs Xcode and a signing team. A free Apple ID works, but the build expires after 7 days.

After installing, `npx expo start` serves the JavaScript. On first launch, enter `http://<lan-ip>:3000`, the invite code `BOBSRANCH`, and a name.

## 3. The acceptance test (from PLAN.md)

| # | Step | Pass when |
|---|---|---|
| 1 | Online: pan to the test area, tap **Download area** | The status line reads `complete 100%` |
| 2 | Airplane mode on, force-quit, reopen | Imagery still renders for that area |
| 3 | **+** → photo → kind/tag/note → **Save**, force-quit, reopen | The pin (dashed border = unsynced) and its photo are still there |
| 4 | Airplane mode off | The status line shows `pushed 2, photos ↑1`; the pin border turns solid |
| 5 | Other phone: tap **Sync** | The same pin appears; tapping it shows the photo |

Notes:
- In step 2, force-quit also kills the Metro connection on a debug build. To test a truly cold start offline, use a release build: `npx expo run:android --variant release` / `npx expo run:ios --configuration Release`.
- Offline packs use zoom levels 10 to 16 (USGS imagery stops at 16). Packs are capped at 6,000 tiles.
- A build allows plain HTTP only when `EXPO_PUBLIC_API_URL` is an `http://` address (see `mobile/app.config.js`). That's for talking to the Mac over LAN; builds pointed at Bob are HTTPS only.
- Test ride tracking on a release build (`./gradlew assembleRelease` in `mobile/android`). In a dev build, the ride's background location task starts React before the dev launcher does, and the launcher crashes on open ("App react context shouldn't be created before").

## Test server on Bob

For field testing over cell data, the API runs on Bob (the home Mac mini, `ssh thebob`) at **https://ranch.thebob.dev**, through Bob's existing Cloudflare tunnel. App builds point there by default. Everything is in ninjabob's home folder, with no sudo:

- **Ruby:** 3.3.6 under rbenv (`~/.rbenv`), built against MacPorts OpenSSL and a home-built libyaml (`~/.local/libyaml`).
- **Postgres:** 17.9 from EnterpriseDB's binaries (`~/data/ranch-hand/dist/pgsql`), with its data in `~/data/ranch-hand/pgdata`. It listens on localhost:5433 and runs as the LaunchAgent `dev.thebob.ranchhand.postgres`.
- **API:** `~/apps/ranch-hand-api`, started by `~/bin/ranch-hand-api` under the LaunchAgent `dev.thebob.ranchhand.api` on 127.0.0.1:3100. Photos are stored in `~/data/ranch-hand/storage`, and logs in `~/logs/ranch-hand-*.log`.
- **Tunnel:** a `ranch.thebob.dev` entry in `~/.cloudflared/config.yml` (backup: `config.yml.bak-ranchhand`). There's no Cloudflare Access on it; the app uses device tokens.

Deploy the API from this Mac:

```bash
rsync -az --delete --exclude log/ --exclude tmp/ --exclude storage/ --exclude .bundle/ --exclude vendor/bundle/ --exclude '.env*' api/ thebob:apps/ranch-hand-api/
ssh thebob 'cd ~/apps/ranch-hand-api && PATH=~/.rbenv/versions/3.3.6/bin:~/data/ranch-hand/dist/pgsql/bin:$PATH bundle install && launchctl kickstart -k gui/$(id -u)/dev.thebob.ranchhand.api'
```

The start script runs `db:prepare`, so migrations apply on restart. To point a build back at the laptop, set `EXPO_PUBLIC_API_URL` in `mobile/.env.local`.

## Notifications and Sign in with Apple

Both are built and switched off until their keys exist. Nothing breaks without them: the app runs, and the server skips a platform it has no key for.

**Android notifications** (free):
1. Add Firebase to the Google Cloud project the sign-in already uses (`ranch-hand-512121`) and register the Android app `dev.ranchhand.spike`.
2. Download `google-services.json` into `mobile/`. `app.config.js` picks it up; rebuild the app (`npx expo prebuild`, then `npx expo run:android`).
3. In Firebase, Project settings, Service accounts, make a private key. Put the whole JSON file's text in `FCM_SERVICE_ACCOUNT_JSON` in the API's environment on Bob, and restart the API.

**iPhone, once the Apple developer account is paid for:**
1. Turn on Sign in with Apple and Push Notifications for the app ID, and set the team in Xcode.
2. Set `EXPO_PUBLIC_APPLE_ENTITLEMENTS=1` in `mobile/.env.local`, then `npx expo prebuild` and rebuild. That puts both entitlements in the build, shows Sign in with Apple to owners, and asks for notifications.
3. Make an APNs key (.p8) and set `APNS_KEY` (the file's text), `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_TOPIC` (the bundle ID) on Bob. Add `APNS_SANDBOX=1` while testing builds made from Xcode.
4. `APPLE_BUNDLE_ID` on Bob must match the app's bundle ID; it defaults to `dev.ranchhand.spike`.

A build pointed at a laptop over plain HTTP (`EXPO_PUBLIC_API_URL=http://…` in `mobile/.env.local`) is allowed cleartext; every other build is HTTPS only. Run `npx expo prebuild` after changing either setting.

## Tests

- API: `cd api && bundle exec rspec` (or `bin/ci` for RuboCop, RSpec, Brakeman and the gem audit).
- App: `cd mobile && npm test` runs the sync and database tests on Node's built-in SQLite (Node 22.13 or newer). `npm run typecheck` and `npm run lint` are the other two checks.
- GitHub runs all of it on every pull request (`.github/workflows/ci.yml`).
