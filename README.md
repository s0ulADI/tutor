# Tutor — Camera Focus Enforcer

Tutor is a playful, fully client-side focus timer that watches you through your webcam
and theatrically escalates when you vanish mid-session — from a polite nudge to a full
productivity siren, until you return to the chair.

No backend. No uploads. Your camera frames never leave your browser.

## Quick start

Serve the folder statically (camera access requires `localhost` or HTTPS):

```powershell
python -m http.server 4173
```

Then open `http://localhost:4173`.

You can also deploy it as-is to GitHub Pages, Netlify, Vercel, or any static host.

## How it works

1. **Set the timer** — pick a session length with the dial, plus break cadence, intensity, and grace period.
2. **Arm the camera** — face detection runs locally via face-api.js, with a motion-diff fallback if face models can't load.
3. **Stay in frame** — a focus streak meter tracks uninterrupted presence.
4. **Vanish, get judged** — after the grace period expires, Tutor escalates through three punishment tiers (visual alarm overlay + sound pack audio) until you return.
5. **Get your report** — session summary with focus score, badge, and a downloadable share card.

## Features

### Focus sessions
- Duration dial (5–120 min) with keyboard support, Pomodoro-style break cadence, short breaks
- Chill / Normal / Chaotic intensity profiles controlling escalation timing and volume
- Configurable grace period (seconds away before Tutor escalates)
- Pause / resume / end controls, break mode with punishments auto-disabled
- Roast mode for extra-disappointed commentary

### Presence detection (100% local)
- Face detection via face-api.js, all frames processed in-page
- Motion-diff fallback when face models are unavailable
- Live camera preview with presence glow (green / amber grace / red punished)
- Camera preview can be hidden; detection keeps working

### Sound packs
Seven selectable personalities, each with 3–5 short clips that cycle so they never get stale.
Tier 1 stays light; intensity and volume escalate through tier 3:

| Pack | Personality |
| --- | --- |
| Classic Alarm | Sirens, buzzers, urgent beeps |
| Cartoon Chaos | Slide whistles, boings, womp-womp, drum sting |
| Meme Pack | Air-horn-ish blast, dramatic sting, record scratch, sad trombone |
| Retro Computer | Modem handshake, error chime, floppy clicks, game-over jingle |
| Drill Sergeant | Synthesized voice orders via Speech Synthesis (no audio files) |
| Chime only | One polite tone, never scary |
| Custom | Your own uploaded clips, stored in-browser via IndexedDB |

All pack audio except Custom is procedurally synthesized with the Web Audio API —
no copyrighted clips. The settings panel has a **Test** button with a playing
indicator to preview the selected pack.

### Stats & history
- Aggregate cards (sessions, avg focus, present total, day streak) with count-up animation
- Focus calendar heatmap (last 8 weeks, GitHub-style)
- Focus-%-per-session bar chart
- Badge gallery: Chair Champion, Focus Ninja, Mostly Here, Reformed Wanderer, Serial Disappearer — earned in color, locked greyed out, with an unlock animation + confetti on first earn
- Session history list with per-session focus bars
- Daily streak tracking across days

### Landing & motion
- Animated gradient mesh + reactive particle field (calm drift idle, energetic chaos coloring during punishments)
- Letter-by-letter headline reveal, scroll-triggered reveals, 3D tilt cards, magnetic CTA button
- Mascot with idle animation that reacts on hover and scroll-into-view
- Custom cursor with hover/click states
- Everything respects `prefers-reduced-motion`

### Session report card
- Themed share card (badge, focus score + bar, present time, vanishes, longest streak, shame score)
- One-click PNG export rendered on canvas

## Project structure

- `index.html` — app shell, screens, settings drawer, CDN script tags
- `css/styles.css` — layout, theme, components
- `css/animations.css` — keyframes and motion utilities
- `assets/images/tutor-mascot.svg` — mascot artwork (`.png` fallback beside it)
- `js/main.js` — wiring: buttons, settings, dial, timer, presence, camera
- `js/ui.js` — rendering, screen transitions, particles, stats charts, badge gallery
- `js/stats.js` — settings, session history, streaks, badges, heatmap aggregation (`localStorage`)
- `js/timerEngine.js` — focus/break state machine
- `js/presenceDetector.js` — webcam, face-api.js, motion fallback
- `js/punishmentSystem.js` — sound packs, WebAudio synth, speech, custom-clip IndexedDB store

## Data & privacy

- Settings, history (last 40 sessions), streaks, and earned badges live in `localStorage`
- Custom sound clips live in IndexedDB, on your device only
- Webcam frames are read by the page and never sent anywhere — there is no server side to this project at all

## Browser support

Works best in a recent Chromium/Edge/Chrome or Firefox with webcam access.
Speech synthesis (Drill Sergeant pack, roast lines) depends on OS voices.
