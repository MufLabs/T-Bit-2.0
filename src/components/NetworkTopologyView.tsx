import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useTBitStore } from "../store/useTBitStore";

const statusColor = {
  ONLINE: "#a855f7",
  OFFLINE: "#4b5563",
  SYNCING: "#ffaa00",
} as const;

const pulseColor = {
  EXPORT: "#e0f2fe",
  IMPORT: "#00ffcc",
  COMPARE: "#ffaa00",
} as const;

export function NetworkTopologyView() {
  const networkNodes = useTBitStore((state) => state.networkNodes);
  const activeDataBridgeLine = useTBitStore((state) => state.activeDataBridgeLine);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.12) * 0.08;
  });

  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.26} wireframe />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.08, 0.018, 8, 72]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.3} />
      </mesh>

      {networkNodes.map((node) => (
        <group key={node.nodeId} position={node.position}>
          <mesh>
            <sphereGeometry args={[0.55, 32, 32]} />
            <meshBasicMaterial color={statusColor[node.status]} wireframe transparent opacity={0.9} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.86, 0.02, 8, 64]} />
            <meshBasicMaterial color={statusColor[node.status]} opacity={0.32} transparent />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.98, 0.012, 8, 64]} />
            <meshBasicMaterial color="#e0f2fe" opacity={0.18} transparent />
          </mesh>
        </group>
      ))}

      {activeDataBridgeLine && (
        <Line
          points={[activeDataBridgeLine.from, activeDataBridgeLine.to]}
          color={pulseColor[activeDataBridgeLine.type]}
          lineWidth={2}
          transparent
          opacity={0.9}
        />
      )}
    </group>
  );
}

export default NetworkTopologyView;
