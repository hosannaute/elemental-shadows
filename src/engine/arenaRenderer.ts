import { Container, FillGradient, Graphics } from 'pixi.js';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './cameraController';
import { GROUND_Y } from '../combat/fighterStateMachine';

interface LanternNode {
  container: Container;
  baseX: number;
  baseY: number;
  phase: number;
  scale: number;
}

interface MistCloud {
  g: Graphics;
  x: number;
  y: number;
  speed: number;
  width: number;
}

export class ArenaRenderer {
  public readonly bgContainer = new Container();
  public readonly foregroundContainer = new Container();

  private readonly skyLayer = new Graphics();
  private readonly moonLayer = new Container();
  private readonly farPagodaLayer = new Container();
  private readonly midDojoLayer = new Container();
  private readonly floorLayer = new Graphics();
  private readonly ambientGlowLayer = new Graphics();
  private lanterns: LanternNode[] = [];
  private mists: MistCloud[] = [];
  private time = 0;

  constructor() {
    this.bgContainer.addChild(this.skyLayer);
    this.bgContainer.addChild(this.moonLayer);
    this.bgContainer.addChild(this.farPagodaLayer);
    this.bgContainer.addChild(this.midDojoLayer);
    this.bgContainer.addChild(this.floorLayer);
    this.bgContainer.addChild(this.ambientGlowLayer);

    this.buildSky();
    this.buildMoon();
    this.buildMist();
    this.buildFarPagodas();
    this.buildMidTreesAndLanterns();
    this.buildFloor();
    this.buildForegroundFrames();
  }

  private buildSky(): void {
    const g = this.skyLayer;
    const skyGrad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 0xb85e24 },
        { offset: 0.28, color: 0xe4943e },
        { offset: 0.58, color: 0xffcf75 },
        { offset: 0.84, color: 0xffeaad },
        { offset: 1, color: 0xfff4cf },
      ],
    });
    g.rect(-140, 0, DESIGN_WIDTH + 280, GROUND_Y + 4).fill(skyGrad);

    // Radiant golden horizon bloom behind the fighting plane
    const bloomGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(255, 252, 228, 0.72)' },
        { offset: 0.52, color: 'rgba(255, 224, 146, 0.32)' },
        { offset: 1, color: 'rgba(255, 196, 110, 0)' },
      ],
    });
    g.circle(DESIGN_WIDTH * 0.5, 225, 450).fill(bloomGrad);
  }

  private buildMoon(): void {
    const g = new Graphics();
    const mx = DESIGN_WIDTH * 0.5;
    const my = 225;

    const haloGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0.25,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(255, 250, 224, 0.85)' },
        { offset: 0.6, color: 'rgba(255, 216, 132, 0.34)' },
        { offset: 1, color: 'rgba(255, 196, 110, 0)' },
      ],
    });
    g.circle(mx, my, 320).fill(haloGrad);

    const sunGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.45, y: 0.38 },
      innerRadius: 0.05,
      outerRadius: 0.55,
      colorStops: [
        { offset: 0, color: 0xfffef6 },
        { offset: 0.72, color: 0xffefba },
        { offset: 1, color: 0xffd278 },
      ],
    });
    g.circle(mx, my, 158).fill(sunGrad);

    this.moonLayer.addChild(g);
  }

  private buildMist(): void {
    const specs = [
      { x: 180, y: 472, w: 620, speed: 0.18 },
      { x: 740, y: 498, w: 680, speed: -0.14 },
      { x: 460, y: 534, w: 780, speed: 0.11 },
    ];
    for (const s of specs) {
      const g = new Graphics();
      const mistGrad = new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: 'rgba(255, 246, 212, 0.45)' },
          { offset: 0.65, color: 'rgba(255, 234, 178, 0.2)' },
          { offset: 1, color: 'rgba(255, 224, 156, 0)' },
        ],
      });
      g.ellipse(0, 0, s.w * 0.5, 68).fill(mistGrad);
      g.position.set(s.x, s.y);
      this.moonLayer.addChild(g);
      this.mists.push({ g, x: s.x, y: s.y, speed: s.speed, width: s.w });
    }
  }

  private buildFarPagodas(): void {
    const g = new Graphics();

    // Soft distant mountains in warm atmospheric amber haze
    g.poly([
      -120, GROUND_Y,
      130, 392,
      350, 456,
      640, 412,
      930, 382,
      1160, 444,
      1400, GROUND_Y,
    ]).fill({ color: 0xc88446, alpha: 0.9 });

    g.poly([
      -120, GROUND_Y,
      220, 468,
      520, 495,
      840, 454,
      1090, 488,
      1400, GROUND_Y,
    ]).fill({ color: 0xb26e38, alpha: 0.65 });

    this.drawPagoda(g, 270, 558, 0.96, 0x9d5e31);
    this.drawPagoda(g, 105, 566, 0.68, 0xbb7a44);
    this.drawPagoda(g, 1010, 558, 0.94, 0x9d5e31);
    this.drawPagoda(g, 1178, 566, 0.78, 0xbb7a44);

    // Bright luminous horizon mist band right behind fighters for maximum black-ink contrast
    const mistBand = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: 'rgba(255, 244, 205, 0)' },
        { offset: 0.55, color: 'rgba(255, 242, 198, 0.68)' },
        { offset: 1, color: 'rgba(255, 232, 170, 0.82)' },
      ],
    });
    g.rect(-140, 290, DESIGN_WIDTH + 280, GROUND_Y - 290).fill(mistBand);

    // Backlit Shadow Fight 2 Shoji Paper Screen & Veranda Rail
    g.rect(-140, 514, DESIGN_WIDTH + 280, 68).fill({ color: 0xfff5d6, alpha: 0.62 });
    g.rect(-140, 510, DESIGN_WIDTH + 280, 6).fill({ color: 0x683c1c, alpha: 0.58 });
    for (let x = -128; x <= DESIGN_WIDTH + 128; x += 64) {
      g.moveTo(x, 514).lineTo(x, GROUND_Y).stroke({ width: 2, color: 0x683c1c, alpha: 0.55 });
    }
    g.moveTo(-140, 548).lineTo(DESIGN_WIDTH + 140, 548).stroke({ width: 2, color: 0x683c1c, alpha: 0.55 });

    this.farPagodaLayer.addChild(g);
  }

  private drawPagoda(g: Graphics, cx: number, baseY: number, scale: number, color: number): void {
    const tiers = 3;
    let y = baseY;
    for (let i = 0; i < tiers; i++) {
      const w = (176 - i * 36) * scale;
      const h = (52 - i * 8) * scale;
      g.rect(cx - w * 0.34, y - h, w * 0.68, h).fill({ color });
      g.poly([
        cx - w * 0.64, y - h + 6 * scale,
        cx - w * 0.42, y - h - 18 * scale,
        cx, y - h - 28 * scale,
        cx + w * 0.42, y - h - 18 * scale,
        cx + w * 0.64, y - h + 6 * scale,
        cx + w * 0.44, y - h + 2 * scale,
        cx - w * 0.44, y - h + 2 * scale,
      ]).fill({ color });
      y -= h + 13 * scale;
    }
    g.rect(cx - 3 * scale, y - 42 * scale, 6 * scale, 42 * scale).fill({ color });
  }

  private drawPineCluster(g: Graphics, cx: number, cy: number, radiusX: number, radiusY: number, color: number): void {
    const blobs = [
      { dx: -0.45, dy: 0.1, rx: 0.45, ry: 0.65 },
      { dx: 0, dy: -0.2, rx: 0.55, ry: 0.72 },
      { dx: 0.45, dy: 0.12, rx: 0.44, ry: 0.62 },
    ];
    for (const b of blobs) {
      g.ellipse(cx + b.dx * radiusX, cy + b.dy * radiusY, b.rx * radiusX, b.ry * radiusY).fill({ color });
    }
  }

  private buildMidTreesAndLanterns(): void {
    const g = new Graphics();
    const bambooCol = 0x522c14;

    // Graceful bamboo stalks framing ONLY outer arena edges so the fighting horizon stays bright
    const stalks: [number, number][] = [
      [24, 9],
      [56, 7],
      [84, 5],
      [DESIGN_WIDTH - 26, 9],
      [DESIGN_WIDTH - 60, 7],
      [DESIGN_WIDTH - 88, 5],
    ];
    for (const [bx, bw] of stalks) {
      g.rect(bx, 0, bw, GROUND_Y).fill({ color: bambooCol });
      for (let ny = 70; ny < GROUND_Y; ny += 92) {
        g.rect(bx - 1, ny, bw + 2, 2.5).fill({ color: 0xffe8aa, alpha: 0.7 });
      }
    }

    this.drawPineCluster(g, 72, 118, 86, 26, bambooCol);
    this.drawPineCluster(g, 122, 198, 62, 20, bambooCol);
    this.drawPineCluster(g, DESIGN_WIDTH - 76, 118, 86, 26, bambooCol);
    this.drawPineCluster(g, DESIGN_WIDTH - 126, 202, 62, 20, bambooCol);

    this.midDojoLayer.addChild(g);

    // Warm lanterns anchored cleanly to outer bamboo stalks
    this.addLantern(60, 290, 0.96, 0);
    this.addLantern(DESIGN_WIDTH - 56, 290, 0.96, 3.2);
  }

  private addLantern(x: number, y: number, scale: number, phase: number): void {
    const c = new Container();
    c.position.set(x, y);
    const g = new Graphics();

    const glowGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0.05,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(255, 196, 84, 0.5)' },
        { offset: 0.45, color: 'rgba(255, 132, 30, 0.2)' },
        { offset: 1, color: 'rgba(255, 100, 20, 0)' },
      ],
    });
    g.circle(0, 30 * scale, 72 * scale).fill(glowGrad);

    g.rect(-1.5, 0, 3, 12 * scale).fill({ color: 0x090c14 });
    g.roundRect(-13 * scale, 10 * scale, 26 * scale, 6 * scale, 2).fill({ color: 0x0b0e17 });
    g.roundRect(-16 * scale, 15 * scale, 32 * scale, 36 * scale, 9 * scale).fill({ color: 0xff9e2c });
    g.roundRect(-11 * scale, 19 * scale, 22 * scale, 28 * scale, 6 * scale).fill({ color: 0xfff5c2, alpha: 0.94 });
    g.roundRect(-12 * scale, 50 * scale, 24 * scale, 5 * scale, 2).fill({ color: 0x0b0e17 });

    c.addChild(g);
    this.midDojoLayer.addChild(c);
    this.lanterns.push({ container: c, baseX: x, baseY: y, phase, scale });
  }

  private buildFloor(): void {
    const g = this.floorLayer;
    // Rich dark-walnut dojo timber floor contrasting sharply with sunlit golden horizon
    g.rect(-140, GROUND_Y, DESIGN_WIDTH + 280, DESIGN_HEIGHT - GROUND_Y + 60).fill({ color: 0x26170e });
    g.ellipse(DESIGN_WIDTH * 0.5, GROUND_Y + 22, 580, 42).fill({ color: 0xffba5c, alpha: 0.24 });
    g.moveTo(-140, GROUND_Y).lineTo(DESIGN_WIDTH + 140, GROUND_Y).stroke({ width: 3, color: 0xffde96, alpha: 0.65 });

    for (let i = -2; i <= 14; i++) {
      const topX = i * 100;
      const botX = DESIGN_WIDTH * 0.5 + (topX - DESIGN_WIDTH * 0.5) * 1.45;
      g.moveTo(topX, GROUND_Y)
        .lineTo(botX, DESIGN_HEIGHT + 30)
        .stroke({ width: 1.5, color: 0x0a0604, alpha: 0.5 });
    }
    const rows = [GROUND_Y + 20, GROUND_Y + 46, GROUND_Y + 80, GROUND_Y + 120];
    for (const ry of rows) {
      g.moveTo(-140, ry)
        .lineTo(DESIGN_WIDTH + 140, ry)
        .stroke({ width: 1.5, color: 0x0a0604, alpha: 0.45 });
    }
  }

  private buildForegroundFrames(): void {
    const g = new Graphics();
    g.rect(0, DESIGN_HEIGHT - 84, DESIGN_WIDTH, 84).fill({ color: 0x0a0604, alpha: 0.42 });
    this.foregroundContainer.addChild(g);
  }

  public update(
    parallaxX: number,
    p1X: number,
    p1Color: number,
    p2X: number,
    p2Color: number
  ): void {
    this.time += 0.025;

    this.moonLayer.x = -parallaxX * 0.25;
    this.farPagodaLayer.x = -parallaxX * 0.55;
    this.midDojoLayer.x = -parallaxX * 0.85;

    // Gentle mist drift
    for (const m of this.mists) {
      m.x += m.speed;
      if (m.x > DESIGN_WIDTH + 320) m.x = -320;
      if (m.x < -320) m.x = DESIGN_WIDTH + 320;
      m.g.x = m.x;
    }

    // Gentle lantern wind sway & subtle flicker
    for (const l of this.lanterns) {
      l.container.rotation = Math.sin(this.time * 0.9 + l.phase) * 0.055;
      l.container.alpha = 0.92 + Math.sin(this.time * 3.1 + l.phase) * 0.08;
    }

    // Ground elemental ambient reflections under both fighters
    const ag = this.ambientGlowLayer;
    ag.clear();
    ag.ellipse(p1X, GROUND_Y + 6, 98, 16).fill({ color: p1Color, alpha: 0.22 });
    ag.ellipse(p1X, GROUND_Y + 3, 52, 8).fill({ color: 0x020306, alpha: 0.72 });

    ag.ellipse(p2X, GROUND_Y + 6, 98, 16).fill({ color: p2Color, alpha: 0.22 });
    ag.ellipse(p2X, GROUND_Y + 3, 52, 8).fill({ color: 0x020306, alpha: 0.72 });
  }
}
