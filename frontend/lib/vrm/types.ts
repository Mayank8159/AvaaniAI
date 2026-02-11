import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";

export type VrmContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  vrm: VRM;
};
