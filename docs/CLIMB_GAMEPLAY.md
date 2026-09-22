# Zipzip climb: tempo and route redesign

## Design basis

- Lima Sky's Doodle Jump listing describes distinct moving/broken/disappearing platforms and springs/rockets that immediately carry the player higher: https://apps.apple.com/us/app/doodle-jump-insanely-good/id456355158
- Slow Rush Games' first-hand platforming implementation discusses acceleration and gravity as game-feel controls: https://www.slowrush.dev/news/adding-platforming/
- JumpLab exposes jump, running acceleration and camera parameters as interacting design choices: https://fukuchi.org/en/works/jumplab/

These sources inform principles, not claimed access to Doodle Jump's proprietary generator or numerical difficulty curve. The following tuning is Zipzip-specific.

## Contracts

- Gesture overlays and toasts never receive pointer events. The hint is removed from layout at the first canvas pointer-down or direction-key input. Pointer capture handles drags outside the canvas; secondary pointers are ignored.
- Spring collection immediately sets upward velocity to at least 1.65× local normal jump, emits a trail/burst, distinct sound and haptic. Two subsequent bounces get a smaller 1.18× bonus.
- At 0/150/350/650/1000/1800m, speed is 1/1.08/1.22/1.42/1.65/1.85. Values interpolate continuously and cap for playability. Gravity scales with speed squared; jump velocity scales with speed. Normal apex remains 145.2px while airtime shrinks from 0.88s to 0.53s at 1000m. Gravity is fixed for each flight.
- Horizontal movement uses acceleration and target braking, with lower starting maximum speed (270px/s). Simulation uses 120Hz steps independently of render rate.
- Every generated row has a permanent solid/spring anchor. Normal jumps can reach the next anchor without a power-up. Fragile/moving/boost platforms are optional reward detours; removing all of them cannot break the permanent route. Moving detours have bounded travel. This guarantees a route, not survival after every player mistake.
- A spring pad launches at 1.5×; a narrow, one-use boost pad at 1.9×. Five platform types have shape/detail cues, not color alone. Pickups use drawn spring, shield and minted-coin shapes with pulse halos.
- Shield recovery uses an existing permanent anchor. It does not create a disconnected rescue platform.
- Bounce is a 60ms bright tone; crack/break are 35/50ms filtered noise. Spring has a separate rising two-tone envelope. Device loudness and haptic quality still require physical-phone assessment.

## Validation

`npm test` and `npm run build` are gates in both CI and Pages deployment.

Tests cover continuous tempo and reach, 100 seeds × 4 widths through 2500m with 100ms reaction delay plus real horizontal acceleration, target braking, actual pickup/pad collisions, permanent route after removing hazards, shield recovery, actual simulated play beyond 1000m, and all canvas drawing branches.

Local visual browser verification was unavailable in this environment (browser daemon startup failed; cloud browser blocks localhost). A production browser check follows deployment. Automated simulation does not substitute for subjective touchscreen/audio/haptic playtesting.
