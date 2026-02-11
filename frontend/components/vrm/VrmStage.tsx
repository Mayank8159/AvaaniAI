"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { VRM } from "@pixiv/three-vrm";

import { loadVrm } from "@/lib/vrm/loadVrm";
import { createRenderer } from "@/lib/three/createRenderer";
import { createScene } from "@/lib/three/createScene";
import { disposeObject3D } from "@/lib/vrm/disposeThree";

import { BodyController } from "@/features/body/BodyController";
import { PhysicsController } from "@/features/physics/PhysicsController";
import { PoseController } from "@/features/body/PoseController";
import { IdleBodyController } from "@/features/body/IdleBodyController";
import { fitVrmToView } from "@/lib/vrm/fitVrmToView";

export default function VrmStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    // Renderer
    const renderer = createRenderer(canvas);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current = renderer;

    // Scene + clock
    const scene = createScene();
    const clock = new THREE.Clock();

    // Stage floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Camera
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
    camera.position.set(0, 1.4, 3.5);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.1, 0);

    // Wrapper for the avatar (rotate this, not vrm.scene)
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

    // Robust facing fix: try ±Z then ±X and pick best
    const faceAvatarToCamera = () => {
      if (!vrm) return;

      const humanoid = vrm.humanoid;
      const hips =
        humanoid?.getNormalizedBoneNode?.("hips") ??
        humanoid?.getRawBoneNode?.("hips");

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

      const candidates: Array<{ yaw: number; score: number }> = [
        { yaw: 0, score: plusZ.dot(toCam) }, // front is +Z
        { yaw: Math.PI, score: minusZ.dot(toCam) }, // front is -Z
        { yaw: -Math.PI / 2, score: plusX.dot(toCam) }, // front is +X
        { yaw: Math.PI / 2, score: minusX.dot(toCam) }, // front is -X
      ];

      candidates.sort((a, b) => b.score - a.score);
      avatarRoot.rotation.y = candidates[0]?.yaw ?? 0;
    };

    (async () => {
      try {
        const loaded = (await loadVrm("/models/character.vrm")) as VRM | null;
        if (!mounted || !loaded) return;

        vrm = loaded;

        // Shadows for meshes
        vrm.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        // Add VRM under wrapper
        avatarRoot.add(vrm.scene);

        // Controllers
        controllers.pose = new PoseController(vrm);
        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);

        // Subtle "alive" motion layer
        controllers.idle = new IdleBodyController(vrm, {
          intensity: 0.9,
          breathe: 1.0,
          sway: 1.0,
          head: 0.9,
          slerp: 0.22,
        });

        // Wake springs (depends on VRM version; keep optional)
        if (vrm.springBoneManager?.reset) vrm.springBoneManager.reset();

        controllers.body.setBodyWeight(0.2);

        // Settle once
        vrm.update(0);

        onResize();

        // Fit camera to the wrapper
        fitVrmToView(avatarRoot, camera, { padding: 0.9 });

        // Face camera AFTER fitting
        faceAvatarToCamera();

        // Keep orbit stable
        controls.target.set(0, 1.1, 0);
        controls.update();
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

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mounted = false;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);

      // Remove & dispose avatar
      if (vrm?.scene) {
        avatarRoot.remove(vrm.scene);
        disposeObject3D(vrm.scene);
      }

      controls.dispose();
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
