import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { pseudoNoise } from "@/lib/math/SimpleNoise";

export class SecondaryPhysicsController {
  private vrm: VRM;
  private enabled: boolean = true;
  private time: number = 0;

  // Hand State
  private leftFingers: THREE.Object3D[] = [];
  private rightFingers: THREE.Object3D[] = [];
  private fingerOffsets: number[] = []; 

  // Cloth/Wind State
  private springJoints: any[] = []; 
  
  // We keep a reference to the original gravity to allow resetting
  private originalGravity = new THREE.Vector3(0, -1, 0);

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.initHandBones();
    this.initClothPhysics();
  }

  /**
   * 1. HAND SETUP
   */
  private initHandBones() {
    // List valid bones (VRM 1.0 standard)
    const fingerNames: (VRMHumanBoneName | undefined)[] = [
      VRMHumanBoneName.LeftThumbProximal, VRMHumanBoneName.LeftThumbDistal,
      VRMHumanBoneName.LeftIndexProximal, VRMHumanBoneName.LeftIndexIntermediate, VRMHumanBoneName.LeftIndexDistal,
      VRMHumanBoneName.LeftMiddleProximal, VRMHumanBoneName.LeftMiddleIntermediate, VRMHumanBoneName.LeftMiddleDistal,
      VRMHumanBoneName.LeftRingProximal, VRMHumanBoneName.LeftRingIntermediate, VRMHumanBoneName.LeftRingDistal,
      VRMHumanBoneName.LeftLittleProximal, VRMHumanBoneName.LeftLittleIntermediate, VRMHumanBoneName.LeftLittleDistal,
    ];

    // Filter out undefined to prevent crashes
    const validLeftBones = fingerNames.filter((n): n is VRMHumanBoneName => !!n);

    // Get Left Hand Bones
    validLeftBones.forEach((name, i) => {
      const node = this.vrm.humanoid.getNormalizedBoneNode(name);
      if (node) {
        this.leftFingers.push(node);
        this.fingerOffsets.push(Math.random() * 100); // Unique twitch offset per finger
      }
    });

    // Get Right Hand Bones (Mirror)
    const validRightBones = validLeftBones.map(n => n.replace("Left", "Right") as VRMHumanBoneName);
    validRightBones.forEach((name, i) => {
      const node = this.vrm.humanoid.getNormalizedBoneNode(name);
      if (node) {
        this.rightFingers.push(node);
      }
    });
  }

  /**
   * 2. CLOTH SETUP (The Gravity Hack)
   * We gather every single spring bone joint to control them manually.
   */
  private initClothPhysics() {
    if (!this.vrm.springBoneManager) return;

    // Convert Set to Array for VRM 1.0 compatibility
    // @ts-ignore
    const joints = this.vrm.springBoneManager.joints;
    
    if (joints) {
        if (Array.isArray(joints)) {
             this.springJoints = joints;
        } else if (typeof joints.forEach === 'function') {
             // It's a Set (VRM 1.0 standard)
             joints.forEach((joint: any) => this.springJoints.push(joint));
        }
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  public update(dt: number) {
    if (!this.enabled) return;
    this.time += dt;

    this.updateHandMicroMovements(dt);
    this.updateWindGravity(dt);
  }

  /**
   * THE FIX: WIND GRAVITY
   * We continuously change the direction of "Down" for the clothes.
   * This makes them swing even when the model is standing still.
   */
  private updateWindGravity(dt: number) {
    if (this.springJoints.length === 0) {
        // Fallback: If no joints found, shake the hips slightly to wake up physics
        const hips = this.vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Hips);
        if (hips) {
             hips.position.x += Math.sin(this.time * 20) * 0.0002; // Invisible micro-shake
        }
        return;
    }

    // 1. Calculate Wind Force (Perlin Noise)
    // t * 0.5 = Speed of wind change (Gusts)
    const windX = pseudoNoise(this.time * 0.5) * 0.2; // Sideways breeze force
    const windZ = pseudoNoise(this.time * 0.5 + 42) * 0.15; // Forward/Back breeze force
    
    // 2. Gravity Pulse
    // Gravity isn't constant. It pulses slightly to simulate cloth weight shifting
    const gravityPulse = -1.0 + (Math.sin(this.time * 2.0) * 0.05); 

    // 3. Apply to EVERY cloth bone
    // We update the 'gravityDir' setting on the fly.
    for (let i = 0; i < this.springJoints.length; i++) {
        const joint = this.springJoints[i];
        
        // Safety check if settings exist (VRM 1.0)
        if (joint.settings) {
            // Modifying gravity direction directly
            // Standard is (0, -1, 0). We add wind to X/Z.
            joint.settings.gravityDir.x = windX;
            joint.settings.gravityDir.y = gravityPulse;
            joint.settings.gravityDir.z = windZ;
        } 
        // Fallback for VRM 0.0 (if property names differ)
        else if (joint.gravityDir) {
            joint.gravityDir.x = windX;
            joint.gravityDir.y = gravityPulse;
            joint.gravityDir.z = windZ;
        }
    }
  }

  /**
   * Hand Animations
   */
  private updateHandMicroMovements(dt: number) {
    for (let i = 0; i < this.leftFingers.length; i++) {
      const bone = this.leftFingers[i];
      const offset = this.fingerOffsets[i];

      const baseCurl = 0.15; // Increased curl for natural look
      const twitch = pseudoNoise(this.time * 0.8 + offset) * 0.05; 
      
      // Additive rotation
      bone.rotation.z = baseCurl + twitch;
      
      if (this.rightFingers[i]) {
        this.rightFingers[i].rotation.z = -(baseCurl + twitch);
      }
    }
  }
}