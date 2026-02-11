import * as THREE from "three";

export class PhysicsController {
  private vrm: any;

  constructor(vrm: any) {
    this.vrm = vrm;
  }

  public applyWind(t: number) {
    const manager = this.vrm.springBoneManager;
    if (!manager || !manager.joints) return;

    // Organic wind gusts
    const windX = Math.sin(t * 1.2) * 0.08;
    const windZ = Math.cos(t * 0.8) * 0.05;

    manager.joints.forEach((joint: any) => {
      const target = joint.settings || joint;
      if (target.gravityDir) {
        // We force gravityDir to act as a wind vector
        target.gravityDir.set(windX, -1.0, windZ);
        target.gravityPower = 0.6; // Enough power to overcome stiffness
      }
    });
  }
}