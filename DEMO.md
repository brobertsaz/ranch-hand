# Demo video: the handoff in 60 seconds

One story, told in about a minute: a hand spots a sick heifer and pins her with no signal, and the next hand rides straight to her and marks her doctored. It matches the landing page: **Mark it once. Anyone can find it.**

The demo ranch is **Bob's Ranch** (invite code BOBSRANCH). Never show a real ranch's name, sign or brand.

## What you need

- The Pixel with a **release build** (rides crash the dev launcher), joined to `https://ranch.thebob.dev`. The iPhone build crashes on iOS 27 for now.
- The offline area downloaded at the house, with both Aerial and Topo.
- The Android emulator joined to Bob's Ranch, for the second hand's screen. Its clips are screen recordings only, so no second phone is needed.
- A helper with another phone to film the outdoor clips, and a cow or calf on ground you have permission to film.
- Do Not Disturb on, a full battery, and gloves for the close-ups.

## Shot list

Film each shot as its own clip. Screen clips are recorded on the phone; outdoor clips are filmed by the helper, held vertically.

| # | Time | Clip | What to show | Caption |
|---|---|---|---|---|
| 1 | 0–5 s | Outdoor | Wide shot of brush or tall grass, then a heifer standing off by herself. | Spot a sick one out here… |
| 2 | 5–15 s | Outdoor + screen | Over the shoulder: gloved hand taps the camera button. Screen: airplane mode on, snap the ear tag, **Sick animal**, tap *Off feed*, **Drop the pin**. The pin lands with a dashed border. | Pin her in 10 seconds. No signal. |
| 3 | 15–20 s | Outdoor | The hand rides or drives away. The heifer is lost in the brush behind them. | …and you'd never find her again. |
| 4 | 20–28 s | Screen | Back in range: the dashed pin turns solid. Cut to the emulator: the **New** tab badge, then Heifer 1147 in What's new with OPEN. | The whole crew gets it. |
| 5 | 28–45 s | Screen + outdoor | Emulator: open the pin, **Take me there**. The arrow swings and the distance counts down. Outdoor: a second rider heads out, phone in hand, and rides up to the heifer. | Someone else rides straight to her. |
| 6 | 45–52 s | Screen | **Mark resolved**. What's new shows RESOLVED, and the open count in the header drops. | Doctored. Marked done. |
| 7 | 52–60 s | End card | The ear-tag logo, the headline and the web address. | Mark it once. Anyone can find it. ranch.thebob.dev |

## Recording the Pixel's screen

In the field, use the **Screen record** tile in Quick Settings. Its clips land in Photos.

With the phone plugged into the Mac, each clip can also be recorded from the terminal (Android caps a clip at 3 minutes):

```bash
adb shell screenrecord --time-limit 180 /sdcard/shot-2.mp4
adb pull /sdcard/shot-2.mp4 ~/Movies/ranch-hand/
```

For the emulator, use its **Record screen** button in the extended controls (the `…` menu).

## Editing

Use **CapCut** (free, on the Mac or the phone). iMovie works too.

1. Start a 9:16 project and drop the clips in shot order.
2. Trim each clip to its time in the table. Cut away any loading or typing.
3. Put a screen clip and its outdoor clip side by side, or cut between them, for shots 2 and 5.
4. Add the captions from the table as big text, and turn on auto captions if you narrate.
5. Add quiet music, and make the end card from the logo in `mobile/assets/brand/`.
6. Export at 1080×1920. Post the vertical cut to Facebook groups and Reels, and make a 16:9 copy for the landing page later.
