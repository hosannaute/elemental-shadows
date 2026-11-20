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

  private readonly inputBuffer: InputBuffer;
  private readonly callbacks: ControlsCallbacks;
  private settings: GameSettings;
  private unsubscribe: (() => void) | null = null;

  // Keyboard held directions
  private keysDown: Set<string> = new Set();
  // Active touch joystick state
  private stickPointerId: number | null = null;
  private stickOriginX = 0;
  private stickOriginY = 0;
  private stickDirX: -1 | 0 | 1 = 0;
  private stickDirY: -1 | 0 | 1 = 0;
  private keyDirX: -1 | 0 | 1 = 0;
  private keyDirY: -1 | 0 | 1 = 0;
  private isListeningForRemap = false;
  private lastElementId = '';

  constructor(inputBuffer: InputBuffer, callbacks: ControlsCallbacks) {
    this.inputBuffer = inputBuffer;
    this.callbacks = callbacks;
    this.settings = settingsStore.get();

    this.element = document.createElement('div');
    this.element.className = 'touch-controls-layer';
    this.element.innerHTML = `
      <div class="stick-zone" id="touch-stick-zone">
        <div class="virtual-stick-base" id="virtual-stick-base">
          <span class="stick-arrow arrow-up">▲</span>
          <span class="stick-arrow arrow-down">▼</span>
          <span class="stick-arrow arrow-left">◀</span>
          <span class="stick-arrow arrow-right">▶</span>
          <div class="virtual-stick-knob" id="virtual-stick-knob"></div>
        </div>
      </div>

      <div class="action-cluster" id="touch-action-cluster">
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
        <button class="combat-btn btn-magic" data-action="magic" id="touch-btn-magic" aria-label="Elemental Magic">
          <span class="magic-btn-icon" id="touch-magic-icon"></span>
          <span class="magic-btn-text">MAGIC</span>
        </button>
        <button class="combat-btn btn-evade" data-action="evade" aria-label="Evade or Roll">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
        </button>
      </div>
    `;

    this.stickZone = this.element.querySelector('#touch-stick-zone')!;
    this.stickBase = this.element.querySelector('#virtual-stick-base')!;
    this.stickKnob = this.element.querySelector('#virtual-stick-knob')!;
    this.actionCluster = this.element.querySelector('#touch-action-cluster')!;
    this.magicBtn = this.element.querySelector('#touch-btn-magic')!;
    this.magicIconEl = this.element.querySelector('#touch-magic-icon')!;

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
    if (this.lastElementId !== element.id) {
      this.lastElementId = element.id;
      this.magicIconEl.innerHTML = element.crestSvg;
      this.magicBtn.style.setProperty('--magic-primary', element.cssPrimary);
      this.magicBtn.style.setProperty('--magic-glow', element.cssGlow);
    }
    this.magicBtn.classList.toggle('ready', magicMeter >= 100);
  }

  private applyControlSettings(s: GameSettings): void {
    const showTouch = s.inputMode === 'touch' || s.inputMode === 'auto';
    this.element.classList.toggle('hidden', !showTouch);
    this.element.style.opacity = String(s.buttonOpacity);
    this.stickBase.style.transform = `scale(${s.buttonScale})`;
    this.actionCluster.style.transform = `scale(${s.buttonScale})`;
    this.stickZone.classList.toggle('floating-mode', s.virtualStickMode === 'floating');

    // Update keyboard hints on action buttons
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
    // 8-Way Virtual Joystick (Fixed or Floating)
    this.stickZone.addEventListener('pointerdown', (e) => {
      this.callbacks.onUserGesture();
      if (this.stickPointerId !== null) return;
      e.preventDefault();
      this.stickPointerId = e.pointerId;
      this.stickZone.setPointerCapture(e.pointerId);

      const zoneRect = this.stickZone.getBoundingClientRect();
      if (this.settings.virtualStickMode === 'floating') {
        const localX = e.clientX - zoneRect.left;
        const localY = e.clientY - zoneRect.top;
        this.stickBase.style.left = `${localX - 70}px`;
        this.stickBase.style.top = `${localY - 70}px`;
        this.stickBase.style.bottom = 'auto';
        this.stickOriginX = e.clientX;
        this.stickOriginY = e.clientY;
      } else {
        const baseRect = this.stickBase.getBoundingClientRect();
        this.stickOriginX = baseRect.left + baseRect.width * 0.5;
        this.stickOriginY = baseRect.top + baseRect.height * 0.5;
      }
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

    // Right Action Cluster Buttons
    const buttons = this.actionCluster.querySelectorAll<HTMLButtonElement>('[data-action]');
    buttons.forEach((btn) => {
      const action = btn.dataset.action as ActionButton;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.callbacks.onUserGesture();
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

    const deadzone = 14;
    if (dist < deadzone) {
      this.stickDirX = 0;
      this.stickDirY = 0;
    } else {
      const nx = dx / dist;
      const ny = dy / dist;
      this.stickDirX = nx > 0.36 ? 1 : nx < -0.36 ? -1 : 0;
      this.stickDirY = ny > 0.38 ? 1 : ny < -0.38 ? -1 : 0;
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
    else if (e.code === kb.magic || e.code === 'Space') this.inputBuffer.pressButton('magic', frame);
    else if (e.code === kb.evade || e.code === 'ShiftLeft') this.inputBuffer.pressButton('evade', frame);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysDown.delete(e.code);
    this.recomputeKeyDirection();

    const kb = this.settings.keyBindings;
    if (e.code === kb.punch) this.inputBuffer.releaseButton('punch');
    else if (e.code === kb.kick) this.inputBuffer.releaseButton('kick');
    else if (e.code === kb.weapon) this.inputBuffer.releaseButton('weapon');
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
    this.inputBuffer.setDirection(x, y, this.callbacks.getFrame());
  }

  public destroy(): void {
    this.unsubscribe?.();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }
}
