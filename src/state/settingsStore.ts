export type InputMode = 'auto' | 'touch' | 'keyboard';
export type VirtualStickMode = 'floating' | 'fixed';
export type InputBufferPreset = 5 | 8 | 12;
export type VfxQuality = 'low' | 'medium' | 'high';
export type ImpactFeedbackLevel = 0 | 0.5 | 1;
export type MatchFormat = 'bo3' | 'bo5' | 'endless';
export type AiTier = 'novice' | 'warrior' | 'master' | 'shadow';
export type FpsMode = 60 | 30;
export type CombatTempo = 'fast' | 'classic';

export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  punch: string;
  kick: string;
  weapon: string;
  magic: string;
  evade: string;
  block: string;
  pause: string;
}

export interface GameSettings {
  inputMode: InputMode;
  virtualStickMode: VirtualStickMode;
  buttonScale: number;
  buttonOpacity: number;
  inputBufferFrames: InputBufferPreset;
  combatTempo: CombatTempo;
  keyBindings: KeyBindings;
  vfxQuality: VfxQuality;
  impactFeedback: ImpactFeedbackLevel;
  fpsMode: FpsMode;
  matchFormat: MatchFormat;
  aiTier: AiTier;
  dojoDebugOverlay: boolean;
  masterVolume: number;
  sfxEnabled: boolean;
  hapticsEnabled: boolean;
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'KeyW',
  down: 'KeyS',
  punch: 'KeyJ',
  kick: 'KeyK',
  weapon: 'KeyL',
  magic: 'KeyU',
  evade: 'KeyI',
  block: 'KeyB',
  pause: 'Escape',
};

export const DEFAULT_SETTINGS: GameSettings = {
  inputMode: 'auto',
  virtualStickMode: 'fixed',
  buttonScale: 1.0,
  buttonOpacity: 0.88,
  inputBufferFrames: 8,
  combatTempo: 'fast',
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  vfxQuality: 'high',
  impactFeedback: 1,
  fpsMode: 60,
  matchFormat: 'bo3',
  aiTier: 'warrior',
  dojoDebugOverlay: false,
  masterVolume: 0.72,
  sfxEnabled: true,
  hapticsEnabled: true,
};

const STORAGE_KEY = 'elemental-shadows-settings-v1';

type SettingsListener = (settings: GameSettings) => void;

class SettingsStore {
  private settings: GameSettings;
  private listeners: Set<SettingsListener> = new Set();

  constructor() {
    this.settings = this.load();
  }

  private load(): GameSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.cloneDefaults();
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      return {
        ...this.cloneDefaults(),
        ...parsed,
        keyBindings: {
          ...DEFAULT_KEY_BINDINGS,
          ...(parsed.keyBindings ?? {}),
        },
      };
    } catch {
      return this.cloneDefaults();
    }
  }

  private cloneDefaults(): GameSettings {
    return {
      ...DEFAULT_SETTINGS,
      keyBindings: { ...DEFAULT_KEY_BINDINGS },
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore quota / private browsing errors
    }
  }

  public get(): GameSettings {
    return this.settings;
  }

  public update(patch: Partial<GameSettings>): void {
    this.settings = {
      ...this.settings,
      ...patch,
      keyBindings: patch.keyBindings
        ? { ...this.settings.keyBindings, ...patch.keyBindings }
        : this.settings.keyBindings,
    };
    this.persist();
    this.emit();
  }

  public setKeyBinding(action: keyof KeyBindings, code: string): void {
    this.settings = {
      ...this.settings,
      keyBindings: {
        ...this.settings.keyBindings,
        [action]: code,
      },
    };
    this.persist();
    this.emit();
  }

  public reset(): void {
    this.settings = this.cloneDefaults();
    this.persist();
    this.emit();
  }

  public subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    listener(this.settings);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.settings);
    }
  }
}

export const settingsStore = new SettingsStore();

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACE';
  if (code === 'Escape') return 'ESC';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  return code.toUpperCase();
}
