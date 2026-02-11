import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";
import { VRMLoaderPlugin, VRM, VRMUtils } from "@pixiv/three-vrm";

export async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));

  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  const vrm: VRM = gltf.userData.vrm;
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
