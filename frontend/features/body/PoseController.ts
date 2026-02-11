// features/body/PoseController.ts
import * as THREE from "three";

export class PoseController {
  private vrm: any;

  constructor(vrm: any) {
    this.vrm = vrm;
  }

  /**
   * Re-applies the pose every frame to prevent VRM from resetting to T-Pose.
   */
  public update(dt: number) {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // A-Pose: Rotate Upper Arms down (~60 degrees)
    const armAngle = 1.05; 

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");

    if (leftUpperArm) leftUpperArm.rotation.z = armAngle;
    if (rightUpperArm) rightUpperArm.rotation.z = -armAngle;

    // Slight bend in elbows and wrists for a "natural" relaxed look
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");

    if (leftLowerArm) leftLowerArm.rotation.y = 0.3;
    if (rightLowerArm) rightLowerArm.rotation.y = -0.3;
  }
}