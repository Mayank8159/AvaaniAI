import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";

export class DanceController {
  private mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;

  constructor(private vrm: VRM) {
    this.mixer = new THREE.AnimationMixer(vrm.scene);
  }

  // If your VRM has clips (some do), you can play them.
  // Otherwise you can later load external FBX/GLB animations and retarget.
  playClip(clip: THREE.AnimationClip) {
    this.currentAction?.stop();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.play();
    this.currentAction = action;
  }

  stop() {
    this.currentAction?.stop();
    this.currentAction = null;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
