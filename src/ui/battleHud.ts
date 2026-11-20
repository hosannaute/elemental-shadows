import type { Fighter } from '../combat/fighterStateMachine';
import type { MatchStateStore } from '../state/matchState';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../engine/cameraController';

export interface HudCallbacks {
  onOpenPause: () => void;
  onOpenRoster: () => void;
  onRematch: () => void;
}

export class BattleHud {
  public readonly element: HTMLDivElement;

  private p1CrestEl!: HTMLElement;
  private p2CrestEl!: HTMLElement;
  private p1NameEl!: HTMLElement;
  private p2NameEl!: HTMLElement;
  private p1HpFillEl!: HTMLElement;
  private p1HpTrailEl!: HTMLElement;
  private p2HpFillEl!: HTMLElement;
  private p2HpTrailEl!: HTMLElement;
  private p1MagicFillEl!: HTMLElement;
  private p2MagicFillEl!: HTMLElement;
  private p1MagicWrapEl!: HTMLElement;
  private p2MagicWrapEl!: HTMLElement;
  private p1StatusesEl!: HTMLElement;
  private p2StatusesEl!: HTMLElement;
  private p1JewelsEl!: HTMLElement;
  private p2JewelsEl!: HTMLElement;
  private timerEl!: HTMLElement;

  private p1ComboEl!: HTMLElement;
  private p2ComboEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerTitleEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;
  private matchOverActionsEl!: HTMLElement;
  private calloutsLayerEl!: HTMLElement;

  private lastP1ElementId = '';
  private lastP2ElementId = '';
  private lastJewelsKey = '';

  constructor(callbacks: HudCallbacks) {
    this.element = document.createElement('div');
    this.element.className = 'battle-hud';
    this.element.innerHTML = `
      <header class="hud-top-bar">
        <!-- P1 SIDE -->
        <div class="hud-fighter hud-p1">
          <div class="crest-wrap p1-crest-wrap">
            <span class="player-tag">P1</span>
            <div class="element-crest" id="hud-p1-crest"></div>
          </div>
          <div class="bars-column">
            <div class="fighter-meta-row">
              <span class="fighter-name" id="hud-p1-name">IGNIS</span>
              <div class="round-jewels" id="hud-p1-jewels"></div>
            </div>
            <div class="hp-bar-frame">
              <div class="hp-trail-fill p1-trail" id="hud-p1-hp-trail"></div>
              <div class="hp-fill p1-hp" id="hud-p1-hp"></div>
            </div>
            <div class="magic-row">
              <span class="magic-label">MAGIC</span>
              <div class="magic-bar-frame" id="hud-p1-magic-wrap">
                <div class="magic-fill p1-magic" id="hud-p1-magic"></div>
              </div>
            </div>
            <div class="status-badges" id="hud-p1-statuses"></div>
          </div>
        </div>

        <!-- CENTER TIMER & CONTROLS -->
        <div class="hud-center-cluster">
          <div class="timer-emblem" title="Round Timer">
            <span class="timer-value" id="hud-timer">99</span>
          </div>
          <div class="hud-top-actions">
            <button class="hud-icon-btn" id="btn-hud-roster" title="8-Element Roster" aria-label="Change Fighters">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="hud-icon-btn" id="btn-hud-pause" title="Pause & Settings (Esc)" aria-label="Pause Settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3.2"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- P2 SIDE -->
        <div class="hud-fighter hud-p2">
          <div class="bars-column">
            <div class="fighter-meta-row">
              <div class="round-jewels" id="hud-p2-jewels"></div>
              <span class="fighter-name" id="hud-p2-name">FROST</span>
            </div>
            <div class="hp-bar-frame">
              <div class="hp-trail-fill p2-trail" id="hud-p2-hp-trail"></div>
              <div class="hp-fill p2-hp" id="hud-p2-hp"></div>
            </div>
            <div class="magic-row magic-row-right">
              <div class="magic-bar-frame" id="hud-p2-magic-wrap">
                <div class="magic-fill p2-magic" id="hud-p2-magic"></div>
              </div>
              <span class="magic-label">MAGIC</span>
            </div>
            <div class="status-badges status-badges-right" id="hud-p2-statuses"></div>
          </div>
          <div class="crest-wrap p2-crest-wrap">
            <span class="player-tag">P2</span>
            <div class="element-crest" id="hud-p2-crest"></div>
          </div>
        </div>
      </header>

      <!-- COMBAT READOUT LAYER -->
      <div class="combo-readout combo-p1" id="hud-p1-combo"></div>
      <div class="combo-readout combo-p2" id="hud-p2-combo"></div>
      <div class="callouts-layer" id="hud-callouts"></div>

      <!-- CENTER ROUND / KO BANNER -->
      <div class="round-banner hidden" id="hud-banner">
        <div class="round-banner-title" id="hud-banner-title">ROUND 1</div>
        <div class="round-banner-sub" id="hud-banner-sub"></div>
        <div class="match-over-actions hidden" id="hud-match-over-actions">
          <button class="action-pill primary" id="btn-hud-rematch">REMATCH</button>
          <button class="action-pill" id="btn-hud-change">CHANGE FIGHTERS</button>
        </div>
      </div>
    `;

    this.p1CrestEl = this.element.querySelector('#hud-p1-crest')!;
    this.p2CrestEl = this.element.querySelector('#hud-p2-crest')!;
    this.p1NameEl = this.element.querySelector('#hud-p1-name')!;
    this.p2NameEl = this.element.querySelector('#hud-p2-name')!;
    this.p1HpFillEl = this.element.querySelector('#hud-p1-hp')!;
    this.p1HpTrailEl = this.element.querySelector('#hud-p1-hp-trail')!;
    this.p2HpFillEl = this.element.querySelector('#hud-p2-hp')!;
    this.p2HpTrailEl = this.element.querySelector('#hud-p2-hp-trail')!;
    this.p1MagicFillEl = this.element.querySelector('#hud-p1-magic')!;
    this.p2MagicFillEl = this.element.querySelector('#hud-p2-magic')!;
    this.p1MagicWrapEl = this.element.querySelector('#hud-p1-magic-wrap')!;
    this.p2MagicWrapEl = this.element.querySelector('#hud-p2-magic-wrap')!;
    this.p1StatusesEl = this.element.querySelector('#hud-p1-statuses')!;
    this.p2StatusesEl = this.element.querySelector('#hud-p2-statuses')!;
    this.p1JewelsEl = this.element.querySelector('#hud-p1-jewels')!;
    this.p2JewelsEl = this.element.querySelector('#hud-p2-jewels')!;
    this.timerEl = this.element.querySelector('#hud-timer')!;
    this.p1ComboEl = this.element.querySelector('#hud-p1-combo')!;
    this.p2ComboEl = this.element.querySelector('#hud-p2-combo')!;
    this.bannerEl = this.element.querySelector('#hud-banner')!;
    this.bannerTitleEl = this.element.querySelector('#hud-banner-title')!;
    this.bannerSubEl = this.element.querySelector('#hud-banner-sub')!;
    this.matchOverActionsEl = this.element.querySelector('#hud-match-over-actions')!;
    this.calloutsLayerEl = this.element.querySelector('#hud-callouts')!;

    this.element.querySelector('#btn-hud-pause')!.addEventListener('click', callbacks.onOpenPause);
    this.element.querySelector('#btn-hud-roster')!.addEventListener('click', callbacks.onOpenRoster);
    this.element.querySelector('#btn-hud-rematch')!.addEventListener('click', callbacks.onRematch);
    this.element.querySelector('#btn-hud-change')!.addEventListener('click', callbacks.onOpenRoster);
  }

  public update(p1: Fighter, p2: Fighter, match: MatchStateStore): void {
    // Sync elemental crests & accents when fighters change
    if (this.lastP1ElementId !== p1.element.id) {
      this.lastP1ElementId = p1.element.id;
      this.p1CrestEl.innerHTML = p1.element.crestSvg;
      this.p1CrestEl.style.color = p1.element.cssPrimary;
      this.p1CrestEl.style.boxShadow = `0 0 18px ${p1.element.cssPrimary}88, inset 0 0 12px ${p1.element.cssGlow}55`;
      this.p1CrestEl.style.borderColor = p1.element.cssGlow;
      this.p1NameEl.textContent = p1.element.fighterName;
      this.p1MagicFillEl.style.background = `linear-gradient(90deg, ${p1.element.cssPrimary}, ${p1.element.cssGlow})`;
      this.element.style.setProperty('--p1-color', p1.element.cssPrimary);
      this.element.style.setProperty('--p1-glow', p1.element.cssGlow);
    }

    if (this.lastP2ElementId !== p2.element.id) {
      this.lastP2ElementId = p2.element.id;
      this.p2CrestEl.innerHTML = p2.element.crestSvg;
      this.p2CrestEl.style.color = p2.element.cssPrimary;
      this.p2CrestEl.style.boxShadow = `0 0 18px ${p2.element.cssPrimary}88, inset 0 0 12px ${p2.element.cssGlow}55`;
      this.p2CrestEl.style.borderColor = p2.element.cssGlow;
      this.p2NameEl.textContent = p2.element.fighterName;
      this.p2MagicFillEl.style.background = `linear-gradient(270deg, ${p2.element.cssPrimary}, ${p2.element.cssGlow})`;
      this.element.style.setProperty('--p2-color', p2.element.cssPrimary);
      this.element.style.setProperty('--p2-glow', p2.element.cssGlow);
    }

    // HP bars + trailing delayed-damage bars
    const p1Pct = Math.max(0, Math.min(100, (p1.hp / p1.maxHp) * 100));
    const p1Trail = Math.max(p1Pct, Math.min(100, (p1.trailingHp / p1.maxHp) * 100));
    this.p1HpFillEl.style.width = `${p1Pct.toFixed(1)}%`;
    this.p1HpTrailEl.style.width = `${p1Trail.toFixed(1)}%`;

    const p2Pct = Math.max(0, Math.min(100, (p2.hp / p2.maxHp) * 100));
    const p2Trail = Math.max(p2Pct, Math.min(100, (p2.trailingHp / p2.maxHp) * 100));
    this.p2HpFillEl.style.width = `${p2Pct.toFixed(1)}%`;
    this.p2HpTrailEl.style.width = `${p2Trail.toFixed(1)}%`;

    // Magic meters + pulsing full indicator
    this.p1MagicFillEl.style.width = `${Math.min(100, p1.magic).toFixed(1)}%`;
    this.p1MagicWrapEl.classList.toggle('magic-ready', p1.magic >= 100);

    this.p2MagicFillEl.style.width = `${Math.min(100, p2.magic).toFixed(1)}%`;
    this.p2MagicWrapEl.classList.toggle('magic-ready', p2.magic >= 100);

    // Timer
    this.timerEl.textContent = match.roundsToWin > 10 ? '∞' : String(match.timerSeconds).padStart(2, '0');

    // Round jewels
    const jewelKey = `${match.roundsToWin}:${match.p1Rounds}:${match.p2Rounds}`;
    if (jewelKey !== this.lastJewelsKey) {
      this.lastJewelsKey = jewelKey;
      const count = match.roundsToWin > 10 ? 0 : match.roundsToWin;
      this.renderJewels(this.p1JewelsEl, count, match.p1Rounds, p1.element.cssGlow);
      this.renderJewels(this.p2JewelsEl, count, match.p2Rounds, p2.element.cssGlow);
    }

    // Active status & perk badges
    this.renderBadges(this.p1StatusesEl, p1);
    this.renderBadges(this.p2StatusesEl, p2);

    // Combo Counters
    if (match.p1Combo >= 2) {
      this.p1ComboEl.innerHTML = `<span class="combo-word">COMBO</span> <span class="combo-num">x${match.p1Combo}</span>`;
      this.p1ComboEl.classList.add('visible');
    } else {
      this.p1ComboEl.classList.remove('visible');
    }

    if (match.p2Combo >= 2) {
      this.p2ComboEl.innerHTML = `<span class="combo-word">COMBO</span> <span class="combo-num">x${match.p2Combo}</span>`;
      this.p2ComboEl.classList.add('visible');
    } else {
      this.p2ComboEl.classList.remove('visible');
    }

    // Floating combat callouts
    if (match.callouts.length === 0) {
      if (this.calloutsLayerEl.childElementCount > 0) {
        this.calloutsLayerEl.innerHTML = '';
      }
    } else {
      this.calloutsLayerEl.innerHTML = match.callouts
        .map((c) => {
          const leftPct = (c.x / DESIGN_WIDTH) * 100;
          const topPct = (c.y / DESIGN_HEIGHT) * 100;
          const opacity = Math.min(1, c.remainingFrames / 16);
          return `<div class="combat-callout" style="left:${leftPct.toFixed(1)}%;top:${topPct.toFixed(1)}%;color:${c.color};opacity:${opacity.toFixed(2)}">${c.text}</div>`;
        })
        .join('');
    }

    // Center / Upper-Third Banner
    if (match.banner) {
      this.bannerEl.classList.remove('hidden');
      this.bannerEl.classList.toggle('ult-banner', Boolean(match.banner.isUlt));
      this.bannerTitleEl.textContent = match.banner.text;
      this.bannerTitleEl.style.color = match.banner.color;
      this.bannerSubEl.textContent = match.banner.subtext ?? '';
      this.matchOverActionsEl.classList.toggle('hidden', match.screen !== 'match_over');
    } else {
      this.bannerEl.classList.add('hidden');
      this.bannerEl.classList.remove('ult-banner');
    }
  }

  private renderJewels(container: HTMLElement, total: number, won: number, color: string): void {
    let html = '';
    for (let i = 0; i < total; i++) {
      const filled = i < won;
      html += `<span class="round-jewel ${filled ? 'won' : ''}" style="${filled ? `background:${color};box-shadow:0 0 10px ${color}` : ''}"></span>`;
    }
    container.innerHTML = html;
  }

  private renderBadges(container: HTMLElement, fighter: Fighter): void {
    const statuses = fighter.statuses.getAll();
    const perks = fighter.perks.getActiveBadges();
    const items = [
      ...statuses.map((s) => ({ label: s.label, color: s.color })),
      ...perks,
    ];
    if (items.length === 0) {
      if (container.childElementCount > 0) container.innerHTML = '';
      return;
    }
    container.innerHTML = items
      .map(
        (b) =>
          `<span class="status-pill" style="color:${b.color};border-color:${b.color}66">${b.label}</span>`
      )
      .join('');
  }
}
