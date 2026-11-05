import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useTBitStore } from "../store/useTBitStore";

export function QuantumTelemetryRay() {
  const quantumPulseLine = useTBitStore((state) => state.quantumPulseLine);
  const isGravityCompressing = useTBitStore((state) => state.isGravityCompressing);
  const lineRef = useRef<THREE.Line | null>(null);

  const dashedLine = useMemo(() => {
    if (!quantumPulseLine) return null;
    const points = [
      new THREE.Vector3(...quantumPulseLine.from),
      new THREE.Vector3(...quantumPulseLine.to),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: quantumPulseLine.color,
      dashSize: 0.4,
      gapSize: 0.15,
      linewidth: 4,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geometry, material);
    // LineDashedMaterial requiere lineDistances para renderizar guiones.
    line.computeLineDistances();
    lineRef.current = line;
    return line;
  }, [quantumPulseLine]);

  const antiDashedLine = useMemo(() => {
    if (!quantumPulseLine) return null;
    const antiTo: [number, number, number] = [
      -quantumPulseLine.to[0],
      -quantumPulseLine.to[1],
      -quantumPulseLine.to[2],
    ];
    const points = [new THREE.Vector3(...quantumPulseLine.from), new THREE.Vector3(...antiTo)];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: "#ff3366",
      dashSize: 0.4,
      gapSize: 0.15,
      linewidth: 2,
      transparent: true,
      opacity: 0.5,
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
  }, [quantumPulseLine]);

  useFrame(({ clock }) => {
    const material = lineRef.current?.material;
    if (material instanceof THREE.LineDashedMaterial) {
      // dashOffset existe en runtime (uniform del shader de LineDashedMaterial)
      // pero no esta declarado en los typings de three 0.171.
      (material as THREE.LineDashedMaterial & { dashOffset: number }).dashOffset =
        -clock.getElapsedTime() * 3;
    }
  });

  if (isGravityCompressing) {
    return (
      <group>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.82, 32, 32]} />
          <meshBasicMaterial color="#7c3aed" transparent opacity={0.32} wireframe />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.38, 32, 32]} />
          <meshBasicMaterial color="#111827" transparent opacity={0.85} />
        </mesh>
      </group>
    );
  }

  if (!quantumPulseLine || !dashedLine || !antiDashedLine) return null;

  return (
    <group>
      <primitive object={dashedLine} />
      <primitive object={antiDashedLine} />

      <mesh position={quantumPulseLine.to}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color={quantumPulseLine.color} transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  );
}

export default QuantumTelemetryRay;
