# Zipzip Buz Kulesi

The main mode now uses an Icy Tower-inspired momentum loop instead of automatic bouncing. Original runner art, tower renderer and physics are implemented locally; no Icy Tower assets are included.

## Controls

- Phone: hold left/right with one finger and jump with the other. Holding jump repeats it upon landing; tapping gives one jump. Controls are below the canvas, never over the landing area.
- Keyboard: arrows or A/D to run, Space / W / Up to jump. P / Escape pauses.
- Blur or hiding the tab automatically pauses and clears all held inputs. Resume is explicit.
- The tutorial disappears on first gameplay input. It never intercepts input.

## Rules

- Horizontal acceleration builds momentum up to 340 world units/s. Jump impulse ranges from 470 standing to 880 at full speed, with gravity 1550. Approximate apex: 71–250 units. Floors are 60 units apart: a small standing hop or up to four floors at speed.
- Solid walls rebound the player at 85% speed; there is no horizontal wrap. Brief steering lock prevents an immediate repeat collision.
- 90ms coyote window and 150ms jump buffer soften edge timing. Air control is lower than ground acceleration.
- Consecutive landings that each advance at least two floors beyond the previous takeoff extend the combo. Single-floor, backward or repeated-floor landings end it. A three-second timer also ends it. New record floors score 10 each; banking scores skipped floors × combo length × 25. Repeating low floors cannot farm score.
- Camera pressure starts six seconds after the first jump and increases with elapsed play time and highest floor. Falling below the view ends the run.
- Generated floors overlap their predecessor by at least 42 units, remain inside the tower, and narrow gradually. Every tenth floor is wide. No consumable platform is required for progress.
- World width is fixed at 360 across devices. CSS pixels scale rendering, not physics. Simulation runs at 120Hz.
- A fresh `tower` save section holds floor, score, combo and run records. Previous `climb` and memory-game data remain stored. Every five reached floors earn one shared coin, settled once per run.

## Design references

The original developer's announcement describes the base tower, shrinking platforms, increasing automatic scroll and combos that skip at least two floors:
https://steamcommunity.com/app/3014860/announcements/?l=italian

Developer press kit:
https://www.icytower.com/presskit/

All numerical tuning above is Zipzip-specific, not a claim to reproduce proprietary Icy Tower code or exact physics.

## Validation

`npm test`: momentum/apex, resting and held jumps, acceleration/braking, wall rebounds, coyote/buffer behavior, combo banking/expiry/anti-farming, camera death, deterministic simulation, and 100 seeded routes through 1000 floors.

`npm run build`: TypeScript and Vite production build. User requested to handle broad playtesting. No claim of completed mobile device, visual browser, audio or haptic testing.
