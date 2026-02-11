// features/body/RotationController.ts
import * as THREE from "three";

export class RotationController {
  private vrm: any;
  private isDragging: boolean = false;
  private previousMouseX: number = 0;
  private rotationVelocity: number = 0;
  private friction: number = 0.95; // How quickly it slows down after release

  constructor(vrm: any, canvas: HTMLCanvasElement) {
    this.vrm = vrm;
    this.initEvents(canvas);
  }

  private initEvents(canvas: HTMLCanvasElement) {
    const onDown = (x: number) => {
      this.isDragging = true;
      this.previousMouseX = x;
    };

    const onMove = (x: number) => {
      if (!this.isDragging || !this.vrm.scene) return;
      const deltaX = x - this.previousMouseX;
      this.vrm.scene.rotation.y += deltaX * 0.01; // Sensitivity
      this.rotationVelocity = deltaX * 0.01;
      this.previousMouseX = x;
    };

    const onUp = () => {
      this.isDragging = false;
    };

    // Mouse Events
    canvas.addEventListener("mousedown", (e) => onDown(e.clientX));
    window.addEventListener("mousemove", (e) => onMove(e.clientX));
    window.addEventListener("mouseup", onUp);

    // Touch Events
    canvas.addEventListener("touchstart", (e) => onDown(e.touches[0].clientX));
    window.addEventListener("touchmove", (e) => onMove(e.touches[0].clientX));
    window.addEventListener("touchend", onUp);
  }

  public update(dt: number) {
    // Momentum effect: character keeps spinning slightly after let go
    if (!this.isDragging && Math.abs(this.rotationVelocity) > 0.001) {
      this.vrm.scene.rotation.y += this.rotationVelocity;
      this.rotationVelocity *= this.friction;
    }
  }
}