import * as THREE from "three";

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });

  renderer.setClearColor(0x121212, 1);

  // Good defaults for VRM viewing
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // IMPORTANT: DPR on web
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  return renderer;
}
