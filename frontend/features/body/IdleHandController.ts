import * as THREE from "three";

export class IdleHandController {
  private vrm: any;
  private t = 0;
  private rest = new Map<string, THREE.Quaternion>();

  private _euler = new THREE.Euler();
  private _qOffset = new THREE.Quaternion();

  constructor(vrm: any) {
    this.vrm = vrm;
  }

  public update(dt: number) {
    if (!this.vrm?.humanoid) return;
    this.t += dt;

    this.applySide("left");
    this.applySide("right");
  }

  private applySide(side: "left" | "right") {
    const humanoid = this.vrm.humanoid;
    const isLeft = side === "left";
    const sideMult = isLeft ? 1 : -1;

    // 1. Wrist Gravity Dangle
    const weightSway = Math.sin(this.t * 0.45) * 0.04;
    const gravityPull = 0.12;
    this.applyOffset(humanoid, `${side}Hand`, gravityPull + weightSway, 0, 0.05 * sideMult);

    // 2. Finger Gravity Profile
    const fingers = ["Index", "Middle", "Ring", "Little"];
    const joints = ["Proximal", "Intermediate", "Distal"];
    const gravityWeights = [0.28, 0.48, 0.45, 0.38]; // Middle/Ring are heaviest

    fingers.forEach((finger, fIdx) => {
      const noise = Math.sin(this.t * 1.2 + fIdx * 0.5) * 0.04;
      const baseCurl = gravityWeights[fIdx] + noise;
      
      joints.forEach((joint, jIdx) => {
        const boneName = `${side}${finger}${joint}`;
        const falloff = 1.0 - jIdx * 0.22;
        const finalCurl = baseCurl * falloff;
        const splay = (fIdx - 1.5) * 0.08 * sideMult; 

        this.applyOffset(humanoid, boneName, finalCurl, 0, splay);
      });
    });

    // 3. Thumb Logic
    ["Proximal", "Intermediate", "Distal"].forEach((joint, jIdx) => {
      const boneName = `${side}Thumb${joint}`;
      const tX = (0.28 + Math.sin(this.t * 0.8) * 0.02) * (1 - jIdx * 0.3);
      this.applyOffset(humanoid, boneName, tX, 0.45 * sideMult, 0.2 * sideMult);
    });
  }

  private applyOffset(humanoid: any, name: string, x: number, y: number, z: number) {
    const bone = humanoid.getNormalizedBoneNode(name);
    if (!bone) return;
    if (!this.rest.has(name)) this.rest.set(name, bone.quaternion.clone());

    const baseQ = this.rest.get(name)!;
    this._euler.set(x, y, z, "XYZ");
    this._qOffset.setFromEuler(this._euler);
    bone.quaternion.copy(baseQ).multiply(this._qOffset);
  }
}