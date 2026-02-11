import * as THREE from "three";

export function fixEyeMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh || !mesh.isMesh) return;

    const name = (mesh.name ?? "").toLowerCase();

    const isEyeLike =
      name.includes("eye") ||
      name.includes("iris") ||
      name.includes("pupil") ||
      name.includes("cornea") ||
      name.includes("eyeball");

    if (!isEyeLike) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const m of materials) {
      if (!m) continue;

      // Key fixes:
      // - DoubleSide prevents backface culling hiding iris/pupil surfaces
      // - alphaTest helps with cutout textures (lashes/iris masks)
      // - depthWrite/depthTest avoids weird "pupil behind eyeball" issues
      m.side = THREE.DoubleSide;

      m.alphaTest = Math.max((m as any).alphaTest ?? 0, 0.25);

      // Some VRM eye layers use transparency that breaks sorting
      // Force opaque-ish behavior for the iris/pupil layer
      (m as any).transparent = false;
      (m as any).depthWrite = true;
      (m as any).depthTest = true;

      // If you use MeshStandard/Phong etc, keep color in SRGB-ish pipeline
      // (no harm if not supported)
      (m as any).needsUpdate = true;
    }

    // Render eyes later than face to avoid being buried
    mesh.renderOrder = 10;
  });
}
