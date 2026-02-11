import * as THREE from "three";

type LiveContext = {
  emotion_probs: Record<string, number>;
  energy_level: number;
  attention: number;
  engagement: number;
  gaze: { score: number; vector: "direct" | string };
  tracking: { x: number; y: number; z: number; visible: boolean };
  posture: { inclination: number; facing_camera: boolean; energy: number };
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class LiveContextController {
  private vrm: any;
  private ctx: LiveContext | null = null;

  // smoothing
  private s = {
    happy: 0,
    sad: 0,
    angry: 0,
    surprise: 0,
    energy: 0.6,
    gaze: 0.7,
    lookX: 0,
    lookY: 0,
    lean: 0,
  };

  constructor(vrm: any) {
    this.vrm = vrm;
  }

  /** call this whenever you receive backend JSON */
  public setContext(ctx: LiveContext) {
    this.ctx = ctx;
  }

  public update(dt: number) {
    if (!this.vrm || !this.vrm.humanoid || !this.ctx) return;

    // EMA smoothing factor
    const a = 1 - Math.exp(-dt * 10); // ~fast but stable

    // ---- Expressions (map probs -> blend weights) ----
    const p = this.ctx.emotion_probs || {};
    const targetHappy = clamp01(p.happy ?? 0);
    const targetSad = clamp01(p.sad ?? 0);
    const targetAngry = clamp01(p.angry ?? 0);
    const targetSurprise = clamp01(p.surprise ?? 0);

    this.s.happy += (targetHappy - this.s.happy) * a;
    this.s.sad += (targetSad - this.s.sad) * a;
    this.s.angry += (targetAngry - this.s.angry) * a;
    this.s.surprise += (targetSurprise - this.s.surprise) * a;

    // If using VRM expressionManager (VRM 1.0-ish)
    const em = this.vrm.expressionManager;
    if (em) {
      // names may be "happy"/"sad"/"angry"/"surprised" depending on your setup
      em.setValue?.("happy", this.s.happy);
      em.setValue?.("sad", this.s.sad);
      em.setValue?.("angry", this.s.angry);
      em.setValue?.("surprised", this.s.surprise);
    }

    // ---- Energy -> your idle intensity (expose this out if needed) ----
    const targetEnergy = clamp01(this.ctx.energy_level ?? 0.6);
    this.s.energy += (targetEnergy - this.s.energy) * a;

    // ---- Gaze -> head/eye look strength ----
    const targetGaze = clamp01(this.ctx.gaze?.score ?? 0.7);
    this.s.gaze += (targetGaze - this.s.gaze) * a;

    // ---- Tracking -> look direction ----
    // tracking.x/y are normalized-ish: 0..1 (center ~0.5). Convert to -1..1
    const tr = this.ctx.tracking;
    const visible = !!tr?.visible;

    const tx = visible ? (tr.x - 0.5) * 2 : 0;
    const ty = visible ? (0.5 - tr.y) * 2 : 0; // invert so up is positive
    const targetLookX = THREE.MathUtils.clamp(tx, -1, 1);
    const targetLookY = THREE.MathUtils.clamp(ty, -1, 1);

    this.s.lookX += (targetLookX - this.s.lookX) * a;
    this.s.lookY += (targetLookY - this.s.lookY) * a;

    // ---- Posture inclination -> slight torso lean ----
    const targetLean = THREE.MathUtils.clamp(this.ctx.posture?.inclination ?? 0, -0.3, 0.3);
    this.s.lean += (targetLean - this.s.lean) * a;

    // Apply to bones (small rotations)
    const humanoid = this.vrm.humanoid;
    const head = humanoid.getNormalizedBoneNode?.("head");
    const neck = humanoid.getNormalizedBoneNode?.("neck");
    const spine = humanoid.getNormalizedBoneNode?.("spine");

    // Head look: scale by gaze strength (keep subtle)
    const yaw = this.s.lookX * 0.35 * this.s.gaze;   // left-right
    const pitch = this.s.lookY * 0.25 * this.s.gaze; // up-down

    if (neck) neck.rotation.set(pitch * 0.4, yaw * 0.4, 0);
    if (head) head.rotation.set(pitch * 0.6, yaw * 0.6, 0);

    // Torso lean
    if (spine) spine.rotation.x = this.s.lean * 0.5;
  }

  /** optional getter: use this to drive IdleBodyController intensity */
  public getEnergy() {
    return this.s.energy;
  }
}
