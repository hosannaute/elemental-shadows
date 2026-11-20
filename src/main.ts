import './styles/main.css';
import { ElementalShadowsEngine } from './engine/gameLoop';
import { BattleHud } from './ui/battleHud';
import { TouchAndKeyboardController } from './ui/touchControls';
import { PauseSettingsDrawer } from './ui/pauseSettingsDrawer';
import { CharacterSelectOverlay } from './ui/characterSelect';

async function bootstrap(): Promise<void> {
  const stageFrame = document.getElementById('stage-frame');
  const canvasMount = document.getElementById('canvas-mount');
  if (!stageFrame || !canvasMount) {
    throw new Error('Missing #stage-frame or #canvas-mount in index.html');
  }

  let controls: TouchAndKeyboardController | null = null;
  let hud: BattleHud | null = null;
  let pauseDrawer: PauseSettingsDrawer | null = null;
  let rosterOverlay: CharacterSelectOverlay | null = null;

  const engine = new ElementalShadowsEngine({
    onHudUpdate: (p1, p2, match) => {
      hud?.update(p1, p2, match);
      controls?.syncFighterState(p1.element, p1.magic);
    },
  });

  const openPause = (): void => {
    engine.audio.unlock();
    if (pauseDrawer?.getIsOpen()) {
      pauseDrawer.close();
    } else {
      engine.setPaused(true);
      pauseDrawer?.open();
    }
  };

  const openRoster = (): void => {
    engine.audio.unlock();
    engine.setPaused(true);
    rosterOverlay?.open(engine.p1.element.id, engine.p2.element.id);
  };

  hud = new BattleHud({
    onOpenPause: openPause,
    onOpenRoster: openRoster,
    onRematch: () => {
      engine.audio.unlock();
      engine.startMatch(engine.p1.element.id, engine.p2.element.id);
    },
  });

  controls = new TouchAndKeyboardController(engine.p1.input, {
    getFrame: () => engine.getCurrentSimFrame(),
    onUserGesture: () => engine.audio.unlock(),
    onTogglePause: openPause,
  });

  pauseDrawer = new PauseSettingsDrawer({
    onResume: () => engine.setPaused(false),
    onRestartRound: () => engine.restartRound(),
    onOpenRoster: openRoster,
    onRemapStateChange: (listening) => controls?.setRemapLock(listening),
  });

  rosterOverlay = new CharacterSelectOverlay({
    onConfirmMatch: (p1El, p2El) => {
      engine.audio.unlock();
      engine.startMatch(p1El, p2El);
    },
    onCancel: () => {
      engine.setPaused(false);
    },
  });

  stageFrame.appendChild(hud.element);
  stageFrame.appendChild(controls.element);
  stageFrame.appendChild(pauseDrawer.element);
  stageFrame.appendChild(rosterOverlay.element);

  await engine.init(canvasMount);

  // Register lightweight PWA service worker when supported
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal in dev or restricted contexts
    });
  }
}

void bootstrap();
