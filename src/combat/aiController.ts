import type { AiTier } from '../state/settingsStore';
import type { Fighter } from './fighterStateMachine';

interface AiConfig {
  reactionFrames: number;
  guardChance: number;
  aggressiveness: number;
  comboChance: number;
  throwChance: number;
  magicChance: number;
  wallJumpChance: number;
  counterChance: number;
}

const AI_PROFILES: Record<AiTier, AiConfig> = {
  novice: {
    reactionFrames: 26,
    guardChance: 0.24,
    aggressiveness: 0.36,
    comboChance: 0.25,
    throwChance: 0.12,
    magicChance: 0.28,
    wallJumpChance: 0.15,
    counterChance: 0.18,
  },
  warrior: {
    reactionFrames: 16,
    guardChance: 0.5,
    aggressiveness: 0.56,
    comboChance: 0.54,
    throwChance: 0.34,
    magicChance: 0.55,
    wallJumpChance: 0.45,
    counterChance: 0.42,
  },
  master: {
    reactionFrames: 10,
    guardChance: 0.72,
    aggressiveness: 0.74,
    comboChance: 0.76,
    throwChance: 0.54,
    magicChance: 0.78,
    wallJumpChance: 0.72,
    counterChance: 0.68,
  },
  shadow: {
    reactionFrames: 6, // 6f reaction per GDD Section 6
    guardChance: 0.88,
    aggressiveness: 0.88,
    comboChance: 0.92,
    throwChance: 0.72,
    magicChance: 0.9,
    wallJumpChance: 0.88,
    counterChance: 0.86,
  },
};

export class AiController {
  private decisionCooldown = 0;
  private holdGuardFrames = 0;
  private desiredMoveDir: -1 | 0 | 1 = 0;
  private desiredCrouch = false;
  private comboStepQueued = false;

  public reset(): void {
    this.decisionCooldown = 14;
    this.holdGuardFrames = 0;
    this.desiredMoveDir = 0;
    this.desiredCrouch = false;
    this.comboStepQueued = false;
  }

  public update(
    ai: Fighter,
    target: Fighter,
    tier: AiTier,
    currentFrame: number,
    canFight: boolean
  ): void {
    if (!canFight || ai.state === 'ko' || ai.state === 'victory') {
      ai.input.setDirection(0, 0, currentFrame);
      return;
    }

    const cfg = AI_PROFILES[tier];
    const dist = Math.abs(target.x - ai.x);
    const dirToTarget: -1 | 1 = target.x >= ai.x ? 1 : -1;
    const dirAway: -1 | 1 = dirToTarget === 1 ? -1 : 1;

    // Release transient button presses each tick so new presses register cleanly
    ai.input.releaseButton('punch');
    ai.input.releaseButton('kick');
    ai.input.releaseButton('weapon');
    ai.input.releaseButton('magic');
    ai.input.releaseButton('evade');

    // 1. Grounded Wake-Up Decision
    if (ai.state === 'grounded' && ai.stateFrame >= 27) {
      const roll = Math.random();
      if (dist < 130 && roll < 0.48) {
        ai.input.setDirection(0, 1, currentFrame);
        ai.input.pressButton('kick', currentFrame); // Wake-up sweep
      } else if (ai.isNearWall() !== 0 || roll < 0.78) {
        ai.input.setDirection(dirToTarget, 0, currentFrame); // Forward roll out of corner
      } else {
        ai.input.setDirection(dirAway, 0, currentFrame); // Back roll
      }
      return;
    }

    // 2. Shadow Step cancel during roll
    if (ai.element.hasShadowStep && (ai.state === 'roll_fwd' || ai.state === 'roll_back') && ai.stateFrame === 10) {
      if (Math.random() < cfg.counterChance) {
        ai.input.pressButton('evade', currentFrame);
      }
      return;
    }

    // 3. Combo Follow-up Chaining
    if (ai.state === 'attack' && ai.currentMove?.nextComboMove && ai.currentMove.cancelWindowStart) {
      if (ai.stateFrame === ai.currentMove.cancelWindowStart + 1 && !this.comboStepQueued) {
        this.comboStepQueued = true;
        if (Math.random() < cfg.comboChance && dist < 175) {
          const btn = ai.currentMove.isWeapon
            ? 'weapon'
            : ai.currentMove.id === 'jab' || ai.currentMove.id === 'cross'
            ? 'punch'
            : 'kick';
          ai.input.pressButton(btn, currentFrame);
        }
      }
      return;
    } else {
      this.comboStepQueued = false;
    }

    // 4. Active Guard Hold
    if (this.holdGuardFrames > 0) {
      this.holdGuardFrames -= 1;
      const crouchLow = target.currentMove?.height === 'low';
      ai.input.setDirection(dirAway, crouchLow ? 1 : 0, currentFrame);
      return;
    }

    // 5. Threat Reaction (Guard, Evasive Counter, or Back Handspring)
    if (
      target.state === 'attack' &&
      target.currentMove &&
      dist < (target.currentMove.isWeapon ? 195 : 145) &&
      target.stateFrame >= Math.max(1, cfg.reactionFrames - 3) &&
      this.decisionCooldown <= 4
    ) {
      const r = Math.random();
      if (r < cfg.guardChance) {
        this.holdGuardFrames = 14 + Math.floor(Math.random() * 10);
        const low = target.currentMove.height === 'low';
        ai.input.setDirection(dirAway, low ? 1 : 0, currentFrame);
        this.decisionCooldown = cfg.reactionFrames;
        return;
      } else if (r < cfg.guardChance + cfg.counterChance * 0.45 && target.currentMove.height === 'high') {
        // Duck/lean with Horse Kick or Elbow Strike
        ai.input.setDirection(dirAway, 1, currentFrame);
        ai.input.pressButton(dist < 90 ? 'punch' : 'kick', currentFrame);
        this.decisionCooldown = cfg.reactionFrames + 8;
        return;
      }
    }

    // 6. Periodic Tactical Decisions
    if (this.decisionCooldown > 0) {
      this.decisionCooldown -= 1;
      ai.input.setDirection(this.desiredMoveDir, this.desiredCrouch ? 1 : 0, currentFrame);
      return;
    }

    this.decisionCooldown = cfg.reactionFrames + Math.floor(Math.random() * 10);
    this.desiredCrouch = false;

    // Corner Escape Wall Jump
    const wall = ai.isNearWall();
    if (wall !== 0 && dist < 175 && Math.random() < cfg.wallJumpChance * 0.45) {
      ai.input.setDirection(wall === -1 ? 1 : -1, -1, currentFrame);
      return;
    }

    // Ground Punish (Sucker Kick) when player is grounded
    if (target.state === 'grounded' && dist < 125 && Math.random() < cfg.aggressiveness) {
      ai.input.setDirection(0, 1, currentFrame);
      ai.input.pressButton('kick', currentFrame);
      return;
    }

    // Cast Signature Elemental Magic when charged
    if (ai.magic >= 100 && dist > 95 && dist < 440 && Math.random() < cfg.magicChance * 0.55) {
      ai.input.setDirection(dirToTarget, 0, currentFrame);
      ai.input.pressButton('magic', currentFrame);
      return;
    }

    // Point-Blank Range: Throws, Elbow Strike, or Fast Jab
    if (dist < 88) {
      const r = Math.random();
      if (r < cfg.throwChance * 0.48) {
        const throwDir = ai.isNearWall() !== 0 ? dirAway : dirToTarget;
        ai.input.setDirection(throwDir, 0, currentFrame);
        ai.input.pressButton('punch', currentFrame);
      } else if (r < 0.72) {
        ai.input.setDirection(dirAway, 1, currentFrame);
        ai.input.pressButton('punch', currentFrame); // Elbow Strike
      } else if (r < 0.88) {
        ai.input.setDirection(0, 0, currentFrame);
        ai.input.pressButton('punch', currentFrame);
      } else {
        ai.input.setDirection(dirAway, 0, currentFrame);
        ai.input.pressButton('evade', currentFrame); // Back Handspring
      }
      return;
    }

    // Mid Weapon / Kick Range
    const idealReach = ai.element.weaponReach + 24;
    if (dist < idealReach) {
      const r = Math.random();
      if (r < cfg.aggressiveness * 0.42) {
        ai.input.setDirection(r < 0.14 ? dirToTarget : 0, 0, currentFrame);
        ai.input.pressButton('weapon', currentFrame);
      } else if (r < cfg.aggressiveness * 0.68) {
        const lowOrBack = Math.random();
        if (lowOrBack < 0.35) ai.input.setDirection(0, 1, currentFrame);
        else if (lowOrBack < 0.65) ai.input.setDirection(dirAway, 0, currentFrame);
        else ai.input.setDirection(0, 0, currentFrame);
        ai.input.pressButton('kick', currentFrame);
      } else if (r < cfg.aggressiveness * 0.82) {
        ai.input.setDirection(0, -1, currentFrame); // Overhead weapon or jump
        if (Math.random() < 0.65) ai.input.pressButton('weapon', currentFrame);
      } else {
        // Footsie micro-spacing
        this.desiredMoveDir = Math.random() < 0.5 ? dirAway : dirToTarget;
        ai.input.setDirection(this.desiredMoveDir, 0, currentFrame);
      }
      return;
    }

    // Far Range: Approach, Forward Dash, or Jump-In
    const approach = Math.random();
    if (approach < 0.22 && dist > 260) {
      ai.input.setDirection(dirToTarget, 0, currentFrame);
      ai.input.pressButton('evade', currentFrame); // Forward Dash
    } else if (approach < 0.34 && dist < 340) {
      ai.input.setDirection(dirToTarget, -1, currentFrame); // Jump-in
    } else {
      this.desiredMoveDir = dirToTarget;
      ai.input.setDirection(dirToTarget, 0, currentFrame);
    }
  }
}
