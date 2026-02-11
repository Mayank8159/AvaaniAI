import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

export type AvaaniLiveContext = {
  identity?: string;
  state_confidence?: number;

  emotion?: string;
  emotion_intensity?: number;
  emotion_probs?: Record<string, number>;

  energy_level?: number;
  attention?: number;
  engagement?: number;

  gaze?: { score?: number; vector?: string };

  tracking?: { x?: number; y?: number; z?: number; visible?: boolean };

  posture?: { inclination?: number; facing_camera?: boolean; energy?: number };

  timestamp?: number;
  system_status?: string;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

export class LiveContextController {
  private vrm: VRM;
  private ctx: AvaaniLiveContext | null = null;

  // smoothed state
  private s = {
    happy: 0,
    sad: 0,
    angry: 0,
    surprised: 0,

    energy: 0.6,
    gaze: 0.7,

    lookX: 0,
    lookY: 0,
    lean: 0,

    confidence: 0.2,
  };

  constructor(vrm: VRM) {
    this.vrm = vrm;
  }

  /** Call whenever you receive JSON from backend */
  public setContext(ctx: AvaaniLiveContext) {
    this.ctx = ctx;
  }

  /** Use this to drive IdleBodyController intensity */
  public getEnergy() {
    return this.s.energy;
  }

  public update(dt: number) {
    if (!this.ctx) return;

    // Exponential smoothing: stable across framerates
    const a = 1 - Math.exp(-dt * 10);

    const conf = clamp01(this.ctx.state_confidence ?? 0.2);
    this.s.confidence += (conf - this.s.confidence) * a;

    const probs = this.ctx.emotion_probs ?? {};
    const tgtHappy = clamp01(probs.happy ?? 0);
    const tgtSad = clamp01(probs.sad ?? 0);
    const tgtAngry = clamp01(probs.angry ?? 0);
    const tgtSurprised = clamp01((probs.surprise ?? probs.surprised ?? 0) as number);

    // gate expressions by confidence (your sample had 0.17, so this matters)
    const gate = clamp(this.s.confidence * 1.6, 0, 1);

    this.s.happy += (tgtHappy * gate - this.s.happy) * a;
    this.s.sad += (tgtSad * gate - this.s.sad) * a;
    this.s.angry += (tgtAngry * gate - this.s.angry) * a;
    this.s.surprised += (tgtSurprised * gate - this.s.surprised) * a;

    const energy = clamp01(this.ctx.energy_level ?? 0.6);
    this.s.energy += (energy - this.s.energy) * a;

    const gaze = clamp01(this.ctx.gaze?.score ?? 0.7);
    this.s.gaze += (gaze - this.s.gaze) * a;

    // tracking: x/y are usually 0..1 (center ~0.5)
    const tr = this.ctx.tracking;
    const visible = !!tr?.visible;

    const tx = visible ? ((tr?.x ?? 0.5) - 0.5) * 2 : 0;
    const ty = visible ? (0.5 - ((tr?.y ?? 0.5) as number)) * 2 : 0;

    const tgtLookX = clamp(tx, -1, 1);
    const tgtLookY = clamp(ty, -1, 1);

    this.s.lookX += (tgtLookX - this.s.lookX) * a;
    this.s.lookY += (tgtLookY - this.s.lookY) * a;

    const lean = clamp(this.ctx.posture?.inclination ?? 0, -0.3, 0.3);
    this.s.lean += (lean - this.s.lean) * a;

    // Apply expressions
    const em: any = (this.vrm as any).expressionManager;
    if (em?.setValue) {
      em.setValue("happy", this.s.happy);
      em.setValue("sad", this.s.sad);
      em.setValue("angry", this.s.angry);
      em.setValue("surprised", this.s.surprised);
    }

    // Apply head/neck/spine subtle look
    const humanoid: any = (this.vrm as any).humanoid;
    if (!humanoid?.getNormalizedBoneNode) return;

    const neck = humanoid.getNormalizedBoneNode("neck");
    const head = humanoid.getNormalizedBoneNode("head");
    const spine = humanoid.getNormalizedBoneNode("spine");

    const yaw = this.s.lookX * 0.35 * this.s.gaze;   // left-right
    const pitch = this.s.lookY * 0.25 * this.s.gaze; // up-down

    if (neck) neck.rotation.set(pitch * 0.4, yaw * 0.4, 0);
    if (head) head.rotation.set(pitch * 0.6, yaw * 0.6, 0);

    if (spine) spine.rotation.x = this.s.lean * 0.5;
  }
}
