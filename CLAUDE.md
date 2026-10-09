# Ranch Hand — notes for Claude Code

Read README.md and PLAN.md first. They hold the product concept and the phased plan.

## Priorities
- Offline-first is non-negotiable. Every write goes to the local DB first. The network only matters for sync.
- Phase 1 (the offline spike) comes before any polish. Don't build screens or styling until the 5-step airplane-mode acceptance test in PLAN.md passes.
- Keep the observation flow fast: camera first, then save. Aim for under 10 seconds.

## Stack
- `mobile/`: Expo (dev builds) + React Native + TypeScript, MapLibre RN, expo-sqlite, expo-camera, expo-location
- `api/`: Rails 8 API-only, Postgres, Active Storage, RSpec
- Sync uses WatermelonDB's pull/push protocol (`mobile/src/sync.ts` client, `api/app/services/sync_*.rb` server). WatermelonDB itself is out: its native module needs the old RN architecture

## Conventions
- The owner is a senior Rails developer, so Rails code should be idiomatic and tested with RSpec
- No vendor lock-in where an open option exists (MapLibre over Mapbox, our own sync over hosted sync services)
