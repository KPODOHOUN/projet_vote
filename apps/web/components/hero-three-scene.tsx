"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

function ParticleSphere() {
  const pointsRef = useRef<THREE.Points>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      mouse.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const [positions, colors] = useMemo(() => {
    const count = 2400;
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const color1 = new THREE.Color("#6366F1");
    const color2 = new THREE.Color("#8B5CF6");
    const accent = new THREE.Color("#F59E0B");

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * Math.random() - 1.0);
      const r = 1.6 + Math.random() * 0.4;

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      const t = Math.random();
      const mixedColor = t < 0.7
        ? color1.clone().lerp(color2, Math.random())
        : color1.clone().lerp(accent, Math.random() * 0.5);
      cols[i * 3] = mixedColor.r;
      cols[i * 3 + 1] = mixedColor.g;
      cols[i * 3 + 2] = mixedColor.b;
    }
    return [pos, cols];
  }, []);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    pointsRef.current.rotation.y += delta * 0.06;
    pointsRef.current.rotation.x += delta * 0.03;
    const targetX = mouse.current.x * 0.3;
    const targetY = mouse.current.y * 0.3;
    pointsRef.current.rotation.y += (targetX - pointsRef.current.rotation.y) * 0.03;
    pointsRef.current.rotation.x += (targetY - pointsRef.current.rotation.x) * 0.03;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.04}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function FloatingRings() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.04;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.1;
    }
  });

  const ring = useMemo(() => {
    const geometry = new THREE.TorusGeometry(2.8, 0.02, 16, 100);
    const material = new THREE.MeshBasicMaterial({
      color: "#6366F1",
      transparent: true,
      opacity: 0.12,
    });
    return new THREE.Mesh(geometry, material);
  }, []);

  const ring2 = useMemo(() => {
    const geometry = new THREE.TorusGeometry(3.4, 0.015, 16, 100);
    const material = new THREE.MeshBasicMaterial({
      color: "#8B5CF6",
      transparent: true,
      opacity: 0.08,
    });
    return new THREE.Mesh(geometry, material);
  }, []);

  return (
    <group ref={groupRef}>
      <primitive object={ring} />
      <primitive object={ring2} rotation={[Math.PI / 3, 0, 0]} />
    </group>
  );
}

export function HeroThreeScene() {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const hasWebGL = !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
      setSupported(hasWebGL);
    } catch {
      setSupported(false);
    }
  }, []);

  if (!supported) return null;

  return (
    <div className="absolute inset-0 z-0 opacity-60" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 5.5], fov: 40 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.5} color="#6366F1" />
        <pointLight position={[-5, -5, -5]} intensity={1.0} color="#8B5CF6" />
        <FloatingRings />
        <ParticleSphere />
      </Canvas>
    </div>
  );
}
