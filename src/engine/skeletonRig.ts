import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { Fighter } from '../combat/fighterStateMachine';
import type { ElementProfile, WeaponType } from '../elements/elementRegistry';
import { RibbonTrail } from '../elements/ribbonTrails';
import type { ElementalVfxSystem } from '../elements/elementalShaders';
import type { VfxQuality } from '../state/settingsStore';

interface RigPose {
  pelvisY: number; // offset from foot ground (negative = higher)
  pelvisRot: number;
  torsoRot: number;
  headRot: number;
  // Front arm (right side in facing=1)
  fShoulder: number;
  fElbow: number;
  fWeaponRot: number;
  // Back arm (left side in facing=1)
  bShoulder: number;
  bElbow: number;
  bWeaponRot: number;
  // Front leg
  fHip: number;
  fKnee: number;
  // Back leg
  bHip: number;
  bKnee: number;
}

const NEUTRAL_POSE: RigPose = {
  pelvisY: -86,
  pelvisRot: 0.04,
  torsoRot: 0.14,
  headRot: -0.08,
  fShoulder: -0.82,
  fElbow: -1.15,
  fWeaponRot: 0.35,
  bShoulder: 0.45,
  bElbow: -1.35,
  bWeaponRot: -0.4,
  fHip: -0.44,
  fKnee: 0.46,
  bHip: 0.42,
  bKnee: 0.44,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cubicEaseOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function blendPose(a: RigPose, b: RigPose, t: number): RigPose {
  const e = cubicEaseOut(t);
  return {
    pelvisY: lerp(a.pelvisY, b.pelvisY, e),
    pelvisRot: lerp(a.pelvisRot, b.pelvisRot, e),
    torsoRot: lerp(a.torsoRot, b.torsoRot, e),
    headRot: lerp(a.headRot, b.headRot, e),
    fShoulder: lerp(a.fShoulder, b.fShoulder, e),
    fElbow: lerp(a.fElbow, b.fElbow, e),
    fWeaponRot: lerp(a.fWeaponRot, b.fWeaponRot, e),
    bShoulder: lerp(a.bShoulder, b.bShoulder, e),
    bElbow: lerp(a.bElbow, b.bElbow, e),
    bWeaponRot: lerp(a.bWeaponRot, b.bWeaponRot, e),
    fHip: lerp(a.fHip, b.fHip, e),
    fKnee: lerp(a.fKnee, b.fKnee, e),
    bHip: lerp(a.bHip, b.bHip, e),
    bKnee: lerp(a.bKnee, b.bKnee, e),
  };
}

interface AfterimageGhost {
  g: Graphics;
  age: number;
  maxAge: number;
}

export class FighterSkeletonRig {
  public readonly root = new Container();
  public readonly trailLayer = new Container();
  public readonly afterimageLayer = new Container();

  private readonly bodyContainer = new Container();
  private readonly pelvis = new Container();
  private readonly torso = new Container();
  private readonly head = new Container();

  private readonly fShoulder = new Container();
  private readonly fElbow = new Container();
  private readonly fWeapon = new Container();

  private readonly bShoulder = new Container();
  private readonly bElbow = new Container();
  private readonly bWeapon = new Container();

  private readonly fHip = new Container();
  private readonly fKnee = new Container();
  private readonly fFoot = new Container();

  private readonly bHip = new Container();
  private readonly bKnee = new Container();
  private readonly bFoot = new Container();

  private readonly ponytailGraphic = new Graphics();
  private readonly sashGraphic = new Graphics();
  private readonly markerContainer = new Container();

  private readonly weaponTrailGraphics = new Graphics();
  private readonly limbTrailGraphics = new Graphics();
  public readonly weaponTrail: RibbonTrail;
  public readonly limbTrail: RibbonTrail;

  private currentPose: RigPose = { ...NEUTRAL_POSE };
  private ponytailAngle = 0;
  private ponytailVel = 0;
  private sashAngle = 0;
  private sashVel = 0;
  private lastX = 0;
  private element: ElementProfile;
  private ghosts: AfterimageGhost[] = [];
  private sideId: 'p1' | 'p2';

  constructor(sideId: 'p1' | 'p2', element: ElementProfile) {
    this.sideId = sideId;
    this.element = element;

    this.weaponTrail = new RibbonTrail(this.weaponTrailGraphics);
    this.limbTrail = new RibbonTrail(this.limbTrailGraphics);
    this.trailLayer.addChild(this.weaponTrailGraphics);
    this.trailLayer.addChild(this.limbTrailGraphics);

    // Parent-child bone hierarchy: pelvis -> torso -> shoulder -> elbow -> hand -> weapon
    this.root.addChild(this.bodyContainer);
    this.root.addChild(this.markerContainer);

    this.bodyContainer.addChild(this.pelvis);

    // Back limbs behind torso
    this.pelvis.addChild(this.bHip);
    this.bHip.position.set(-4, 4);
    this.bHip.addChild(this.bKnee);
    this.bKnee.position.set(0, 43);
    this.bKnee.addChild(this.bFoot);
    this.bFoot.position.set(0, 43);

    this.pelvis.addChild(this.torso);
    this.torso.position.set(0, -4);

    // Back arm attached to torso shoulder
    this.torso.addChild(this.bShoulder);
    this.bShoulder.position.set(-4, -50);
    this.bShoulder.addChild(this.bElbow);
    this.bElbow.position.set(0, 32);
    this.bElbow.addChild(this.bWeapon);
    this.bWeapon.position.set(0, 30);

    // Sash attached to pelvis
    this.pelvis.addChild(this.sashGraphic);

    // Head + ponytail attached to top of torso
    this.torso.addChild(this.head);
    this.head.position.set(2, -62);
    this.head.addChild(this.ponytailGraphic);

    // Front leg in front of torso
    this.pelvis.addChild(this.fHip);
    this.fHip.position.set(5, 4);
    this.fHip.addChild(this.fKnee);
    this.fKnee.position.set(0, 43);
    this.fKnee.addChild(this.fFoot);
    this.fFoot.position.set(0, 43);

    // Front arm in front
    this.torso.addChild(this.fShoulder);
    this.fShoulder.position.set(6, -50);
    this.fShoulder.addChild(this.fElbow);
    this.fElbow.position.set(0, 32);
    this.fElbow.addChild(this.fWeapon);
    this.fWeapon.position.set(0, 30);

    this.rebuildGeometry(element);
    this.buildPlayerMarker();
  }

  private buildPlayerMarker(): void {
    this.markerContainer.removeChildren();
    const color = this.sideId === 'p1' ? 0xff7033 : 0x4be3ff;
    const style = new TextStyle({
      fontFamily: 'Cinzel, Georgia, serif',
      fontSize: 16,
      fontWeight: '800',
      fill: this.sideId === 'p1' ? '#ff9d5c' : '#7aefff',
      stroke: { color: '#05070d', width: 4 },
      letterSpacing: 1,
    });
    const label = new Text({ text: this.sideId === 'p1' ? 'P1' : 'P2', style });
    label.anchor.set(0.5, 1);
    label.position.set(0, -14);

    const tri = new Graphics();
    tri.poly([-7, -10, 7, -10, 0, -2]).fill({ color }).stroke({ width: 1.5, color: 0x05070c });

    this.markerContainer.addChild(label);
    this.markerContainer.addChild(tri);
    this.markerContainer.position.set(0, -230);
    this.bodyContainer.scale.set(1.18, 1.18);
  }

  public rebuildGeometry(element: ElementProfile, vfx?: ElementalVfxSystem): void {
    this.element = element;
    const rim = element.glowColor;
    const core = element.coreColor;
    const bodyFill = 0x05070c;

    // Helper to clear graphics children while preserving bone Container children
    const replaceMesh = (bone: Container, draw: (g: Graphics) => void): void => {
      for (let i = bone.children.length - 1; i >= 0; i--) {
        if (bone.children[i].label === 'mesh') {
          bone.removeChildAt(i);
        }
      }
      const g = new Graphics();
      g.label = 'mesh';
      draw(g);
      bone.addChildAt(g, 0);
    };

    // Pelvis joint bridge (seamless hips & martial arts hakama skirt)
    replaceMesh(this.pelvis, (g) => {
      g.poly([-15, -6, 15, -6, 19, 15, -19, 15]).fill({ color: bodyFill });
    });

    // Torso (realistic Bézier-sculpted athletic human torso, chest, back, neck)
    replaceMesh(this.torso, (g) => {
      g.moveTo(-12, 4)
        .bezierCurveTo(-15, -10, -17, -26, -21, -46)
        .quadraticCurveTo(-22, -57, -10, -60)
        .lineTo(-6, -68)
        .lineTo(6, -68)
        .quadraticCurveTo(17, -60, 21, -48)
        .bezierCurveTo(23, -34, 17, -18, 13, 4)
        .closePath()
        .fill({ color: bodyFill });
    });

    // Head (realistic human cranium, brow ridge, nose, chin, jawline, headband knot & eyes)
    replaceMesh(this.head, (g) => {
      g.moveTo(-12, -14)
        .bezierCurveTo(-13, -27, -4, -31, 4, -29)
        .quadraticCurveTo(12, -26, 13, -19)
        .lineTo(15.5, -14)
        .lineTo(13, -11)
        .lineTo(13.5, -7)
        .quadraticCurveTo(8, -2, -2, -3)
        .quadraticCurveTo(-11, -5, -12, -14)
        .closePath()
        .fill({ color: bodyFill });
      g.ellipse(-12, -21, 3.5, 4.5).fill({ color: bodyFill });
      g.poly([4, -18.5, 11.5, -17.5, 7, -15]).fill({ color: core, alpha: 0.98 });
    });

    // Realistic muscular arms (deltoid -> curved bicep -> tapered forearm -> sculpted fist)
    const drawArmUpper = (g: Graphics): void => {
      g.circle(0, 0, 8.2).fill({ color: bodyFill });
      g.moveTo(-7.8, 0)
        .bezierCurveTo(-9.5, 11, -8, 22, -5.8, 32)
        .lineTo(6.2, 32)
        .bezierCurveTo(9.5, 20, 9.5, 10, 7.8, 0)
        .closePath()
        .fill({ color: bodyFill });
      g.circle(0, 32, 6).fill({ color: bodyFill });
    };
    const drawArmLower = (g: Graphics): void => {
      g.circle(0, 0, 6).fill({ color: bodyFill });
      g.moveTo(-6, 0)
        .bezierCurveTo(-7.5, 8, -5.8, 20, -3.8, 30)
        .lineTo(4.2, 30)
        .bezierCurveTo(6.8, 18, 7.5, 8, 6, 0)
        .closePath()
        .fill({ color: bodyFill });
      g.ellipse(1, 33, 5.8, 6.6).fill({ color: bodyFill });
    };
    replaceMesh(this.fShoulder, drawArmUpper);
    replaceMesh(this.bShoulder, drawArmUpper);
    replaceMesh(this.fElbow, drawArmLower);
    replaceMesh(this.bElbow, drawArmLower);

    // Realistic martial arts legs (hakama thighs -> sculpted curved calves -> arched tabi feet)
    const drawThigh = (g: Graphics): void => {
      g.circle(0, 0, 11).fill({ color: bodyFill });
      g.moveTo(-12.5, 0)
        .bezierCurveTo(-15.5, 14, -13, 30, -8.5, 43)
        .lineTo(9.5, 43)
        .bezierCurveTo(15, 28, 15.5, 14, 12, 0)
        .closePath()
        .fill({ color: bodyFill });
      g.circle(0, 43, 8).fill({ color: bodyFill });
    };
    const drawShin = (g: Graphics): void => {
      g.circle(0, 0, 8).fill({ color: bodyFill });
      g.moveTo(-7.5, 0)
        .bezierCurveTo(-11.5, 12, -9.5, 25, -4.5, 43)
        .lineTo(4.8, 43)
        .bezierCurveTo(7.2, 26, 8.2, 12, 7.5, 0)
        .closePath()
        .fill({ color: bodyFill });
      g.circle(0, 43, 4.8).fill({ color: bodyFill });
    };
    const drawFoot = (g: Graphics): void => {
      g.moveTo(-6, -2)
        .quadraticCurveTo(6, -1, 18, 4)
        .quadraticCurveTo(21, 7.5, 16, 8.5)
        .quadraticCurveTo(5, 7, -6.5, 8)
        .quadraticCurveTo(-8, 4, -6, -2)
        .closePath()
        .fill({ color: bodyFill });
    };
    replaceMesh(this.fHip, drawThigh);
    replaceMesh(this.bHip, drawThigh);
    replaceMesh(this.fKnee, drawShin);
    replaceMesh(this.bKnee, drawShin);
    replaceMesh(this.fFoot, drawFoot);
    replaceMesh(this.bFoot, drawFoot);

    // Signature Weapons (Front hand + optional off-hand dual weapon!)
    replaceMesh(this.fWeapon, (g) => this.drawWeapon(g, element.weaponType, rim, core, true));
    replaceMesh(this.bWeapon, (g) => this.drawWeapon(g, element.weaponType, rim, core, false));

    if (vfx) {
      this.applyQualityFilters(vfx);
    }
  }

  public applyQualityFilters(vfx: ElementalVfxSystem): void {
    this.bodyContainer.filters = vfx.createFighterGlow(this.element.glowColor);
  }

  private drawWeapon(
    g: Graphics,
    type: WeaponType,
    rim: number,
    core: number,
    isPrimaryHand: boolean
  ): void {
    const dualHand = type === 'dual_katana' || type === 'twin_sai' || type === 'shadow_sickles';
    if (!isPrimaryHand && !dualHand) return;

    if (type === 'dual_katana') {
      // Curved glowing katana blade
      g.rect(-2.5, -16, 5, 20).fill({ color: 0x0b0d14 }).stroke({ width: 1, color: rim });
      g.rect(-8, -1, 16, 4).fill({ color: rim });
      g.moveTo(0, 2)
        .quadraticCurveTo(8, 44, 15, 92)
        .lineTo(8, 86)
        .quadraticCurveTo(2, 42, -3.5, 2)
        .closePath()
        .fill({ color: 0x09090f })
        .stroke({ width: 2.2, color: rim });
      g.moveTo(1.5, 5)
        .quadraticCurveTo(7.5, 44, 13.5, 89)
        .stroke({ width: 1.6, color: core, alpha: 0.92 });
    } else if (type === 'liquid_staff') {
      g.roundRect(-3.5, -48, 7, 154, 3).fill({ color: 0x0a1019 }).stroke({ width: 2.2, color: rim });
      g.moveTo(0, -44).lineTo(0, 102).stroke({ width: 1.5, color: core, alpha: 0.78 });
      // Crescent tip
      g.poly([0, 102, 16, 114, 0, 122, -6, 108]).fill({ color: rim, alpha: 0.9 });
    } else if (type === 'great_hammer') {
      // Sculpted octagonal warhammer with pommel spike, collar, beveled head & glowing rune
      g.rect(-3.5, -24, 7, 94).fill({ color: 0x0c0b0a }).stroke({ width: 1.8, color: rim });
      g.poly([-5, -24, 5, -24, 0, -34]).fill({ color: 0x0c0b0a }).stroke({ width: 1.5, color: rim });
      g.roundRect(-7, 58, 14, 10, 2).fill({ color: rim });
      g.poly([
        -24, 68, -16, 62, 16, 62, 24, 68,
        24, 94, 16, 100, -16, 100, -24, 94,
      ])
        .fill({ color: 0x0a0a0d })
        .stroke({ width: 2.6, color: rim });
      g.poly([-8, 81, 0, 72, 8, 81, 0, 90]).fill({ color: core, alpha: 0.92 });
      g.moveTo(-20, 81).lineTo(-10, 81).moveTo(10, 81).lineTo(20, 81).stroke({ width: 2, color: rim });
    } else if (type === 'twin_sai') {
      g.rect(-2, -12, 4, 16).fill({ color: 0x080c0d });
      g.moveTo(-12, 14).quadraticCurveTo(-12, 2, 0, 2).quadraticCurveTo(12, 2, 12, 14)
        .stroke({ width: 3, color: rim });
      g.poly([-3, 2, 3, 2, 0, 62]).fill({ color: 0x090f12 }).stroke({ width: 2, color: core });
    } else if (type === 'nunchaku') {
      g.roundRect(-3.5, 0, 7, 34, 2).fill({ color: 0x0b0c12 }).stroke({ width: 2, color: rim });
      g.moveTo(0, 34).lineTo(6, 48).lineTo(-2, 58).stroke({ width: 2.4, color: core });
      g.roundRect(-5, 56, 7, 36, 2).fill({ color: 0x0b0c12 }).stroke({ width: 2, color: rim });
    } else if (type === 'naginata') {
      g.rect(-3, -42, 6, 114).fill({ color: 0x080f18 }).stroke({ width: 1.8, color: rim });
      g.poly([-3, 70, 5, 70, 14, 104, 4, 126, -4, 100])
        .fill({ color: 0x0b1724 })
        .stroke({ width: 2.4, color: rim });
      g.moveTo(2, 74).lineTo(11, 104).lineTo(4, 122).stroke({ width: 1.8, color: core });
    } else if (type === 'shadow_sickles') {
      g.rect(-2.5, -10, 5, 36).fill({ color: 0x080712 }).stroke({ width: 1.5, color: rim });
      g.moveTo(0, 24)
        .quadraticCurveTo(38, 30, 44, 62)
        .quadraticCurveTo(22, 48, -2, 34)
        .closePath()
        .fill({ color: 0x070611 })
        .stroke({ width: 2.2, color: rim });
    } else {
      // Heavy Molten Cleaver
      g.rect(-3.5, -18, 7, 30).fill({ color: 0x0d0909 }).stroke({ width: 1.5, color: rim });
      g.poly([-4, 10, 14, 14, 24, 86, 6, 102, -6, 94])
        .fill({ color: 0x0e0809 })
        .stroke({ width: 2.6, color: rim });
      g.moveTo(12, 16).lineTo(22, 85).lineTo(7, 98).stroke({ width: 2, color: core });
    }
  }

  public sync(fighter: Fighter, quality: VfxQuality, freezeSkeleton: boolean): void {
    this.root.position.set(fighter.x, fighter.y);
    this.bodyContainer.scale.x = fighter.facing * 1.18;

    // Preserve solid pitch-black ink silhouette even during hit-flash or i-frames
    this.bodyContainer.alpha = 1;

    // Track P1/P2 indicator tightly above the fighter's actual head posture
    const targetMarkerY =
      fighter.state === 'grounded' || fighter.state === 'ko'
        ? -78
        : fighter.state === 'knockdown_air'
        ? -128
        : fighter.state === 'crouch' ||
          fighter.state === 'block_low' ||
          fighter.state === 'roll_fwd' ||
          fighter.state === 'roll_back'
        ? -158
        : -230;
    this.markerContainer.y += (targetMarkerY - this.markerContainer.y) * 0.28;

    if (!freezeSkeleton) {
      const targetPose = this.computeTargetPose(fighter);
      const blendRate = fighter.state === 'attack' ? 0.56 : 0.32;
      this.currentPose = blendPose(this.currentPose, targetPose, blendRate);
      this.applyPose(this.currentPose);
      this.updateSecondaryMotion(fighter);
    }

    // Update trailing weapon & limb ribbons
    const weaponTip = this.getBoneWorldPos(this.fWeapon, 0, 88);
    const shouldEmitWeaponTrail =
      fighter.state === 'attack' &&
      fighter.currentMove?.isWeapon &&
      fighter.stateFrame >= Math.max(2, fighter.moveStartupFrames - 4) &&
      fighter.stateFrame <= fighter.moveStartupFrames + fighter.moveActiveFrames + 6;

    if (shouldEmitWeaponTrail) {
      this.weaponTrail.push(weaponTip.x, weaponTip.y, 24, 11);
    } else if (fighter.state === 'attack' && fighter.currentMove?.id === 'magic_cast') {
      const handTip = this.getBoneWorldPos(this.fElbow, 0, 32);
      this.weaponTrail.push(handTip.x, handTip.y, 20, 10);
    }

    const shouldEmitLimbTrail =
      fighter.state === 'attack' &&
      fighter.currentMove &&
      !fighter.currentMove.isWeapon &&
      fighter.stateFrame >= Math.max(1, fighter.moveStartupFrames - 2) &&
      fighter.stateFrame <= fighter.moveStartupFrames + fighter.moveActiveFrames + 4;

    if (shouldEmitLimbTrail && fighter.currentMove) {
      const bone =
        fighter.currentMove.trailBone === 'rightFoot'
          ? this.fFoot
          : fighter.currentMove.trailBone === 'leftFoot'
          ? this.bFoot
          : fighter.currentMove.trailBone === 'leftHand'
          ? this.bElbow
          : this.fElbow;
      const tip = this.getBoneWorldPos(bone, 0, 24);
      this.limbTrail.push(tip.x, tip.y, 15, 9);
    }

    this.weaponTrail.tickAndDraw(
      this.element.primaryColor,
      this.element.glowColor,
      this.element.coreColor,
      quality
    );
    this.limbTrail.tickAndDraw(
      this.element.primaryColor,
      this.element.glowColor,
      this.element.coreColor,
      quality
    );

    // Spawn silhouette afterimages during dashes, rolls, wall jumps, shadow step
    if (fighter.afterimageTimer > 0 && fighter.stateFrame % 3 === 0 && quality !== 'low') {
      this.spawnAfterimage(fighter);
    }
    this.updateAfterimages();
  }

  private spawnAfterimage(fighter: Fighter): void {
    const g = new Graphics();
    g.ellipse(0, -90, 22, 58).fill({ color: this.element.glowColor, alpha: 0.32 });
    g.circle(0, -155, 13).fill({ color: this.element.primaryColor, alpha: 0.36 });
    g.position.set(fighter.x, fighter.y);
    this.afterimageLayer.addChild(g);
    this.ghosts.push({ g, age: 0, maxAge: 14 });
  }

  private updateAfterimages(): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.age += 1;
      gh.g.alpha = Math.max(0, 1 - gh.age / gh.maxAge);
      if (gh.age >= gh.maxAge) {
        this.afterimageLayer.removeChild(gh.g);
        gh.g.destroy();
        this.ghosts.splice(i, 1);
      }
    }
  }

  private getBoneWorldPos(bone: Container, localX: number, localY: number): { x: number; y: number } {
    const pt = bone.toGlobal({ x: localX, y: localY });
    // Convert from app global to root parent (worldContainer) local coordinates
    if (this.root.parent) {
      const local = this.root.parent.toLocal(pt);
      return { x: local.x, y: local.y };
    }
    return { x: pt.x, y: pt.y };
  }

  private applyPose(p: RigPose): void {
    this.pelvis.position.set(0, p.pelvisY);
    this.pelvis.rotation = p.pelvisRot;
    this.torso.rotation = p.torsoRot;
    this.head.rotation = p.headRot;

    this.fShoulder.rotation = p.fShoulder;
    this.fElbow.rotation = p.fElbow;
    this.fWeapon.rotation = p.fWeaponRot;

    this.bShoulder.rotation = p.bShoulder;
    this.bElbow.rotation = p.bElbow;
    this.bWeapon.rotation = p.bWeaponRot;

    this.fHip.rotation = p.fHip;
    this.fKnee.rotation = p.fKnee;
    this.bHip.rotation = p.bHip;
    this.bKnee.rotation = p.bKnee;

    // Ground IK ankle leveling so feet plant cleanly on cobblestones
    this.fFoot.rotation = -(p.pelvisRot + p.fHip + p.fKnee) * 0.85;
    this.bFoot.rotation = -(p.pelvisRot + p.bHip + p.bKnee) * 0.85;
  }

  private updateSecondaryMotion(fighter: Fighter): void {
    const dx = (fighter.x - this.lastX) * fighter.facing;
    this.lastX = fighter.x;

    // Spring-damped ponytail & waist sash reacting to velocity + ambient dojo breeze
    const targetTail = 0.28 - Math.max(-0.8, Math.min(0.8, dx * 0.08)) + Math.sin(fighter.stateFrame * 0.14) * 0.15;
    this.ponytailVel += (targetTail - this.ponytailAngle) * 0.18;
    this.ponytailVel *= 0.78;
    this.ponytailAngle += this.ponytailVel;

    const targetSash = 0.42 - Math.max(-0.8, Math.min(0.8, dx * 0.07)) + Math.cos(fighter.stateFrame * 0.12) * 0.14;
    this.sashVel += (targetSash - this.sashAngle) * 0.15;
    this.sashVel *= 0.8;
    this.sashAngle += this.sashVel;

    // Draw flowing ponytail & headband tails
    const pg = this.ponytailGraphic;
    pg.clear();
    const tailLen = 40;
    const tx = -11 - Math.cos(this.ponytailAngle) * tailLen;
    const ty = -17 + Math.sin(this.ponytailAngle) * tailLen;
    pg.moveTo(-9, -20)
      .quadraticCurveTo(-26, -24 + this.ponytailAngle * 10, tx, ty)
      .quadraticCurveTo(-22, -10 + this.ponytailAngle * 12, -10, -11)
      .closePath()
      .fill({ color: 0x05070c });

    // Draw flowing waist sash ribbons
    const sg = this.sashGraphic;
    sg.clear();
    const sx = -12 - Math.cos(this.sashAngle) * 44;
    const sy = 12 + Math.sin(this.sashAngle) * 30;
    sg.moveTo(-10, -2)
      .quadraticCurveTo(-26, 8 + this.sashAngle * 10, sx, sy)
      .lineTo(sx + 6, sy + 7)
      .quadraticCurveTo(-20, 18 + this.sashAngle * 10, -4, 7)
      .closePath()
      .fill({ color: 0x05070c });
  }

  private computeTargetPose(fighter: Fighter): RigPose {
    const f = fighter.stateFrame;
    const breath = Math.sin(f * 0.09);

    switch (fighter.state) {
      case 'idle':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -86 + breath * 2.5,
          torsoRot: 0.14 + breath * 0.03,
          fShoulder: -0.82 + breath * 0.05,
          bShoulder: 0.45 - breath * 0.04,
        };
      case 'walk_fwd': {
        const cyc = Math.sin(f * 0.24);
        return {
          ...NEUTRAL_POSE,
          pelvisY: -85 + Math.abs(cyc) * 4,
          torsoRot: 0.24,
          fHip: -0.55 + cyc * 0.48,
          fKnee: 0.42 + Math.max(0, -cyc) * 0.45,
          bHip: 0.45 - cyc * 0.48,
          bKnee: 0.42 + Math.max(0, cyc) * 0.45,
          fShoulder: -0.95 - cyc * 0.22,
          bShoulder: 0.35 + cyc * 0.22,
        };
      }
      case 'walk_back': {
        const cyc = Math.sin(f * 0.22);
        return {
          ...NEUTRAL_POSE,
          pelvisY: -86 + Math.abs(cyc) * 3,
          torsoRot: 0.05,
          fHip: -0.38 - cyc * 0.42,
          fKnee: 0.44 + Math.max(0, cyc) * 0.35,
          bHip: 0.38 + cyc * 0.42,
          bKnee: 0.44 + Math.max(0, -cyc) * 0.35,
          fShoulder: -1.1,
          fElbow: -1.35,
        };
      }
      case 'crouch':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -54,
          torsoRot: 0.36,
          fHip: -1.15,
          fKnee: 1.48,
          bHip: 0.32,
          bKnee: 1.35,
          fShoulder: -0.9,
          fElbow: -1.3,
        };
      case 'jump':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -94,
          torsoRot: 0.22,
          fHip: -1.05,
          fKnee: 1.25,
          bHip: 0.52,
          bKnee: 0.92,
          fShoulder: -1.35,
          fElbow: -0.8,
          bShoulder: 0.85,
          bElbow: -0.95,
        };
      case 'wall_jump':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -96,
          pelvisRot: 0.4 + f * 0.28,
          torsoRot: 0.35,
          fHip: -1.2,
          fKnee: 1.4,
          bHip: -0.7,
          bKnee: 1.3,
          fShoulder: -1.6,
          fElbow: -1.1,
        };
      case 'dash_fwd':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -78,
          torsoRot: 0.56,
          fHip: -0.85,
          fKnee: 0.9,
          bHip: 0.85,
          bKnee: 0.35,
          fShoulder: -0.5,
          fElbow: -1.2,
          bShoulder: 0.95,
          bElbow: -0.6,
        };
      case 'back_handspring':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -78 - Math.sin(Math.min(1, f / 16) * Math.PI) * 32,
          pelvisRot: -(f / 18) * Math.PI * 2,
          torsoRot: -0.3,
          fShoulder: -2.4,
          fElbow: -0.2,
          bShoulder: -2.2,
          bElbow: -0.2,
          fHip: 0.2,
          fKnee: 0.4,
          bHip: -0.3,
          bKnee: 0.5,
        };
      case 'roll_fwd':
      case 'roll_back': {
        const dir = fighter.state === 'roll_fwd' ? 1 : -1;
        return {
          ...NEUTRAL_POSE,
          pelvisY: -44,
          pelvisRot: dir * (f / 22) * Math.PI * 2,
          torsoRot: 0.75,
          fHip: -1.45,
          fKnee: 1.75,
          bHip: -1.25,
          bKnee: 1.65,
          fShoulder: -1.3,
          fElbow: -1.5,
          bShoulder: -1.1,
          bElbow: -1.5,
        };
      }
      case 'block_high':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -82,
          torsoRot: -0.06,
          fShoulder: -1.55,
          fElbow: -1.45,
          fWeaponRot: -0.5,
          bShoulder: -1.25,
          bElbow: -1.4,
          fHip: -0.52,
          fKnee: 0.58,
          bHip: 0.5,
          bKnee: 0.5,
        };
      case 'block_low':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -54,
          torsoRot: 0.25,
          fShoulder: -1.2,
          fElbow: -1.5,
          bShoulder: -0.95,
          bElbow: -1.4,
          fHip: -1.15,
          fKnee: 1.5,
          bHip: 0.35,
          bKnee: 1.35,
        };
      case 'hitstun':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -84,
          torsoRot: -0.45,
          headRot: -0.35,
          fShoulder: -0.3,
          fElbow: -0.7,
          bShoulder: 0.75,
          bElbow: -0.6,
          fHip: -0.25,
          fKnee: 0.4,
          bHip: 0.55,
          bKnee: 0.5,
        };
      case 'grabbed':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -72,
          pelvisRot: -0.9 + f * 0.22,
          torsoRot: -0.35,
          headRot: 0.22,
          fShoulder: -0.6,
          fElbow: -0.9,
          bShoulder: 0.7,
          bElbow: -0.8,
          fHip: -0.5,
          fKnee: 0.85,
          bHip: 0.35,
          bKnee: 0.75,
        };
      case 'knockdown_air':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -76,
          pelvisRot: -1.18,
          torsoRot: -0.22,
          fHip: -0.35,
          fKnee: 0.48,
          bHip: 0.2,
          bKnee: 0.56,
          fShoulder: 0.28,
          fElbow: -0.65,
          fWeaponRot: 0.25,
          bShoulder: 0.55,
          bElbow: -0.5,
          bWeaponRot: -0.2,
        };
      case 'grounded':
      case 'ko':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -18,
          pelvisRot: -1.54,
          torsoRot: 0.04,
          headRot: 0.15,
          fHip: -0.08,
          fKnee: 0.25,
          bHip: 0.12,
          bKnee: 0.18,
          fShoulder: 0.18,
          fElbow: -0.32,
          fWeaponRot: 0.45,
          bShoulder: 0.35,
          bElbow: -0.24,
          bWeaponRot: -0.35,
        };
      case 'victory':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -88,
          torsoRot: -0.05,
          fShoulder: -2.55,
          fElbow: -0.35,
          fWeaponRot: 0.1,
          bShoulder: 0.45,
          bElbow: -0.8,
          fHip: -0.35,
          fKnee: 0.35,
          bHip: 0.35,
          bKnee: 0.35,
        };
      case 'attack':
        return this.computeAttackPose(fighter);
      default:
        return NEUTRAL_POSE;
    }
  }

  private computeAttackPose(fighter: Fighter): RigPose {
    const move = fighter.currentMove;
    if (!move) return NEUTRAL_POSE;

    const sf = fighter.stateFrame;
    const isWindup = sf < fighter.moveStartupFrames;
    const isActive = sf >= fighter.moveStartupFrames && sf < fighter.moveStartupFrames + fighter.moveActiveFrames;
    const phase = isWindup ? 'windup' : isActive ? 'active' : 'recover';

    switch (move.id) {
      case 'jab':
      case 'cross':
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, torsoRot: -0.05, fShoulder: -0.35, fElbow: -1.75 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -84,
          torsoRot: 0.34,
          fShoulder: -1.55,
          fElbow: -0.1,
          bShoulder: 0.72,
          bElbow: -1.3,
          fHip: -0.58,
          fKnee: 0.62,
        };
      case 'backfist':
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, torsoRot: -0.35, fShoulder: 0.6, fElbow: -1.2 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -84,
          torsoRot: 0.45,
          fShoulder: -1.65,
          fElbow: -0.08,
          bShoulder: 1.05,
          bElbow: -0.8,
        };
      case 'elbow_strike':
        // Leans torso back during startup to evade high head strikes!
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, pelvisY: -72, torsoRot: -0.45, fShoulder: -0.5, fElbow: -2.1 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -74,
          torsoRot: 0.28,
          fShoulder: -1.45,
          fElbow: -2.05,
          fHip: -0.68,
          fKnee: 0.85,
        };
      case 'high_kick':
      case 'roundhouse':
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, pelvisY: -84, torsoRot: -0.25, fHip: -1.15, fKnee: 1.45 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -86,
          torsoRot: -0.44,
          fHip: -1.95,
          fKnee: 0.12,
          bHip: 0.16,
          bKnee: 0.18,
          fShoulder: 0.35,
          fElbow: -1.2,
          bShoulder: -1.1,
          bElbow: -1.1,
        };
      case 'low_sweep':
      case 'wakeup_sweep':
      case 'sucker_kick':
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, pelvisY: -48, torsoRot: 0.42, fHip: -1.25, fKnee: 1.55 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -44,
          torsoRot: -0.28,
          fHip: -1.35,
          fKnee: 0.12,
          bHip: 0.65,
          bKnee: 1.45,
          fShoulder: 0.65,
          fElbow: -0.4,
          bShoulder: -0.8,
          bElbow: -0.9,
        };
      case 'horse_kick':
        // Ducks low and fires sharp counter kick
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, pelvisY: -58, torsoRot: 0.55, bHip: -0.9, bKnee: 1.5 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -64,
          torsoRot: -0.52,
          bHip: -1.68,
          bKnee: 0.1,
          fHip: 0.22,
          fKnee: 0.72,
          fShoulder: 0.7,
          bShoulder: -0.6,
        };
      case 'back_kick':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -82,
          torsoRot: -0.5,
          fHip: -1.65,
          fKnee: 0.08,
          bHip: 0.32,
          bKnee: 0.32,
          fShoulder: 0.5,
          bShoulder: -0.9,
        };
      case 'weapon_slash_1':
        if (phase === 'windup') {
          return {
            ...NEUTRAL_POSE,
            pelvisY: -82,
            torsoRot: -0.22,
            fShoulder: -2.45,
            fElbow: -0.55,
            fWeaponRot: -0.45,
            bShoulder: -1.45,
            bElbow: -0.75,
          };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -78,
          torsoRot: 0.44,
          fShoulder: -0.48,
          fElbow: -0.15,
          fWeaponRot: 0.75,
          bShoulder: 0.85,
          bElbow: -0.5,
          fHip: -0.72,
          fKnee: 0.78,
          bHip: 0.65,
          bKnee: 0.42,
        };
      case 'weapon_slash_2':
        if (phase === 'windup') {
          return {
            ...NEUTRAL_POSE,
            pelvisY: -78,
            torsoRot: 0.3,
            fShoulder: 0.35,
            fElbow: -0.8,
            fWeaponRot: 0.9,
          };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -86,
          torsoRot: -0.1,
          fShoulder: -2.2,
          fElbow: -0.12,
          fWeaponRot: -0.35,
          bShoulder: -1.4,
          bElbow: -0.4,
          fHip: -0.62,
          fKnee: 0.56,
        };
      case 'weapon_thrust':
        if (phase === 'windup') {
          return {
            ...NEUTRAL_POSE,
            pelvisY: -80,
            torsoRot: -0.16,
            fShoulder: 0.25,
            fElbow: -1.8,
            fWeaponRot: 1.2,
          };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -74,
          torsoRot: 0.48,
          fShoulder: -1.48,
          fElbow: -0.08,
          fWeaponRot: 1.48,
          bShoulder: 1.15,
          bElbow: -0.4,
          fHip: -0.82,
          fKnee: 0.88,
          bHip: 0.78,
          bKnee: 0.25,
        };
      case 'weapon_overhead':
        if (phase === 'windup') {
          return {
            ...NEUTRAL_POSE,
            pelvisY: -90,
            torsoRot: -0.32,
            fShoulder: -2.85,
            fElbow: -0.45,
            fWeaponRot: -0.7,
            bShoulder: -2.55,
            bElbow: -0.55,
          };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -72,
          torsoRot: 0.55,
          fShoulder: -0.55,
          fElbow: -0.1,
          fWeaponRot: 0.85,
          bShoulder: -0.35,
          bElbow: -0.25,
          fHip: -0.84,
          fKnee: 0.95,
          bHip: 0.68,
          bKnee: 0.48,
        };
      case 'air_kick':
      case 'air_weapon':
        return {
          ...NEUTRAL_POSE,
          pelvisY: -92,
          torsoRot: 0.32,
          fShoulder: move.isWeapon ? -0.75 : -1.2,
          fElbow: -0.15,
          fWeaponRot: 0.65,
          fHip: -1.48,
          fKnee: 0.18,
          bHip: 0.45,
          bKnee: 1.1,
        };
      case 'throw_forward':
      case 'throw_back':
      case 'suplex':
        if (phase === 'windup') {
          return { ...NEUTRAL_POSE, pelvisY: -76, torsoRot: 0.4, fShoulder: -1.4, fElbow: -0.5, bShoulder: -1.2, bElbow: -0.5 };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -80,
          torsoRot: move.id === 'throw_forward' ? 0.55 : -0.62,
          fShoulder: move.id === 'throw_forward' ? -0.6 : -2.4,
          fElbow: -0.2,
          bShoulder: move.id === 'throw_forward' ? -0.8 : -2.2,
          bElbow: -0.3,
        };
      case 'magic_cast':
        if (phase === 'windup') {
          return {
            ...NEUTRAL_POSE,
            pelvisY: -82,
            torsoRot: -0.22,
            fShoulder: -0.3,
            fElbow: -1.65,
            bShoulder: -0.5,
            bElbow: -1.65,
          };
        }
        return {
          ...NEUTRAL_POSE,
          pelvisY: -84,
          torsoRot: 0.32,
          fShoulder: -1.55,
          fElbow: -0.08,
          bShoulder: -1.35,
          bElbow: -0.12,
          fHip: -0.68,
          fKnee: 0.72,
          bHip: 0.62,
          bKnee: 0.35,
        };
      default:
        return NEUTRAL_POSE;
    }
  }
}
