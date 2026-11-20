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
        { offset: 0, color: 0x090e1c },
        { offset: 0.38, color: 0x1a2742 },
        { offset: 0.72, color: 0x2d3f60 },
        { offset: 0.9, color: 0x1d273d },
        { offset: 1, color: 0x0c101a },
      ],
    });
    g.rect(-140, 0, DESIGN_WIDTH + 280, DESIGN_HEIGHT + 40).fill(skyGrad);

    // Soft atmospheric lunar sky bloom
    const bloomGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(176, 204, 238, 0.36)' },
        { offset: 0.5, color: 'rgba(110, 144, 192, 0.16)' },
        { offset: 1, color: 'rgba(30, 44, 72, 0)' },
      ],
    });
    g.circle(DESIGN_WIDTH * 0.5, 190, 440).fill(bloomGrad);
  }

  private buildMoon(): void {
    const g = new Graphics();
    const mx = DESIGN_WIDTH * 0.5;
    const my = 158;

    // Smooth radial lunar halo
    const haloGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0.25,
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: 'rgba(225, 236, 250, 0.45)' },
        { offset: 0.6, color: 'rgba(172, 198, 230, 0.16)' },
        { offset: 1, color: 'rgba(120, 150, 190, 0)' },
      ],
    });
    g.circle(mx, my, 275).fill(haloGrad);

    // Moon disc with soft spherical shading
    const moonGrad = new FillGradient({
      type: 'radial',
      center: { x: 0.42, y: 0.38 },
      innerRadius: 0.05,
      outerRadius: 0.55,
      colorStops: [
        { offset: 0, color: 0xf4f7fc },
        { offset: 0.72, color: 0xd6e0ec },
        { offset: 1, color: 0xb7c6d8 },
      ],
    });
    g.circle(mx, my, 150).fill(moonGrad);

    // Subtle organic lunar maria
    g.ellipse(mx - 44, my - 24, 38, 28).fill({ color: 0xaab9cc, alpha: 0.22 });
    g.ellipse(mx + 44, my + 18, 44, 34).fill({ color: 0xa4b3c7, alpha: 0.2 });
    g.circle(mx - 12, my + 50, 26).fill({ color: 0xb0bfd1, alpha: 0.18 });
    g.circle(mx + 22, my - 54, 18).fill({ color: 0xb8c7da, alpha: 0.18 });

    this.moonLayer.addChild(g);
  }

  private buildMist(): void {
    const specs = [
      { x: 180, y: 472, w: 560, speed: 0.18 },
      { x: 740, y: 498, w: 620, speed: -0.14 },
      { x: 460, y: 534, w: 720, speed: 0.11 },
    ];
    for (const s of specs) {
      const g = new Graphics();
      const mistGrad = new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: 'rgba(176, 198, 224, 0.2)' },
          { offset: 0.65, color: 'rgba(130, 156, 190, 0.08)' },
          { offset: 1, color: 'rgba(100, 125, 160, 0)' },
        ],
      });
      g.ellipse(0, 0, s.w * 0.5, 62).fill(mistGrad);
      g.position.set(s.x, s.y);
      this.moonLayer.addChild(g);
      this.mists.push({ g, x: s.x, y: s.y, speed: s.speed, width: s.w });
    }
  }

  private buildFarPagodas(): void {
    const g = new Graphics();

    // Distant mountain silhouettes
    g.poly([
      -120, 585,
      110, 405,
      360, 462,
      640, 434,
      940, 392,
      1190, 448,
      1400, 585,
    ]).fill({ color: 0x161f33, alpha: 0.92 });

    // Left multi-tier grand pagoda
    this.drawPagoda(g, 330, 560, 1.06, 0x111726);
    // Mid-left smaller shrine roof
    this.drawPagoda(g, 130, 568, 0.72, 0x0d121f);
    // Right temple spire pagoda
    this.drawPagoda(g, 955, 560, 0.98, 0x111726);
    // Far-right dojo hall roof
    this.drawPagoda(g, 1155, 568, 0.85, 0x0c111d);

    // Courtyard low perimeter stone wall
    g.rect(-120, 520, DESIGN_WIDTH + 240, 66).fill({ color: 0x0d111b, alpha: 0.94 });
    for (let x = 20; x < DESIGN_WIDTH; x += 58) {
      g.rect(x, 496, 8, 28).fill({ color: 0x101624 });
    }
    g.rect(-120, 502, DESIGN_WIDTH + 240, 5).fill({ color: 0x101624 });

    this.farPagodaLayer.addChild(g);
  }

  private drawPagoda(g: Graphics, cx: number, baseY: number, scale: number, color: number): void {
    const tiers = 3;
    let y = baseY;
    for (let i = 0; i < tiers; i++) {
      const w = (180 - i * 36) * scale;
      const h = (58 - i * 8) * scale;
      g.rect(cx - w * 0.34, y - h, w * 0.68, h).fill({ color });
      g.poly([
        cx - w * 0.62, y - h + 6 * scale,
        cx - w * 0.42, y - h - 18 * scale,
        cx, y - h - 28 * scale,
        cx + w * 0.42, y - h - 18 * scale,
        cx + w * 0.62, y - h + 6 * scale,
        cx + w * 0.44, y - h + 2 * scale,
        cx - w * 0.44, y - h + 2 * scale,
      ]).fill({ color });
      y -= h + 14 * scale;
    }
    g.rect(cx - 3 * scale, y - 48 * scale, 6 * scale, 48 * scale).fill({ color });
    g.circle(cx, y - 34 * scale, 7 * scale).fill({ color });
  }

  private drawPineCluster(g: Graphics, cx: number, cy: number, radiusX: number, radiusY: number, color: number): void {
    const blobs = [
      { dx: -0.55, dy: 0.15, rx: 0.48, ry: 0.68 },
      { dx: -0.18, dy: -0.25, rx: 0.56, ry: 0.78 },
      { dx: 0.25, dy: -0.12, rx: 0.52, ry: 0.72 },
      { dx: 0.58, dy: 0.2, rx: 0.42, ry: 0.6 },
      { dx: 0, dy: 0.22, rx: 0.68, ry: 0.58 },
    ];
    for (const b of blobs) {
      g.ellipse(cx + b.dx * radiusX, cy + b.dy * radiusY, b.rx * radiusX, b.ry * radiusY).fill({ color });
    }
  }

  private buildMidTreesAndLanterns(): void {
    const g = new Graphics();

    // Left gnarled bonsai/pine framing edge
    g.poly([
      -34, 585,
      -12, 310,
      24, 185,
      82, 114,
      96, 128,
      54, 206,
      152, 224,
      148, 240,
      46, 236,
      36, 354,
      108, 326,
      104, 340,
      32, 382,
      24, 585,
    ]).fill({ color: 0x070a12 });

    this.drawPineCluster(g, 88, 134, 96, 34, 0x070a12);
    this.drawPineCluster(g, 172, 224, 78, 26, 0x080c15);
    this.drawPineCluster(g, 24, 262, 74, 26, 0x070a12);

    // Right gnarled tree framing edge
    g.poly([
      DESIGN_WIDTH + 34, 585,
      DESIGN_WIDTH + 12, 295,
      DESIGN_WIDTH - 24, 178,
      DESIGN_WIDTH - 96, 114,
      DESIGN_WIDTH - 108, 128,
      DESIGN_WIDTH - 48, 202,
      DESIGN_WIDTH - 148, 234,
      DESIGN_WIDTH - 140, 250,
      DESIGN_WIDTH - 44, 230,
      DESIGN_WIDTH - 34, 585,
    ]).fill({ color: 0x070a12 });

    this.drawPineCluster(g, DESIGN_WIDTH - 96, 132, 94, 34, 0x070a12);
    this.drawPineCluster(g, DESIGN_WIDTH - 168, 228, 76, 26, 0x080c15);

    // Mid-background lantern posts
    g.rect(268, 344, 9, 238).fill({ color: 0x090d16 });
    g.rect(254, 344, 42, 7).fill({ color: 0x090d16 });

    g.rect(996, 348, 9, 234).fill({ color: 0x090d16 });
    g.rect(968, 348, 42, 7).fill({ color: 0x090d16 });

    this.midDojoLayer.addChild(g);

    // Warm hanging amber paper lanterns
    this.addLantern(70, 306, 1.05, 0);
    this.addLantern(288, 372, 0.72, 1.8);
    this.addLantern(976, 374, 0.72, 3.1);
    this.addLantern(1214, 304, 1.08, 4.4);
  }

  private addLantern(x: number, y: number, scale: number, phase: number): void {
    const c = new Container();
    c.position.set(x, y);
    const g = new Graphics();

    // Smooth radial warm amber lantern glow
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
    g.roundRect(-11 * scale, 19 * scale, 22 * scale, 28 * scale, 6 * scale).fill({ color: 0xffe48c, alpha: 0.94 });
    g.moveTo(-6 * scale, 16 * scale).lineTo(-6 * scale, 50 * scale).stroke({ width: 1.5, color: 0x803708, alpha: 0.55 });
    g.moveTo(6 * scale, 16 * scale).lineTo(6 * scale, 50 * scale).stroke({ width: 1.5, color: 0x803708, alpha: 0.55 });
    g.roundRect(-12 * scale, 50 * scale, 24 * scale, 5 * scale, 2).fill({ color: 0x0b0e17 });
    g.rect(-1.5, 55 * scale, 3, 12 * scale).fill({ color: 0xb34d12 });

    c.addChild(g);
    this.midDojoLayer.addChild(c);
    this.lanterns.push({ container: c, baseX: x, baseY: y, phase, scale });
  }

  private buildFloor(): void {
    const g = this.floorLayer;
    // Main arena cobblestone ground plane
    g.rect(-140, GROUND_Y, DESIGN_WIDTH + 280, DESIGN_HEIGHT - GROUND_Y + 60).fill({ color: 0x111622 });
    // Soft moonlit sheen near combat line
    g.ellipse(DESIGN_WIDTH * 0.5, GROUND_Y + 26, 560, 42).fill({ color: 0x2b3a54, alpha: 0.42 });
    // Top arena edge line
    g.moveTo(-140, GROUND_Y).lineTo(DESIGN_WIDTH + 140, GROUND_Y).stroke({ width: 2, color: 0x455a7d, alpha: 0.55 });

    // Perspective cobblestone cracks/tiles
    for (let i = -2; i <= 14; i++) {
      const topX = i * 100;
      const botX = DESIGN_WIDTH * 0.5 + (topX - DESIGN_WIDTH * 0.5) * 1.45;
      g.moveTo(topX, GROUND_Y)
        .lineTo(botX, DESIGN_HEIGHT + 30)
        .stroke({ width: 1.5, color: 0x080b12, alpha: 0.65 });
    }
    const rows = [GROUND_Y + 20, GROUND_Y + 46, GROUND_Y + 80, GROUND_Y + 120];
    for (const ry of rows) {
      g.moveTo(-140, ry)
        .lineTo(DESIGN_WIDTH + 140, ry)
        .stroke({ width: 1.5, color: 0x080b12, alpha: 0.55 });
    }
  }

  private buildForegroundFrames(): void {
    // Dark atmospheric bottom vignette so touch controls pop effortlessly
    const g = new Graphics();
    g.rect(0, DESIGN_HEIGHT - 84, DESIGN_WIDTH, 84).fill({ color: 0x05070c, alpha: 0.48 });
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
