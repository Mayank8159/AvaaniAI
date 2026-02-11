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
import { PoseController } from "@/features/body/PoseController"; 
import { fitVrmToView } from "@/lib/vrm/fitVrmToView";

export default function VrmStage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    let mounted = true;
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    // 1. Setup Core
    const renderer = createRenderer(canvas);
    renderer.shadowMap.enabled = true; // Enable shadows in renderer
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    const scene = createScene();
    const clock = new THREE.Clock();

    // 2. Add Floor Shadow Plane
    const floorGeometry = new THREE.PlaneGeometry(10, 10);
    const floorMaterial = new THREE.ShadowMaterial({ opacity: 0.2 }); // Only shows shadows
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const camera = new THREE.PerspectiveCamera(30.0, window.innerWidth / window.innerHeight, 0.1, 20.0);
    camera.position.set(0.0, 1.4, 3.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.0, 1.1, 0.0);
    controls.enableDamping = true;

    let vrm: any = null;
    const controllers: any = { body: null, physics: null, pose: null };

    const onResize = () => {
      if (canvas.parentElement) {
        camera.aspect = canvas.parentElement.clientWidth / canvas.parentElement.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight);
        if (vrm?.scene) fitVrmToView(vrm.scene, camera, { targetHeight: 1.7, padding: 0.8 });
      }
    };

    window.addEventListener("resize", onResize);

    (async () => {
      try {
        vrm = await loadVrm("/models/character.vrm");
        if (!mounted) return;

        // Enable shadows for the character
        vrm.scene.traverse((obj: any) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
        });

        scene.add(vrm.scene);

        controllers.body = new BodyController(vrm);
        controllers.physics = new PhysicsController(vrm);
        controllers.pose = new PoseController(vrm); 
        
        controllers.body.setBodyWeight(0.2); 
        vrm.update(0); 
        onResize();
      } catch (e) {
        console.error("VRM Stage Error:", e);
      }
    })();

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      controls.update();

      if (vrm) {
        controllers.body?.update?.(dt);
        controllers.pose?.update?.(dt);
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
    <div style={{ width: "100vw", height: "100vh", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />
    </div>
  );
}