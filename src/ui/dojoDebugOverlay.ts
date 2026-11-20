import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Fighter } from '../combat/fighterStateMachine';
import type { ElementalProjectile } from '../combat/hitboxSystem';
import type { FloorHazard } from '../elements/statusEffects';

export class DojoDebugOverlay {
  public readonly worldContainer = new Container();
  public readonly hudContainer = new Container();
  private readonly boxGraphics = new Graphics();
  private readonly infoText: Text;
  private enabled = false;

  constructor() {
    this.worldContainer.addChild(this.boxGraphics);
    const style = new TextStyle({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12,
      fill: '#b8f7ff',
      stroke: { color: '#04070d', width: 3 },
      lineHeight: 16,
    });
    this.infoText = new Text({ text: '', style });
    this.infoText.position.set(16, 114);
    this.hudContainer.addChild(this.infoText);
    this.setEnabled(false);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.worldContainer.visible = enabled;
    this.hudContainer.visible = enabled;
    if (!enabled) {
      this.boxGraphics.clear();
      this.infoText.text = '';
    }
  }

  public update(
    p1: Fighter,
    p2: Fighter,
    projectiles: ElementalProjectile[],
    hazards: FloorHazard[],
    fps: number,
    hitstopFrames: number,
    simFrame: number
  ): void {
    if (!this.enabled) return;

    const g = this.boxGraphics;
    g.clear();

    this.drawFighterBoxes(g, p1);
    this.drawFighterBoxes(g, p2);

    // Projectile hitboxes
    for (const p of projectiles) {
      g.rect(p.x - p.width * 0.5, p.y - p.height * 0.5, p.width, p.height)
        .fill({ color: 0xff42e8, alpha: 0.22 })
        .stroke({ width: 2, color: 0xff42e8, alpha: 0.95 });
    }

    // Floor hazard boxes
    for (const h of hazards) {
      g.rect(h.x - h.halfWidth, 566, h.halfWidth * 2, 24)
        .fill({ color: 0xff5a1a, alpha: 0.24 })
        .stroke({ width: 2, color: 0xff9d2e, alpha: 0.95 });
    }

    const dist = Math.round(Math.abs(p1.x - p2.x));
    this.infoText.text = [
      `DOJO DEBUG | FPS: ${fps.toFixed(0)} | TICK: ${simFrame} | HITSTOP: ${hitstopFrames}f | DIST: ${dist}px`,
      `P1 [${p1.element.fighterName}] ${p1.state.toUpperCase()} f:${p1.stateFrame} iF:${p1.invulnFrames} HP:${Math.round(p1.hp)} MAG:${Math.round(p1.magic)}%`,
      `P2 [${p2.element.fighterName}] ${p2.state.toUpperCase()} f:${p2.stateFrame} iF:${p2.invulnFrames} HP:${Math.round(p2.hp)} MAG:${Math.round(p2.magic)}%`,
    ].join('\n');
  }

  private drawFighterBoxes(g: Graphics, f: Fighter): void {
    // Pushbox (amber)
    const pb = f.getPushbox();
    g.rect(pb.x, pb.y, pb.w, pb.h).stroke({ width: 1.5, color: 0xffc845, alpha: 0.7 });

    // Hurtbox (green, or cyan when invulnerable!)
    const hb = f.getHurtbox();
    const hurtColor = f.isInvulnerable() ? 0x35f0ff : 0x38e57d;
    g.rect(hb.x, hb.y, hb.w, hb.h)
      .fill({ color: hurtColor, alpha: f.isInvulnerable() ? 0.28 : 0.14 })
      .stroke({ width: 2, color: hurtColor, alpha: 0.92 });

    // Active Hitbox (crimson red)
    const atk = f.getActiveHitbox();
    if (atk) {
      g.rect(atk.box.x, atk.box.y, atk.box.w, atk.box.h)
        .fill({ color: 0xff2e44, alpha: 0.28 })
        .stroke({ width: 2.5, color: 0xff3b52, alpha: 1 });
    }
  }
}
