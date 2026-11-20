# Elemental Shadows

**2D Liquid-Silhouette Martial Arts Fighting Game — Built with Vite, TypeScript, and PixiJS v8**

## Highlights

- **Liquid Silhouette Skeletal Engine (`src/engine/skeletonRig.ts`)**: Parent-child PixiJS v8 `Container` bone hierarchies (`pelvis → torso → shoulder → elbow → hand → weapon`), elemental rim lighting with `GlowFilter`, IK ankle grounding, spring-damped ponytail and sash motion, and bone-attached elemental ribbon trails.
- **Deterministic Fixed-Timestep Combat (`src/engine/gameLoop.ts`)**: 60 Hz logic loop with optional 30 FPS render lock, 3–5f hit-stop freezes, camera shake, `ShockwaveFilter` impacts, and configurable 5f/8f/12f input buffering.
- **Shadow Fight 2 Reversal & Comeback Toolkit**:
  - Grounded **Wake-Up Sweep** (16f i-frames), **Forward Recovery Roll** (18f i-frames), **Backward Recovery Roll**
  - **Wall Jump**, **Forward Throw**, **Throw Through Back**, **Shadow Suplex**, **Sucker Kick**, **Back Handspring**, **Elbow Strike**, **Horse Kick**, and **Back Kick**
  - Reactive perks: **Enlightenment**, **Desperate**, **Avenger**, **Mirror**, and **Rock**
- **8 Elemental Archetypes (`src/elements/elementRegistry.ts`)**: Fire (*Ignis*), Ice (*Frost*), Water (*Mizu*), Earth (*Terra*), Air (*Zephyr*), Lightning (*Volt*), Shadow (*Umbra*), and Lava (*Magma*) — each with unique weapons, signature magic, status debuffs, and movement/comeback twists.
- **Live Mid-Match Settings & Dojo Debug Overlay**: Tune touch scale/opacity, Fixed vs. Floating stick, input buffer, VFX quality, hit-stop scale, AI difficulty (`Novice` / `Warrior` / `Master` / `Shadow 6f`), custom key bindings, and live hitbox/hurtbox/i-frame overlays without resetting round state.

## Controls

| Action | Default Keyboard | Touch / On-Screen |
|---|---|---|
| Move / Crouch / Jump | `W A S D` or Arrow Keys | 8-Way Virtual Joystick |
| Punch / Throws | `J` | `P` |
| Kick / Wake-Up Sweep | `K` | `K` |
| Signature Weapon | `L` | `W` |
| Elemental Magic (100%) | `U` or `Space` | Glowing `MAGIC` Orb |
| Roll / Back Handspring | `I` or `Shift` (or double-tap) | `↺` Evade Button |
| Pause & Live Settings | `Esc` | Top Center Cog Icon |

## Development

```bash
npm install
npm run dev
npm run build
```
