import type { StatusEffectId } from './elementRegistry';

export interface ActiveStatus {
  id: StatusEffectId;
  label: string;
  color: string;
  remainingFrames: number;
  maxFrames: number;
  tickCounter: number;
}

export interface FloorHazard {
  id: number;
  ownerId: 'p1' | 'p2';
  x: number;
  halfWidth: number;
  remainingFrames: number;
  maxFrames: number;
  tickCounter: number;
  color: number;
  glowColor: number;
}

export interface StatusTickResult {
  dotDamage: number;
  magicDrain: number;
  moveSpeedMultiplier: number;
  startupMultiplier: number;
  extraChipMultiplier: number;
  shockPulse: boolean;
}

const STATUS_META: Record<StatusEffectId, { label: string; color: string; duration: number }> = {
  burn: { label: 'BURN', color: '#ff6a1a', duration: 240 },
  chill: { label: 'FREEZE', color: '#4be3ff', duration: 240 },
  shock: { label: 'SHOCK', color: '#ffd84a', duration: 150 },
  soaked: { label: 'SOAKED', color: '#3bc4ff', duration: 210 },
  crush: { label: 'CRUSH', color: '#e6b95c', duration: 180 },
  lift: { label: 'GALE', color: '#7cf0bd', duration: 150 },
  hex: { label: 'HEX', color: '#b59cff', duration: 210 },
  scorched: { label: 'SCORCHED', color: '#ff4b1f', duration: 240 },
};

export class StatusEffectManager {
  private active: Map<StatusEffectId, ActiveStatus> = new Map();

  public apply(id: StatusEffectId, durationScale = 1): ActiveStatus {
    const meta = STATUS_META[id];
    const frames = Math.round(meta.duration * durationScale);
    const existing = this.active.get(id);
    if (existing) {
      existing.remainingFrames = Math.max(existing.remainingFrames, frames);
      existing.maxFrames = Math.max(existing.maxFrames, frames);
      return existing;
    }
    const status: ActiveStatus = {
      id,
      label: meta.label,
      color: meta.color,
      remainingFrames: frames,
      maxFrames: frames,
      tickCounter: 0,
    };
    this.active.set(id, status);
    return status;
  }

  public clear(): void {
    this.active.clear();
  }

  public has(id: StatusEffectId): boolean {
    return this.active.has(id);
  }

  public getAll(): ActiveStatus[] {
    return Array.from(this.active.values());
  }

  public tick(): StatusTickResult {
    let dotDamage = 0;
    let magicDrain = 0;
    let moveSpeedMultiplier = 1;
    let startupMultiplier = 1;
    let extraChipMultiplier = 1;
    let shockPulse = false;

    for (const [id, status] of this.active.entries()) {
      status.remainingFrames -= 1;
      status.tickCounter += 1;

      if (id === 'burn') {
        extraChipMultiplier = Math.max(extraChipMultiplier, 1.35);
        if (status.tickCounter % 30 === 0) {
          dotDamage += 9;
        }
      } else if (id === 'chill') {
        moveSpeedMultiplier = Math.min(moveSpeedMultiplier, 0.7); // -30% move speed
        startupMultiplier = Math.max(startupMultiplier, 1.15);
      } else if (id === 'shock') {
        if (status.tickCounter % 50 === 0) {
          dotDamage += 6;
          shockPulse = true;
        }
      } else if (id === 'soaked') {
        moveSpeedMultiplier = Math.min(moveSpeedMultiplier, 0.88);
      } else if (id === 'crush') {
        extraChipMultiplier = Math.max(extraChipMultiplier, 1.5);
      } else if (id === 'hex') {
        if (status.tickCounter % 20 === 0) {
          magicDrain += 2.2;
        }
      } else if (id === 'scorched') {
        extraChipMultiplier = Math.max(extraChipMultiplier, 1.6);
        if (status.tickCounter % 25 === 0) {
          dotDamage += 10;
        }
      }

      if (status.remainingFrames <= 0) {
        this.active.delete(id);
      }
    }

    return {
      dotDamage,
      magicDrain,
      moveSpeedMultiplier,
      startupMultiplier,
      extraChipMultiplier,
      shockPulse,
    };
  }
}
