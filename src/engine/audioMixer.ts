import type { ElementId } from '../elements/elementRegistry';

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private masterVolume = 0.7;
  private enabled = true;
  private hapticsEnabled = true;

  public configure(volume: number, enabled: boolean, hapticsEnabled: boolean): void {
    this.masterVolume = volume;
    this.enabled = enabled;
    this.hapticsEnabled = hapticsEnabled;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore on unsupported devices
      }
    }
  }

  private canPlay(): boolean {
    return this.enabled && this.masterVolume > 0.01 && this.ctx !== null && this.ctx.state === 'running';
  }

  public playWhoosh(heavy = false): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const duration = heavy ? 0.22 : 0.13;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 480 : 920, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 160 : 280, now + duration);
    filter.Q.value = 1.6;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
  }

  public playHit(heavy = false, isWeapon = false): void {
    this.vibrate(heavy ? [22, 16, 30] : 14);
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Sub punch thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 150 : 210, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + (heavy ? 0.19 : 0.12));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime((heavy ? 0.55 : 0.38) * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.22 : 0.14));

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);

    // Metallic blade ring for weapon hits
    if (isWeapon) {
      const ring = this.ctx.createOscillator();
      ring.type = 'sawtooth';
      ring.frequency.setValueAtTime(heavy ? 1120 : 1480, now);
      ring.frequency.exponentialRampToValueAtTime(520, now + 0.14);
      const rg = this.ctx.createGain();
      rg.gain.setValueAtTime(0.14 * this.masterVolume, now);
      rg.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      ring.connect(rg).connect(this.ctx.destination);
      ring.start(now);
      ring.stop(now + 0.16);
    }
  }

  public playGuard(perfect = false): void {
    this.vibrate(perfect ? [18, 12, 24] : 10);
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = perfect ? 'sine' : 'square';
    osc.frequency.setValueAtTime(perfect ? 1320 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(perfect ? 880 : 210, now + (perfect ? 0.28 : 0.09));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime((perfect ? 0.34 : 0.2) * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (perfect ? 0.3 : 0.1));

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playMagic(element: ElementId): void {
    this.vibrate([25, 18, 35]);
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq: Record<ElementId, number> = {
      fire: 220,
      water: 340,
      earth: 110,
      air: 520,
      lightning: 880,
      ice: 980,
      shadow: 180,
      lava: 135,
    };

    const osc = this.ctx.createOscillator();
    osc.type = element === 'lightning' || element === 'ice' ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq[element], now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq[element] * 0.45, now + 0.38);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  public playGong(): void {
    if (!this.canPlay() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [142, 214, 319, 478];
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime((0.18 / freqs.length) * this.masterVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.3);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.35);
    }
  }
}
