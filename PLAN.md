# Ranch Hand — Plan

**Goal:** have a build reliable enough to field-test at Kara Creek Ranch in June 2027, with real cows, real feed stations, and no signal.
**Pace:** side project. About 8 months of runway.

---

## Guiding rules

1. **Prove offline first.** Offline maps plus local storage plus sync is the hard part. Everything else is ordinary CRUD.
2. **Observations come before rides.** "I didn't lose track of that sick cow" is the feature that sells the app. Ride tracking is a nice extra.
3. **No hardware, no accounts friction.** A ranch hand should be logging within a minute of installing.
4. **Own the infrastructure.** Run our own Rails API and our own sync endpoints, and self-host map tiles where licensing allows.

---

## Proposed stack

| Layer | Choice | Why |
|---|---|---|
| App | React Native via **Expo** (dev builds, not Expo Go) | Builds on existing React skills; dev builds allow native modules |
| Maps | **MapLibre React Native** | Open source, supports offline region packs, no Mapbox lock-in |
| Map imagery | **USDA NAIP** aerial imagery (public domain, US) served as self-hosted tiles; a vector basemap for roads and labels | Ranchers want to see their land, and a public-domain source avoids offline-caching license problems (*verify NAIP terms and resolution for target areas*) |
| Local DB | **expo-sqlite**, with a small sync client that speaks WatermelonDB's pull/push protocol | WatermelonDB's native module needs the old React Native architecture, which Expo SDK 57 / RN 0.86 dropped (found in the Phase 1 spike). The protocol is kept, so the Rails endpoints match WatermelonDB's docs |
| Photos | expo-camera, saved to app storage, with an upload queue | The photo is saved locally the moment it's taken. Upload happens later |
| Location | expo-location + expo-task-manager (background) | Needed for ride tracking. Watch battery use |
| Backend | **Rails 8 API**, Postgres, Active Storage | Familiar territory. PostGIS can come later; plain lat/lng decimals are enough to start |
| Auth | Ranch invite code, then a per-device token | No email or password juggling in the field |

---

## Data model (first pass)

- **Ranch:** name, boundary (GeoJSON, optional)
- **Member:** ranch, name, role (owner / hand), device token
- **Waypoint:** ranch, kind (feed, water, gate, fence, other), lat/lng, name, note. These are *persistent* places.
- **Observation:** ranch, member, kind (sick animal, feed check, fence issue, other), lat/lng, accuracy, observed_at, tag_number (optional), note, status (open / resolved), optional waypoint. These are *events*.
- **Photo:** observation, local URI, remote attachment, upload state
- **Ride:** member, started_at, ended_at, track (GeoJSON LineString)

Sync conflict policy: observations are mostly append-only, and each one has a single author. For edits, use last-write-wins per record. Resolving an observation is a status change, not a delete.

---

## Phases

### Phase 0: Decisions and a quick market check (Oct–Nov 2026)
- [ ] Confirm the stack above, or swap pieces
- [ ] Map the competitors (see below) and install them. Write down what they do badly for *ranch hands logging in the field*.
- [ ] Talk to 2–3 ranch people if possible: How do sick-animal sightings get passed along today? Who would pay, the owner or the operation?
- [ ] Apple Developer account ($99/yr) and Google Play account ($25 one-time)

### Phase 1: The offline spike (Nov–Dec 2026) ⭐ hardest part
This is a throwaway prototype that answers one question: does offline really work?

**Acceptance test, run on a real phone in airplane mode:**
1. Download a map region for a test area while online
2. Turn on airplane mode, force-quit the app, and reopen it. The map still renders.
3. Drop a pin with a photo and note. Force-quit and reopen. The pin and photo are still there.
4. Turn airplane mode off. The pin and photo sync to the Rails API.
5. A second phone pulls them down and sees the same pin.

If all five pass, the architecture works.

**Result (2026-10-09): all five pass on Android.** Steps 1–4 ran on a Pixel 10 Pro in airplane mode; step 5's second phone was an Android emulator. Still open:
- [ ] Repeat step 5 on a second real phone
- [ ] Run the same test on iOS (needs Xcode and an iPhone)
- Lessons: the map style must be served without `must-revalidate`, or MapLibre won't load it from an offline pack on a cold start. WatermelonDB was swapped for expo-sqlite (see Stack).

### Phase 2: Core loop (Jan–Feb 2027)
- [ ] Observation flow: camera opens immediately, then kind, optional tag number and note, then save. Aim for under 10 seconds.
- [ ] Map showing waypoints and observations, filtered by kind and by open/resolved
- [ ] Observation detail view: photo, where, when, who; mark resolved
- [ ] Persistent waypoints (feed stations, tanks, gates)
- [ ] Basic ride recording (start, stop, track on the map)

### Phase 3: Crew and sync (Mar–Apr 2027)
- [ ] Ranch invite codes and members
- [ ] Reliable sync for multiple people (retries, partial uploads, large photos on a weak signal)
- [ ] "What's new since I last synced" view
- [ ] Rails API: request specs, deploy to a server we control

### Phase 4: Field-ready (May 2027)
- [ ] TestFlight and an Android internal test build
- [ ] Battery test: a 4-hour ride with tracking on
- [ ] Test on a rural drive somewhere with dead zones
- [ ] Pre-download the Kara Creek area map pack
- [ ] **Ask Kara Creek for permission** to test with their hands and cattle, and agree on what we'll record

### June 2027: Kara Creek field test
- Hand it to the people who do the feed runs. Watch them use it, without coaching.
- Record what confused them, what they skipped, and what they wished it did

### After the test
- Decide whether it's worth selling. Validate pricing (a hypothesis to test: a per-ranch monthly subscription).

---

## Later ideas (not before the field test)
- **Reading the tag from the photo** with on-device text recognition, which suggests the tag number for a person to confirm. Muddy or partial tags mean it has to stay editable.
- Herd or animal history: every observation for tag 1234
- Pasture boundaries and grazing rotation
- Export to CSV or PDF for the vet or the owner

---

## Competitors to study

- **onX Hunt** already has photo waypoints with icons, notes, and sharing. It's built for hunters on public and private-land maps, not for ranch crews logging animals. Its waypoint UX is the bar to meet.
- **PastureMap** is a grazing-planning and ranch-management app (fences, water tanks, herd records). It works offline and syncs. Its App Store rating is low, and one reviewer says team sharing costs about $750/yr (unverified).
- **CattleMax** and similar products are herd record-keeping software, more office-side than field-side.

**Where we can be different:** the fastest way for a *hand on horseback* to log what they saw and have the crew find it later, without paperwork or hardware.
