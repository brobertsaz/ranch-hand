# Ranch Hand API

Rails 8 API for Ranch Hand. Phones join a ranch with an invite code, then sync over WatermelonDB's pull/push protocol.

| Endpoint | What it does |
|---|---|
| `POST /api/v1/devices` | `{invite_code, name}` → device token |
| `GET /api/v1/sync?last_pulled_at=` | Pull: changes since the last pull |
| `POST /api/v1/sync` | Push: `{changes}`, last write wins per record |
| `PUT /api/v1/photos/:id/file` | Raw JPEG body for a photo record that has already synced |
| `GET /api/v1/photos/:id/file` | Redirects to the image |
| `GET /api/v1/map/style` | MapLibre style. Offline packs download against this URL |

## Run it

```bash
docker compose up -d      # Postgres 17 on port 5433
bin/rails db:prepare      # creates the dev DB and seeds invite code KARACREEK
bin/rails s -b 0.0.0.0    # reachable from phones on the same Wi-Fi
bundle exec rspec
```

Set `MAP_TILE_URL` and `MAP_TILE_MAXZOOM` to point the map at self-hosted tiles. The default is USGS imagery, which is public domain.
