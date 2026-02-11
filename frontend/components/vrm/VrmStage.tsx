"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

import { loadVrm } from "@/lib/vrm/loadVrm";
import { createRenderer } from "@/lib/three/createRenderer";
import { createScene } from "@/lib/three/createScene";
import { disposeObject3D } from "@/lib/vrm/disposeThree";

import { BodyController } from "@/features/body/BodyController";
import { PhysicsController } from "@/features/physics/PhysicsController";
import { PoseController } from "@/features/body/PoseController";
import { IdleBodyController } from "@/features/body/IdleBodyController";

export default function VrmStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    const renderer = createRenderer(canvas);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current = renderer;

    const scene = createScene();
    const clock = new THREE.Clock();

    // --- UPDATED VIDEO CALL CAMERA ---
    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 20);
    
    // Position: Kept at 2.1 distance for stability
    camera.position.set(0, 1.4, 2.1); 
    
    // --- THE FIX TO BRING HER UP ---
    // Lowered target from 1.25 to 1.15. 
    // This looks at her waist, which pushes her head/upper chest higher in the frame.
    camera.lookAt(new THREE.Vector3(0, 1.15, 0));

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    let vrm: VRM | null = null;
    const controllers: {
      body: BodyController | null;
      physics: PhysicsController | null;
      pose: PoseController | null;
      idle: IdleBodyController | null;
    } = { body: null, physics: null, pose: null, idle: null };

    const onResize = () => {
      if (!canvas.parentElement) return;
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    const faceAvatarToCamera = () => {
      if (!vrm) return;
      const humanoid = vrm.humanoid;
      const hips = humanoid?.getNormalizedBoneNode?.("hips") ?? humanoid?.getRawBoneNode?.("hips");
      const basisObj: THREE.Object3D = hips || vrm.scene;
      const avatarPos = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      basisObj.getWorldPosition(avatarPos);
      camera.getWorldPosition(camPos);
      const toCam = camPos.sub(avatarPos).normalize();
      const q = new THREE.Quaternion();
      basisObj.getWorldQuaternion(q);
      const plusZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
      const minusZ = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
      const plusX = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
      const minusX = new THREE.Vector3(-1, 0, 0).applyQuaternion(q).normalize();
      const candidates = [
        { yaw: 0, score: plusZ.dot(toCam) },
        { yaw: Math.PI, score: minusZ.dot(toCam) },
        { yaw: -Math.PI / 2, score: plusX.dot(toCam) },
        { yaw: Math.PI / 2, score: minusX.dot(toCam) },
      ];
      candidates.sort((a, b) => b.score - a.score);
      avatarRoot.rotation.y = candidates[0]?.yaw ?? 0;
    };

    (async () => {
      try {
        const loaded = (await loadVrm("/models/character.vrm")) as VRM | null;
        if (!mounted || !loaded) return;
        vrm = loaded;

        vrm.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        avatarRoot.add(vrm.scene);

        controllers.pose = new PoseController(vrm);
        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);
        controllers.idle = new IdleBodyController(vrm, {
          intensity: 0.9, breathe: 1.0, sway: 1.0, head: 0.9, slerp: 0.22,
        });

        if (vrm.springBoneManager?.reset) vrm.springBoneManager.reset();
        controllers.body.setBodyWeight(0.2);
        vrm.update(0);
        onResize();
        faceAvatarToCamera();
      } catch (e) {
        console.error(e);
      }
    })();

    const animate = () => {
      if (!mounted) return;
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (vrm) {
        controllers.pose?.update?.(dt);
        controllers.body?.update?.(dt);
        controllers.idle?.update?.(dt);
        controllers.physics?.applyWind?.(t);
        vrm.update(dt);
      }
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      if (vrm?.scene) {
        avatarRoot.remove(vrm.scene);
        disposeObject3D(vrm.scene);
      }
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}