// features/physics/PhysicsController.ts
export class PhysicsController {
  constructor(vrm: any) {
    // 1. Check if vrm and springBoneManager exist
    if (vrm && vrm.springBoneManager) {
      
      // 2. Safety check for the gravityDir object before calling .set()
      if (vrm.springBoneManager.gravityDir) {
        vrm.springBoneManager.gravityDir.set(0.0, -1.0, 0.0);
        vrm.springBoneManager.gravityPower = 0.5;
        console.log("Physics: Gravity applied.");
      }
    } else {
      console.warn("Physics: No springBoneManager found on this VRM.");
    }
  }
}