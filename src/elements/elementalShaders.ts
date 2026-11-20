import { Container, Graphics } from 'pixi.js';
import { GlowFilter, ShockwaveFilter } from 'pixi-filters';
import type { ElementalProjectile } from '../combat/hitboxSystem';
import type { FloorHazard } from './statusEffects';
import type { VfxQuality } from '../state/settingsStore';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  age: number;
  maxAge: number;
  gravity: number;
  shape: 'spark' | 'shard' | 'ember' | 'dust' | 'ring' | 'bolt';
  rotation: number;
  vRot: number;
}

interface ShockwaveInstance {
  filter: ShockwaveFilter;
  age: number;
  maxAge: number;
}

export class ElementalVfxSystem {
  public readonly worldLayer = new Container();
  private readonly particleGraphics = new Graphics();
  private readonly projectileGraphics = new Graphics();
  private readonly hazardGraphics = new Graphics();
  private particles: Particle[] = [];
  private shockwaves: ShockwaveInstance[] = [];
  private quality: VfxQuality = 'high';
  private stageTarget: Container | null = null;

  constructor() {
    this.worldLayer.addChild(this.hazardGraphics);
    this.worldLayer.addChild(this.projectileGraphics);
    this.worldLayer.addChild(this.particleGraphics);
  }

  public attachStageTarget(target: Container): void {
    this.stageTarget = target;
  }

  public setQuality(quality: VfxQuality): void {
    this.quality = quality;
    if (quality === 'high') {
      this.projectileGraphics.filters = [
        new GlowFilter({
          distance: 14,
          outerStrength: 2.1,
          color: 0xffffff,
          quality: 0.2,
        }),
      ];
    } else {
      this.projectileGraphics.filters = [];
    }
    if (quality !== 'high' && this.stageTarget) {
      this.shockwaves = [];
      this.stageTarget.filters = [];
    }
  }

  public createFighterGlow(color: number): GlowFilter[] {
    if (this.quality === 'low') {
      return [
        new GlowFilter({
          distance: 6,
          outerStrength: 1.4,
          innerStrength: 0,
          color,
          quality: 0.1,
        }),
      ];
    }
    return [
      new GlowFilter({
        distance: this.quality === 'high' ? 13 : 9,
        outerStrength: this.quality === 'high' ? 3.2 : 2.1,
        innerStrength: this.quality === 'high' ? 0.85 : 0.45,
        color,
        quality: this.quality === 'high' ? 0.3 : 0.18,
      }),
    ];
  }

  public triggerShockwave(screenX: number, screenY: number, amplitude = 24): void {
    if (this.quality !== 'high' || !this.stageTarget) return;
    if (this.shockwaves.length >= 2) {
      this.shockwaves.shift();
    }
    const filter = new ShockwaveFilter({
      center: { x: screenX, y: screenY },
      speed: 520,
      amplitude,
      wavelength: 130,
      brightness: 1.15,
      radius: 420,
      time: 0,
    });
    this.shockwaves.push({ filter, age: 0, maxAge: 28 });
    this.stageTarget.filters = this.shockwaves.map((s) => s.filter);
  }

  public spawnHitSparks(
    x: number,
    y: number,
    primaryColor: number,
    coreColor: number,
    intensity = 1,
    isIce = false
  ): void {
    const count = this.quality === 'low' ? 6 : Math.round(16 * intensity);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const speed = (3.5 + Math.random() * 8.5) * intensity;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        size: (3 + Math.random() * 5.5) * intensity,
        color: i % 3 === 0 ? coreColor : primaryColor,
        alpha: 1,
        age: 0,
        maxAge: 14 + Math.floor(Math.random() * 14),
        gravity: 0.22,
        shape: isIce ? 'shard' : 'spark',
        rotation: angle,
        vRot: (Math.random() - 0.5) * 0.25,
      });
    }
    // Impact flash ring
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: 16 * intensity,
      color: coreColor,
      alpha: 0.95,
      age: 0,
      maxAge: 12,
      gravity: 0,
      shape: 'ring',
      rotation: 0,
      vRot: 0,
    });
  }

  public spawnGuardSparks(x: number, y: number, perfect: boolean, color: number): void {
    const count = perfect ? 18 : 9;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (perfect ? 5 : 3) + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: perfect ? 6 : 4,
        color: perfect ? color : 0xd8ecff,
        alpha: 1,
        age: 0,
        maxAge: perfect ? 20 : 12,
        gravity: 0.1,
        shape: perfect ? 'shard' : 'spark',
        rotation: angle,
        vRot: 0.15,
      });
    }
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size: perfect ? 24 : 14,
      color: perfect ? color : 0xbce8ff,
      alpha: 0.9,
      age: 0,
      maxAge: perfect ? 16 : 10,
      gravity: 0,
      shape: 'ring',
      rotation: 0,
      vRot: 0,
    });
  }

  public spawnDustBurst(x: number, y: number, dirX = 0, count = 7): void {
    if (this.quality === 'low') return;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 28,
        y: y - 4 - Math.random() * 8,
        vx: dirX * (1.5 + Math.random() * 3.2) + (Math.random() - 0.5) * 2.5,
        vy: -0.6 - Math.random() * 2.2,
        size: 6 + Math.random() * 10,
        color: 0x9aa6ba,
        alpha: 0.42,
        age: 0,
        maxAge: 22 + Math.floor(Math.random() * 14),
        gravity: -0.02,
        shape: 'dust',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 0.06,
      });
    }
  }

  public spawnElementalAuraParticle(x: number, y: number, color: number, isIce = false): void {
    if (this.quality === 'low') return;
    if (this.particles.length > 160) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 56,
      y: y - 20 - Math.random() * 125,
      vx: (Math.random() - 0.5) * 1.1,
      vy: -0.8 - Math.random() * 1.8,
      size: 2.5 + Math.random() * 3.5,
      color,
      alpha: 0.78,
      age: 0,
      maxAge: 24 + Math.floor(Math.random() * 18),
      gravity: -0.02,
      shape: isIce ? 'shard' : 'ember',
      rotation: Math.random() * Math.PI,
      vRot: (Math.random() - 0.5) * 0.15,
    });
  }

  public clear(): void {
    this.particles = [];
    this.particleGraphics.clear();
    this.projectileGraphics.clear();
    this.hazardGraphics.clear();
    this.shockwaves = [];
    if (this.stageTarget) this.stageTarget.filters = [];
  }

  public update(projectiles: ElementalProjectile[], hazards: FloorHazard[]): void {
    // Update shockwave shaders
    if (this.shockwaves.length > 0 && this.stageTarget) {
      let changed = false;
      for (let i = this.shockwaves.length - 1; i >= 0; i--) {
        const sw = this.shockwaves[i];
        sw.age += 1;
        sw.filter.time = sw.age / 60;
        if (sw.age >= sw.maxAge) {
          this.shockwaves.splice(i, 1);
          changed = true;
        }
      }
      if (changed) {
        this.stageTarget.filters = this.shockwaves.map((s) => s.filter);
      }
    }

    // Update & draw floor hazards (Lava Magma Pools)
    const hg = this.hazardGraphics;
    hg.clear();
    for (const h of hazards) {
      const lifeRatio = Math.min(1, h.remainingFrames / 45);
      const pulse = 0.85 + Math.sin(h.tickCounter * 0.18) * 0.15;
      hg.ellipse(h.x, 584, h.halfWidth, 14)
        .fill({ color: h.color, alpha: 0.65 * lifeRatio });
      hg.ellipse(h.x, 583, h.halfWidth * 0.72 * pulse, 8)
        .fill({ color: h.glowColor, alpha: 0.85 * lifeRatio });
      if (Math.random() < 0.25) {
        this.spawnElementalAuraParticle(h.x + (Math.random() - 0.5) * h.halfWidth * 1.4, 584, h.glowColor);
      }
    }

    // Draw elemental projectiles
    const pg = this.projectileGraphics;
    pg.clear();
    for (const p of projectiles) {
      const dir = p.vx >= 0 ? 1 : -1;
      const t = 1 - p.remainingFrames / p.maxFrames;
      if (p.style === 'arc') {
        // Fire Inferno Arc crescent
        pg.moveTo(p.x - dir * 32, p.y - 54)
          .quadraticCurveTo(p.x + dir * 48, p.y, p.x - dir * 32, p.y + 54)
          .quadraticCurveTo(p.x + dir * 16, p.y, p.x - dir * 32, p.y - 54)
          .fill({ color: p.color, alpha: 0.92 });
        pg.moveTo(p.x - dir * 16, p.y - 36)
          .quadraticCurveTo(p.x + dir * 34, p.y, p.x - dir * 16, p.y + 36)
          .quadraticCurveTo(p.x + dir * 10, p.y, p.x - dir * 16, p.y - 36)
          .fill({ color: p.coreColor, alpha: 0.95 });
      } else if (p.style === 'wave') {
        // Water Tidal Wave
        pg.moveTo(p.x - dir * 56, p.y + 36)
          .quadraticCurveTo(p.x - dir * 10, p.y - 52, p.x + dir * 48, p.y - 26)
          .quadraticCurveTo(p.x + dir * 16, p.y + 8, p.x + dir * 40, p.y + 36)
          .closePath()
          .fill({ color: p.color, alpha: 0.88 });
        pg.moveTo(p.x - dir * 36, p.y + 34)
          .quadraticCurveTo(p.x, p.y - 32, p.x + dir * 42, p.y - 22)
          .stroke({ width: 5, color: p.coreColor, alpha: 0.92 });
      } else if (p.style === 'pillar') {
        // Earth Stone Pillar
        const rise = Math.min(1, t * 4.5);
        const h = p.height * rise;
        pg.poly([
          p.x - 38, p.y + 60,
          p.x - 26, p.y + 60 - h,
          p.x, p.y + 42 - h,
          p.x + 28, p.y + 60 - h,
          p.x + 40, p.y + 60,
        ]).fill({ color: 0x161412, alpha: 0.96 }).stroke({ width: 3, color: p.glowColor, alpha: 0.95 });
      } else if (p.style === 'vortex') {
        // Air Cyclone Vortex
        for (let k = 0; k < 4; k++) {
          const w = 18 + k * 14;
          const yOff = 44 - k * 28;
          pg.ellipse(p.x + Math.sin(p.remainingFrames * 0.4 + k) * 6, p.y + yOff, w, 10)
            .stroke({ width: 4, color: k % 2 === 0 ? p.glowColor : p.coreColor, alpha: 0.88 });
        }
      } else if (p.style === 'bolt') {
        // Lightning Thunder Drop Bolt
        pg.moveTo(p.x - 8, 90)
          .lineTo(p.x + 22, 230)
          .lineTo(p.x - 18, 340)
          .lineTo(p.x + 18, 460)
          .lineTo(p.x - 4, 582)
          .stroke({ width: 12, color: p.glowColor, alpha: 0.65 });
        pg.moveTo(p.x - 8, 90)
          .lineTo(p.x + 22, 230)
          .lineTo(p.x - 18, 340)
          .lineTo(p.x + 18, 460)
          .lineTo(p.x - 4, 582)
          .stroke({ width: 4, color: p.coreColor, alpha: 1 });
      } else if (p.style === 'shards') {
        // Ice Frost Shards cluster
        const offsets = [
          { dx: 18, dy: -26, s: 1.0 },
          { dx: -10, dy: 0, s: 1.25 },
          { dx: 12, dy: 28, s: 0.95 },
        ];
        for (const o of offsets) {
          const sx = p.x + o.dx * dir;
          const sy = p.y + o.dy;
          pg.poly([
            sx + dir * 26 * o.s, sy,
            sx - dir * 8 * o.s, sy - 11 * o.s,
            sx - dir * 24 * o.s, sy,
            sx - dir * 8 * o.s, sy + 11 * o.s,
          ]).fill({ color: p.color, alpha: 0.9 }).stroke({ width: 2, color: p.coreColor, alpha: 0.98 });
        }
      } else if (p.style === 'tendrils') {
        // Shadow Umbral Tendrils
        for (let k = -1; k <= 1; k++) {
          pg.moveTo(p.x - dir * 55, 582)
            .quadraticCurveTo(p.x + k * 24, p.y - 34, p.x + dir * 40 + k * 14, p.y - 12 + k * 18)
            .stroke({ width: 9, color: 0x090714, alpha: 0.95 });
          pg.moveTo(p.x - dir * 55, 582)
            .quadraticCurveTo(p.x + k * 24, p.y - 34, p.x + dir * 40 + k * 14, p.y - 12 + k * 18)
            .stroke({ width: 3, color: p.glowColor, alpha: 0.92 });
        }
      } else {
        // Lava Eruption Slam plume
        pg.poly([
          p.x - 46, 584,
          p.x - 18, p.y - 60,
          p.x + 4, p.y - 90,
          p.x + 24, p.y - 50,
          p.x + 46, 584,
        ]).fill({ color: p.color, alpha: 0.9 }).stroke({ width: 3, color: p.coreColor, alpha: 0.95 });
      }
    }

    // Update & draw particles
    const g = this.particleGraphics;
    g.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += 1;
      if (p.age >= p.maxAge) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.97;
      p.rotation += p.vRot;

      const life = 1 - p.age / p.maxAge;
      const a = p.alpha * life;

      if (p.shape === 'ring') {
        const radius = p.size + (1 - life) * 58;
        g.circle(p.x, p.y, radius).stroke({ width: 4 * life, color: p.color, alpha: a });
      } else if (p.shape === 'dust') {
        g.circle(p.x, p.y, p.size * (1 + (1 - life) * 0.9)).fill({ color: p.color, alpha: a });
      } else if (p.shape === 'shard') {
        const c = Math.cos(p.rotation);
        const s = Math.sin(p.rotation);
        const r = p.size * (0.5 + life * 0.7);
        g.poly([
          p.x + c * r * 1.9, p.y + s * r * 1.9,
          p.x - s * r * 0.65, p.y + c * r * 0.65,
          p.x - c * r * 1.3, p.y - s * r * 1.3,
          p.x + s * r * 0.65, p.y - c * r * 0.65,
        ]).fill({ color: p.color, alpha: a });
      } else {
        // Spark / ember
        const tailX = p.x - p.vx * 2.2;
        const tailY = p.y - p.vy * 2.2;
        g.moveTo(tailX, tailY)
          .lineTo(p.x, p.y)
          .stroke({ width: Math.max(1.5, p.size * life * 0.7), color: p.color, alpha: a });
      }
    }
  }
}
