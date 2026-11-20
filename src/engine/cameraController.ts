import type { Container } from 'pixi.js';
import type { Fighter } from '../combat/fighterStateMachine';

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export class CameraController {
  public x = DESIGN_WIDTH * 0.5;
  public y = DESIGN_HEIGHT * 0.5;
  public zoom = 1.0;

  private shakeMagnitude = 0;
  private shakeDecay = 0.84;
  private feedbackScale = 1.0;

  public setFeedbackScale(scale: number): void {
    this.feedbackScale = scale;
  }

  public addShake(amount: number): void {
    this.shakeMagnitude = Math.min(28, Math.max(this.shakeMagnitude, amount * this.feedbackScale));
  }

  public reset(): void {
    this.x = DESIGN_WIDTH * 0.5;
    this.y = DESIGN_HEIGHT * 0.5;
    this.zoom = 1.0;
    this.shakeMagnitude = 0;
  }

  public update(p1: Fighter, p2: Fighter, worldContainer: Container): { parallaxX: number } {
    const midX = (p1.x + p2.x) * 0.5;
    const dist = Math.abs(p1.x - p2.x);

    // Subtle zoom in during close exchanges, zoom out at range
    const targetZoom = Math.max(0.94, Math.min(1.12, 1.15 - dist / 2400));
    const targetX = Math.max(460, Math.min(820, midX));
    const targetY = DESIGN_HEIGHT * 0.5 + (targetZoom - 1) * 90;

    this.zoom += (targetZoom - this.zoom) * 0.08;
    this.x += (targetX - this.x) * 0.1;
    this.y += (targetY - this.y) * 0.1;

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeMagnitude > 0.35) {
      shakeX = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      shakeY = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      this.shakeMagnitude *= this.shakeDecay;
    } else {
      this.shakeMagnitude = 0;
    }

    worldContainer.scale.set(this.zoom);
    worldContainer.position.set(
      DESIGN_WIDTH * 0.5 - this.x * this.zoom + shakeX,
      DESIGN_HEIGHT * 0.5 - this.y * this.zoom + shakeY
    );

    return { parallaxX: (this.x - DESIGN_WIDTH * 0.5) * 0.18 };
  }
}
