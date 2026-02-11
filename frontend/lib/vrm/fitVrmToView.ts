import * as THREE from "three";

export function fitVrmToView(
  vrmScene: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  opts?: {
    targetHeight?: number; // desired avatar height in world units
    padding?: number;      // extra framing space
    lookAtY?: number;      // where camera looks (head/chest height)
    ground?: boolean;      // keep feet on ground (y = 0)
  }
) {
  const targetHeight = opts?.targetHeight ?? 1.6;
  const padding = opts?.padding ?? 1.2;
  const lookAtY = opts?.lookAtY ?? 1.35;
  const ground = opts?.ground ?? true;

  // Compute bounds
  const box = new THREE.Box3().setFromObject(vrmScene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (size.y <= 0.0001) return;

  // Center X/Z
  vrmScene.position.x += -center.x;
  vrmScene.position.z += -center.z;

  // Put feet on ground (or center vertically)
  if (ground) {
    const box2 = new THREE.Box3().setFromObject(vrmScene);
    const minY = box2.min.y;
    vrmScene.position.y += -minY; // raise so minY becomes 0
  } else {
    vrmScene.position.y += -center.y;
  }

  // Scale to target height
  const box3 = new THREE.Box3().setFromObject(vrmScene);
  const size3 = new THREE.Vector3();
  box3.getSize(size3);

  const s = targetHeight / size3.y;
  vrmScene.scale.setScalar(s);

  // Recompute after scaling
  const box4 = new THREE.Box3().setFromObject(vrmScene);
  const finalSize = new THREE.Vector3();
  box4.getSize(finalSize);

  // Fit camera distance based on FOV + aspect
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitHeightDist = (finalSize.y * padding) / (2 * Math.tan(fov / 2));
  const fitWidthDist =
    (finalSize.x * padding) / (2 * Math.tan(fov / 2)) / camera.aspect;

  const dist = Math.max(fitHeightDist, fitWidthDist);

  camera.position.set(0, lookAtY, dist);
  camera.near = Math.max(0.01, dist / 100);
  camera.far = dist * 100;
  camera.lookAt(0, lookAtY, 0);
  camera.updateProjectionMatrix();
}
