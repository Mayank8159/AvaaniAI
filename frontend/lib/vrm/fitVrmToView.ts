import * as THREE from "three";

export function fitVrmToView(
  vrmInput: any, 
  camera: THREE.PerspectiveCamera,
  opts?: {
    targetHeight?: number;
    padding?: number;
    lookAtY?: number;
    ground?: boolean;
  }
) {
  // Extract the actual Object3D scene from the VRM wrapper
  const vrmScene = vrmInput.scene ? vrmInput.scene : vrmInput;

  // Validation to prevent "updateWorldMatrix is not a function"
  if (!vrmScene || typeof vrmScene.updateWorldMatrix !== 'function') {
    console.warn("fitVrmToView: Input is not a valid THREE.Object3D");
    return;
  }

  const targetHeight = opts?.targetHeight ?? 1.7;
  const padding = opts?.padding ?? 0.85; // Lower values = Closer camera
  const lookAtY = opts?.lookAtY ?? 1.25;
  const ground = opts?.ground ?? true;

  vrmScene.updateMatrixWorld();
  const box = new THREE.Box3().setFromObject(vrmScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (size.y <= 0.0001) return;

  // Position logic
  vrmScene.position.x += -center.x;
  vrmScene.position.z += -center.z;
  if (ground) {
    vrmScene.position.y += -box.min.y;
  }

  // Perspective math
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distHeight = (size.y * padding) / (2 * Math.tan(fov / 2));
  const distWidth = (size.x * padding) / (2 * Math.tan(fov / 2)) / camera.aspect;
  const dist = Math.max(distHeight, distWidth);

  camera.position.set(0, lookAtY, dist);
  camera.lookAt(0, lookAtY, 0);
  camera.updateProjectionMatrix();
}