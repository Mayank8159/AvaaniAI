"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { loadVrm } from "@/lib/vrm/loadVrm";
import { createRenderer } from "@/lib/three/createRenderer";
import { createScene } from "@/lib/three/createScene";
import { disposeObject3D } from "@/lib/vrm/disposeThree";

import { BodyController } from "@/features/body/BodyController";
import { PhysicsController } from "@/features/physics/PhysicsController";
import { PoseController } from "@/features/body/PoseController"; // Import added
import { fitVrmToView } from "@/lib/vrm/fitVrmToView";

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

    // Floor setup for the "Stage" feel
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.set(0, 1.4, 3.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1.1, 0);

    let vrm: any = null;
    let controllers: any = { body: null, physics: null, pose: null };

    const onResize = () => {
      if (canvas.parentElement) {
        camera.aspect = canvas.parentElement.clientWidth / canvas.parentElement.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
      }
    };
    window.addEventListener("resize", onResize);

    (async () => {
      try {
        vrm = await loadVrm("/models/character.vrm");
        if (!mounted) return;

        vrm.scene.traverse((obj: any) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(vrm.scene);

        // Initialize all logic
        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);
        controllers.pose = new PoseController(vrm);
        
        // Reset physics engine to "wake up" the hair
        if (vrm.springBoneManager) vrm.springBoneManager.reset();

        controllers.body.setBodyWeight(0.2); 
        
        vrm.update(0);
        onResize();
        if (vrm.scene) fitVrmToView(vrm.scene, camera, { padding: 0.9 });
      } catch (e) { console.error(e); }
    })();

    const animate = () => {
      if (!mounted) return;
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      if (vrm) {
        // 1. Maintain the Pose and Body Weight (Hand position fix)
        controllers.pose?.update?.(dt);
        controllers.body?.update?.(dt);
        
        // 2. Apply Wind (Physics movement fix)
        controllers.physics?.applyWind?.(t);

        // 3. Final VRM solver
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
      if (vrm) disposeObject3D(vrm.scene);
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