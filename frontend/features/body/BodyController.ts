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

    const hips =
      humanoid.getRawBone("hips" as any)?.node ??
      humanoid.getRawBone("Hips" as any)?.node;

    const spine =
      humanoid.getRawBone("spine" as any)?.node ??
      humanoid.getRawBone("Spine" as any)?.node;

    const chest =
      humanoid.getRawBone("chest" as any)?.node ??
      humanoid.getRawBone("Chest" as any)?.node;

    const leftUpperLeg =
      humanoid.getRawBone("leftUpperLeg" as any)?.node ??
      humanoid.getRawBone("LeftUpperLeg" as any)?.node;

    const rightUpperLeg =
      humanoid.getRawBone("rightUpperLeg" as any)?.node ??
      humanoid.getRawBone("RightUpperLeg" as any)?.node;

    const scale = 1 + w * 0.25; // 25% wider at max

    if (hips) hips.scale.set(scale, 1, scale);
    if (spine) spine.scale.set(scale * 0.9, 1, scale * 0.9);
    if (chest) chest.scale.set(scale * 0.85, 1, scale * 0.85);

    if (leftUpperLeg) leftUpperLeg.scale.set(scale * 0.95, 1, scale * 0.95);
    if (rightUpperLeg) rightUpperLeg.scale.set(scale * 0.95, 1, scale * 0.95);
  }
}
