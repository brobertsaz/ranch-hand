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

After installing, `npx expo start` serves the JavaScript. On first launch, enter `http://<lan-ip>:3000`, the invite code `KARACREEK`, and a name.

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
- The iOS build allows plain HTTP (`NSAllowsArbitraryLoads`), and so does Android (`usesCleartextTraffic`). That's for talking to the Mac over LAN; it is spike-only and comes out before TestFlight.
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
