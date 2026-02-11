"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { loadVrm } from "@/lib/vrm/loadVrm";
import { createRenderer } from "@/lib/three/createRenderer";
import { createScene, createCamera } from "@/lib/three/createScene";
import { disposeObject3D } from "@/lib/vrm/disposeThree";

// --- IMPORT CONTROLLERS ---
import { RootFixer } from "@/features/body/RootFixer";
import { IdleHumanController } from "@/features/emotions/IdleHumanController";
import { SecondaryPhysicsController } from "@/features/physics/SecondaryPhysicsController";
import { DanceController } from "@/features/dances/DanceController";

export default function VrmStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Init Renderer (Singleton)
    if (rendererRef.current) return;
    const renderer = createRenderer(canvas);
    rendererRef.current = renderer;

    const scene = createScene();

    // 2. Init Camera (Positioned for full body)
    const camera = new THREE.PerspectiveCamera(30.0, window.innerWidth / window.innerHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.4, 3.5);

    // 3. Init Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.0, 0.9, 0.0); // Look at center mass
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const clock = new THREE.Clock();

    // 4. Controller Refs
    let rootFixer: RootFixer | null = null;
    let idleHuman: IdleHumanController | null = null;
    let secondaryPhysics: SecondaryPhysicsController | null = null;
    let dance: DanceController | null = null;
    let vrm: any = null;

    // 5. Resize Logic
    const onResize = () => {
      if (canvas.parentElement) {
        camera.aspect = canvas.parentElement.clientWidth / canvas.parentElement.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);
    onResize();

    // 6. Load VRM
    (async () => {
      try {
        vrm = await loadVrm("/models/character.vrm");
        if (!mounted) return;

        scene.add(vrm.scene);

        // --- INSTANTIATE CONTROLLERS ---
        rootFixer = new RootFixer(vrm);
        idleHuman = new IdleHumanController(vrm);
        secondaryPhysics = new SecondaryPhysicsController(vrm);
        dance = new DanceController(vrm);

        console.log("VRM Loaded & Physics Systems Active");
      } catch (e) {
        console.error("Failed to load VRM:", e);
      }
    })();

    // 7. Render Loop
    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();

      controls.update();

      if (vrm) {
        // A. RESET
        rootFixer?.update(); // Lock root to floor

        // B. LOGIC
        const isDancing = dance?.isPlaying ?? false;

        // Human Idle (Sway/Blink/Look)
        if (idleHuman) {
            idleHuman.setEnabled(!isDancing);
            idleHuman.update(dt);
        }

        // Secondary Physics (Wind/Fingers)
        // We run this every frame to inject Wind Gravity
        if (secondaryPhysics) {
            secondaryPhysics.setEnabled(!isDancing);
            secondaryPhysics.update(dt);
        }

        // Dance
        dance?.update(dt);

        // C. PHYSICS ENGINE (Must be LAST)
        // The VRM engine now sees the modified Gravity from SecondaryPhysics
        // and simulates the skirt/hair swinging to the side.
        vrm.update(dt);
      }

      renderer.render(scene, camera);
    };

    animate();

    // 8. Cleanup
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      if (vrm) {
        scene.remove(vrm.scene);
        disposeObject3D(vrm.scene);
      }
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#121212" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
}