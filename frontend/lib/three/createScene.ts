// lib/three/createScene.ts
import * as THREE from "three";

export function createScene() {
  const scene = new THREE.Scene();

  // --- 1. Professional Gradient Texture (Studio Backdrop) ---
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512; // High resolution for the vertical spread
  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    // Dark professional palette
    gradient.addColorStop(0, "#1a1a1a");   // Top: Near black
    gradient.addColorStop(0.5, "#2d161f"); // Middle: Very dark muted plum
    gradient.addColorStop(1, "#111111");   // Bottom: Floor depth
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 512);
  }

  const bgTexture = new THREE.CanvasTexture(canvas);
  scene.background = bgTexture;

  // --- 2. Professional Lighting (3-Point Setup) ---
  
  // Ambient: Very low, for deep shadows
  const ambient = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambient);

  // Key Light: Neutral white from the front-right
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(5, 5, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0001;
  scene.add(sun);

  // Fill Light: The "Soothing Pink" accent from the left
  // This gives the character pink highlights without making the whole room pink
  const fillLight = new THREE.PointLight(0xffb6c1, 0.8);
  fillLight.position.set(-5, 3, 2);
  scene.add(fillLight);

  // Rim Light: Strong white light from behind
  // Essential for that "Pro" silhouette look
  const rimLight = new THREE.SpotLight(0xffffff, 1.5);
  rimLight.position.set(0, 5, -5);
  rimLight.target.position.set(0, 1, 0);
  scene.add(rimLight);

  return scene;
}