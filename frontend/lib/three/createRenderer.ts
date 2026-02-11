import * as THREE from "three";

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,           // 👈 THIS ALLOWS CSS BACKGROUND TO SHOW
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  // 👈 THIS FORCES THE 3D SCENE TO BE TRANSPARENT
  renderer.setClearColor(0x000000, 0); 

  return renderer;
}