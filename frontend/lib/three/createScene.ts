// lib/three/createScene.ts
import * as THREE from "three";

export function createScene() {
  const scene = new THREE.Scene();
  
  // Soothing Dark Pink / Deep Berry
  scene.background = new THREE.Color("#2D1B22"); 

  // Ambient light: Lower intensity to keep the dark vibe
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // Directional light: Act as a soft "Key Light"
  const sun = new THREE.DirectionalLight(0xffd1dc, 0.8); // Slightly pinkish light
  sun.position.set(2, 5, 3);
  sun.castShadow = true;
  
  // High quality soft shadows
  sun.shadow.mapSize.width = 2048; 
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -2;
  sun.shadow.camera.right = 2;
  sun.shadow.camera.top = 2;
  sun.shadow.camera.bottom = -2;
  sun.shadow.bias = -0.0001;
  
  scene.add(sun);

  // Add a subtle Rim Light to make the character pop from the dark BG
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
  rimLight.position.set(-2, 2, -2);
  scene.add(rimLight);

  return scene;
}