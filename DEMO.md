# Demo video: shot list

A short video of Ranch Hand doing its job: log what you see with no signal, the crew gets it, and a new hand can find their way. Record each shot as its own clip and cut them together later.

## Before recording

- Use a **release build** (rides crash the dev launcher), joined to Bob (`https://ranch.thebob.dev`).
- Download the offline area first, with both Aerial and Topo.
- Location for Ranch Hand: **Allow all the time**, so rides record in a pocket.
- A second phone (or the emulator) joined to the same ranch, for the crew's side.
- Clear the status bar: Do Not Disturb on, full battery or charging.

## Shots

| # | Shot | What to show | Where |
|---|---|---|---|
| 1 | **Opening** | Launch: the 1147 tag logo, then the join screen. Type KARACREEK and a name, then **Join the crew**. | Anywhere |
| 2 | **Log it with no signal** | Airplane mode on. Camera → snap an ear tag → **Sick animal** → tap *Limping* and *Off feed* → **Drop the pin**. The pin lands with a dashed border ("on this phone"). | Out in a pasture |
| 3 | **The crew gets it** | Back in range: the dashed pin turns solid. Cut to the second phone: the **New** tab badge, then the item in What's new with OPEN. | Then at home |
| 4 | **Take me there** | On the second phone: open the pin → **Take me there** → the arrow swings as you turn, and the distance counts down. | Walking toward the pin |
| 5 | **Ride it** | **Start a ride** → RECORDING RIDE, and the track draws behind you → **Log what you see** mid-ride → **Hold to stop** (the fill bar) → name it with a suggestion chip ("To Water 1"). | On horseback or the side-by-side |
| 6 | **A new hand follows it** | Second phone: Rides → the named ride → **Follow this ride** → "On the trail", the arrow along the bends, "Gate in 0.3 mi", then a step off to show "60 m off the trail" and the arrow pointing back. | Along the same route |
| 7 | **Topo** | Layers → **Topo**: contours, creeks, draws. Back to Aerial. Airplane mode on: both still there. | Anywhere in the saved area |
| 8 | **Resolved** | Open the sick-animal pin → **Mark resolved** → What's new shows RESOLVED, and the header count drops. | Anywhere |

## Recording the Pixel's screen

With the phone plugged in, each shot is one clip (Android caps a clip at 3 minutes):

```bash
adb shell screenrecord --time-limit 180 /sdcard/shot-2.mp4
```

Press Ctrl+C to stop early, then copy it to the Mac:

```bash
adb pull /sdcard/shot-2.mp4 ~/Movies/ranch-hand/
```

Out in the field with no laptop, use the Pixel's built-in **Screen record** tile in Quick Settings instead. Its clips land in Photos.
