import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";

export class RootFixer {
  private vrm: VRM;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    // Hard reset initially
    this.vrm.scene.position.set(0, 0, 0);
    this.vrm.scene.rotation.set(0, Math.PI, 0); // Rotate 180 if needed to face camera
  }

  update() {
    // 1. Force Root Lock
    // Even if animations try to move the root transform, we zero it out.
    this.vrm.scene.position.y = 0;
    this.vrm.scene.position.x = 0;
    this.vrm.scene.position.z = 0;
    
    this.vrm.scene.updateMatrixWorld();
  }
}