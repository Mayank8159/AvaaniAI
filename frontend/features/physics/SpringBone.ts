import * as THREE from "three";

export class SpringBone {
  public position: THREE.Vector3;
  private velocity: THREE.Vector3;
  private target: THREE.Vector3;
  
  // Physics config
  public stiffness: number; // Snap back speed
  public damping: number;   // Jiggle reduction (higher = heavier/slower)
  public mass: number;

  constructor(stiffness = 40, damping = 10, mass = 1.0) {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
  }

  update(dt: number, inputTarget: THREE.Vector3) {
    this.target.copy(inputTarget);

    // F = -k * (x - target)
    const displacement = this.position.clone().sub(this.target);
    const springForce = displacement.multiplyScalar(-this.stiffness);

    // F_damping = -c * v
    const dampingForce = this.velocity.clone().multiplyScalar(-this.damping);

    // a = F / m
    const acceleration = springForce.add(dampingForce).divideScalar(this.mass);

    // Integrate
    this.velocity.add(acceleration.multiplyScalar(dt));
    this.position.add(this.velocity.clone().multiplyScalar(dt));
  }

  getOffset(): THREE.Vector3 {
    return this.position;
  }
}