import { Application, Container } from 'pixi.js';
import { AiController } from '../combat/aiController';
import {
  ARENA_LEFT,
  ARENA_RIGHT,
  Fighter,
  GROUND_Y,
} from '../combat/fighterStateMachine';
import {
  computeIntersectionPoint,
  rectsIntersect,
  type ActiveHitbox,
  type ElementalProjectile,
} from '../combat/hitboxSystem';
import type { ElementId } from '../elements/elementRegistry';
import { ElementalVfxSystem } from '../elements/elementalShaders';
import type { FloorHazard } from '../elements/statusEffects';
import { MatchStateStore } from '../state/matchState';
import { settingsStore, type GameSettings } from '../state/settingsStore';
import { DojoDebugOverlay } from '../ui/dojoDebugOverlay';
import { ArenaRenderer } from './arenaRenderer';
import { AudioMixer } from './audioMixer';
import { CameraController, DESIGN_HEIGHT, DESIGN_WIDTH } from './cameraController';
import { FighterSkeletonRig } from './skeletonRig';

const FIXED_DT = 1 / 60;
const MAX_FRAME_DELTA = 0.1;

export interface EngineCallbacks {
  onHudUpdate: (p1: Fighter, p2: Fighter, match: MatchStateStore) => void;
}

export class ElementalShadowsEngine {
  public readonly app = new Application();
  public readonly match = new MatchStateStore();
  public readonly audio = new AudioMixer();
  public readonly p1: Fighter;
  public readonly p2: Fighter;

  private readonly stageRoot = new Container();
  private readonly worldContainer = new Container();
  private readonly arena = new ArenaRenderer();
  private readonly camera = new CameraController();
  private readonly vfx = new ElementalVfxSystem();
  private readonly debugOverlay = new DojoDebugOverlay();
  private readonly ai = new AiController();

  private p1Rig: FighterSkeletonRig;
  private p2Rig: FighterSkeletonRig;

  private projectiles: ElementalProjectile[] = [];
  private hazards: FloorHazard[] = [];
  private nextProjectileId = 1;
  private nextHazardId = 1;

  private simFrame = 0;
  private hitstopFrames = 0;
  private slowMoFrames = 0;
  private slowMoTick = 0;
  private accumulator = 0;
  private lastRafTime = 0;
  private renderAccumulator = 0;
  private fpsSamples: number[] = [];
  private currentFps = 60;
  private rafId = 0;
  private callbacks: EngineCallbacks;
  private settings: GameSettings;
  private unsubscribeSettings: (() => void) | null = null;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    this.settings = settingsStore.get();
    this.p1 = new Fighter('p1', this.match.p1Element);
    this.p2 = new Fighter('p2', this.match.p2Element);
    this.p1Rig = new FighterSkeletonRig('p1', this.p1.element);
    this.p2Rig = new FighterSkeletonRig('p2', this.p2.element);
  }

  public async init(mountElement: HTMLElement): Promise<void> {
    await this.app.init({
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      backgroundColor: 0x090d18,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });

    this.app.canvas.className = 'game-canvas';
    mountElement.appendChild(this.app.canvas);

    // Build scene hierarchy
    this.app.stage.addChild(this.stageRoot);
    this.stageRoot.addChild(this.worldContainer);
    this.worldContainer.addChild(this.arena.bgContainer);
    this.worldContainer.addChild(this.p1Rig.afterimageLayer);
    this.worldContainer.addChild(this.p2Rig.afterimageLayer);
    this.worldContainer.addChild(this.p1Rig.trailLayer);
    this.worldContainer.addChild(this.p2Rig.trailLayer);
    this.worldContainer.addChild(this.p1Rig.root);
    this.worldContainer.addChild(this.p2Rig.root);
    this.worldContainer.addChild(this.vfx.worldLayer);
    this.worldContainer.addChild(this.debugOverlay.worldContainer);
    this.stageRoot.addChild(this.arena.foregroundContainer);
    this.stageRoot.addChild(this.debugOverlay.hudContainer);

    this.vfx.attachStageTarget(this.stageRoot);

    this.unsubscribeSettings = settingsStore.subscribe((next) => {
      this.applySettings(next);
    });

    this.startMatch(this.match.p1Element, this.match.p2Element);
    this.lastRafTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  public destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.unsubscribeSettings?.();
    this.app.destroy(true);
  }

  private applySettings(next: GameSettings): void {
    this.settings = next;
    this.p1.input.setWindow(next.inputBufferFrames);
    this.p2.input.setWindow(next.inputBufferFrames);
    this.vfx.setQuality(next.vfxQuality);
    this.p1Rig.applyQualityFilters(this.vfx);
    this.p2Rig.applyQualityFilters(this.vfx);
    this.camera.setFeedbackScale(next.impactFeedback);
    this.debugOverlay.setEnabled(next.dojoDebugOverlay);
    this.audio.configure(next.masterVolume, next.sfxEnabled, next.hapticsEnabled);
    this.match.configureFormat(next.matchFormat);
  }

  public getCurrentSimFrame(): number {
    return this.simFrame;
  }

  public startMatch(p1Element: ElementId, p2Element: ElementId): void {
    this.p1.setElement(p1Element);
    this.p2.setElement(p2Element);
    this.p1Rig.rebuildGeometry(this.p1.element, this.vfx);
    this.p2Rig.rebuildGeometry(this.p2.element, this.vfx);
    this.p1.resetForMatch();
    this.p2.resetForMatch();
    this.resetRoundEntities();
    this.match.startNewMatch(p1Element, p2Element, this.settings.matchFormat);
    this.audio.playGong();
    this.callbacks.onHudUpdate(this.p1, this.p2, this.match);
  }

  public restartRound(): void {
    this.p1.resetForRound();
    this.p2.resetForRound();
    this.resetRoundEntities();
    this.match.beginRound();
    this.audio.playGong();
    this.callbacks.onHudUpdate(this.p1, this.p2, this.match);
  }

  public setPaused(paused: boolean): void {
    this.match.paused = paused;
    this.callbacks.onHudUpdate(this.p1, this.p2, this.match);
  }

  private resetRoundEntities(): void {
    this.projectiles = [];
    this.hazards = [];
    this.hitstopFrames = 0;
    this.vfx.clear();
    this.p1Rig.weaponTrail.clear();
    this.p1Rig.limbTrail.clear();
    this.p2Rig.weaponTrail.clear();
    this.p2Rig.limbTrail.clear();
    this.ai.reset();
    this.camera.reset();
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);

    const rawDt = (now - this.lastRafTime) / 1000;
    this.lastRafTime = now;
    const dt = Math.min(MAX_FRAME_DELTA, Math.max(0, rawDt));

    if (rawDt > 0.001) {
      this.fpsSamples.push(1 / rawDt);
      if (this.fpsSamples.length > 20) this.fpsSamples.shift();
      this.currentFps =
        this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    }

    if (!this.match.paused && this.match.screen !== 'select') {
      this.accumulator += dt;
      while (this.accumulator >= FIXED_DT) {
        this.stepSimulation();
        this.accumulator -= FIXED_DT;
      }
    }

    // Optional 30 FPS render lock while maintaining fixed 60Hz deterministic simulation
    const renderInterval = this.settings.fpsMode === 30 ? 1 / 30 : 0;
    this.renderAccumulator += dt;
    if (this.renderAccumulator >= renderInterval) {
      this.renderAccumulator = renderInterval > 0 ? this.renderAccumulator % renderInterval : 0;
      this.syncVisuals();
      this.callbacks.onHudUpdate(this.p1, this.p2, this.match);
    }
  };

  private stepSimulation(): void {
    this.simFrame += 1;

    if (this.slowMoFrames > 0) {
      this.slowMoFrames -= 1;
      this.slowMoTick += 1;
      this.vfx.update(this.projectiles, this.hazards);
      if (this.slowMoTick % 3 !== 0) return;
    }

    // Ambient elemental aura particles
    if (this.simFrame % 7 === 0) {
      this.vfx.spawnElementalAuraParticle(
        this.p1.x,
        this.p1.y,
        this.p1.element.glowColor,
        this.p1.element.id === 'ice'
      );
      this.vfx.spawnElementalAuraParticle(
        this.p2.x,
        this.p2.y,
        this.p2.element.glowColor,
        this.p2.element.id === 'ice'
      );
    }

    // During Hit-Stop, freeze fighter skeletons & move timers while particles/shake keep running!
    if (this.hitstopFrames > 0) {
      this.hitstopFrames -= 1;
      this.vfx.update(this.projectiles, this.hazards);
      return;
    }

    const isEndless = this.settings.matchFormat === 'endless';
    const { roundStartedNow, timeUp } = this.match.tickTimers(isEndless);
    if (roundStartedNow) {
      this.audio.playGong();
    }

    // Round transition when round_over completes
    if (this.match.screen === 'round_over' && this.match.roundOverFrames <= 0) {
      this.match.roundNumber += 1;
      this.restartRound();
      return;
    }

    const canFight = this.match.screen === 'fighting' && this.match.roundIntroFrames <= 26;

    // Update AI sparring opponent
    this.ai.update(this.p2, this.p1, this.settings.aiTier, this.simFrame, canFight);

    // Tick both fighters
    const p1Events = this.p1.tick(this.simFrame, this.p2, canFight);
    const p2Events = this.p2.tick(this.simFrame, this.p1, canFight);

    this.handleFighterEvents(this.p1, this.p2, p1Events);
    this.handleFighterEvents(this.p2, this.p1, p2Events);

    // Resolve pushbox separation (skip during rolls & shadow step so fighters can cross-up!)
    this.resolvePushboxes();

    // Resolve melee hitboxes
    if (canFight) {
      this.resolveMeleeHit(this.p1, this.p2);
      this.resolveMeleeHit(this.p2, this.p1);
    }

    // Update projectiles & floor hazards
    this.updateProjectiles(canFight);
    this.updateHazards(canFight);
    this.vfx.update(this.projectiles, this.hazards);

    // True combo chain reset once defender recovers out of hitstun/knockdown_air
    if (this.p2.state !== 'hitstun' && this.p2.state !== 'knockdown_air') {
      this.match.endComboChain('p1');
    }
    if (this.p1.state !== 'hitstun' && this.p1.state !== 'knockdown_air') {
      this.match.endComboChain('p2');
    }

    // Endless dojo passive recovery when KO'd or normal round resolution
    if (this.match.screen === 'fighting') {
      if (this.p1.hp <= 0 || this.p2.hp <= 0) {
        if (isEndless) {
          // Instant seamless reset in Endless Dojo mode
          const loser = this.p1.hp <= 0 ? this.p1 : this.p2;
          loser.hp = loser.maxHp;
          loser.trailingHp = loser.maxHp;
          loser.state = 'idle';
          this.match.showBanner('DOJO RESET', 'ENDLESS SPARRING', '#7cf0bd', 55);
        } else {
          const winner: 'p1' | 'p2' | 'draw' =
            this.p1.hp <= 0 && this.p2.hp <= 0
              ? 'draw'
              : this.p2.hp <= 0
              ? 'p1'
              : 'p2';
          if (winner === 'p1') this.p1.state = 'victory';
          if (winner === 'p2') this.p2.state = 'victory';
          this.match.concludeRound(winner, false);
          this.audio.playGong();
        }
      } else if (timeUp) {
        const p1Pct = this.p1.hp / this.p1.maxHp;
        const p2Pct = this.p2.hp / this.p2.maxHp;
        const winner: 'p1' | 'p2' | 'draw' =
          Math.abs(p1Pct - p2Pct) < 0.005 ? 'draw' : p1Pct > p2Pct ? 'p1' : 'p2';
        this.match.concludeRound(winner, false);
        this.audio.playGong();
      }
    }
  }

  private handleFighterEvents(
    fighter: Fighter,
    opponent: Fighter,
    events: ReturnType<Fighter['tick']>
  ): void {
    if (events.moveStarted) {
      const heavy =
        events.moveStarted === 'weapon_overhead' ||
        events.moveStarted === 'weapon_slash_2' ||
        events.moveStarted === 'roundhouse' ||
        events.moveStarted === 'magic_cast';
      this.audio.playWhoosh(heavy);
      if (events.moveStarted === 'wakeup_sweep') {
        this.vfx.spawnDustBurst(fighter.x, GROUND_Y, fighter.facing, 10);
        this.match.pushCallout(fighter.id, 'WAKE-UP SWEEP', fighter.element.cssGlow, fighter.x, fighter.y - 165);
      }
    }
    if (events.wallJumpTriggered) {
      this.audio.playWhoosh(false);
      this.vfx.spawnDustBurst(fighter.x, fighter.y, fighter.facing, 10);
      const label = fighter.element.id === 'air' ? 'ZEPHYR VAULT!' : 'WALL JUMP';
      this.match.pushCallout(fighter.id, label, fighter.element.cssGlow, fighter.x, fighter.y - 170);
    }
    if (events.shadowStepTriggered) {
      this.audio.playWhoosh(true);
      this.vfx.spawnHitSparks(fighter.x, fighter.y - 90, fighter.element.primaryColor, fighter.element.coreColor, 0.9);
      this.match.pushCallout(fighter.id, 'SHADOW STEP!', fighter.element.cssGlow, fighter.x, fighter.y - 175);
    }
    if (events.voltDashTriggered) {
      this.vfx.spawnHitSparks(fighter.x, fighter.y - 75, fighter.element.primaryColor, fighter.element.coreColor, 0.7);
      this.match.pushCallout(fighter.id, 'VOLT DASH', fighter.element.cssGlow, fighter.x, fighter.y - 160);
    }
    if (events.spawnEmberBurst) {
      // Fire's Wake-Up Ember Burst pushes blockers back
      this.vfx.spawnHitSparks(fighter.x, fighter.y - 60, 0xff5a14, 0xfff0b8, 1.3);
      if (Math.abs(opponent.x - fighter.x) < 165) {
        opponent.vx += (opponent.x >= fighter.x ? 1 : -1) * 14;
        opponent.statuses.apply('burn', 0.65);
        this.match.pushCallout(fighter.id, 'EMBER BURST', '#ff8c2e', fighter.x, fighter.y - 190);
      }
    }
    if (events.spawnMoltenPool) {
      this.spawnFloorHazard(fighter, fighter.x + fighter.facing * 52);
    }
    if (events.spawnMagic) {
      this.spawnElementalMagic(fighter, opponent);
    }
  }

  private spawnFloorHazard(owner: Fighter, x: number): void {
    const clampedX = Math.max(ARENA_LEFT + 60, Math.min(ARENA_RIGHT - 60, x));
    this.hazards.push({
      id: this.nextHazardId++,
      ownerId: owner.id,
      x: clampedX,
      halfWidth: 78,
      remainingFrames: 240,
      maxFrames: 240,
      tickCounter: 0,
      color: 0xff3214,
      glowColor: 0xff9d2e,
    });
    if (this.hazards.length > 3) {
      this.hazards.shift();
    }
  }

  private spawnElementalMagic(caster: Fighter, target: Fighter): void {
    this.audio.playMagic(caster.element.id);
    this.camera.addShake(9);
    const el = caster.element;
    this.match.pushCallout(caster.id, el.magicName.toUpperCase(), el.cssGlow, caster.x, caster.y - 188);

    const styleMap: Record<ElementId, ElementalProjectile['style']> = {
      fire: 'arc',
      water: 'wave',
      earth: 'pillar',
      air: 'vortex',
      lightning: 'bolt',
      ice: 'shards',
      shadow: 'tendrils',
      lava: 'eruption',
    };
    const style = styleMap[el.id];

    let x = caster.x + caster.facing * 75;
    let y = caster.y - 102;
    let vx = caster.facing * 12.5;
    let width = 92;
    let height = 96;
    let maxFrames = 48;
    let launchY = -8.5;
    let hitsLow = false;

    if (style === 'wave') {
      y = GROUND_Y - 40;
      vx = caster.facing * 11.2;
      width = 112;
      height = 74;
      maxFrames = 66;
      hitsLow = true;
    } else if (style === 'pillar') {
      x = Math.max(ARENA_LEFT + 50, Math.min(ARENA_RIGHT - 50, target.x));
      y = GROUND_Y - 64;
      vx = 0;
      width = 86;
      height = 180;
      maxFrames = 34;
      launchY = -12.5;
    } else if (style === 'bolt') {
      x = Math.max(ARENA_LEFT + 40, Math.min(ARENA_RIGHT - 40, target.x));
      y = GROUND_Y - 120;
      vx = 0;
      width = 80;
      height = 260;
      maxFrames = 24;
    } else if (style === 'vortex') {
      vx = caster.facing * 8.4;
      width = 96;
      height = 148;
      maxFrames = 52;
      launchY = -13.2;
    } else if (style === 'eruption') {
      x = Math.max(ARENA_LEFT + 70, Math.min(ARENA_RIGHT - 70, caster.x + caster.facing * 145));
      y = GROUND_Y - 75;
      vx = 0;
      width = 118;
      height = 155;
      maxFrames = 34;
      this.spawnFloorHazard(caster, x);
    } else if (style === 'tendrils') {
      y = GROUND_Y - 64;
      vx = caster.facing * 10.2;
      width = 104;
      height = 110;
      maxFrames = 54;
    }

    this.projectiles.push({
      id: this.nextProjectileId++,
      ownerId: caster.id,
      elementId: el.id,
      x,
      y,
      vx,
      vy: 0,
      width,
      height,
      damage: 135,
      knockbackX: caster.facing * 11.5,
      launchY,
      knockdown: true,
      remainingFrames: maxFrames,
      maxFrames,
      color: el.primaryColor,
      glowColor: el.glowColor,
      coreColor: el.coreColor,
      style,
      hitAlready: false,
      hitsLow,
    });

    this.vfx.triggerShockwave(caster.x, caster.y - 100, 22);
  }

  private resolvePushboxes(): void {
    const bypass =
      this.p1.state === 'roll_fwd' ||
      this.p1.state === 'roll_back' ||
      this.p1.state === 'shadow_step' ||
      this.p2.state === 'roll_fwd' ||
      this.p2.state === 'roll_back' ||
      this.p2.state === 'shadow_step' ||
      this.p1.state === 'wall_jump' ||
      this.p2.state === 'wall_jump';
    if (bypass) return;

    const b1 = this.p1.getPushbox();
    const b2 = this.p2.getPushbox();
    if (!rectsIntersect(b1, b2)) return;

    const minSep = (b1.w + b2.w) * 0.5;
    const dx = this.p2.x - this.p1.x;
    const dir = dx >= 0 ? 1 : -1;
    const overlap = minSep - Math.abs(dx);
    if (overlap > 0) {
      const push = overlap * 0.5;
      this.p1.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, this.p1.x - dir * push));
      this.p2.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, this.p2.x + dir * push));
    }
  }

  private resolveMeleeHit(attacker: Fighter, defender: Fighter): void {
    const hitbox = attacker.getActiveHitbox();
    if (!hitbox) return;
    if (defender.isInvulnerable() || defender.state === 'ko') return;

    // Grounded opponents can only be hit by Sucker Kick (hitsGrounded)
    if (defender.state === 'grounded' && !attacker.currentMove?.hitsGrounded) {
      return;
    }

    const hurtbox = defender.getHurtbox();
    if (!rectsIntersect(hitbox.box, hurtbox)) return;

    attacker.moveHitConnected = true;
    const impact = computeIntersectionPoint(hitbox.box, hurtbox);
    this.applyImpact(attacker, defender, hitbox, impact.x, impact.y);
  }

  private applyImpact(
    attacker: Fighter,
    defender: Fighter,
    hit: ActiveHitbox,
    impactX: number,
    impactY: number
  ): void {
    // Determine if defender is guarding (throws beat guard!)
    const relDef = defender.input.getRelativeDirection(defender.facing);
    const holdingGuard =
      !hit.isThrow &&
      defender.isGroundedOnFloor() &&
      (defender.canActNeutral() || defender.isBlocking()) &&
      (relDef.back || defender.input.isHeld('block'));

    const guardedCorrectHeight =
      holdingGuard &&
      (hit.height === 'mid' ||
        (hit.height === 'low' && (relDef.down || defender.state === 'block_low')) ||
        (hit.height === 'high' && !relDef.down));

    if (guardedCorrectHeight) {
      const perfectGuard = this.simFrame - defender.guardEnteredFrame <= 9;
      defender.state = relDef.down ? 'block_low' : 'block_high';
      defender.stateFrame = 0;
      defender.stunFrames = hit.blockstun;
      defender.vx = attacker.facing * hit.knockbackX * 0.55;

      const chipMult = defender.statuses.has('burn') || defender.statuses.has('scorched') ? 1.45 : 1;
      const chip = perfectGuard ? 0 : Math.round(hit.chipDamage * chipMult);
      defender.hp = Math.max(1, defender.hp - chip);
      defender.magic = Math.min(100, defender.magic + (perfectGuard ? 15 : 7));
      attacker.magic = Math.min(100, attacker.magic + hit.magicGain * 0.4);

      this.audio.playGuard(perfectGuard);
      this.vfx.spawnGuardSparks(impactX, impactY, perfectGuard, defender.element.glowColor);
      this.triggerHitStop(perfectGuard ? 4 : 3);
      this.camera.addShake(perfectGuard ? 6 : 3.5);

      // Mirror perk on clean guard
      const mirrorEvt = defender.perks.onCleanGuard();
      if (perfectGuard) {
        this.match.pushCallout(defender.id, mirrorEvt.label, mirrorEvt.color, defender.x, defender.y - 176);
        // Ice's Permafrost Parry freezes attacker weapon recovery!
        if (defender.element.hasPermafrostParry) {
          attacker.freezeWeaponFrames = 18;
          attacker.statuses.apply('chill', 0.9);
          this.match.pushCallout(defender.id, 'PERMAFROST PARRY!', '#7cf2ff', defender.x, defender.y - 202);
        }
      }
      return;
    }

    // === CLEAN HIT ===
    const outgoing = attacker.perks.computeOutgoingMultiplier();
    const isCritical = hit.critical || outgoing.guaranteedCrit;
    const comboCount = this.match.registerHit(attacker.id);
    const scaling = this.match.getDamageScaling(comboCount);

    let finalDamage = Math.round(hit.damage * outgoing.multiplier * scaling);
    if (outgoing.consumedAvenger) {
      this.match.pushCallout(attacker.id, 'AVENGER CRIT!', '#ffae34', attacker.x, attacker.y - 190);
    } else if (outgoing.consumedMirror) {
      this.match.pushCallout(attacker.id, 'MIRROR COUNTER!', '#80f4ff', attacker.x, attacker.y - 185);
    }

    // Check Rock poise armor on critical hits
    const rock = defender.perks.tryRockArmor(finalDamage, isCritical);
    if (rock.triggered && rock.event) {
      finalDamage = Math.round(finalDamage * 0.45);
      attacker.hp = Math.max(1, attacker.hp - rock.reflectedDamage);
      this.match.pushCallout(defender.id, rock.event.label, rock.event.color, defender.x, defender.y - 188);
    }

    // Check Earth wake-up super armor
    const armored = rock.triggered || defender.superArmorHits > 0;
    if (defender.superArmorHits > 0) {
      defender.superArmorHits -= 1;
      this.match.pushCallout(defender.id, 'POISE ARMOR', '#f2c057', defender.x, defender.y - 178);
    }

    // Apply damage + check Enlightenment (Second Wind)
    let nextHp = defender.hp - finalDamage;
    const enlighten = defender.perks.tryEnlightenment(nextHp, defender.maxHp);
    if (enlighten.triggered && enlighten.event) {
      defender.hp = enlighten.restoredHp;
      defender.invulnFrames = 32;
      attacker.vx = -attacker.facing * 18;
      attacker.vy = -6;
      attacker.state = 'hitstun';
      attacker.stunFrames = 22;
      this.vfx.triggerShockwave(defender.x, defender.y - 95, 34);
      this.vfx.spawnHitSparks(defender.x, defender.y - 95, 0xffe57f, 0xffffff, 1.8);
      this.match.showBanner('ENLIGHTENMENT!', 'SECOND WIND +25% HP', '#ffe57f', 70, true);
      this.audio.playGong();
      this.triggerHitStop(5);
      this.slowMoFrames = 26;
      this.camera.addShake(16);
      return;
    }

    defender.hp = Math.max(0, nextHp);
    if (defender.hp <= 0) {
      this.slowMoFrames = 38;
    }
    defender.flashFrames = 7;
    attacker.magic = Math.min(100, attacker.magic + hit.magicGain);
    defender.magic = Math.min(100, defender.magic + Math.round(hit.magicGain * 0.65));

    // Apply elemental status effect
    if (hit.appliesElementStatus) {
      const applied = defender.statuses.apply(attacker.element.statusId);
      this.match.pushCallout(defender.id, applied.label, applied.color, defender.x, defender.y - 165);
    }

    // Throws swap / slam positions cleanly
    if (hit.isThrow) {
      if (hit.throwType === 'back' || hit.throwType === 'suplex') {
        defender.x = Math.max(
          ARENA_LEFT + 30,
          Math.min(ARENA_RIGHT - 30, attacker.x - attacker.facing * 88)
        );
        defender.vx = -attacker.facing * Math.abs(hit.knockbackX);
        this.match.pushCallout(
          attacker.id,
          hit.throwType === 'suplex' ? 'SHADOW SUPLEX!' : 'THROW THROUGH BACK',
          attacker.element.cssGlow,
          impactX,
          impactY - 50
        );
      } else {
        defender.vx = attacker.facing * hit.knockbackX;
        this.match.pushCallout(attacker.id, 'FORWARD THROW', attacker.element.cssGlow, impactX, impactY - 50);
      }
      defender.vy = hit.launchY;
      defender.state = 'knockdown_air';
      defender.stateFrame = 0;
    } else if (!armored) {
      defender.vx = attacker.facing * hit.knockbackX;
      if (hit.knockdown || defender.hp <= 0 || hit.launchY < -4) {
        defender.vy = hit.launchY || -7.2;
        defender.state = 'knockdown_air';
        defender.stateFrame = 0;
        if (isCritical && defender.hp > 0) {
          const av = defender.perks.onCriticalKnockdownTaken();
          this.match.pushCallout(defender.id, av.label, av.color, defender.x, defender.y - 196);
        }
      } else {
        defender.state = 'hitstun';
        defender.stateFrame = 0;
        defender.stunFrames = hit.hitstun + (defender.statuses.has('shock') ? 7 : 0);
      }
    }

    // Hit-stop, screen shake, shockwave & VFX sparks
    const isHeavy = isCritical || hit.knockdown || hit.damage >= 90;
    this.audio.playHit(isHeavy, attacker.currentMove?.isWeapon ?? false);
    this.triggerHitStop(hit.hitstop);
    this.camera.addShake(isHeavy ? 13 : 6);
    this.vfx.spawnHitSparks(
      impactX,
      impactY,
      attacker.element.glowColor,
      attacker.element.coreColor,
      isHeavy ? 1.45 : 1.0,
      attacker.element.id === 'ice'
    );
    if (isHeavy) {
      this.vfx.triggerShockwave(impactX, impactY, isCritical ? 26 : 16);
      this.vfx.spawnDustBurst(defender.x, GROUND_Y, attacker.facing, 8);
    }
  }

  private triggerHitStop(baseFrames: number): void {
    const scaled = Math.round(baseFrames * this.settings.impactFeedback);
    this.hitstopFrames = Math.max(this.hitstopFrames, scaled);
  }

  private updateProjectiles(canFight: boolean): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.remainingFrames -= 1;

      if (canFight && !p.hitAlready) {
        const attacker = p.ownerId === 'p1' ? this.p1 : this.p2;
        const defender = p.ownerId === 'p1' ? this.p2 : this.p1;
        const pBox = {
          x: p.x - p.width * 0.5,
          y: p.y - p.height * 0.5,
          w: p.width,
          h: p.height,
        };
        if (!defender.isInvulnerable() && defender.state !== 'ko' && rectsIntersect(pBox, defender.getHurtbox())) {
          p.hitAlready = true;
          const hit: ActiveHitbox = {
            box: pBox,
            height: p.hitsLow ? 'low' : 'mid',
            damage: p.damage,
            chipDamage: 28,
            hitstun: 30,
            blockstun: 16,
            hitstop: 5,
            knockbackX: Math.abs(p.knockbackX),
            launchY: p.launchY,
            knockdown: p.knockdown,
            critical: true,
            isThrow: false,
            appliesElementStatus: true,
            magicGain: 0,
            moveId: 'magic_cast',
          };
          this.applyImpact(attacker, defender, hit, p.x, p.y);
        }
      }

      if (p.remainingFrames <= 0 || p.x < ARENA_LEFT - 120 || p.x > ARENA_RIGHT + 120) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateHazards(canFight: boolean): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.remainingFrames -= 1;
      h.tickCounter += 1;

      if (canFight && h.tickCounter % 22 === 0) {
        const target = h.ownerId === 'p1' ? this.p2 : this.p1;
        if (
          target.isGroundedOnFloor() &&
          !target.isInvulnerable() &&
          Math.abs(target.x - h.x) < h.halfWidth + 16
        ) {
          target.hp = Math.max(1, target.hp - 18);
          target.statuses.apply('scorched', 0.5);
          this.vfx.spawnHitSparks(target.x, GROUND_Y - 14, 0xff4514, 0xffe478, 0.7);
        }
      }

      if (h.remainingFrames <= 0) {
        this.hazards.splice(i, 1);
      }
    }
  }

  private syncVisuals(): void {
    const freeze = this.hitstopFrames > 0;
    this.p1Rig.sync(this.p1, this.settings.vfxQuality, freeze);
    this.p2Rig.sync(this.p2, this.settings.vfxQuality, freeze);

    const { parallaxX } = this.camera.update(this.p1, this.p2, this.worldContainer);
    this.arena.update(
      parallaxX,
      this.p1.x,
      this.p1.element.primaryColor,
      this.p2.x,
      this.p2.element.primaryColor
    );

    this.debugOverlay.update(
      this.p1,
      this.p2,
      this.projectiles,
      this.hazards,
      this.currentFps,
      this.hitstopFrames,
      this.simFrame
    );
  }
}
