import * as THREE from "three";

export function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj: any) => {
    if (obj.geometry) obj.geometry.dispose?.();

    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of materials) {
        // dispose textures
        for (const key of Object.keys(m)) {
          const value = (m as any)[key];
          if (value && value.isTexture) value.dispose?.();
        }
        m.dispose?.();
      }
    }
  });
}
