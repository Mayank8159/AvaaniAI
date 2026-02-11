// features/body/FaceController.ts
import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class IdleFaceController {
  private vrm: VRM;

  private elapsed = 0;

  // Blink
  private nextBlinkTime = 0;
  private blinkPhase = 0; // 0..PI
  private isBlinking = false;

  // Live signals (so we can suppress saccades while tracking)
  private liveGazeStrength = 0; // 0..1
  private liveTrackingVisible = false;

  // Eye micro motion (bone-based)
  private nextSaccadeTime = 0;
  private targetYaw = 0;   // radians
  private targetPitch = 0; // radians
  private yaw = 0;
  private pitch = 0;

  // Cache rest quaternions so we apply offsets additively (don’t destroy rig)
  private rest = new Map<string, THREE.Quaternion>();

  // temp
  private _euler = new THREE.Euler(0, 0, 0, "XYZ");
  private _qOff = new THREE.Quaternion();

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.scheduleNextBlink();
    this.scheduleNextSaccade();
    this.cacheRestEyes();
  }

  public setLiveGaze(params: { strength?: number; visible?: boolean }) {
    if (typeof params.strength === "number") {
      this.liveGazeStrength = clamp(params.strength, 0, 1);
    }
    if (typeof params.visible === "boolean") {
      this.liveTrackingVisible = params.visible;
    }
  }

  private scheduleNextBlink() {
    this.nextBlinkTime = this.elapsed + 2 + Math.random() * 4;
  }

  private scheduleNextSaccade() {
    this.nextSaccadeTime = this.elapsed + 0.4 + Math.random() * 0.8;

    // VERY SMALL angles so pupil never “disappears”
    this.targetYaw = (Math.random() - 0.5) * 0.18;   // about ±0.09 rad (~5°)
    this.targetPitch = (Math.random() - 0.5) * 0.12; // about ±0.06 rad (~3.4°)
  }

  private cacheRestEyes() {
    const humanoid: any = (this.vrm as any).humanoid;
    if (!humanoid?.getNormalizedBoneNode) return;

    const leftEye = humanoid.getNormalizedBoneNode("leftEye");
    const rightEye = humanoid.getNormalizedBoneNode("rightEye");

    if (leftEye) this.rest.set("leftEye", leftEye.quaternion.clone());
    if (rightEye) this.rest.set("rightEye", rightEye.quaternion.clone());
  }

  private setBlink(value: number) {
    const expressions: any = (this.vrm as any).expressionManager;
    if (!expressions?.setValue) return;

    // VRM 1.0 presets
    expressions.setValue("blinkLeft", value);
    expressions.setValue("blinkRight", value);

    // fallback (some avatars)
    expressions.setValue("blink", value);
  }

  private applyEyeOffset(yaw: number, pitch: number, dt: number) {
    const humanoid: any = (this.vrm as any).humanoid;
    if (!humanoid?.getNormalizedBoneNode) return;

    const leftEye = humanoid.getNormalizedBoneNode("leftEye");
    const rightEye = humanoid.getNormalizedBoneNode("rightEye");
    if (!leftEye || !rightEye) return;

    // lazily cache if hot reload / late init
    if (!this.rest.has("leftEye")) this.rest.set("leftEye", leftEye.quaternion.clone());
    if (!this.rest.has("rightEye")) this.rest.set("rightEye", rightEye.quaternion.clone());

    const baseL = this.rest.get("leftEye")!;
    const baseR = this.rest.get("rightEye")!;

    // Smooth motion
    const k = 1 - Math.exp(-dt * 16);
    this.yaw += (yaw - this.yaw) * k;
    this.pitch += (pitch - this.pitch) * k;

    // Apply tiny yaw/pitch. (XYZ works for most VRM eye bones.)
    this._euler.set(this.pitch, this.yaw, 0, "XYZ");
    this._qOff.setFromEuler(this._euler);

    leftEye.quaternion.copy(baseL).multiply(this._qOff);
    rightEye.quaternion.copy(baseR).multiply(this._qOff);
  }

  public update(dt: number) {
    this.elapsed += dt;

    // ----- Blink -----
    if (!this.isBlinking && this.elapsed >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkPhase = 0;
    }

    if (this.isBlinking) {
      this.blinkPhase = Math.min(this.blinkPhase + dt * 12, Math.PI);
      const blinkValue = Math.sin(this.blinkPhase);
      this.setBlink(blinkValue);

      if (this.blinkPhase >= Math.PI) {
        this.isBlinking = false;
        this.blinkPhase = 0;
        this.scheduleNextBlink();
      }
    } else {
      // Always reset blink when not blinking
      this.setBlink(0);
    }

    // ----- Eye micro motion -----
    // If live tracking is active, STOP saccades and keep eyes centered
    const liveActive = this.liveTrackingVisible && this.liveGazeStrength > 0.35;
    if (liveActive) {
      this.applyEyeOffset(0, 0, dt);
      return;
    }

    if (this.elapsed >= this.nextSaccadeTime) {
      this.scheduleNextSaccade();
    }

    this.applyEyeOffset(this.targetYaw, this.targetPitch, dt);
  }
}
