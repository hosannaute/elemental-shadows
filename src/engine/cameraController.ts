import type { Container } from 'pixi.js';
import type { Fighter } from '../combat/fighterStateMachine';

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;

export class CameraController {
  public x = DESIGN_WIDTH * 0.5;
  public y = DESIGN_HEIGHT * 0.5;
  public zoom = 1.08;

  private shakeMagnitude = 0;
  private shakeDecay = 0.84;
  private feedbackScale = 1.0;

  public setFeedbackScale(scale: number): void {
    this.feedbackScale = scale;
  }

  public addShake(amount: number): void {
    this.shakeMagnitude = Math.min(24, Math.max(this.shakeMagnitude, amount * this.feedbackScale));
  }

  public reset(): void {
    this.x = DESIGN_WIDTH * 0.5;
    this.y = DESIGN_HEIGHT * 0.5;
    this.zoom = 1.08;
    this.shakeMagnitude = 0;
  }

  public update(p1: Fighter, p2: Fighter, worldContainer: Container): { parallaxX: number } {
    const midX = (p1.x + p2.x) * 0.5;
    const dist = Math.abs(p1.x - p2.x);

    // Keep zoom >= 1.05 so panning & screen shake always stay strictly inside the painted backdrop
    const targetZoom = Math.max(1.05, Math.min(1.16, 1.18 - dist / 4600));
    this.zoom += (targetZoom - this.zoom) * 0.08;

    const halfViewW = (DESIGN_WIDTH * 0.5) / this.zoom;
    const minCamX = Math.min(DESIGN_WIDTH * 0.5, halfViewW + 18);
    const maxCamX = Math.max(DESIGN_WIDTH * 0.5, DESIGN_WIDTH - halfViewW - 18);
    const targetX = Math.max(minCamX, Math.min(maxCamX, midX));

    const halfViewH = (DESIGN_HEIGHT * 0.5) / this.zoom;
    const minCamY = Math.min(DESIGN_HEIGHT * 0.5, halfViewH + 14);
    const maxCamY = Math.max(DESIGN_HEIGHT * 0.5, DESIGN_HEIGHT - halfViewH - 14);
    const targetY = Math.max(minCamY, Math.min(maxCamY, DESIGN_HEIGHT * 0.5 + (this.zoom - 1.05) * 75));

    this.x += (targetX - this.x) * 0.1;
    this.y += (targetY - this.y) * 0.1;
    this.x = Math.max(minCamX, Math.min(maxCamX, this.x));
    this.y = Math.max(minCamY, Math.min(maxCamY, this.y));

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeMagnitude > 0.35) {
      shakeX = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      shakeY = (Math.random() - 0.5) * 2 * this.shakeMagnitude;
      this.shakeMagnitude *= this.shakeDecay;
    } else {
      this.shakeMagnitude = 0;
    }

    const minPosX = DESIGN_WIDTH - DESIGN_WIDTH * this.zoom;
    const minPosY = DESIGN_HEIGHT - DESIGN_HEIGHT * this.zoom;
    const posX = Math.max(minPosX, Math.min(0, DESIGN_WIDTH * 0.5 - this.x * this.zoom + shakeX));
    const posY = Math.max(minPosY, Math.min(0, DESIGN_HEIGHT * 0.5 - this.y * this.zoom + shakeY));

    worldContainer.scale.set(this.zoom);
    worldContainer.position.set(posX, posY);

    return { parallaxX: (this.x - DESIGN_WIDTH * 0.5) * 0.18 };
  }
}
