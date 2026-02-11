import { GLTFLoader } from "three-stdlib";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";

export async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();

  // ✅ Fix 1: type mismatch for parser / plugin
  loader.register((parser: any) => new VRMLoaderPlugin(parser) as any);

  // ✅ Type the GLTF enough to access userData safely
  const gltf = await new Promise<{ userData: { vrm?: VRM } }>((resolve, reject) => {
    loader.load(
      url,
      (g) => resolve(g as any),
      undefined,
      (e) => reject(e)
    );
  });

  // ✅ Fix 2: userData typing for vrm
  const vrm = gltf.userData.vrm;
  if (!vrm) throw new Error("VRM not found in gltf.userData.vrm");

  // Optional cleanup (performance)
  VRMUtils.removeUnnecessaryVertices(vrm.scene);
  VRMUtils.removeUnnecessaryJoints(vrm.scene);

  // Avoid culling issues on some rigs
  vrm.scene.traverse((o: any) => {
    if (o.isMesh) o.frustumCulled = false;
  });

  // VRM faces -Z forward; rotate to face camera
  vrm.scene.rotation.y = Math.PI;
  vrm.scene.position.set(0, 0, 0);

  return vrm;
}
