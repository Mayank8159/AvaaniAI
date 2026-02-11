import * as THREE from "three";

export class SpringSimulator {
  private position: THREE.Vector3;
  private velocity: THREE.Vector3;
  private target: THREE.Vector3;
  
  // Physics parameters
  public stiffness: number; // How fast it returns to rest (Tenseness)
  public damping: number;   // How much it slows down (Jiggle duration)
  public mass: number;

  constructor(stiffness = 120, damping = 10, mass = 1) {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.target = new THREE.Vector3();
    
    this.stiffness = stiffness;
    this.damping = damping;
    this.mass = mass;
  }

  /**
   * Updates the spring physics
   * @param dt Delta time
   * @param inputForce External movement (like body sway) acting on the spring
   */
  update(dt: number, inputForce: THREE.Vector3) {
    // F = -k * x (Hooke's Law)
    const displacement = this.position.clone().sub(this.target);
    const springForce = displacement.multiplyScalar(-this.stiffness);
    
    // F_damping = -c * v
    const dampingForce = this.velocity.clone().multiplyScalar(-this.damping);
    
    // F_total = F_spring + F_damping + Input
    const force = springForce.add(dampingForce).add(inputForce);
    
    // a = F / m
    const acceleration = force.divideScalar(this.mass);

    // v = v + a * dt
    this.velocity.add(acceleration.multiplyScalar(dt));
    
    // p = p + v * dt
    this.position.add(this.velocity.clone().multiplyScalar(dt));
  }

  getOffset(): THREE.Vector3 {
    return this.position;
  }
}