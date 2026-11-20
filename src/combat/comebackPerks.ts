export interface PerkTriggerEvent {
  perk: 'enlightenment' | 'desperate' | 'avenger' | 'mirror' | 'rock';
  label: string;
  color: string;
}

export class ComebackPerkState {
  public enlightenmentUsedMatch = false;
  public rockReadyRound = true;
  public avengerFrames = 0; // 5 seconds (300 frames) after taking critical knockdown -> 160% crit
  public mirrorFrames = 0; // 90 frames after clean guard -> +50% counter damage
  public desperateActive = false;

  public resetForRound(): void {
    this.rockReadyRound = true;
    this.avengerFrames = 0;
    this.mirrorFrames = 0;
    this.desperateActive = false;
  }

  public resetForMatch(): void {
    this.enlightenmentUsedMatch = false;
    this.resetForRound();
  }

  public tick(hp: number, maxHp: number): void {
    if (this.avengerFrames > 0) this.avengerFrames -= 1;
    if (this.mirrorFrames > 0) this.mirrorFrames -= 1;
    this.desperateActive = hp > 0 && hp / maxHp < 0.2;
  }

  public onCleanGuard(): PerkTriggerEvent {
    this.mirrorFrames = 95;
    return {
      perk: 'mirror',
      label: 'MIRROR +50%',
      color: '#9cf4ff',
    };
  }

  public onCriticalKnockdownTaken(): PerkTriggerEvent {
    this.avengerFrames = 300; // 5 seconds at 60Hz
    return {
      perk: 'avenger',
      label: 'AVENGER READY',
      color: '#ff6b4a',
    };
  }

  public tryRockArmor(incomingDamage: number, isCritical: boolean): {
    triggered: boolean;
    reflectedDamage: number;
    event?: PerkTriggerEvent;
  } {
    if (!isCritical || !this.rockReadyRound) {
      return { triggered: false, reflectedDamage: 0 };
    }
    this.rockReadyRound = false;
    return {
      triggered: true,
      reflectedDamage: Math.round(incomingDamage * 0.4),
      event: {
        perk: 'rock',
        label: 'ROCK POISE!',
        color: '#f2c057',
      },
    };
  }

  public tryEnlightenment(nextHp: number, maxHp: number): {
    triggered: boolean;
    restoredHp: number;
    event?: PerkTriggerEvent;
  } {
    if (nextHp > 0 || this.enlightenmentUsedMatch) {
      return { triggered: false, restoredHp: nextHp };
    }
    this.enlightenmentUsedMatch = true;
    const restored = Math.max(1, Math.round(maxHp * 0.25));
    return {
      triggered: true,
      restoredHp: restored,
      event: {
        perk: 'enlightenment',
        label: 'ENLIGHTENMENT!',
        color: '#ffe57f',
      },
    };
  }

  public computeOutgoingMultiplier(): {
    multiplier: number;
    guaranteedCrit: boolean;
    consumedMirror: boolean;
    consumedAvenger: boolean;
  } {
    let multiplier = 1.0;
    let guaranteedCrit = false;
    let consumedMirror = false;
    let consumedAvenger = false;

    if (this.desperateActive) {
      multiplier *= 1.25;
    }
    if (this.mirrorFrames > 0) {
      multiplier *= 1.5;
      this.mirrorFrames = 0;
      consumedMirror = true;
    }
    if (this.avengerFrames > 0) {
      multiplier *= 1.6;
      guaranteedCrit = true;
      this.avengerFrames = 0;
      consumedAvenger = true;
    }

    return { multiplier, guaranteedCrit, consumedMirror, consumedAvenger };
  }

  public getActiveBadges(): { label: string; color: string }[] {
    const badges: { label: string; color: string }[] = [];
    if (this.desperateActive) badges.push({ label: 'DESPERATE', color: '#ff5e3a' });
    if (this.avengerFrames > 0) badges.push({ label: 'AVENGER', color: '#ffae34' });
    if (this.mirrorFrames > 0) badges.push({ label: 'MIRROR', color: '#7ceeff' });
    return badges;
  }
}
