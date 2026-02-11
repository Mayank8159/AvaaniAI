import * as THREE from "three";

export function createScene() {
  const scene = new THREE.Scene();

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.9));

  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(2, 4, 2);
  scene.add(dir);

  return scene;
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 1.4, 3.0);
  camera.lookAt(0, 1.4, 0);
  return camera;
}
