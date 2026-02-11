import { VRM } from "@pixiv/three-vrm";

export class AttributeController {
  constructor(private vrm: VRM) {}

  breathe(t: number) {
    const chest =
      this.vrm.humanoid?.getRawBone("chest" as any)?.node ??
      this.vrm.humanoid?.getRawBone("Chest" as any)?.node;

    if (chest) chest.position.z = Math.sin(t * 2.0) * 0.005;
  }
}
