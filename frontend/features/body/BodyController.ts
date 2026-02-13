import { VRM } from "@pixiv/three-vrm";

export class BodyController {
  private vrm: VRM;
  private targetWeight = 0;
  private currentWeight = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  /**
   * 0 = slim
   * 1 = heavy
   */
  setBodyWeight(value: number) {
    this.targetWeight = Math.max(0, Math.min(1, value));
  }

  update(dt: number) {
    // smooth interpolation
    const speed = 3;
    const k = 1 - Math.exp(-speed * dt);
    this.currentWeight += (this.targetWeight - this.currentWeight) * k;

    this.applyWeight(this.currentWeight);
  }

  private applyWeight(w: number) {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // Use the built-in VRMHumanBoneName enum for type safety if available
    const bones = {
      hips: humanoid.getNormalizedBoneNode("hips"),
      spine: humanoid.getNormalizedBoneNode("spine"),
      chest: humanoid.getNormalizedBoneNode("chest"),
      upperLeft: humanoid.getNormalizedBoneNode("leftUpperLeg"),
      upperRight: humanoid.getNormalizedBoneNode("rightUpperLeg"),
      // Adding neck helps the transition to the head look natural
      neck: humanoid.getNormalizedBoneNode("neck")
    };

    const scale = 1 + w * 0.25;

    // Apply scales with slight "tapering" as we move up the spine
    if (bones.hips) bones.hips.scale.set(scale, 1, scale);
    if (bones.spine) bones.spine.scale.set(scale * 0.95, 1, scale * 0.95);
    if (bones.chest) bones.chest.scale.set(scale * 0.9, 1, scale * 0.9);
    if (bones.neck) bones.neck.scale.set(1 + (w * 0.1), 1, 1 + (w * 0.1));

    // Legs usually need to stay relatively thick to support the wider hips
    const legScale = 1 + w * 0.15;
    if (bones.upperLeft) bones.upperLeft.scale.set(legScale, 1, legScale);
    if (bones.upperRight) bones.upperRight.scale.set(legScale, 1, legScale);
  }
}
