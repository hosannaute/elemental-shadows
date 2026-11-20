import type { ActionButton, InputBuffer } from '../combat/inputBuffer';
import type { ElementProfile } from '../elements/elementRegistry';
import { settingsStore, type GameSettings } from '../state/settingsStore';

export interface ControlsCallbacks {
  getFrame: () => number;
  onUserGesture: () => void;
  onTogglePause: () => void;
}

export class TouchAndKeyboardController {
  public readonly element: HTMLDivElement;

  private readonly stickZone: HTMLDivElement;
  private readonly stickBase: HTMLDivElement;
  private readonly stickKnob: HTMLDivElement;
  private readonly actionCluster: HTMLDivElement;
  private readonly magicBtn: HTMLButtonElement;
  private readonly magicIconEl: HTMLElement;
  private readonly arrowUp: HTMLElement;
  private readonly arrowDown: HTMLElement;
  private readonly arrowLeft: HTMLElement;
  private readonly arrowRight: HTMLElement;

  private readonly inputBuffer: InputBuffer;
  private readonly callbacks: ControlsCallbacks;
  private settings: GameSettings;
  private unsubscribe: (() => void) | null = null;

  private keysDown: Set<string> = new Set();
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private stickDirX: -1 | 0 | 1 = 0;
  private stickDirY: -1 | 0 | 1 = 0;
  private keyDirX: -1 | 0 | 1 = 0;
  private keyDirY: -1 | 0 | 1 = 0;
  private isListeningForRemap = false;
  private lastElementId = '';
  private currentMagicMeter = 0;

  constructor(inputBuffer: InputBuffer, callbacks: ControlsCallbacks) {
    this.inputBuffer = inputBuffer;
    this.callbacks = callbacks;
    this.settings = settingsStore.get();

    this.element = document.createElement('div');
    this.element.className = 'touch-controls-layer';
    this.element.innerHTML = `
      <div class="stick-wrap">
        <div class="stick-zone" id="touch-stick-zone">
          <div class="virtual-stick-base" id="virtual-stick-base">
            <div class="virtual-stick-ring"></div>
            <span class="stick-arrow arrow-up" id="stick-arr-up">▲</span>
            <span class="stick-arrow arrow-down" id="stick-arr-down">▼</span>
            <span class="stick-arrow arrow-left" id="stick-arr-left">◀</span>
            <span class="stick-arrow arrow-right" id="stick-arr-right">▶</span>
            <div class="virtual-stick-knob" id="virtual-stick-knob"></div>
          </div>
        </div>
        <div class="stick-caption">WASD / ARROWS · BACK = GUARD</div>
      </div>

      <div class="action-cluster" id="touch-action-cluster">
        <div class="action-row top-row">
          <button class="combat-btn btn-block" data-action="block" aria-label="Guard or Parry">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span class="btn-hint">BLK</span>
          </button>
          <button class="combat-btn btn-evade" data-action="evade" aria-label="Evade or Roll">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            <span class="btn-hint">ROLL</span>
          </button>
          <button class="combat-btn btn-magic" data-action="magic" id="touch-btn-magic" aria-label="Elemental Magic">
            <span class="magic-btn-icon" id="touch-magic-icon"></span>
            <span class="magic-btn-text">MAGIC</span>
          </button>
        </div>
        <div class="action-row">
          <button class="combat-btn btn-punch" data-action="punch" aria-label="Punch">
            <span class="btn-letter">P</span>
            <span class="btn-hint">J</span>
          </button>
          <button class="combat-btn btn-kick" data-action="kick" aria-label="Kick">
            <span class="btn-letter">K</span>
            <span class="btn-hint">K</span>
          </button>
          <button class="combat-btn btn-weapon" data-action="weapon" aria-label="Weapon">
            <span class="btn-letter">W</span>
            <span class="btn-hint">L</span>
          </button>
        </div>
      </div>
    `;

    this.stickZone = this.element.querySelector('#touch-stick-zone')!;
    this.stickBase = this.element.querySelector('#virtual-stick-base')!;
    this.stickKnob = this.element.querySelector('#virtual-stick-knob')!;
    this.actionCluster = this.element.querySelector('#touch-action-cluster')!;
    this.magicBtn = this.element.querySelector('#touch-btn-magic')!;
    this.magicIconEl = this.element.querySelector('#touch-magic-icon')!;
    this.arrowUp = this.element.querySelector('#stick-arr-up')!;
    this.arrowDown = this.element.querySelector('#stick-arr-down')!;
    this.arrowLeft = this.element.querySelector('#stick-arr-left')!;
    this.arrowRight = this.element.querySelector('#stick-arr-right')!;

    this.bindPointerEvents();
    this.bindKeyboardEvents();

    this.unsubscribe = settingsStore.subscribe((next) => {
      this.settings = next;
      this.applyControlSettings(next);
    });
  }

  public setRemapLock(locked: boolean): void {
    this.isListeningForRemap = locked;
  }

  public syncFighterState(element: ElementProfile, magicMeter: number): void {
    this.currentMagicMeter = magicMeter;
    if (this.lastElementId !== element.id) {
      this.lastElementId = element.id;
      this.magicIconEl.innerHTML = element.crestSvg;
      this.magicBtn.style.setProperty('--magic-primary', element.cssPrimary);
      this.magicBtn.style.setProperty('--magic-glow', element.cssGlow);
    }
    this.magicBtn.classList.toggle('ready', magicMeter >= 100);
  }

  private triggerDenyShake(btn: HTMLElement): void {
    btn.classList.remove('deny');
    void btn.offsetWidth;
    btn.classList.add('deny');
  }

  private applyControlSettings(s: GameSettings): void {
    const showTouch = s.inputMode === 'touch' || s.inputMode === 'auto';
    this.element.classList.toggle('hidden', !showTouch);
    this.element.style.opacity = String(s.buttonOpacity);
    this.stickBase.style.transform = `scale(${s.buttonScale})`;
    this.actionCluster.style.transform = `scale(${s.buttonScale})`;
    this.stickZone.classList.toggle('floating-mode', s.virtualStickMode === 'floating');

    const hints: Record<string, string> = {
      punch: s.keyBindings.punch.replace('Key', ''),
      kick: s.keyBindings.kick.replace('Key', ''),
      weapon: s.keyBindings.weapon.replace('Key', ''),
    };
    for (const [act, label] of Object.entries(hints)) {
      const hintEl = this.actionCluster.querySelector(`[data-action="${act}"] .btn-hint`);
      if (hintEl) hintEl.textContent = label.slice(0, 3);
    }
  }

  private bindPointerEvents(): void {
    this.stickZone.addEventListener('pointerdown', (e) => {
      this.callbacks.onUserGesture();
      if (this.stickPointerId !== null) return;
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      this.stickZone.setPointerCapture(e.pointerId);

      const baseRect = this.stickBase.getBoundingClientRect();
      this.stickOriginX = baseRect.left + baseRect.width * 0.5;
      this.stickOriginY = baseRect.top + baseRect.height * 0.5;
      this.updateStickFromPoint(e.clientX, e.clientY);
    });

    this.stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointerId) return;
      e.preventDefault();
      this.updateStickFromPoint(e.clientX, e.clientY);
    });

    const endStick = (e: PointerEvent): void => {
      if (e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.stickKnob.style.transform = 'translate(0px, 0px)';
      this.stickDirX = 0;
      this.stickDirY = 0;
      this.flushCombinedDirection();
    };

    this.stickZone.addEventListener('pointerup', endStick);
    this.stickZone.addEventListener('pointercancel', endStick);

    const buttons = this.actionCluster.querySelectorAll<HTMLButtonElement>('[data-action]');
    buttons.forEach((btn) => {
      const action = btn.dataset.action as ActionButton;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.callbacks.onUserGesture();
        if (action === 'magic' && this.currentMagicMeter < 100) {
          this.triggerDenyShake(btn);
          return;
        }
        btn.classList.add('pressed');
        this.inputBuffer.pressButton(action, this.callbacks.getFrame());
      });
      const release = (): void => {
        btn.classList.remove('pressed');
        this.inputBuffer.releaseButton(action);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    });
  }

  private updateStickFromPoint(clientX: number, clientY: number): void {
    const dx = clientX - this.stickOriginX;
    const dy = clientY - this.stickOriginY;
    const maxRadius = 44 * this.settings.buttonScale;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(maxRadius, dist);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clampedDist;
    const ky = Math.sin(angle) * clampedDist;
    this.stickKnob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

    const deadzone = 13;
    if (dist < deadzone) {
      this.stickDirX = 0;
      this.stickDirY = 0;
    } else {
      const nx = dx / dist;
      const ny = dy / dist;
      this.stickDirX = nx > 0.34 ? 1 : nx < -0.34 ? -1 : 0;
      this.stickDirY = ny > 0.36 ? 1 : ny < -0.36 ? -1 : 0;
    }
    this.flushCombinedDirection();
  }

  private bindKeyboardEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isListeningForRemap) return;
    this.callbacks.onUserGesture();

    const kb = this.settings.keyBindings;
    if (e.code === kb.pause) {
      e.preventDefault();
      this.callbacks.onTogglePause();
      return;
    }

    if (
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }

    this.keysDown.add(e.code);
    this.recomputeKeyDirection();

    if (e.repeat) return;
    const frame = this.callbacks.getFrame();

    if (e.code === kb.punch) this.inputBuffer.pressButton('punch', frame);
    else if (e.code === kb.kick) this.inputBuffer.pressButton('kick', frame);
    else if (e.code === kb.weapon) this.inputBuffer.pressButton('weapon', frame);
    else if (e.code === kb.block) this.inputBuffer.pressButton('block', frame);
    else if (e.code === kb.magic || e.code === 'Space') {
      if (this.currentMagicMeter < 100) {
        this.triggerDenyShake(this.magicBtn);
      } else {
        this.inputBuffer.pressButton('magic', frame);
      }
    } else if (e.code === kb.evade || e.code === 'ShiftLeft') {
      this.inputBuffer.pressButton('evade', frame);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
    this.recomputeKeyDirection();

    const kb = this.settings.keyBindings;
    if (e.code === kb.punch) this.inputBuffer.releaseButton('punch');
    else if (e.code === kb.kick) this.inputBuffer.releaseButton('kick');
    else if (e.code === kb.weapon) this.inputBuffer.releaseButton('weapon');
    else if (e.code === kb.block) this.inputBuffer.releaseButton('block');
    else if (e.code === kb.magic || e.code === 'Space') this.inputBuffer.releaseButton('magic');
    else if (e.code === kb.evade || e.code === 'ShiftLeft') this.inputBuffer.releaseButton('evade');
  };

  private recomputeKeyDirection(): void {
    const kb = this.settings.keyBindings;
    const left = this.keysDown.has(kb.left) || this.keysDown.has('ArrowLeft');
    const right = this.keysDown.has(kb.right) || this.keysDown.has('ArrowRight');
    const up = this.keysDown.has(kb.up) || this.keysDown.has('ArrowUp');
    const down = this.keysDown.has(kb.down) || this.keysDown.has('ArrowDown');

    this.keyDirX = right && !left ? 1 : left && !right ? -1 : 0;
    this.keyDirY = down && !up ? 1 : up && !down ? -1 : 0;
    this.flushCombinedDirection();
  }

  private flushCombinedDirection(): void {
    const x = this.stickDirX !== 0 ? this.stickDirX : this.keyDirX;
    const y = this.stickDirY !== 0 ? this.stickDirY : this.keyDirY;
    this.arrowUp.classList.toggle('active', y === -1);
    this.arrowDown.classList.toggle('active', y === 1);
    this.arrowLeft.classList.toggle('active', x === -1);
    this.arrowRight.classList.toggle('active', x === 1);
    this.inputBuffer.setDirection(x, y, this.callbacks.getFrame());
  }

  public destroy(): void {
    this.unsubscribe?.();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}
