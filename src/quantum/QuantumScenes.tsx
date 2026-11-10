/**
 * QuantumScenes â€” Tanda 4 (Fase 79): correccion de la regresion del frontend.
 *
 * Escenas 3D de Quantum Engine (VoidScene y QVaultScene3D) extraidas VERBATIM
 * desde App.tsx, sin cambios de comportamiento ni de aspecto. Este modulo es
 * el unico punto de la interfaz que depende de three / @react-three/fiber /
 * @react-three/drei, y se carga EXCLUSIVAMENTE mediante importacion dinamica
 * (React.lazy en App.tsx). Asi, three-core, fiber y drei nunca aparecen en el
 * modulepreload de index.html: solo se descargan al abrir una vista 3D.
 */

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Instance, Instances, Line, OrbitControls, Sphere, Text } from "@react-three/drei";
import * as THREE from "three";
import { CognitiveQuantumRay } from "../CognitiveQuantumRay";
import { NetworkTopologyView } from "../components/NetworkTopologyView";
import { WikiLinksMesh } from "../components/WikiLinksMesh";
import {
  ANTI_COLOR,
  ANTI_HALO_COLOR,
  DATA_COLOR,
  DATA_HALO_COLOR,
  type FocusTarget,
  getParentKey,
  isChunkKey,
  isFiniteVector3,
  type QueryLine,
  type SecondBrainPreviewLink,
  type SecondBrainPreviewNode,
  type Vit,
} from "./quantumTypes";

function OriginSingularity() {
  return (
    <group position={[0, 0, 0]}>
      <pointLight color="#ffd34d" intensity={28} distance={34} decay={2} />
      <pointLight color="#00ffcc" intensity={8} distance={20} decay={2} />

      <Sphere args={[0.46, 64, 64]}>
        <meshStandardMaterial
          color="#fff3a3"
          emissive="#ffd34d"
          emissiveIntensity={3.8}
          roughness={0.12}
          metalness={0.1}
        />
      </Sphere>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.88, 0.026, 12, 96]} />
        <meshBasicMaterial color="#ffd34d" transparent opacity={0.82} />
      </mesh>

      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.16, 0.018, 12, 96]} />
        <meshBasicMaterial color="#00ffcc" transparent opacity={0.55} />
      </mesh>

      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.38, 0.014, 12, 96]} />
        <meshBasicMaterial color="#ff2d75" transparent opacity={0.32} />
      </mesh>
    </group>
  );
}

function VitPair({
  vit,
  parentVit,
  isHighlighted
}: {
  vit: Vit;
  parentVit?: Vit;
  isHighlighted: boolean;
}) {
  const origin: [number, number, number] = [0, 0, 0];
  const scale = isHighlighted ? 1.45 : 1;
  const vectorAnchor = parentVit?.position ?? origin;
  const antiVectorAnchor = parentVit?.antiPosition ?? origin;
  const edgeOpacity = parentVit ? 0.72 : isHighlighted ? 1 : 0.92;
  const antiEdgeOpacity = parentVit ? 0.7 : isHighlighted ? 1 : 0.9;

  return (
    <group>
      <Line
        points={[vectorAnchor, vit.position]}
        color={DATA_COLOR}
        lineWidth={2}
        transparent
        opacity={edgeOpacity}
      />
      <Line
        points={[antiVectorAnchor, vit.antiPosition]}
        color={ANTI_COLOR}
        lineWidth={2}
        transparent
        opacity={antiEdgeOpacity}
      />

      <pointLight position={vit.position} color={DATA_COLOR} intensity={isHighlighted ? 5 : 2.6} distance={7} />
      <pointLight position={vit.antiPosition} color={ANTI_COLOR} intensity={isHighlighted ? 4.8 : 2.4} distance={7} />

      <Sphere args={[0.28 * scale, 40, 40]} position={vit.position}>
        <meshBasicMaterial color={DATA_COLOR} toneMapped={false} />
      </Sphere>

      <Sphere args={[0.42 * scale, 32, 32]} position={vit.position}>
        <meshBasicMaterial color={DATA_HALO_COLOR} transparent opacity={0.16} toneMapped={false} />
      </Sphere>

      <mesh position={vit.position} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52 * scale, 0.018, 8, 72]} />
        <meshBasicMaterial color={DATA_HALO_COLOR} transparent opacity={0.8} toneMapped={false} />
      </mesh>

      <Sphere args={[0.28 * scale, 40, 40]} position={vit.antiPosition}>
        <meshBasicMaterial color={ANTI_COLOR} toneMapped={false} />
      </Sphere>

      <Sphere args={[0.42 * scale, 32, 32]} position={vit.antiPosition}>
        <meshBasicMaterial color={ANTI_HALO_COLOR} transparent opacity={0.14} toneMapped={false} />
      </Sphere>

      <mesh position={vit.antiPosition} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.52 * scale, 0.018, 8, 72]} />
        <meshBasicMaterial color={ANTI_COLOR} transparent opacity={0.84} toneMapped={false} />
      </mesh>
    </group>
  );
}

function QuantumRay({ queryLine }: { queryLine: QueryLine }) {
  return (
    <Line
      points={[queryLine.from, queryLine.to]}
      color="#00ffcc"
      lineWidth={2}
      transparent
      opacity={0.9}
    />
  );
}

function VitInstanceCloud({ vits }: { vits: Vit[] }) {
  const safeVits = useMemo(
    () => vits.filter((vit) => isFiniteVector3(vit.position) && isFiniteVector3(vit.antiPosition)).slice(0, 1200),
    [vits],
  );

  return (
    <group>
      <Instances limit={safeVits.length}>
        <sphereGeometry args={[0.16, 16, 16]} />
        <meshBasicMaterial color={DATA_COLOR} toneMapped={false} />
        {safeVits.map((vit) => (
          <Instance key={`data-${vit.id}`} position={vit.position} scale={isChunkKey(vit.key) ? 0.72 : 1.15} />
        ))}
      </Instances>
      <Instances limit={safeVits.length}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshBasicMaterial color={ANTI_COLOR} transparent opacity={0.78} toneMapped={false} />
        {safeVits.map((vit) => (
          <Instance key={`anti-${vit.id}`} position={vit.antiPosition} scale={isChunkKey(vit.key) ? 0.65 : 1} />
        ))}
      </Instances>
    </group>
  );
}

function CameraFocus({ focusTarget }: { focusTarget?: FocusTarget }) {
  const { camera } = useThree();
  const targetVector = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!focusTarget) {
      return;
    }

    const elapsed = performance.now() - focusTarget.startedAt;
    if (elapsed > 2200) {
      return;
    }

    const target = focusTarget.position;
    targetVector.set(target[0] * 0.72 + 2.2, target[1] * 0.72 + 2.1, target[2] * 0.72 + 4.4);
    camera.position.lerp(targetVector, 0.025);
    camera.lookAt(target[0], target[1], target[2]);
  });

  return null;
}


export function VoidScene({
  vits,
  highlightedVitId,
  focusTarget,
  activeQueryLine
}: {
  vits: Vit[];
  highlightedVitId?: string;
  focusTarget?: FocusTarget;
  activeQueryLine?: QueryLine | null;
}) {
  const useDenseInstances = vits.length > 180;
  const highlightedVit = highlightedVitId ? vits.find((vit) => vit.id === highlightedVitId) : undefined;

  return (
    <Canvas
      camera={{ position: [10, 8, 13], fov: 48, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false }}
      flat
      className="absolute inset-0"
    >
      <color attach="background" args={["#02040a"]} />
      <ambientLight intensity={0.16} />
      <OriginSingularity />

      <gridHelper
        args={[70, 70, "#ffd34d", "#6f5b1b"]}
        position={[0, -3.2, 0]}
      />

      <gridHelper
        args={[24, 24, "#00ffcc", "#174e49"]}
        position={[0, -3.18, 0]}
      />

      {useDenseInstances ? (
        <>
          <VitInstanceCloud vits={vits} />
          {highlightedVit && <VitPair vit={highlightedVit} isHighlighted />}
        </>
      ) : vits.map((vit) => {
        const parentKey = getParentKey(vit.key);
        const parentVit = parentKey ? vits.find((candidate) => candidate.key === parentKey) : undefined;

        return (
          <VitPair
            key={vit.id}
            vit={vit}
            parentVit={parentVit}
            isHighlighted={vit.id === highlightedVitId}
          />
        );
      })}

      {activeQueryLine && <QuantumRay queryLine={activeQueryLine} />}

      <CameraFocus focusTarget={focusTarget} />

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.75}
        minDistance={1.4}
        maxDistance={80}
      />
      <CognitiveQuantumRay />
      <NetworkTopologyView />
      <WikiLinksMesh />
    </Canvas>
  );
}

function QVaultNode3D({
  node,
  isActive,
  showAnti,
  showLabels,
  onSelectNode,
}: {
  node: SecondBrainPreviewNode;
  isActive: boolean;
  showAnti: boolean;
  showLabels: boolean;
  onSelectNode: (node: SecondBrainPreviewNode) => void;
}) {
  const ringRef = useRef<THREE.Mesh>(null);
  const antiRingRef = useRef<THREE.Mesh>(null);
  const isDocument = node.kind === "memory" && node.chunkCount > 0;
  const isChat = node.kind === "chat";
  const radius = isDocument ? 0.36 : isChat ? 0.32 : node.kind === "memory" ? 0.29 : 0.26;
  const coreColor = isDocument ? "#00b8ff" : isChat ? "#7e1bfd" : node.kind === "memory" ? "#7e1bfd" : DATA_COLOR;
  const label = node.label.length > 34 ? `${node.label.slice(0, 31)}...` : node.label;

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.rotation.z = elapsed * 0.32;
    }
    if (antiRingRef.current) {
      antiRingRef.current.rotation.z = -elapsed * 0.28;
    }
  });

  return (
    <group>
      {showAnti && (
        <>
          <Line
            points={[node.position, node.antiPosition]}
            color={ANTI_COLOR}
            lineWidth={isActive ? 2.6 : 1.35}
            transparent
            opacity={isActive ? 0.78 : 0.42}
          />
          <pointLight position={node.antiPosition} color={ANTI_COLOR} intensity={isActive ? 3.4 : 1.55} distance={6} />
          <Sphere args={[radius * 0.82, 32, 32]} position={node.antiPosition}>
            <meshBasicMaterial color={ANTI_COLOR} transparent opacity={0.94} toneMapped={false} />
          </Sphere>
          <Sphere args={[radius * 1.95, 24, 24]} position={node.antiPosition}>
            <meshBasicMaterial color={ANTI_HALO_COLOR} transparent opacity={isActive ? 0.18 : 0.08} toneMapped={false} />
          </Sphere>
          <mesh ref={antiRingRef} position={node.antiPosition} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius * 1.65, 0.014, 8, 72]} />
            <meshBasicMaterial color={ANTI_COLOR} transparent opacity={0.78} toneMapped={false} />
          </mesh>
        </>
      )}

      <pointLight position={node.position} color={coreColor} intensity={isActive ? 4.6 : 2.2} distance={7} />
      <group
        position={node.position}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode(node);
        }}
      >
        <Sphere args={[radius, 42, 42]}>
          <meshBasicMaterial color={coreColor} toneMapped={false} />
        </Sphere>
        <Sphere args={[radius * (isActive ? 2.28 : 1.82), 28, 28]}>
          <meshBasicMaterial color={isActive ? "#ffe66d" : coreColor} transparent opacity={isActive ? 0.2 : 0.12} toneMapped={false} />
        </Sphere>
        <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 1.55, 0.014, 8, 72]} />
          <meshBasicMaterial color={isActive ? "#ffe66d" : "#22d3ee"} transparent opacity={0.82} toneMapped={false} />
        </mesh>
        {showLabels && (
          <Text
            position={[radius + 0.22, radius + 0.22, 0]}
            fontSize={0.18}
            color="#e8fbff"
            anchorX="left"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#101741"
            maxWidth={3.4}
          >
            {label}
          </Text>
        )}
      </group>
    </group>
  );
}

export function QVaultScene3D({
  nodes,
  links,
  activeKeys,
  showAnti,
  showLabels,
  focusTarget,
  onSelectNode,
}: {
  nodes: SecondBrainPreviewNode[];
  links: SecondBrainPreviewLink[];
  activeKeys: Set<string>;
  showAnti: boolean;
  showLabels: boolean;
  focusTarget?: FocusTarget;
  onSelectNode: (node: SecondBrainPreviewNode) => void;
}) {
  const safeNodes = useMemo(
    () => nodes.filter((node) => isFiniteVector3(node.position) && isFiniteVector3(node.antiPosition)),
    [nodes],
  );
  const safeLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          isFiniteVector3(link.source.position) &&
          isFiniteVector3(link.target.position) &&
          safeNodes.some((node) => node.id === link.source.id) &&
          safeNodes.some((node) => node.id === link.target.id),
      ),
    [links, safeNodes],
  );
  const maxDistance = useMemo(
    () =>
      Math.max(
        12,
        ...safeNodes.map((node) =>
          Math.sqrt(node.position[0] ** 2 + node.position[1] ** 2 + node.position[2] ** 2),
        ),
      ),
    [safeNodes],
  );

  return (
    <Canvas
      camera={{ position: [0, 8.5, Math.min(Math.max(maxDistance * 1.15, 12), 42)], fov: 48, near: 0.1, far: 140 }}
      gl={{ antialias: true, alpha: true }}
      flat
      className="absolute inset-0"
    >
      <color attach="background" args={["#111a4b"]} />
      <ambientLight intensity={0.32} />
      <pointLight position={[0, 8, 6]} color="#a5f3fc" intensity={5.5} distance={28} />
      <pointLight position={[0, -5, -7]} color="#7e1bfd" intensity={3.2} distance={24} />
      <gridHelper args={[34, 34, "#8aa7ff", "#233071"]} position={[0, -3.4, 0]} />

      {safeLinks.map((link) => (
        <Line
          key={link.id}
          points={[link.source.position, link.target.position]}
          color={link.type === "backlink" ? "#d946ef" : "#8b5cf6"}
          lineWidth={link.type === "backlink" ? 1.7 : 1.25}
          transparent
          opacity={link.type === "backlink" ? 0.64 : 0.42}
        />
      ))}

      {safeNodes.map((node) => (
        <QVaultNode3D
          key={node.id}
          node={node}
          isActive={activeKeys.has(node.key)}
          showAnti={showAnti}
          showLabels={showLabels && safeNodes.length <= 120}
          onSelectNode={onSelectNode}
        />
      ))}

      <CameraFocus focusTarget={focusTarget} />
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.72}
        panSpeed={0.58}
        autoRotate
        autoRotateSpeed={0.18}
        minDistance={2.5}
        maxDistance={90}
      />
    </Canvas>
  );
}
