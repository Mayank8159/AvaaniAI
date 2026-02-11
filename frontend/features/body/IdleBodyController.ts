import * as THREE from "three";

type IdleConfig = {
  enabled: boolean;

  // Overall intensity multipliers
  intensity: number;     // 0..1
  breathe: number;       // 0..1
  sway: number;          // 0..1
  head: number;          // 0..1

  // Speeds (Hz-ish)
  breatheSpeed: number;  // ~0.15..0.35
  swaySpeed: number;     // ~0.08..0.18
  headSpeed: number;     // ~0.15..0.35

  // Optional: ease / smoothing
  slerp: number;         // 0..1 (per frame blend)
};

const DEFAULT_CONFIG: IdleConfig = {
  enabled: true,
  intensity: 1.0,
  breathe: 1.0,
  sway: 1.0,
  head: 1.0,

  breatheSpeed: 0.22,
  swaySpeed: 0.12,
  headSpeed: 0.20,

  slerp: 0.25,
};

type BoneName =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "rightShoulder";

export class IdleBodyController {
  private vrm: any;
  private cfg: IdleConfig;

  private t = 0;
  private rest = new Map<BoneName, THREE.Quaternion>();

  // temp objects reused
  private _euler = new THREE.Euler(0, 0, 0, "XYZ");
  private _qOffset = new THREE.Quaternion();
  private _qTarget = new THREE.Quaternion();

  constructor(vrm: any, config: Partial<IdleConfig> = {}) {
    this.vrm = vrm;
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    this.cacheRestPose();
  }

  public setConfig(config: Partial<IdleConfig>) {
    Object.assign(this.cfg, config);
  }

  public enable() {
    this.cfg.enabled = true;
  }
  public disable() {
    this.cfg.enabled = false;
  }

  public update(dt: number) {
    if (!this.cfg.enabled || !this.vrm?.humanoid) return;

    this.t += dt;

    // Lazy cache in case VRM loads after controller constructed
    if (this.rest.size === 0) this.cacheRestPose();

    const I = this.cfg.intensity;

    // --- Signals (smooth, non-jittery) ---
    const breathe = Math.sin(this.t * Math.PI * 2 * this.cfg.breatheSpeed) * this.cfg.breathe * I;
    const breathe2 = Math.sin(this.t * Math.PI * 2 * (this.cfg.breatheSpeed * 2.0 + 0.03)) * 0.35;

    const sway = Math.sin(this.t * Math.PI * 2 * this.cfg.swaySpeed) * this.cfg.sway * I;
    const sway2 = Math.sin(this.t * Math.PI * 2 * (this.cfg.swaySpeed * 1.7 + 0.01)) * 0.35;

    const head = Math.sin(this.t * Math.PI * 2 * this.cfg.headSpeed) * this.cfg.head * I;
    const head2 = Math.sin(this.t * Math.PI * 2 * (this.cfg.headSpeed * 2.3 + 0.02)) * 0.35;

    // --- Apply subtle rotations (RADIANS) ---
    // Notes:
    // - Keep values tiny (0.01–0.08 rad) for realism.
    // - Hips sway + tiny yaw, spine/chest counter-rotate, head adds micro motion.

    // Hips: weight shift + tiny yaw
    this.applyOffset("hips",
      0.02 * sway,                 // x: slight forward/back
      0.03 * sway,                 // y: yaw
      0.05 * sway                  // z: side lean
    );

    // Spine: counter to hips + breathing
    this.applyOffset("spine",
      0.015 * breathe + 0.01 * sway2,
      -0.01 * sway,
      -0.02 * sway
    );

    // Chest: breathing + gentle counter sway
    this.applyOffset("chest",
      0.035 * breathe + 0.01 * breathe2,
      -0.015 * sway,
      -0.015 * sway2
    );

    // Some VRMs have upperChest; harmless if missing
    this.applyOffset("upperChest",
      0.02 * breathe,
      -0.01 * sway2,
      -0.01 * sway
    );

    // Neck: small stabilizer
    this.applyOffset("neck",
      0.01 * head,
      0.015 * head2,
      0.01 * sway2
    );

    // Head: tiny “alive” motion
    this.applyOffset("head",
      0.02 * head2,
      0.02 * head,
      0.015 * sway
    );

    // Shoulders: micro response to breathing
    this.applyOffset("leftShoulder",
      0.01 * breathe,
      0,
      0.01 * breathe
    );
    this.applyOffset("rightShoulder",
      0.01 * breathe,
      0,
      -0.01 * breathe
    );
  }

  private cacheRestPose() {
    const humanoid = this.vrm?.humanoid;
    if (!humanoid?.getNormalizedBoneNode) return;

    const bones: BoneName[] = [
      "hips",
      "spine",
      "chest",
      "upperChest",
      "neck",
      "head",
      "leftShoulder",
      "rightShoulder",
    ];

    for (const name of bones) {
      const b = humanoid.getNormalizedBoneNode(name);
      if (b) this.rest.set(name, b.quaternion.clone());
    }
  }

  private applyOffset(name: BoneName, x: number, y: number, z: number) {
    const humanoid = this.vrm.humanoid;
    const bone = humanoid.getNormalizedBoneNode(name);
    if (!bone) return;

    // Ensure rest exists
    if (!this.rest.has(name)) this.rest.set(name, bone.quaternion.clone());
    const base = this.rest.get(name)!;

    this._euler.set(x, y, z, "XYZ");
    this._qOffset.setFromEuler(this._euler);

    // target = base * offset
    this._qTarget.copy(base).multiply(this._qOffset);

    // Smoothly blend so motion feels organic (and avoids snapping with other controllers)
    const a = this.cfg.slerp;
    bone.quaternion.slerp(this._qTarget, a);
  }
}
