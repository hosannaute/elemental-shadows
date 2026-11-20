export type ActionButton = 'punch' | 'kick' | 'weapon' | 'magic' | 'evade' | 'block';

export interface DirectionInput {
  x: -1 | 0 | 1; // world X: -1 left, +1 right
  y: -1 | 0 | 1; // -1 up, +1 down
}

export interface RelativeDirection {
  forward: boolean;
  back: boolean;
  up: boolean;
  down: boolean;
}

export interface BufferedAction {
  button: ActionButton;
  frame: number;
  dir: DirectionInput;
  consumed: boolean;
}

export interface DoubleTapEvent {
  direction: -1 | 1; // world direction
  frame: number;
}

export class InputBuffer {
  private buffer: BufferedAction[] = [];
  private maxBufferFrames = 8;
  public currentDir: DirectionInput = { x: 0, y: 0 };
  private lastTapDir: -1 | 0 | 1 = 0;
  private lastTapFrame = -999;
  private prevDirX: -1 | 0 | 1 = 0;
  private pendingDoubleTap: DoubleTapEvent | null = null;
  private heldButtons: Set<ActionButton> = new Set();

  public setWindow(frames: number): void {
    this.maxBufferFrames = Math.max(3, Math.min(20, frames));
  }

  public setDirection(x: -1 | 0 | 1, y: -1 | 0 | 1, currentFrame: number): void {
    if (x !== 0 && this.prevDirX === 0) {
      if (this.lastTapDir === x && currentFrame - this.lastTapFrame <= 15) {
        this.pendingDoubleTap = { direction: x, frame: currentFrame };
        this.lastTapDir = 0;
      } else {
        this.lastTapDir = x;
        this.lastTapFrame = currentFrame;
      }
    }
    this.prevDirX = x;
    this.currentDir = { x, y };
  }

  public pressButton(button: ActionButton, currentFrame: number): void {
    if (this.heldButtons.has(button)) return;
    this.heldButtons.add(button);
    this.buffer.push({
      button,
      frame: currentFrame,
      dir: { ...this.currentDir },
      consumed: false,
    });
    if (this.buffer.length > 16) {
      this.buffer.shift();
    }
  }

  public releaseButton(button: ActionButton): void {
    this.heldButtons.delete(button);
  }

  public isHeld(button: ActionButton): boolean {
    return this.heldButtons.has(button);
  }

  public prune(currentFrame: number): void {
    const cutoff = currentFrame - this.maxBufferFrames;
    this.buffer = this.buffer.filter((entry) => !entry.consumed && entry.frame >= cutoff);
    if (this.pendingDoubleTap && currentFrame - this.pendingDoubleTap.frame > this.maxBufferFrames) {
      this.pendingDoubleTap = null;
    }
  }

  public consumeButton(button: ActionButton, currentFrame: number): BufferedAction | null {
    this.prune(currentFrame);
    for (let i = 0; i < this.buffer.length; i++) {
      const entry = this.buffer[i];
      if (!entry.consumed && entry.button === button) {
        entry.consumed = true;
        return entry;
      }
    }
    return null;
  }

  public consumeAny(priority: ActionButton[], currentFrame: number): BufferedAction | null {
    this.prune(currentFrame);
    for (const btn of priority) {
      const hit = this.consumeButton(btn, currentFrame);
      if (hit) return hit;
    }
    return null;
  }

  public peekNewest(currentFrame: number): BufferedAction | null {
    this.prune(currentFrame);
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : null;
  }

  public consumeDoubleTap(currentFrame: number): DoubleTapEvent | null {
    this.prune(currentFrame);
    const evt = this.pendingDoubleTap;
    this.pendingDoubleTap = null;
    return evt;
  }

  public getRelativeDirection(facing: 1 | -1, dirOverride?: DirectionInput): RelativeDirection {
    const d = dirOverride ?? this.currentDir;
    return {
      forward: d.x === facing,
      back: d.x === -facing,
      up: d.y === -1,
      down: d.y === 1,
    };
  }

  public clear(): void {
    this.buffer = [];
    this.pendingDoubleTap = null;
    this.heldButtons.clear();
    this.currentDir = { x: 0, y: 0 };
    this.prevDirX = 0;
  }
}
