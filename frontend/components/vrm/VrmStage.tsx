"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
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
import { IdleFaceController } from "@/features/body/FaceController";
import { IdleHandController } from "@/features/body/IdleHandController";
import {
  LiveContextController,
  type AvaaniLiveContext,
} from "@/features/live/LiveContextController";

const VrmStage = forwardRef((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const mouthOpenTarget = useRef(0);

  useImperativeHandle(ref, () => ({
    triggerMouthPop: () => {
      mouthOpenTarget.current = 0.85; // Slightly wider for better visibility
      setTimeout(() => {
        if (mouthOpenTarget.current > 0) mouthOpenTarget.current = 0.25; 
      }, 70);
    },
    stopMouth: () => {
      mouthOpenTarget.current = 0;
    }
  }));

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;
    const scene = createScene();
    const clock = new THREE.Clock();

    const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 20);
    camera.position.set(0, 1.4, 2.1); 
    camera.lookAt(new THREE.Vector3(0, 1.15, 0));

    const avatarRoot = new THREE.Group();
    scene.add(avatarRoot);

    let vrm: VRM | null = null;
    const controllers: any = { 
      body: null, physics: null, pose: null, idle: null, face: null, hand: null, live: null 
    };

    // ... (onResize, faceAvatarToCamera, WebSocket/Polling logic stays the same)
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
      const humanoid: any = vrm.humanoid;
      const hips = humanoid?.getNormalizedBoneNode?.("hips") ?? humanoid?.getRawBoneNode?.("hips");
      const basisObj: THREE.Object3D = hips || vrm.scene;
      const avatarPos = new THREE.Vector3();
      const camPos = new THREE.Vector3();
      basisObj.getWorldPosition(avatarPos);
      camera.getWorldPosition(camPos);
      const toCam = camPos.sub(avatarPos).normalize();
      const q = new THREE.Quaternion();
      basisObj.getWorldQuaternion(q);
      const axes = [
        { yaw: 0, vec: new THREE.Vector3(0, 0, 1) },
        { yaw: Math.PI, vec: new THREE.Vector3(0, 0, -1) },
        { yaw: -Math.PI / 2, vec: new THREE.Vector3(1, 0, 0) },
        { yaw: Math.PI / 2, vec: new THREE.Vector3(-1, 0, 0) },
      ];
      const candidates = axes.map(a => ({
        yaw: a.yaw,
        score: a.vec.applyQuaternion(q).normalize().dot(toCam)
      })).sort((a, b) => b.score - a.score);
      avatarRoot.rotation.y = candidates[0]?.yaw ?? 0;
    };

    (async () => {
      try {
        const loaded = (await loadVrm("/models/character.vrm")) as VRM | null;
        if (!mounted || !loaded) return;
        vrm = loaded;
        avatarRoot.add(vrm.scene);

        controllers.pose = new PoseController(vrm);
        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);
        controllers.live = new LiveContextController(vrm);
        controllers.face = new IdleFaceController(vrm);
        controllers.hand = new IdleHandController(vrm);
        controllers.idle = new IdleBodyController(vrm, {
          intensity: 0.9, breathe: 1.0, sway: 1.0, head: 0.9, slerp: 0.22,
        });

        vrm.update(0);
        onResize();
        faceAvatarToCamera();
      } catch (e) { console.error("VRM Load Error:", e); }
    })();

    const animate = () => {
      if (!mounted) return;
      rafRef.current = requestAnimationFrame(animate);
      
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (vrm) {
        // 1. Run standard controllers
        controllers.pose?.update?.(dt);
        controllers.body?.update?.(dt);
        controllers.live?.update(dt);

        const gazeScore = controllers.live?.getGazeScore?.() ?? 0;
        const visible = controllers.live?.getTrackingVisible?.() ?? false;
        controllers.face?.setLiveGaze({ strength: gazeScore, visible });
        controllers.face?.update(dt); // <--- This might be clearing mouth values

        const energy = controllers.live?.getEnergy?.() ?? 0.9;
        controllers.idle?.setConfig?.({ intensity: 0.5 + energy * 0.7 });
        controllers.idle?.update?.(dt);
        controllers.hand?.update(dt);
        controllers.physics?.applyWind?.(t);

        // 2. OVERRIDE LIP SYNC (Must be done AFTER controllers.face.update)
        if (vrm.expressionManager) {
            // Get current value (aa or A depending on VRM version)
            const currentA = vrm.expressionManager.getValue("aa") ?? vrm.expressionManager.getValue("ih") ?? 0;
            
            // Smooth lerp for natural movement
            const nextValue = THREE.MathUtils.lerp(currentA, mouthOpenTarget.current, 0.3);
            
            // Apply to multiple shapes to ensure it works on all models
            vrm.expressionManager.setValue("aa", nextValue); // VRM 1.0
            vrm.expressionManager.setValue("A", nextValue);  // VRM 0.x
            vrm.expressionManager.setValue("oh", nextValue * 0.2); // Add some roundness
            
            // 3. CRITICAL: Force the update right now so it registers
            vrm.expressionManager.update();
        }

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
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#1a1a1a" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
});

VrmStage.displayName = "VrmStage";
export default VrmStage;