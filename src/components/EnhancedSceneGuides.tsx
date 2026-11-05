import { Grid, Ring } from "@react-three/drei";

export function EnhancedSceneGuides() {
  return (
    <group>
      <Grid
        position={[0, -0.02, 0]}
        args={[80, 80]}
        cellSize={1}
        cellThickness={0.45}
        cellColor="#d6b13d"
        sectionSize={5}
        sectionThickness={1.15}
        sectionColor="#ffd84d"
        fadeDistance={52}
        fadeStrength={0.7}
        infiniteGrid
      />

      <pointLight position={[0, 0, 0]} intensity={3.2} distance={18} color="#ffd84d" />

      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshBasicMaterial color="#fff2a8" transparent opacity={0.96} toneMapped={false} />
      </mesh>

      <Ring args={[0.72, 0.77, 96]} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color="#ffd84d" transparent opacity={0.78} toneMapped={false} />
      </Ring>

      <Ring args={[1.08, 1.12, 96]} position={[0, 0.02, 0]} rotation={[0, Math.PI / 2, 0]}>
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.42} toneMapped={false} />
      </Ring>
    </group>
  );
}

export default EnhancedSceneGuides;
