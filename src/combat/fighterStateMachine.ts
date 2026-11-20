import { ELEMENT_REGISTRY, type ElementId, type ElementProfile } from '../elements/elementRegistry';
import { StatusEffectManager } from '../elements/statusEffects';
import { ComebackPerkState } from './comebackPerks';
import type { ActiveHitbox, RectBox } from './hitboxSystem';
import { InputBuffer, type BufferedAction } from './inputBuffer';
import { MOVE_LIBRARY, type MoveDefinition, type MoveId } from './moveLibrary';

export const ARENA_LEFT = 110;
export const ARENA_RIGHT = 1170;
export const GROUND_Y = 582;
export const GRAVITY = 0.84;

export type FighterState =
  | 'idle'
  | 'walk_fwd'
  | 'walk_back'
  | 'crouch'
  | 'jump'
  | 'wall_jump'
  | 'dash_fwd'
  | 'back_handspring'
  | 'attack'
  | 'block_high'
  | 'block_low'
  | 'hitstun'
  | 'knockdown_air'
  | 'grounded'
  | 'roll_fwd'
  | 'roll_back'
  | 'shadow_step'
  | 'ko'
  | 'victory';

export interface FighterActionEvents {
  spawnMagic: boolean;
  spawnEmberBurst: boolean;
  spawnMoltenPool: boolean;
  wallJumpTriggered: boolean;
  shadowStepTriggered: boolean;
  voltDashTriggered: boolean;
  moveStarted: MoveId | null;
}

export class Fighter {
  public readonly id: 'p1' | 'p2';
  public element: ElementProfile;
  public x: number;
  public y: number;
  public vx = 0;
  public vy = 0;
  public facing: 1 | -1;

  public hp: number;
  public maxHp: number;
  public trailingHp: number;
  public magic = 35; // Start with partial magic so players feel progression quickly

  public state: FighterState = 'idle';
  public stateFrame = 0;
  public invulnFrames = 0;
  public superArmorHits = 0;
  public stunFrames = 0;
  public guardEnteredFrame = -999;
  public freezeWeaponFrames = 0; // Permafrost Parry extra recovery

  public currentMove: MoveDefinition | null = null;
  public moveHitConnected = false;
  public moveStartupFrames = 0;
  public moveActiveFrames = 0;
  public moveRecoveryFrames = 0;
  public groundedMinFrames = 26;
  public groundedMaxFrames = 85;
  public afterimageTimer = 0;
  public flashFrames = 0;
  public flashColor = 0xffffff;

  public readonly input = new InputBuffer();
  public readonly statuses = new StatusEffectManager();
  public readonly perks = new ComebackPerkState();

  constructor(id: 'p1' | 'p2', elementId: ElementId) {
    this.id = id;
    this.element = ELEMENT_REGISTRY[elementId];
    this.x = id === 'p1' ? 400 : 880;
    this.y = GROUND_Y;
    this.facing = id === 'p1' ? 1 : -1;
    this.maxHp = this.element.maxHp;
    this.hp = this.maxHp;
    this.trailingHp = this.maxHp;
  }

  public setElement(elementId: ElementId): void {
    this.element = ELEMENT_REGISTRY[elementId];
    this.maxHp = this.element.maxHp;
    this.hp = this.maxHp;
    this.trailingHp = this.maxHp;
  }

  public resetForRound(): void {
    this.x = this.id === 'p1' ? 410 : 870;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.id === 'p1' ? 1 : -1;
    this.maxHp = this.element.maxHp;
    this.hp = this.maxHp;
    this.trailingHp = this.maxHp;
    this.magic = Math.min(100, Math.max(35, this.magic * 0.5 + 20));
    this.state = 'idle';
    this.stateFrame = 0;
    this.invulnFrames = 0;
    this.superArmorHits = 0;
    this.stunFrames = 0;
    this.freezeWeaponFrames = 0;
    this.currentMove = null;
    this.moveHitConnected = false;
    this.afterimageTimer = 0;
    this.flashFrames = 0;
    this.statuses.clear();
    this.perks.resetForRound();
    this.input.clear();
  }

  public resetForMatch(): void {
    this.perks.resetForMatch();
    this.magic = 35;
    this.resetForRound();
  }

  public isGroundedOnFloor(): boolean {
    return this.y >= GROUND_Y - 0.5;
  }

  public isNearWall(): -1 | 0 | 1 {
    if (this.x <= ARENA_LEFT + 72) return -1;
    if (this.x >= ARENA_RIGHT - 72) return 1;
    return 0;
  }

  public canActNeutral(): boolean {
    return (
      this.state === 'idle' ||
      this.state === 'walk_fwd' ||
      this.state === 'walk_back' ||
      this.state === 'crouch'
    );
  }

  public isBlocking(): boolean {
    return this.state === 'block_high' || this.state === 'block_low';
  }

  public isInvulnerable(): boolean {
    return this.invulnFrames > 0 || this.state === 'shadow_step';
  }

  public getPushbox(): RectBox {
    const h = this.state === 'crouch' || this.state === 'roll_fwd' || this.state === 'roll_back' ? 92 : 148;
    const w = 54;
    return {
      x: this.x - w * 0.5,
      y: this.y - h,
      w,
      h,
    };
  }

  public getHurtbox(): RectBox {
    if (this.state === 'grounded' || this.state === 'ko') {
      return { x: this.x - 58, y: this.y - 36, w: 116, h: 36 };
    }
    if (this.state === 'roll_fwd' || this.state === 'roll_back') {
      return { x: this.x - 36, y: this.y - 72, w: 72, h: 72 };
    }
    if (this.state === 'crouch' || this.state === 'block_low') {
      return { x: this.x - 32, y: this.y - 102, w: 64, h: 102 };
    }
    if (
      this.state === 'attack' &&
      this.currentMove?.highEvade &&
      this.stateFrame < this.moveStartupFrames + this.moveActiveFrames
    ) {
      // Elbow Strike / Horse Kick ducks/leans beneath high head strikes
      return { x: this.x - 30, y: this.y - 104, w: 60, h: 104 };
    }
    return { x: this.x - 32, y: this.y - 166, w: 64, h: 166 };
  }

  public getActiveHitbox(): ActiveHitbox | null {
    if (this.state !== 'attack' || !this.currentMove || this.moveHitConnected) {
      return null;
    }
    const move = this.currentMove;
    const inActive =
      this.stateFrame >= this.moveStartupFrames &&
      this.stateFrame < this.moveStartupFrames + this.moveActiveFrames;
    if (!inActive) return null;

    const width = move.isWeapon
      ? Math.round((move.hitboxWidth * this.element.weaponReach) / 140)
      : move.hitboxWidth;
    const boxX =
      this.facing === 1
        ? this.x + move.hitboxOffsetX
        : this.x - move.hitboxOffsetX - width;
    const boxY = this.y + move.hitboxOffsetY;

    const baseDamage = move.isWeapon
      ? Math.round(move.damage * this.element.weaponDamageMod)
      : move.damage;

    return {
      box: { x: boxX, y: boxY, w: width, h: move.hitboxHeight },
      height: move.height,
      damage: baseDamage,
      chipDamage: move.chipDamage,
      hitstun: move.hitstun,
      blockstun: move.blockstun,
      hitstop: move.hitstop,
      knockbackX: move.knockbackX,
      launchY: move.launchY,
      knockdown: move.knockdown,
      critical: move.critical,
      isThrow: Boolean(move.isThrow),
      throwType: move.throwType,
      appliesElementStatus: Boolean(move.appliesElementStatus),
      magicGain: move.magicGain,
      moveId: move.id,
    };
  }

  public startMove(moveId: MoveId, startupScale = 1): void {
    const move = MOVE_LIBRARY[moveId];
    this.state = 'attack';
    this.stateFrame = 0;
    this.currentMove = move;
    this.moveHitConnected = false;

    const weaponSpeed = move.isWeapon ? this.element.weaponSpeedMod : 1;
    this.moveStartupFrames = Math.max(4, Math.round(move.startup * weaponSpeed * startupScale));
    this.moveActiveFrames = move.active;
    this.moveRecoveryFrames = Math.max(8, Math.round(move.recovery * weaponSpeed));

    if (move.invulnFrames) {
      this.invulnFrames = Math.max(this.invulnFrames, move.invulnFrames);
    }
    if (moveId === 'wakeup_sweep' && this.element.hasWakeUpArmor) {
      this.superArmorHits = 1;
    }
  }

  public tick(
    currentFrame: number,
    opponent: Fighter,
    canControl: boolean
  ): FighterActionEvents {
    const events: FighterActionEvents = {
      spawnMagic: false,
      spawnEmberBurst: false,
      spawnMoltenPool: false,
      wallJumpTriggered: false,
      shadowStepTriggered: false,
      voltDashTriggered: false,
      moveStarted: null,
    };

    // Smooth delayed-damage HP trail
    if (this.trailingHp > this.hp) {
      this.trailingHp = Math.max(this.hp, this.trailingHp - Math.max(2.2, (this.trailingHp - this.hp) * 0.085));
    } else {
      this.trailingHp = this.hp;
    }

    if (this.invulnFrames > 0) this.invulnFrames -= 1;
    if (this.afterimageTimer > 0) this.afterimageTimer -= 1;
    if (this.flashFrames > 0) this.flashFrames -= 1;

    // Passive slight magic regeneration + status ticks
    const statusTick = this.statuses.tick();
    if (statusTick.dotDamage > 0 && this.state !== 'ko' && this.hp > 1) {
      this.hp = Math.max(1, this.hp - statusTick.dotDamage);
    }
    if (statusTick.magicDrain > 0) {
      this.magic = Math.max(0, this.magic - statusTick.magicDrain);
    }
    this.perks.tick(this.hp, this.maxHp);

    // Auto-face opponent when neutral
    if (this.canActNeutral()) {
      const dx = opponent.x - this.x;
      if (Math.abs(dx) > 12) {
        this.facing = dx >= 0 ? 1 : -1;
      }
    }

    this.stateFrame += 1;
    const rel = this.input.getRelativeDirection(this.facing);
    const dist = Math.abs(opponent.x - this.x);
    const moveSpeed = this.element.moveSpeed * 1.38 * statusTick.moveSpeedMultiplier;
    const jumpImpulse = this.element.jumpForce * 1.22;

    // --- STATE MACHINE UPDATE ---
    if (this.state === 'ko' || this.state === 'victory') {
      this.vx *= 0.84;
      this.applyPhysics(false);
      return events;
    }

    // 1. GROUNDED STATE (Wake-up Sweep, Forward/Back Recovery Rolls)
    if (this.state === 'grounded') {
      this.vx *= 0.78;
      this.applyPhysics(false);
      if (canControl && this.stateFrame >= 22) {
        const kickAction = this.input.consumeButton('kick', currentFrame);
        const evadeAction = this.input.consumeButton('evade', currentFrame);
        if (kickAction) {
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.startMove('wakeup_sweep', statusTick.startupMultiplier);
          events.moveStarted = 'wakeup_sweep';
          if (this.element.hasEmberWakeUp) events.spawnEmberBurst = true;
          if (this.element.hasMoltenWake) events.spawnMoltenPool = true;
          return events;
        }
        if (rel.forward || (evadeAction && !rel.back)) {
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.state = 'roll_fwd';
          this.stateFrame = 0;
          this.invulnFrames = 18 + this.element.extraRollIFrames;
          this.vx = this.facing * 13.4;
          this.afterimageTimer = 18;
          return events;
        }
        if (rel.back || (evadeAction && rel.back)) {
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.state = 'roll_back';
          this.stateFrame = 0;
          this.invulnFrames = 16 + this.element.extraRollIFrames;
          this.vx = -this.facing * 13.8;
          this.afterimageTimer = 16;
          return events;
        }
      }
      if (this.stateFrame >= 74) {
        this.state = 'idle';
        this.stateFrame = 0;
        this.invulnFrames = 10;
      }
      return events;
    }

    // 2. RECOVERY ROLLS (+ Shadow Step Cancel!)
    if (this.state === 'roll_fwd' || this.state === 'roll_back') {
      if (
        canControl &&
        this.element.hasShadowStep &&
        this.stateFrame >= 5 &&
        this.stateFrame <= 15
      ) {
        const cancelAction = this.input.consumeAny(['evade', 'punch', 'weapon'], currentFrame);
        if (cancelAction) {
          this.state = 'shadow_step';
          this.stateFrame = 0;
          this.invulnFrames = 14;
          const behindX = opponent.x + opponent.facing * -88;
          this.x = Math.max(ARENA_LEFT + 30, Math.min(ARENA_RIGHT - 30, behindX));
          this.facing = opponent.x >= this.x ? 1 : -1;
          this.vx = 0;
          this.afterimageTimer = 18;
          events.shadowStepTriggered = true;
          return events;
        }
      }

      this.vx *= 0.93;
      this.applyPhysics(false);
      if (this.stateFrame >= 21) {
        this.state = 'idle';
        this.stateFrame = 0;
        this.facing = opponent.x >= this.x ? 1 : -1;
      }
      return events;
    }

    if (this.state === 'shadow_step') {
      this.vx = 0;
      this.applyPhysics(false);
      if (this.stateFrame >= 10) {
        this.state = 'idle';
        this.stateFrame = 0;
        this.facing = opponent.x >= this.x ? 1 : -1;
      }
      return events;
    }

    // 3. HITSTUN / BLOCKSTUN / KNOCKDOWN AIR
    if (this.state === 'hitstun') {
      this.vx *= 0.86;
      this.applyPhysics(true);
      this.stunFrames -= 1;
      if (this.stunFrames <= 0 && this.isGroundedOnFloor()) {
        this.state = 'idle';
        this.stateFrame = 0;
      }
      return events;
    }

    if (this.state === 'block_high' || this.state === 'block_low') {
      this.vx *= 0.82;
      this.applyPhysics(false);
      if (this.stunFrames > 0) {
        this.stunFrames -= 1;
      } else if (canControl && (this.input.isHeld('block') || (rel.back && opponent.state === 'attack'))) {
        this.state = rel.down ? 'block_low' : 'block_high';
      } else {
        this.state = rel.down ? 'crouch' : 'idle';
        this.stateFrame = 0;
      }
      return events;
    }

    if (this.state === 'knockdown_air') {
      this.applyPhysics(true, this.statuses.has('lift') ? 0.68 : 0.92);
      if (this.isGroundedOnFloor() && this.vy >= 0 && this.stateFrame > 6) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.vx *= 0.42;
        if (this.hp <= 0) {
          this.state = 'ko';
          this.stateFrame = 0;
        } else {
          this.state = 'grounded';
          this.stateFrame = 0;
          this.invulnFrames = 14;
        }
      }
      return events;
    }

    // 4. DASHES & BACK HANDSPRING
    if (this.state === 'dash_fwd' || this.state === 'back_handspring') {
      this.vx *= 0.90;
      this.applyPhysics(false);
      const duration = this.state === 'dash_fwd' ? 12 : 16;
      if (canControl && this.stateFrame >= 6 && this.state === 'dash_fwd') {
        const atk = this.input.consumeAny(['weapon', 'punch', 'kick'], currentFrame);
        if (atk) {
          this.dispatchGroundedAttack(atk, opponent, dist, statusTick.startupMultiplier, events);
          return events;
        }
      }
      if (this.stateFrame >= duration) {
        this.state = 'idle';
        this.stateFrame = 0;
      }
      return events;
    }

    // 5. JUMP & WALL JUMP (With responsive air drift!)
    if (this.state === 'jump' || this.state === 'wall_jump') {
      const wall = this.isNearWall();
      if (
        canControl &&
        this.state === 'jump' &&
        wall !== 0 &&
        this.stateFrame >= 3 &&
        this.stateFrame <= 20 &&
        ((wall === -1 && this.input.currentDir.x === 1) || (wall === 1 && this.input.currentDir.x === -1)) &&
        this.input.currentDir.y === -1
      ) {
        this.triggerWallJump(wall, events);
        return events;
      }

      if (canControl) {
        const airBtn = this.input.consumeAny(['weapon', 'kick', 'punch'], currentFrame);
        if (airBtn && this.y < GROUND_Y - 30) {
          const moveId: MoveId = airBtn.button === 'weapon' ? 'air_weapon' : 'air_kick';
          this.startMove(moveId, statusTick.startupMultiplier);
          events.moveStarted = moveId;
          return events;
        }
        if (this.input.currentDir.x !== 0) {
          this.vx += (this.input.currentDir.x * moveSpeed * 1.08 - this.vx) * 0.08;
        }
      }

      this.applyPhysics(true, this.statuses.has('lift') ? 0.78 : 1);
      if (this.isGroundedOnFloor() && this.vy >= 0) {
        this.y = GROUND_Y;
        this.vy = 0;
        this.vx *= 0.35;
        this.state = 'idle';
        this.stateFrame = 0;
      }
      return events;
    }

    // 6. ATTACK EXECUTION, COMBO CHAINING & HIT-CONFIRM DASH CANCEL
    if (this.state === 'attack' && this.currentMove) {
      const move = this.currentMove;
      if (this.stateFrame === move.impulseFrame) {
        this.vx += this.facing * move.forwardImpulse * 1.25;
      }
      if (move.id === 'magic_cast' && this.stateFrame === this.moveStartupFrames) {
        events.spawnMagic = true;
      }
      if (
        this.element.hasMoltenWake &&
        (move.id === 'weapon_overhead' || move.id === 'throw_forward' || move.id === 'suplex') &&
        this.stateFrame === this.moveStartupFrames + 2
      ) {
        events.spawnMoltenPool = true;
      }

      if (this.isGroundedOnFloor()) {
        this.vx *= 0.80;
      }
      this.applyPhysics(!this.isGroundedOnFloor());

      const totalRecovery = this.moveRecoveryFrames + this.freezeWeaponFrames;
      const totalDuration = this.moveStartupFrames + this.moveActiveFrames + totalRecovery;
      if (
        canControl &&
        move.nextComboMove &&
        move.cancelWindowStart &&
        this.stateFrame >= move.cancelWindowStart &&
        this.freezeWeaponFrames === 0
      ) {
        const expectedBtn = move.isWeapon
          ? 'weapon'
          : move.id === 'jab' || move.id === 'cross'
          ? 'punch'
          : 'kick';
        const chain = this.input.consumeButton(expectedBtn, currentFrame);
        if (chain) {
          this.startMove(move.nextComboMove, statusTick.startupMultiplier);
          events.moveStarted = move.nextComboMove;
          return events;
        }
      }

      if (
        canControl &&
        this.moveHitConnected &&
        this.stateFrame >= this.moveStartupFrames + this.moveActiveFrames + 2 &&
        this.freezeWeaponFrames === 0
      ) {
        const evadeCancel = this.input.consumeButton('evade', currentFrame);
        if (evadeCancel) {
          const r = this.input.getRelativeDirection(this.facing, evadeCancel.dir);
          if (r.forward) this.startForwardDash(events);
          else this.startBackHandspring(events);
          return events;
        }
      }

      if (this.stateFrame >= totalDuration) {
        this.currentMove = null;
        this.freezeWeaponFrames = 0;
        this.superArmorHits = 0;
        this.state = this.isGroundedOnFloor() ? 'idle' : 'jump';
        this.stateFrame = 0;
      }
      return events;
    }

    // 7. NEUTRAL / WALK / CROUCH / DEDICATED BLOCK
    if (!canControl) {
      this.vx *= 0.72;
      this.state = 'idle';
      this.applyPhysics(false);
      return events;
    }

    if (this.input.isHeld('block')) {
      this.state = rel.down ? 'block_low' : 'block_high';
      this.vx *= 0.65;
      this.applyPhysics(false);
      return events;
    }

    const doubleTap = this.input.consumeDoubleTap(currentFrame);
    if (doubleTap) {
      if (doubleTap.direction === this.facing) {
        this.startForwardDash(events);
        return events;
      } else {
        this.startBackHandspring(events);
        return events;
      }
    }

    const buffered = this.input.consumeAny(['magic', 'evade', 'weapon', 'punch', 'kick'], currentFrame);
    if (buffered) {
      if (buffered.button === 'magic' && this.magic >= 100) {
        this.magic = 0;
        this.startMove('magic_cast', statusTick.startupMultiplier);
        events.moveStarted = 'magic_cast';
        return events;
      }
      if (buffered.button === 'evade') {
        const r = this.input.getRelativeDirection(this.facing, buffered.dir);
        if (r.forward) {
          this.startForwardDash(events);
        } else {
          this.startBackHandspring(events);
        }
        return events;
      }
      if (buffered.button !== 'magic') {
        this.dispatchGroundedAttack(buffered, opponent, dist, statusTick.startupMultiplier, events);
        return events;
      }
    }

    if (rel.up) {
      const wall = this.isNearWall();
      if (wall !== 0 && ((wall === -1 && this.input.currentDir.x === 1) || (wall === 1 && this.input.currentDir.x === -1))) {
        this.triggerWallJump(wall, events);
        return events;
      }
      this.state = 'jump';
      this.stateFrame = 0;
      this.vy = -jumpImpulse;
      this.vx = this.input.currentDir.x * moveSpeed * 1.18;
      this.applyPhysics(true);
      return events;
    }

    if (rel.down) {
      this.state = 'crouch';
      this.vx *= 0.6;
    } else if (rel.forward) {
      this.state = 'walk_fwd';
      this.vx += (this.facing * moveSpeed - this.vx) * 0.45;
    } else if (rel.back) {
      this.state = 'walk_back';
      this.vx += (-this.facing * moveSpeed * 0.88 - this.vx) * 0.45;
      if (opponent.state === 'attack') {
        this.guardEnteredFrame = currentFrame;
      }
    } else {
      this.state = 'idle';
      this.vx *= 0.58;
    }

    this.applyPhysics(false);
    return events;
  }

  private startForwardDash(events: FighterActionEvents): void {
    this.state = 'dash_fwd';
    this.stateFrame = 0;
    const bonus = this.element.hasVoltDash ? 1.44 : 1.0;
    this.vx = this.facing * 16.5 * bonus;
    this.invulnFrames = this.element.hasVoltDash ? 9 : 5;
    this.afterimageTimer = this.element.hasVoltDash ? 18 : 13;
    if (this.element.hasVoltDash) events.voltDashTriggered = true;
  }

  private startBackHandspring(events: FighterActionEvents): void {
    this.state = 'back_handspring';
    this.stateFrame = 0;
    const bonus = this.element.hasVoltDash ? 1.4 : 1.0;
    this.vx = -this.facing * 16.0 * bonus;
    this.invulnFrames = this.element.hasVoltDash ? 13 : 10;
    this.afterimageTimer = this.element.hasVoltDash ? 18 : 13;
    if (this.element.hasVoltDash) events.voltDashTriggered = true;
  }

  private triggerWallJump(wall: -1 | 1, events: FighterActionEvents): void {
    this.state = 'wall_jump';
    this.stateFrame = 0;
    const bonus = this.element.wallJumpBonus;
    this.facing = wall === -1 ? 1 : -1;
    this.vx = this.facing * 13.8 * bonus;
    this.vy = -21.2 * bonus;
    this.invulnFrames = 13;
    this.afterimageTimer = 22;
    events.wallJumpTriggered = true;
  }

  private dispatchGroundedAttack(
    action: BufferedAction,
    opponent: Fighter,
    dist: number,
    startupScale: number,
    events: FighterActionEvents
  ): void {
    const r = this.input.getRelativeDirection(this.facing, action.dir);
    let moveId: MoveId = 'jab';

    const opponentGrounded = opponent.state === 'grounded';
    const isClose = dist < 96 && opponent.isGroundedOnFloor() && !opponentGrounded;
    const isBehindOpponent =
      isClose &&
      ((opponent.facing === 1 && this.x < opponent.x) ||
        (opponent.facing === -1 && this.x > opponent.x));

    if (action.button === 'punch') {
      if (isBehindOpponent && r.back) {
        moveId = 'suplex';
      } else if (isClose && r.back) {
        moveId = 'throw_back';
      } else if (isClose && r.forward) {
        moveId = 'throw_forward';
      } else if (r.down && r.back) {
        moveId = 'elbow_strike';
      } else {
        moveId = 'jab';
      }
    } else if (action.button === 'kick') {
      if (r.down && opponentGrounded && dist < 135) {
        moveId = 'sucker_kick';
      } else if (r.down && r.back) {
        moveId = 'horse_kick';
      } else if (r.down) {
        moveId = 'low_sweep';
      } else if (r.back) {
        moveId = 'back_kick';
      } else {
        moveId = 'high_kick';
      }
    } else if (action.button === 'weapon') {
      if (r.up) {
        moveId = 'weapon_overhead';
      } else if (r.forward) {
        moveId = 'weapon_thrust';
      } else {
        moveId = 'weapon_slash_1';
      }
    }

    this.startMove(moveId, startupScale);
    events.moveStarted = moveId;
  }

  public applyPhysics(inAir: boolean, gravityScale = 1): void {
    this.x += this.vx;
    if (inAir || this.y < GROUND_Y) {
      this.vy += GRAVITY * gravityScale;
      this.y += this.vy;
      if (this.y >= GROUND_Y) {
        this.y = GROUND_Y;
        if (this.vy > 0) this.vy = 0;
      }
    }
    if (this.x < ARENA_LEFT) {
      this.x = ARENA_LEFT;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x > ARENA_RIGHT) {
      this.x = ARENA_RIGHT;
      if (this.vx > 0) this.vx = 0;
    }
  }
}
