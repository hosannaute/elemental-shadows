import { Graphics } from 'pixi.js';
import type { VfxQuality } from '../state/settingsStore';

interface TrailSample {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  width: number;
}

export class RibbonTrail {
  private samples: TrailSample[] = [];
  private readonly graphics: Graphics;
  private readonly maxSamples = 12;

  constructor(graphics: Graphics) {
    this.graphics = graphics;
  }

  public push(x: number, y: number, width = 18, maxAge = 11): void {
    this.samples.push({ x, y, age: 0, maxAge, width });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  public clear(): void {
    this.samples = [];
    this.graphics.clear();
  }

  public tickAndDraw(
    primaryColor: number,
    glowColor: number,
    coreColor: number,
    quality: VfxQuality
  ): void {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      this.samples[i].age += 1;
      if (this.samples[i].age >= this.samples[i].maxAge) {
        this.samples.splice(i, 1);
      }
    }

    const g = this.graphics;
    g.clear();

    if (quality === 'low' || this.samples.length < 2) {
      return;
    }

    const count = this.samples.length;

    // Outer elemental aura ribbon
    this.drawRibbonPass(g, count, 1.55, primaryColor, quality === 'high' ? 0.36 : 0.25);
    // Mid luminous blade ribbon
    this.drawRibbonPass(g, count, 0.92, glowColor, 0.72);
    // Hot white/elemental core ribbon
    if (quality === 'high') {
      this.drawRibbonPass(g, count, 0.38, coreColor, 0.9);
    }
  }

  private drawRibbonPass(
    g: Graphics,
    count: number,
    widthScale: number,
    color: number,
    alpha: number
  ): void {
    const leftPts: number[] = [];
    const rightPts: number[] = [];

    for (let i = 0; i < count; i++) {
      const s = this.samples[i];
      const prev = this.samples[Math.max(0, i - 1)];
      const next = this.samples[Math.min(count - 1, i + 1)];
      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;

      const nx = -dy;
      const ny = dx;

      const t = i / (count - 1); // 0 tail -> 1 tip
      const life = 1 - s.age / s.maxAge;
      const halfW = s.width * widthScale * Math.sin(t * Math.PI * 0.85) * life;

      leftPts.push(s.x + nx * halfW, s.y + ny * halfW);
      rightPts.unshift(s.x - nx * halfW, s.y - ny * halfW);
    }

    const poly = [...leftPts, ...rightPts];
    if (poly.length >= 6) {
      g.poly(poly).fill({ color, alpha });
    }
  }
}
