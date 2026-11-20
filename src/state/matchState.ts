import type { ElementId } from '../elements/elementRegistry';
import type { MatchFormat } from './settingsStore';

export type ScreenMode = 'select' | 'fighting' | 'round_over' | 'match_over';

export interface BannerEvent {
  text: string;
  subtext?: string;
  color: string;
  remainingFrames: number;
  maxFrames: number;
  isUlt?: boolean;
}

export interface CombatCallout {
  id: number;
  side: 'p1' | 'p2';
  text: string;
  color: string;
  x: number;
  y: number;
  remainingFrames: number;
  maxFrames: number;
}

export interface MatchSnapshot {
  screen: ScreenMode;
  p1Element: ElementId;
  p2Element: ElementId;
  roundNumber: number;
  p1Rounds: number;
  p2Rounds: number;
  roundsToWin: number;
  timerSeconds: number;
  paused: boolean;
  roundIntroFrames: number;
  roundOverFrames: number;
  matchWinner: 'p1' | 'p2' | 'draw' | null;
  p1Combo: number;
  p2Combo: number;
  p1ComboTimer: number;
  p2ComboTimer: number;
  banner: BannerEvent | null;
  callouts: CombatCallout[];
}

export class MatchStateStore {
  public screen: ScreenMode = 'fighting';
  public p1Element: ElementId = 'fire';
  public p2Element: ElementId = 'ice';
  public roundNumber = 1;
  public p1Rounds = 0;
  public p2Rounds = 0;
  public roundsToWin = 2;
  public timerSeconds = 99;
  public timerTickCounter = 0;
  public paused = false;
  public roundIntroFrames = 90;
  public roundOverFrames = 0;
  public matchWinner: 'p1' | 'p2' | 'draw' | null = null;
  public p1Combo = 0;
  public p2Combo = 0;
  public p1ComboTimer = 0;
  public p2ComboTimer = 0;
  public p1ComboLive = false;
  public p2ComboLive = false;
  public banner: BannerEvent | null = null;
  public callouts: CombatCallout[] = [];
  private nextCalloutId = 1;

  public configureFormat(format: MatchFormat): void {
    if (format === 'bo3') this.roundsToWin = 2;
    else if (format === 'bo5') this.roundsToWin = 3;
    else this.roundsToWin = 999; // Endless Dojo
  }

  public startNewMatch(p1: ElementId, p2: ElementId, format: MatchFormat): void {
    this.p1Element = p1;
    this.p2Element = p2;
    this.configureFormat(format);
    this.roundNumber = 1;
    this.p1Rounds = 0;
    this.p2Rounds = 0;
    this.matchWinner = null;
    this.paused = false;
    this.screen = 'fighting';
    this.beginRound();
  }

  public beginRound(): void {
    this.timerSeconds = 99;
    this.timerTickCounter = 0;
    this.roundIntroFrames = 78;
    this.roundOverFrames = 0;
    this.p1Combo = 0;
    this.p2Combo = 0;
    this.p1ComboTimer = 0;
    this.p2ComboTimer = 0;
    this.p1ComboLive = false;
    this.p2ComboLive = false;
    this.callouts = [];
    this.screen = 'fighting';
    this.showBanner(`ROUND ${this.roundNumber}`, 'PREPARE FOR COMBAT', '#ffd685', 52);
  }

  public showBanner(
    text: string,
    subtext: string | undefined,
    color: string,
    duration = 75,
    isUlt = false
  ): void {
    this.banner = {
      text,
      subtext,
      color,
      remainingFrames: duration,
      maxFrames: duration,
      isUlt,
    };
  }

  public pushCallout(side: 'p1' | 'p2', text: string, color: string, x: number, y: number): void {
    this.callouts.push({
      id: this.nextCalloutId++,
      side,
      text,
      color,
      x,
      y,
      remainingFrames: 54,
      maxFrames: 54,
    });
    if (this.callouts.length > 10) {
      this.callouts.shift();
    }
  }

  public registerHit(attacker: 'p1' | 'p2'): number {
    if (attacker === 'p1') {
      this.p1Combo = this.p1ComboLive ? this.p1Combo + 1 : 1;
      this.p1ComboLive = true;
      this.p1ComboTimer = 75;
      return this.p1Combo;
    } else {
      this.p2Combo = this.p2ComboLive ? this.p2Combo + 1 : 1;
      this.p2ComboLive = true;
      this.p2ComboTimer = 75;
      return this.p2Combo;
    }
  }

  public endComboChain(attacker: 'p1' | 'p2'): void {
    if (attacker === 'p1') {
      if (this.p1ComboLive) {
        this.p1ComboLive = false;
        this.p1ComboTimer = Math.min(this.p1ComboTimer, 28);
      }
    } else {
      if (this.p2ComboLive) {
        this.p2ComboLive = false;
        this.p2ComboTimer = Math.min(this.p2ComboTimer, 28);
      }
    }
  }

  public getDamageScaling(comboCount: number): number {
    if (comboCount <= 1) return 1.0;
    return Math.max(0.42, 1.0 - (comboCount - 1) * 0.11);
  }

  public tickTimers(isEndless: boolean): { roundStartedNow: boolean; timeUp: boolean } {
    let roundStartedNow = false;
    let timeUp = false;

    if (this.banner) {
      this.banner.remainingFrames -= 1;
      if (this.banner.remainingFrames <= 0) {
        this.banner = null;
      }
    }

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      this.callouts[i].remainingFrames -= 1;
      this.callouts[i].y -= 0.7;
      if (this.callouts[i].remainingFrames <= 0) {
        this.callouts.splice(i, 1);
      }
    }

    if (this.p1ComboTimer > 0) {
      this.p1ComboTimer -= 1;
      if (this.p1ComboTimer === 0) {
        this.p1Combo = 0;
        this.p1ComboLive = false;
      }
    }
    if (this.p2ComboTimer > 0) {
      this.p2ComboTimer -= 1;
      if (this.p2ComboTimer === 0) {
        this.p2Combo = 0;
        this.p2ComboLive = false;
      }
    }

    if (this.screen === 'fighting') {
      if (this.roundIntroFrames > 0) {
        this.roundIntroFrames -= 1;
        if (this.roundIntroFrames === 26) {
          this.showBanner('FIGHT!', undefined, '#ffae34', 34);
          roundStartedNow = true;
        }
      } else if (!isEndless) {
        this.timerTickCounter += 1;
        if (this.timerTickCounter >= 60) {
          this.timerTickCounter = 0;
          if (this.timerSeconds > 0) {
            this.timerSeconds -= 1;
          }
          if (this.timerSeconds === 0) {
            timeUp = true;
          }
        }
      }
    } else if (this.screen === 'round_over') {
      if (this.roundOverFrames > 0) {
        this.roundOverFrames -= 1;
      }
    }

    return { roundStartedNow, timeUp };
  }

  public concludeRound(winner: 'p1' | 'p2' | 'draw', isEndless: boolean): boolean {
    if (winner === 'p1') this.p1Rounds += 1;
    else if (winner === 'p2') this.p2Rounds += 1;

    if (!isEndless && (this.p1Rounds >= this.roundsToWin || this.p2Rounds >= this.roundsToWin)) {
      this.screen = 'match_over';
      this.matchWinner = this.p1Rounds >= this.roundsToWin ? 'p1' : 'p2';
      this.showBanner(
        this.matchWinner === 'p1' ? 'VICTORY' : 'DEFEAT',
        `${this.p1Rounds} — ${this.p2Rounds}`,
        this.matchWinner === 'p1' ? '#ffae34' : '#4be3ff',
        9999
      );
      return true;
    }

    this.screen = 'round_over';
    this.roundOverFrames = 115;
    const label = winner === 'draw' ? 'DOUBLE K.O.' : 'K.O.';
    const sub = winner === 'p1' ? 'PLAYER 1 TAKES THE ROUND' : winner === 'p2' ? 'OPPONENT TAKES THE ROUND' : 'DRAW ROUND';
    this.showBanner(label, sub, winner === 'p1' ? '#ff7d29' : '#4be3ff', 110);
    return false;
  }

  public snapshot(): MatchSnapshot {
    return {
      screen: this.screen,
      p1Element: this.p1Element,
      p2Element: this.p2Element,
      roundNumber: this.roundNumber,
      p1Rounds: this.p1Rounds,
      p2Rounds: this.p2Rounds,
      roundsToWin: this.roundsToWin,
      timerSeconds: this.timerSeconds,
      paused: this.paused,
      roundIntroFrames: this.roundIntroFrames,
      roundOverFrames: this.roundOverFrames,
      matchWinner: this.matchWinner,
      p1Combo: this.p1Combo,
      p2Combo: this.p2Combo,
      p1ComboTimer: this.p1ComboTimer,
      p2ComboTimer: this.p2ComboTimer,
      banner: this.banner,
      callouts: this.callouts,
    };
  }
}
