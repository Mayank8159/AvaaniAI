import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { SpringSimulator } from "@/lib/physics/SpringSimulator";

export class IdleMotionController {
  private vrm: VRM;
  private enabled: boolean = true;
  private time: number = 0;

  // State
  private mood: "calm" | "excited" | "shy" = "calm";
  
  // Physics Systems
  private chestSpring: SpringSimulator;
  private hipSpring: SpringSimulator;

  // Previous frame data for calculating velocity
  private prevHipsPos: THREE.Vector3 = new THREE.Vector3();

  constructor(vrm: VRM) {
    this.vrm = vrm;

    // Config: Stiffness (bounce speed), Damping (jiggle duration), Mass
    this.chestSpring = new SpringSimulator(140, 8, 1.2); 
    this.hipSpring = new SpringSimulator(80, 15, 2.0);
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public update(dt: number) {
    if (!this.enabled) return;
    this.time += dt;

    this.updateBreathing(dt);
    this.updateSway(dt);
    this.updatePhysics(dt);
    this.updateMicroGestures(dt);
  }

  /**
   * 1. Procedural Breathing
   * Expands chest and slightly lifts shoulders
   */
  private updateBreathing(dt: number) {
    const frequency = 1.5; // Breath speed
    const breathIntensity = Math.sin(this.time * frequency); // -1 to 1

    const chest = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest);
    const upperChest = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.UpperChest);
    
    if (chest) {
        // Scale chest slightly for breath in
        const scale = 1 + (breathIntensity * 0.02); 
        chest.scale.setScalar(scale);
        
        // Slight rotation back/forward
        chest.rotation.x = Math.sin(this.time * frequency) * 0.03;
    }
  }

  /**
   * 2. Feminine Idle Sway
   * Moves hips in a Figure-8 or gentle sine pattern
   */
  private updateSway(dt: number) {
    const hips = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    const spine = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Spine);
    
    if (hips && spine) {
        // Calculate Sway Logic
        const t = this.time;
        
        // Hips sway Left/Right
        const swayX = Math.sin(t * 0.8) * 0.02;
        // Hips bob Up/Down slightly
        const swayY = Math.abs(Math.sin(t * 1.6)) * 0.005;
        // Hips twist slightly
        const twistY = Math.cos(t * 0.8) * 0.03;

        hips.position.y += swayY * dt * 10; // Apply offset
        hips.rotation.z = swayX;
        hips.rotation.y = twistY;

        // Counter-rotate spine to keep head relatively steady (Simulation of balance)
        spine.rotation.z = -swayX * 0.5;
        spine.rotation.y = -twistY * 0.5;
    }
  }

  /**
   * 3. Soft Jiggle Physics (Chest & Hips interaction)
   * Reacts to the Sway movement
   */
  private updatePhysics(dt: number) {
    const hips = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
    const chest = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Chest);

    if (!hips || !chest) return;

    // 1. Calculate world velocity of hips to drive physics
    const currentHipsPos = new THREE.Vector3();
    hips.getWorldPosition(currentHipsPos);
    
    const velocity = currentHipsPos.clone().sub(this.prevHipsPos).divideScalar(dt);
    this.prevHipsPos.copy(currentHipsPos);

    // 2. Update Springs
    // Input force is inverted velocity (inertia)
    // We dampen the input so it's not too crazy
    const inertia = velocity.multiplyScalar(-0.05); 
    
    this.chestSpring.update(dt, inertia);

    // 3. Apply Spring to Bones
    const springOffset = this.chestSpring.getOffset();

    // Apply Soft Bounce to Chest Rotation (Subtle)
    // We add to existing rotation, not replace it
    chest.rotation.x += springOffset.y * 0.5; 
  }

  /**
   * 4. Micro Gestures (Randomness)
   * Prevents the robot feel
   */
  private updateMicroGestures(dt: number) {
    const head = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);
    if (!head) return;

    // Slow noise-like drift for the head
    const noiseX = Math.sin(this.time * 0.3) * Math.cos(this.time * 0.7) * 0.05;
    const noiseY = Math.cos(this.time * 0.2) * 0.05;

    head.rotation.y += noiseY * dt;
    head.rotation.x += noiseX * dt;
  }
}