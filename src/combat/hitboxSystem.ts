export interface RectBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HitHeight = 'high' | 'mid' | 'low' | 'ground';

export interface ActiveHitbox {
  box: RectBox;
  height: HitHeight;
  damage: number;
  chipDamage: number;
  hitstun: number;
  blockstun: number;
  hitstop: number;
  knockbackX: number;
  launchY: number;
  knockdown: boolean;
  critical: boolean;
  isThrow: boolean;
  throwType?: 'forward' | 'back' | 'suplex';
  appliesElementStatus: boolean;
  magicGain: number;
  moveId: string;
}

export interface ElementalProjectile {
  id: number;
  ownerId: 'p1' | 'p2';
  elementId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  damage: number;
  knockbackX: number;
  launchY: number;
  knockdown: boolean;
  remainingFrames: number;
  maxFrames: number;
  color: number;
  glowColor: number;
  coreColor: number;
  style: 'arc' | 'wave' | 'pillar' | 'vortex' | 'bolt' | 'shards' | 'tendrils' | 'eruption';
  hitAlready: boolean;
  hitsLow: boolean;
}

export function rectsIntersect(a: RectBox, b: RectBox): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function getRectCenter(r: RectBox): { x: number; y: number } {
  return {
    x: r.x + r.w * 0.5,
    y: r.y + r.h * 0.5,
  };
}

export function computeIntersectionPoint(a: RectBox, b: RectBox): { x: number; y: number } {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return {
    x: (left + right) * 0.5,
    y: (top + bottom) * 0.5,
  };
}
