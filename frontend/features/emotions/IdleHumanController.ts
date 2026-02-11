import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { pseudoNoise, damp } from "@/lib/math/SimpleNoise";

export class IdleHumanController {
  private vrm: VRM;
  private enabled: boolean = true;
  private time: number = 0;

  // Base Data (Captured on Init to prevent floating/sinking)
  private baseHipsPosition: THREE.Vector3 = new THREE.Vector3();
  
  // Smoothing State (Current values for interpolation)
  private currentHipsPos: THREE.Vector3 = new THREE.Vector3();
  private currentHipsRotY: number = 0;
  private currentSpineRot: THREE.Vector2 = new THREE.Vector2(); // x, y
  private currentHeadRot: THREE.Vector2 = new THREE.Vector2(); // x, y

  // Eye Logic
  private lookTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 10);
  private nextLookTime: number = 0;
  
  // Blink Logic
  private nextBlinkTime: number = 0;
  private blinkState: "open" | "closing" | "opening" = "open";
  private blinkAlpha: number = 0;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.init();
  }

  private init() {
    // 1. Capture Base Hips Position
    const hips = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    if (hips) {
      this.baseHipsPosition.copy(hips.position);
      this.currentHipsPos.copy(hips.position);
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public update(dt: number) {
    if (!this.enabled) return;

    this.time += dt;

    // 1. ORGANIC HIPS (The Foundation)
    this.updateHipsOrganic(dt);

    // 2. SPINE LAG (Upper body follows hips with delay)
    this.updateSpineLag(dt);

    // 3. HUMAN EYES (Saccadic movement)
    this.updateHeadAndEyes(dt);

    // 4. NATURAL BLINKING (Fast close, slow open)
    this.updateBlink(dt);

    // 5. ARMS (Subtle breathing)
    this.updateArms(dt);
  }

  private updateHipsOrganic(dt: number) {
    const hips = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    if (!hips) return;

    // Noise Inputs (Non-repeating chaos)
    const noiseX = pseudoNoise(this.time * 0.3); // Drift Left/Right
    const noiseY = pseudoNoise(this.time * 0.8 + 100); // Breath Up/Down
    const noiseRot = pseudoNoise(this.time * 0.25 + 50); // Twist

    // Targets (Small deviations from base)
    const targetX = this.baseHipsPosition.x + (noiseX * 0.02); 
    const targetY = this.baseHipsPosition.y + (noiseY * 0.005); 
    const targetRotY = noiseRot * 0.04; 

    // Smooth Damping (Lambda = 3.0 means "heavy/slow")
    this.currentHipsPos.x = damp(this.currentHipsPos.x, targetX, 3.0, dt);
    this.currentHipsPos.y = damp(this.currentHipsPos.y, targetY, 3.0, dt);
    this.currentHipsRotY = damp(this.currentHipsRotY, targetRotY, 3.0, dt);

    // Apply
    hips.position.copy(this.currentHipsPos);
    
    // Strict Upright Rotation (Fixes Back Tilt)
    hips.rotation.y = this.currentHipsRotY;
    hips.rotation.x = 0; // FORCE STRAIGHT
    hips.rotation.z = -this.currentHipsRotY * 0.1; // Tiny counter-roll
  }

  private updateSpineLag(dt: number) {
    const spine = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    if (!spine) return;

    // Spine tries to stay upright while hips move (Counter-balance)
    const targetRotY = -this.currentHipsRotY * 0.5;
    
    // Breathing expansion (Chest expands up slightly)
    const breath = (Math.sin(this.time * 1.5) * 0.5 + 0.5) * 0.02;

    // Smooth Damping (Lambda = 2.0 means "lags behind hips")
    this.currentSpineRot.x = damp(this.currentSpineRot.x, breath, 2.0, dt);
    this.currentSpineRot.y = damp(this.currentSpineRot.y, targetRotY, 2.0, dt);

    spine.rotation.x = this.currentSpineRot.x; // Only breath movement
    spine.rotation.y = this.currentSpineRot.y;
    spine.rotation.z = 0; // FORCE STRAIGHT
  }

  private updateHeadAndEyes(dt: number) {
    // 1. Pick new target occasionally (Saccades)
    if (this.time > this.nextLookTime) {
      const range = Math.random() > 0.9 ? 0.8 : 0.2; // 10% chance big look, 90% small jitters
      this.lookTarget.set(
        (Math.random() - 0.5) * range, 
        (Math.random() - 0.5) * (range * 0.5), 
        10
      );
      this.nextLookTime = this.time + 0.5 + Math.random() * 2.5;
    }

    // 2. Head Follows Eyes (Lazy/Heavy head)
    // Head moves much slower than eyes (Lambda = 1.5)
    this.currentHeadRot.x = damp(this.currentHeadRot.x, this.lookTarget.y * 0.3, 1.5, dt);
    this.currentHeadRot.y = damp(this.currentHeadRot.y, this.lookTarget.x * 0.4, 1.5, dt);

    const head = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
    if (head) {
      head.rotation.x = this.currentHeadRot.x;
      head.rotation.y = this.currentHeadRot.y;
    }

    // 3. Eyes Snap Fast (Lambda = 15.0)
    // We use LookAt for actual eye bones
    if (this.vrm.lookAt) {
       this.vrm.lookAt.lookAt(new THREE.Vector3(this.lookTarget.x, this.lookTarget.y, 10));
    }
  }

  private updateBlink(dt: number) {
    if (this.blinkState === "open" && this.time > this.nextBlinkTime) {
      this.blinkState = "closing";
      this.blinkAlpha = 0;
    }

    if (this.blinkState === "closing") {
      this.blinkAlpha += dt * 15.0; // Close FAST
      if (this.blinkAlpha >= 1) {
        this.blinkAlpha = 1;
        this.blinkState = "opening";
      }
    } else if (this.blinkState === "opening") {
      this.blinkAlpha -= dt * 6.0; // Open SLOW
      if (this.blinkAlpha <= 0) {
        this.blinkAlpha = 0;
        this.blinkState = "open";
        this.nextBlinkTime = this.time + 2.0 + Math.random() * 5.0;
      }
    }

    // Square it for non-linear "pop"
    const val = this.blinkAlpha * this.blinkAlpha;
    this.vrm.expressionManager?.setValue("blink", val);
  }

  private updateArms(dt: number) {
    const breath = Math.sin(this.time * 1.5) * 0.015;
    const armRelax = 75 * (Math.PI / 180);

    const lUpper = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftUpperArm);
    const rUpper = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightUpperArm);
    const lLower = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.LeftLowerArm);
    const rLower = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.RightLowerArm);

    if(lUpper) lUpper.rotation.z = armRelax - breath;
    if(rUpper) rUpper.rotation.z = -armRelax + breath;
    
    // Slight forearm bend
    if(lLower) lLower.rotation.set(0.15, 0, 0); 
    if(rLower) rLower.rotation.set(0.15, 0, 0);
  }
}