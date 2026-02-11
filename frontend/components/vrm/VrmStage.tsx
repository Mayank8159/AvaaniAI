"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { loadVrm } from "@/lib/vrm/loadVrm";
import { createRenderer } from "@/lib/three/createRenderer";
import { createScene, createCamera } from "@/lib/three/createScene";
import { resizeToParent } from "@/lib/three/resize";
import { disposeObject3D } from "@/lib/vrm/disposeThree";

import { EmotionController } from "@/features/emotions/EmotionController";
import { AttributeController } from "@/features/attributes/AttributeController";
import { DanceController } from "@/features/dances/DanceController";
import { BodyController } from "@/features/body/BodyController";
import { PhysicsController } from "@/features/physics/PhysicsController";
import { PoseController } from "@/features/body/PoseController"; // New
import { fitVrmToView } from "@/lib/vrm/fitVrmToView";

export default function VrmStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer(canvas);
    const scene = createScene();
    const camera = createCamera();
    const clock = new THREE.Clock();

    let vrm: any = null;
    let controllers: any = {};

    const onResize = () => {
      resizeToParent(renderer, camera, canvas);
      if (vrm?.scene) {
        fitVrmToView(vrm.scene, camera, {
          targetHeight: 1.6,
          padding: 1.2,
          lookAtY: 1.35,
          ground: true,
        });
      }
    };

    window.addEventListener("resize", onResize);

    (async () => {
      try {
        vrm = await loadVrm("/models/character.vrm");
        if (!mounted) return;

        scene.add(vrm.scene);

        // ✅ CRITICAL: Force an initial update to fix "squeezed" mesh
        vrm.update(0);

        // Initialize Controllers
        controllers.emotion = new EmotionController(vrm);
        controllers.attrs = new AttributeController(vrm);
        controllers.dance = new DanceController(vrm);
        controllers.body = new BodyController(vrm);
        
        // This now has the safety check fix
        controllers.physics = new PhysicsController(vrm); 
        
        // This rotates the arms down from the T-pose
        controllers.pose = new PoseController(vrm);

        controllers.emotion.setEmotion("neutral");
        
        onResize();
      } catch (e) {
        console.error("Failed to load VRM:", e);
      }
    })();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (vrm) {
        // Essential: Standard VRM physics and bone update
        vrm.update(dt);

        const blink = Math.sin(t * 0.5) > 0.98 ? 1 : 0;
        controllers.emotion?.blink(blink);
        controllers.emotion?.update(dt);
        controllers.attrs?.breathe(t);
        controllers.dance?.update(dt);
        controllers.body?.update(dt);
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      if (vrm?.scene) {
        vrm.scene.removeFromParent();
        disposeObject3D(vrm.scene);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#121212" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}