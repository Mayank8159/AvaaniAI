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

import {
  LiveContextController,
  type AvaaniLiveContext,
} from "@/features/live/LiveContextController";

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

    // Floor
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

    // Avatar wrapper
    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    let vrm: VRM | null = null;

    const controllers: {
      body: BodyController | null;
      physics: PhysicsController | null;
      pose: PoseController | null;
      idle: IdleBodyController | null;
      live: LiveContextController | null;
    } = { body: null, physics: null, pose: null, idle: null, live: null };

    const onResize = () => {
      if (!canvas.parentElement) return;
      const w = canvas.parentElement.clientWidth;
      const h = canvas.parentElement.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    window.addEventListener("resize", onResize);

    // Face camera helper
    const faceAvatarToCamera = () => {
      if (!vrm) return;

      const humanoid: any = (vrm as any).humanoid;
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
        { yaw: 0, score: plusZ.dot(toCam) },
        { yaw: Math.PI, score: minusZ.dot(toCam) },
        { yaw: -Math.PI / 2, score: plusX.dot(toCam) },
        { yaw: Math.PI / 2, score: minusX.dot(toCam) },
      ];

      candidates.sort((a, b) => b.score - a.score);
      avatarRoot.rotation.y = candidates[0]?.yaw ?? 0;
    };

    // ---- LIVE CONTEXT CONNECTION (WS preferred, HTTP fallback) ----
    const WS_URL = process.env.NEXT_PUBLIC_AVAANI_WS_URL;
    const HTTP_URL = process.env.NEXT_PUBLIC_AVAANI_HTTP_URL;

    let ws: WebSocket | null = null;
    let pollTimer: number | null = null;

    const handleIncoming = (raw: unknown) => {
      // sometimes backend wraps: {type, payload}, sometimes sends direct JSON
      const msg = raw as any;
      const ctx: AvaaniLiveContext = msg?.payload ?? msg;

      controllers.live?.setContext(ctx);
    };

    const startWebSocket = () => {
      if (!WS_URL) return false;

      try {
        ws = new WebSocket(WS_URL);

        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            handleIncoming(data);
          } catch {
            // ignore malformed frames
          }
        };

        ws.onclose = () => {
          // Optional: attempt reconnect (simple backoff)
          if (!mounted) return;
          setTimeout(() => {
            if (mounted) startWebSocket();
          }, 1000);
        };

        return true;
      } catch {
        return false;
      }
    };

    const startPolling = () => {
      if (!HTTP_URL) return;

      const poll = async () => {
        if (!mounted) return;
        try {
          const res = await fetch(HTTP_URL, { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          handleIncoming(data);
        } catch {
          // ignore
        }
      };

      poll(); // immediate
      pollTimer = window.setInterval(poll, 200); // 5Hz is enough for smooth avatar
    };

    (async () => {
      try {
        const loaded = (await loadVrm("/models/character.vrm")) as VRM | null;
        if (!mounted || !loaded) return;
        vrm = loaded;

        // shadows
        vrm.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });

        avatarRoot.add(vrm.scene);

        // controllers
        controllers.pose = new PoseController(vrm);
        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);
        controllers.idle = new IdleBodyController(vrm, {
          intensity: 0.9,
          breathe: 1.0,
          sway: 1.0,
          head: 0.9,
          slerp: 0.22,
        });

        // ✅ Live context controller (expressions + head look)
        controllers.live = new LiveContextController(vrm);

        // Wake springs (depends on your three-vrm version)
        if ((vrm as any).springBoneManager?.reset) (vrm as any).springBoneManager.reset();

        controllers.body.setBodyWeight(0.2);

        vrm.update(0);
        onResize();

        fitVrmToView(avatarRoot, camera, { padding: 0.9 });
        faceAvatarToCamera();

        controls.target.set(0, 1.1, 0);
        controls.update();

        // start live feed AFTER VRM is ready
        const wsStarted = startWebSocket();
        if (!wsStarted) startPolling();
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
        // Your existing logic order
        controllers.pose?.update?.(dt);
        controllers.body?.update?.(dt);

        // ✅ Apply live context (expressions + head)
        controllers.live?.update(dt);

        // ✅ Drive idle intensity by live energy
        const energy = controllers.live?.getEnergy?.() ?? 0.9;
        controllers.idle?.setConfig?.({ intensity: 0.5 + energy * 0.7 });
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

      if (pollTimer) window.clearInterval(pollTimer);
      if (ws) ws.close();

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
