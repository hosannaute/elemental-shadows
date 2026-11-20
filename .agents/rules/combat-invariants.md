# Elemental Shadows — Combat & Simulation Invariants

These invariants govern the deterministic combat engine, skeletal animation pipeline, and UI controls for **Elemental Shadows**.

## 1. Fixed-Timestep Deterministic Loop
- The combat simulation MUST advance in fixed discrete ticks (`FIXED_DT = 1 / 60` seconds, 60 logic Hz) via a clamped time accumulator (`MAX_FRAME_DELTA = 0.1s`) inside `src/engine/gameLoop.ts`.
- Optional 30 FPS render locking (`settingsStore.fpsMode === 30`) throttles visual frame presentation while keeping simulation logic strictly deterministic and frame-data consistent.
- Never couple combat physics, frame counts, hit-stop, or timers directly to `requestAnimationFrame` delta time.

## 2. Custom Kinematic Motion (Zero Rigid-Body Physics)
- No rigid-body physics engines (Box2D, Matter.js, Planck.js) are permitted.
- Fighter locomotion uses explicit root-motion velocity impulses, floor clamping (`GROUND_Y`), arena wall clamping (`ARENA_LEFT`, `ARENA_RIGHT`), and deterministic pushbox separation so fighters never overlap awkwardly or jitter.

## 3. Landscape Combat Viewport
- The canonical combat coordinate space is **1280 × 720** (16:9 landscape), scaled cleanly to fit any desktop or mobile landscape viewport.
- Portrait screens display a non-destructive rotate-device cue while preserving match state.

## 4. Input Buffer & Responsive Chaining
- Player inputs enter a ring-buffered `InputBuffer` supporting **Tight (5f)**, **Standard (8f)**, and **Forgiving (12f)** buffer windows configurable live via `settingsStore.ts`.
- Follow-up attack inputs pressed during late active or recovery frames automatically execute on the earliest cancelable or neutral frame.
- Directional double-taps (`Forward, Forward` / `Back, Back`) trigger dashes and acrobatic Back Handsprings.

## 5. Hit-Stop & Impact Feel
- Clean hits freeze both attacker and defender skeletons and move frame timers for **3–5 frames** (scaled by attack weight and `impactFeedback` setting).
- Camera shake, hit sparks, ribbon glow, and elemental shockwave shaders continue updating during hit-stop to deliver tactile martial arts weight.

## 6. Invulnerability Frames (i-Frames) & Comeback Guarantees
- **Wake-Up Sweep** (`Down + Kick` or `Kick` while grounded): `16f` startup invulnerability.
- **Forward Recovery Roll** (`Forward` while grounded): `18f` invulnerability (+`6f` for Water's Liquid Slip).
- **Backward Recovery Roll** (`Back` while grounded): `16f` invulnerability (+`6f` for Water's Liquid Slip).
- **Wall Jump** (`Up-Forward` near arena wall): brief takeoff i-frames (`10f`) and vault arc over opponent (+35% height/distance for Air's Zephyr Vault).
- **Throws** (`Close + Forward/Back + Punch`, `Behind + Back + Punch`): beat standing guard cleanly at throw range.

## 7. Live Settings Without State Reset
- Mutating any setting in `src/state/settingsStore.ts` (touch scale, opacity, input buffer, VFX quality, hit-stop scale, AI difficulty, Dojo hitbox overlay, key bindings) MUST apply immediately without resetting HP, round count, timer, or fighter positions.
