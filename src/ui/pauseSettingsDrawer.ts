import {
  formatKeyCode,
  settingsStore,
  type AiTier,
  type FpsMode,
  type GameSettings,
  type ImpactFeedbackLevel,
  type InputBufferPreset,
  type InputMode,
  type KeyBindings,
  type MatchFormat,
  type VfxQuality,
  type VirtualStickMode,
} from '../state/settingsStore';

export interface PauseDrawerCallbacks {
  onResume: () => void;
  onRestartRound: () => void;
  onOpenRoster: () => void;
  onRemapStateChange: (listening: boolean) => void;
}

export class PauseSettingsDrawer {
  public readonly element: HTMLDivElement;
  private isOpen = false;
  private activeTab: 'controls' | 'graphics' | 'movelist' = 'controls';
  private remappingAction: keyof KeyBindings | null = null;
  private callbacks: PauseDrawerCallbacks;
  private unsubscribe: (() => void) | null = null;

  constructor(callbacks: PauseDrawerCallbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'pause-backdrop hidden';
    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) this.close();
    });

    window.addEventListener('keydown', this.handleRemapKey, true);
    this.unsubscribe = settingsStore.subscribe((s) => {
      if (this.isOpen) this.render(s);
    });
  }

  public open(): void {
    this.isOpen = true;
    this.element.classList.remove('hidden');
    this.render(settingsStore.get());
  }

  public close(): void {
    this.isOpen = false;
    this.cancelRemap();
    this.element.classList.add('hidden');
    this.callbacks.onResume();
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  private cancelRemap(): void {
    this.remappingAction = null;
    this.callbacks.onRemapStateChange(false);
  }

  private handleRemapKey = (e: KeyboardEvent): void => {
    if (!this.remappingAction) return;
    e.preventDefault();
    e.stopPropagation();
    const action = this.remappingAction;
    this.cancelRemap();
    if (e.code !== 'Escape') {
      settingsStore.setKeyBinding(action, e.code);
    } else {
      this.render(settingsStore.get());
    }
  };

  private render(s: GameSettings): void {
    this.element.innerHTML = `
      <aside class="pause-drawer" role="dialog" aria-label="Pause and Live Settings">
        <div class="drawer-header">
          <div>
            <h2>DOJO PAUSE &amp; SETTINGS</h2>
            <p class="drawer-subtitle">Live configuration — round state preserved</p>
          </div>
          <button class="drawer-close-btn" id="drawer-close" aria-label="Resume Match">✕</button>
        </div>

        <div class="drawer-quick-actions">
          <button class="action-pill primary" id="drawer-resume">RESUME</button>
          <button class="action-pill" id="drawer-restart">RESTART ROUND</button>
          <button class="action-pill" id="drawer-roster">8-ELEMENT ROSTER</button>
        </div>

        <nav class="drawer-tabs">
          <button class="drawer-tab ${this.activeTab === 'controls' ? 'active' : ''}" data-tab="controls">Controls &amp; Input</button>
          <button class="drawer-tab ${this.activeTab === 'graphics' ? 'active' : ''}" data-tab="graphics">Graphics, AI &amp; Audio</button>
          <button class="drawer-tab ${this.activeTab === 'movelist' ? 'active' : ''}" data-tab="movelist">Reversal Move List</button>
        </nav>

        <div class="drawer-body">
          ${this.activeTab === 'controls' ? this.renderControlsTab(s) : ''}
          ${this.activeTab === 'graphics' ? this.renderGraphicsTab(s) : ''}
          ${this.activeTab === 'movelist' ? this.renderMoveListTab() : ''}
        </div>

        <div class="drawer-footer">
          <button class="reset-link" id="drawer-reset">Reset Settings to Default</button>
        </div>
      </aside>
    `;

    this.wireEvents();
  }

  private renderControlsTab(s: GameSettings): string {
    const keyRows: { action: keyof KeyBindings; label: string }[] = [
      { action: 'left', label: 'Move Left' },
      { action: 'right', label: 'Move Right' },
      { action: 'up', label: 'Jump / Wall Jump' },
      { action: 'down', label: 'Crouch / Sweep' },
      { action: 'punch', label: 'Punch (P) / Throw' },
      { action: 'kick', label: 'Kick (K) / Wake-Up' },
      { action: 'weapon', label: 'Weapon (W)' },
      { action: 'magic', label: 'Elemental Magic' },
      { action: 'evade', label: 'Roll / Back Handspring' },
      { action: 'block', label: 'Block / Perfect Parry' },
    ];

    return `
      <div class="setting-group">
        <label class="setting-label">Input Overlay Mode</label>
        <div class="segmented" data-setting="inputMode">
          ${(['auto', 'touch', 'keyboard'] as InputMode[])
            .map((v) => `<button class="seg-btn ${s.inputMode === v ? 'active' : ''}" data-value="${v}">${v === 'auto' ? 'Auto' : v === 'touch' ? 'Touch UI' : 'Keyboard Only'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Virtual Joystick Anchor</label>
        <div class="segmented" data-setting="virtualStickMode">
          ${(['fixed', 'floating'] as VirtualStickMode[])
            .map((v) => `<button class="seg-btn ${s.virtualStickMode === v ? 'active' : ''}" data-value="${v}">${v === 'fixed' ? 'Fixed Anchor' : 'Floating Dynamic'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Input Buffer Window <span>${s.inputBufferFrames}f</span></label>
        <div class="segmented" data-setting="inputBufferFrames">
          ${([5, 8, 12] as InputBufferPreset[])
            .map((v) => `<button class="seg-btn ${s.inputBufferFrames === v ? 'active' : ''}" data-value="${v}">${v === 5 ? 'Tight (5f)' : v === 8 ? 'Standard (8f)' : 'Forgiving (12f)'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Touch Control Scale <span>${Math.round(s.buttonScale * 100)}%</span></label>
        <input type="range" id="range-scale" min="0.75" max="1.30" step="0.05" value="${s.buttonScale}" />
      </div>

      <div class="setting-group">
        <label class="setting-label">Touch Control Opacity <span>${Math.round(s.buttonOpacity * 100)}%</span></label>
        <input type="range" id="range-opacity" min="0.30" max="1.00" step="0.05" value="${s.buttonOpacity}" />
      </div>

      <div class="setting-group">
        <label class="setting-label">Desktop Key Remapping <span>Arrow keys also supported</span></label>
        <div class="keybind-grid">
          ${keyRows
            .map((r) => {
              const listening = this.remappingAction === r.action;
              return `
                <div class="keybind-row">
                  <span>${r.label}</span>
                  <button class="keybind-btn ${listening ? 'listening' : ''}" data-remap="${r.action}">
                    ${listening ? 'PRESS KEY...' : formatKeyCode(s.keyBindings[r.action])}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private renderGraphicsTab(s: GameSettings): string {
    return `
      <div class="setting-group">
        <label class="setting-label">VFX Shader Quality</label>
        <div class="segmented" data-setting="vfxQuality">
          ${(['low', 'medium', 'high'] as VfxQuality[])
            .map((v) => `<button class="seg-btn ${s.vfxQuality === v ? 'active' : ''}" data-value="${v}">${v === 'low' ? 'Low (Ink)' : v === 'medium' ? 'Med (Trails)' : 'High (Shaders)'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Hit-Stop &amp; Screen Shake</label>
        <div class="segmented" data-setting="impactFeedback">
          ${([0, 0.5, 1] as ImpactFeedbackLevel[])
            .map((v) => `<button class="seg-btn ${s.impactFeedback === v ? 'active' : ''}" data-value="${v}">${Math.round(v * 100)}%</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Frame Rate Lock</label>
        <div class="segmented" data-setting="fpsMode">
          ${([60, 30] as FpsMode[])
            .map((v) => `<button class="seg-btn ${s.fpsMode === v ? 'active' : ''}" data-value="${v}">${v === 60 ? '60 FPS Smooth' : '30 FPS Locked'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">Match Format</label>
        <div class="segmented" data-setting="matchFormat">
          ${(['bo3', 'bo5', 'endless'] as MatchFormat[])
            .map((v) => `<button class="seg-btn ${s.matchFormat === v ? 'active' : ''}" data-value="${v}">${v === 'bo3' ? 'Best of 3' : v === 'bo5' ? 'Best of 5' : 'Endless Dojo'}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group">
        <label class="setting-label">AI Sparring Tier</label>
        <div class="segmented" data-setting="aiTier">
          ${(['novice', 'warrior', 'master', 'shadow'] as AiTier[])
            .map((v) => `<button class="seg-btn ${s.aiTier === v ? 'active' : ''}" data-value="${v}">${v === 'shadow' ? 'Shadow (6f)' : v[0].toUpperCase() + v.slice(1)}</button>`)
            .join('')}
        </div>
      </div>

      <div class="setting-group toggle-row">
        <div>
          <div class="setting-label">Dojo Debug Overlay</div>
          <div class="setting-desc">Live hitboxes, hurtboxes, i-frames &amp; FPS telemetry</div>
        </div>
        <button class="toggle-switch ${s.dojoDebugOverlay ? 'on' : ''}" id="toggle-debug">${s.dojoDebugOverlay ? 'ON' : 'OFF'}</button>
      </div>

      <div class="setting-group">
        <label class="setting-label">Audio Volume <span>${Math.round(s.masterVolume * 100)}%</span></label>
        <input type="range" id="range-volume" min="0" max="1" step="0.05" value="${s.masterVolume}" />
      </div>

      <div class="setting-group toggle-row">
        <div>
          <div class="setting-label">Mobile Haptic Pulses</div>
          <div class="setting-desc">Tactile vibration feedback on hits &amp; parries</div>
        </div>
        <button class="toggle-switch ${s.hapticsEnabled ? 'on' : ''}" id="toggle-haptics">${s.hapticsEnabled ? 'ON' : 'OFF'}</button>
      </div>
    `;
  }

  private renderMoveListTab(): string {
    const moves = [
      ['Wake-Up Sweep', 'Down + K (Grounded)', '16f startup i-frames low spin sweep'],
      ['Forward / Back Roll', 'Forward / Back (Grounded)', '18f i-frames (+6f Water) escape'],
      ['Wall Jump', 'Up + Forward near Wall', 'Vault over cornered opponent (+35% Air)'],
      ['Forward Throw', 'Close + Forward + P', 'Slam forward → sets up Sucker Kick'],
      ['Throw Through Back', 'Close + Back + P', 'Toss attacker into corner behind you'],
      ['Shadow Suplex', 'Behind + Back + P', 'High-damage cross-up slam'],
      ['Sucker Kick', 'Down + K vs Grounded', 'Guaranteed ground punish'],
      ['Back Handspring', 'Back, Back or Evade', 'Acrobatic retreat (+Volt Dash blink)'],
      ['Elbow Strike', 'Down-Back + P', 'Leans torso back under high strikes'],
      ['Horse Kick', 'Down-Back + K', 'Ducks beneath high horizontal slashes'],
      ['Back Kick', 'Back + K', 'Retreating thrust kick with long reach'],
      ['Elemental Magic', 'MAGIC / U / Space (100%)', 'Signature elemental spell + status debuff'],
    ];

    return `
      <div class="movelist-table">
        ${moves
          .map(
            ([name, input, desc]) => `
            <div class="movelist-row">
              <div class="move-name">${name}</div>
              <div class="move-input">${input}</div>
              <div class="move-desc">${desc}</div>
            </div>
          `
          )
          .join('')}
      </div>
    `;
  }

  private wireEvents(): void {
    this.element.querySelector('#drawer-close')?.addEventListener('click', () => this.close());
    this.element.querySelector('#drawer-resume')?.addEventListener('click', () => this.close());
    this.element.querySelector('#drawer-restart')?.addEventListener('click', () => {
      this.close();
      this.callbacks.onRestartRound();
    });
    this.element.querySelector('#drawer-roster')?.addEventListener('click', () => {
      this.isOpen = false;
      this.cancelRemap();
      this.element.classList.add('hidden');
      this.callbacks.onOpenRoster();
    });
    this.element.querySelector('#drawer-reset')?.addEventListener('click', () => {
      settingsStore.reset();
    });

    this.element.querySelectorAll<HTMLButtonElement>('.drawer-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.dataset.tab as 'controls' | 'graphics' | 'movelist';
        this.cancelRemap();
        this.render(settingsStore.get());
      });
    });

    this.element.querySelectorAll<HTMLElement>('.segmented').forEach((group) => {
      const key = group.dataset.setting as keyof GameSettings;
      group.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const raw = btn.dataset.value!;
          const parsed =
            key === 'inputBufferFrames' || key === 'impactFeedback' || key === 'fpsMode'
              ? Number(raw)
              : raw;
          settingsStore.update({ [key]: parsed } as Partial<GameSettings>);
        });
      });
    });

    this.element.querySelector<HTMLInputElement>('#range-scale')?.addEventListener('input', (e) => {
      settingsStore.update({ buttonScale: Number((e.target as HTMLInputElement).value) });
    });
    this.element.querySelector<HTMLInputElement>('#range-opacity')?.addEventListener('input', (e) => {
      settingsStore.update({ buttonOpacity: Number((e.target as HTMLInputElement).value) });
    });
    this.element.querySelector<HTMLInputElement>('#range-volume')?.addEventListener('input', (e) => {
      settingsStore.update({ masterVolume: Number((e.target as HTMLInputElement).value) });
    });

    this.element.querySelector('#toggle-debug')?.addEventListener('click', () => {
      settingsStore.update({ dojoDebugOverlay: !settingsStore.get().dojoDebugOverlay });
    });
    this.element.querySelector('#toggle-haptics')?.addEventListener('click', () => {
      settingsStore.update({ hapticsEnabled: !settingsStore.get().hapticsEnabled });
    });

    this.element.querySelectorAll<HTMLButtonElement>('[data-remap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.remappingAction = btn.dataset.remap as keyof KeyBindings;
        this.callbacks.onRemapStateChange(true);
        this.render(settingsStore.get());
      });
    });
  }

  public destroy(): void {
    this.unsubscribe?.();
    window.removeEventListener('keydown', this.handleRemapKey, true);
  }
}
