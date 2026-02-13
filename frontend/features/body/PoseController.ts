import * as THREE from "three";

type PoseConfig = {
  shoulderDown: number;
  shoulderForward: number; 
  armInward: number;       
  armInternalRotation: number;
  elbowBend: number;
  wristBend: number;
};

const DEFAULT_CONFIG: PoseConfig = {
  shoulderDown: 0.85,
  shoulderForward: 0.25,     
  armInward: 0.22,           
  armInternalRotation: 0.52, 
  elbowBend: 0.45,           
  wristBend: 0.15,
};

export class PoseController {
  private vrm: any;
  private config: PoseConfig;
  private isEnabled = true;
  private rest = new Map<string, THREE.Quaternion>();

  private _euler = new THREE.Euler();
  private _qOffset = new THREE.Quaternion();

  constructor(vrm: any, config: Partial<PoseConfig> = {}) {
    this.vrm = vrm;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheRestPose();
  }

  public update(_dt: number) {
    if (!this.isEnabled || !this.vrm?.humanoid) return;
    this.applyNaturalPose();
  }

  private applyNaturalPose() {
    const humanoid = this.vrm.humanoid;
    const c = this.config;

    // 1. Upper Arms (Feminine slump forward + inward rotation)
    this.applyOffset(humanoid, "leftUpperArm", c.shoulderForward, c.armInternalRotation, -c.shoulderDown);
    this.applyOffset(humanoid, "rightUpperArm", c.shoulderForward, -c.armInternalRotation, c.shoulderDown);

    // 2. Lower Arms (Bring hands toward the front/stomach)
    this.applyOffset(humanoid, "leftLowerArm", -c.elbowBend, -c.armInward, 0);
    this.applyOffset(humanoid, "rightLowerArm", -c.elbowBend, c.armInward, 0);

    // 3. Wrists (Soft inward tilt)
    this.applyOffset(humanoid, "leftHand", 0, 0.3, 0.15);
    this.applyOffset(humanoid, "rightHand", 0, -0.3, -0.15);
  }

  private applyOffset(humanoid: any, name: string, x: number, y: number, z: number) {
    const bone = humanoid.getNormalizedBoneNode(name);
    if (!bone) return;
    if (!this.rest.has(name)) this.rest.set(name, bone.quaternion.clone());

    const base = this.rest.get(name)!;
    this._euler.set(x, y, z, "XYZ");
    this._qOffset.setFromEuler(this._euler);
    bone.quaternion.copy(base).multiply(this._qOffset);
  }

  private cacheRestPose() {
    const humanoid = this.vrm?.humanoid;
    if (!humanoid?.getNormalizedBoneNode) return;
    const bones = ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand"];
    bones.forEach(name => {
      const bone = humanoid.getNormalizedBoneNode(name);
      if (bone) this.rest.set(name, bone.quaternion.clone());
    });
  }
}