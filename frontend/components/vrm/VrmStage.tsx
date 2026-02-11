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

    let emotion: EmotionController | null = null;
    let attrs: AttributeController | null = null;
    let dance: DanceController | null = null;
    let body: BodyController | null = null;

    let vrm: any = null;

    const clock = new THREE.Clock();

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

    onResize();
    window.addEventListener("resize", onResize);

    (async () => {
      try {
        vrm = await loadVrm("/models/character.vrm");
        if (!mounted) return;

        scene.add(vrm.scene);

        // ✅ Fit model + camera for current screen size
        fitVrmToView(vrm.scene, camera, {
          targetHeight: 1.6,
          padding: 1.2,
          lookAtY: 1.35,
          ground: true,
        });

        emotion = new EmotionController(vrm);
        attrs = new AttributeController(vrm);
        dance = new DanceController(vrm);
        body = new BodyController(vrm);

        emotion.setEmotion("neutral");
        body.setBodyWeight(0.3);

        // Re-run resize once VRM is ready (for correct aspect/camera)
        onResize();

        console.log("VRM ready ✅");
      } catch (e) {
        console.error("Failed to load VRM:", e);
      }
    })();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);

      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (vrm) {
        vrm.update(dt);

        // blink
        const blink = Math.sin(t * 0.5) > 0.98 ? 1 : 0;
        emotion?.blink(blink);

        // emotion blending
        emotion?.update(dt);

        // breathing/attributes
        attrs?.breathe(t);

        // animations
        dance?.update(dt);

        // body weight blend
        body?.update(dt);
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
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
