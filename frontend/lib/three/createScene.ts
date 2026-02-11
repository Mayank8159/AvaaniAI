// lib/three/createScene.ts
import * as THREE from "three";

export function createScene() {
  const scene = new THREE.Scene();

  // Dark Pink Stage Gradient
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, "#1a1a1a");   // Dark top
    gradient.addColorStop(0.5, "#741a3c"); // Soothing dark pink
    gradient.addColorStop(1, "#0a0a0a");   // Floor depth
    context.fillStyle = gradient;
    context.fillRect(0, 0, 2, 512);
  }
  const bgTexture = new THREE.CanvasTexture(canvas);
  scene.background = bgTexture;

  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(5, 5, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  return scene;
}