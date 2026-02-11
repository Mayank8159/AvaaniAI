// features/body/PoseController.ts
import * as THREE from "three";

export class PoseController {
  private vrm: any;

  constructor(vrm: any) {
    this.vrm = vrm;
    this.applyRestPose();
  }

  private applyRestPose() {
    const humanoid = this.vrm.humanoid;
    if (!humanoid) return;

    // Rotate Upper Arms down (A-Pose)
    // Degrees converted to Radians: ~65 degrees down
    const armAngle = 1.1; 

    const leftUpperArm = humanoid.getNormalizedBoneNode("leftUpperArm");
    const rightUpperArm = humanoid.getNormalizedBoneNode("rightUpperArm");

    if (leftUpperArm) leftUpperArm.rotation.z = armAngle;
    if (rightUpperArm) rightUpperArm.rotation.z = -armAngle;

    // Slight bend in elbows for realism
    const leftLowerArm = humanoid.getNormalizedBoneNode("leftLowerArm");
    const rightLowerArm = humanoid.getNormalizedBoneNode("rightLowerArm");

    if (leftLowerArm) leftLowerArm.rotation.y = 0.2;
    if (rightLowerArm) rightLowerArm.rotation.y = -0.2;
  }
}