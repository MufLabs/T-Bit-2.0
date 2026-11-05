import { Line, Text } from "@react-three/drei";
import { useMemo } from "react";
import { useTBitStore, TBitVector3 } from "../store/useTBitStore";

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function coordinatesForKey(key: string): TBitVector3 {
  const a = hashString(`${key}:x`);
  const b = hashString(`${key}:y`);
  const c = hashString(`${key}:z`);
  const radius = 7 + (a % 600) / 100;
  const theta = ((b % 6283) / 1000) % (Math.PI * 2);
  const phi = ((c % 3141) / 1000) % Math.PI;
  return [
    Number((Math.sin(phi) * Math.cos(theta) * radius).toFixed(3)),
    Number((Math.cos(phi) * radius * 0.72).toFixed(3)),
    Number((Math.sin(phi) * Math.sin(theta) * radius).toFixed(3)),
  ];
}

function getNodeVisualStyle(node: {
  key: string;
  source: string;
  tags?: string[];
  links: string[];
  backlinks: string[];
}) {
  const normalizedKey = node.key.toLowerCase();
  const tags = (node.tags ?? []).map((tag) => tag.toLowerCase());
  const isChatMemory =
    node.source === "chat-autosave" ||
    tags.includes("chat") ||
    normalizedKey.includes("::bitacora::");

  if (isChatMemory) {
    return {
      core: "#7e1bfd",
      halo: "#ffd84d",
      responseRing: "#00ff88",
      label: "#f4e8ff",
      radiusBoost: 0.06,
    };
  }

  if (normalizedKey.includes("chunk_")) {
    return {
      core: "#ffb000",
      halo: "#ff7a00",
      responseRing: undefined,
      label: "#ffe6a3",
      radiusBoost: 0.02,
    };
  }

  if (node.source === "markdown") {
    return {
      core: "#009dff",
      halo: "#00e5ff",
      responseRing: undefined,
      label: "#bdefff",
      radiusBoost: 0.08,
    };
  }

  return {
    core: "#00f5ff",
    halo: "#7e1bfd",
    responseRing: undefined,
    label: "#d9fbff",
    radiusBoost: 0,
  };
}

function getLinkVisualStyle(type: string) {
  if (type === "backlink") {
    return { color: "#d946ef", opacity: 0.42, width: 0.9 };
  }

  if (type === "chunk" || type === "manifest") {
    return { color: "#ffb000", opacity: 0.62, width: 1.15 };
  }

  return { color: "#a855f7", opacity: 0.38, width: 0.85 };
}

function isChatMemoryNode(node: { key: string; source: string; tags?: string[] }) {
  const normalizedKey = node.key.toLowerCase();
  const tags = (node.tags ?? []).map((tag) => tag.toLowerCase());
  return node.source === "chat-autosave" || tags.includes("chat") || normalizedKey.includes("::bitacora::");
}

function isMirrorableMemoryNode(node: { key: string; source: string; tags?: string[] }) {
  return !node.key.includes("::chunk_") && (node.source === "markdown" || isChatMemoryNode(node));
}

function isInternalChunkNode(node: { key: string; source: string }) {
  return node.key.includes("::chunk_") || node.source === "markdown-chunk" || node.source === "binary-chunk";
}

function mirrorPosition(position: TBitVector3): TBitVector3 {
  return [-position[0], -position[1], -position[2]];
}

export function WikiLinksMesh() {
  const memoryGraph = useTBitStore((state) => state.memoryGraph);
  const selectedMemoryNodeKey = useTBitStore((state) => state.selectedMemoryNodeKey);
  const setSelectedMemoryNodeKey = useTBitStore((state) => state.setSelectedMemoryNodeKey);
  const showMemoryLinks = useTBitStore((state) => state.showMemoryLinks);
  const showMemoryAntiVits = useTBitStore((state) => state.showMemoryAntiVits);

  const visualLinks = useMemo(() => {
    if (!memoryGraph || !showMemoryLinks) return [];
    const nodeKeys = new Set(memoryGraph.nodes.filter((node) => !isInternalChunkNode(node)).map((node) => node.key));
    return memoryGraph.links
      .filter((link) => nodeKeys.has(link.sourceKey) && nodeKeys.has(link.targetKey))
      .map((link) => ({
        ...link,
        from: coordinatesForKey(link.sourceKey),
        to: coordinatesForKey(link.targetKey),
      }));
  }, [memoryGraph, showMemoryLinks]);

  const antiFileClusters = useMemo(() => {
    if (!memoryGraph || !showMemoryAntiVits) return [];
    const nodeByKey = new Map(memoryGraph.nodes.map((node) => [node.key, node]));

    return memoryGraph.nodes.filter(isMirrorableMemoryNode).map((root) => {
      const clusterKeys = new Set<string>([root.key]);

      for (const link of memoryGraph.links) {
        if (
          clusterKeys.has(link.sourceKey) &&
          nodeByKey.has(link.targetKey) &&
          !isInternalChunkNode(nodeByKey.get(link.targetKey)!)
        ) {
          clusterKeys.add(link.targetKey);
        }
      }

      const nodes = [...clusterKeys]
        .map((key) => nodeByKey.get(key))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      const links = memoryGraph.links.filter((link) => clusterKeys.has(link.sourceKey) && clusterKeys.has(link.targetKey));

      return { root, nodes, links };
    });
  }, [memoryGraph, showMemoryAntiVits]);

  if (!showMemoryLinks || !memoryGraph || memoryGraph.nodes.length === 0) return null;

  return (
    <group>
      {visualLinks.map((link) => (
        (() => {
          const style = getLinkVisualStyle(link.type);
          return (
            <Line
              key={`${link.sourceKey}->${link.targetKey}:${link.type}`}
              points={[link.from, link.to]}
              color={style.color}
              lineWidth={style.width}
              transparent
              opacity={style.opacity}
            />
          );
        })()
      ))}
      {memoryGraph.nodes.filter((node) => !isInternalChunkNode(node)).map((node) => {
        const position = coordinatesForKey(node.key);
        const relationCount = node.links.length + node.backlinks.length;
        const style = getNodeVisualStyle(node);
        const radius = 0.22 + Math.min(relationCount, 8) * 0.035 + style.radiusBoost;
        const label = node.key.split("::").slice(-1)[0]?.slice(0, 22) ?? "Memory";
        const isSelected = selectedMemoryNodeKey === node.key;

        return (
          <group key={`memory-node-${node.key}`} position={position}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                setSelectedMemoryNodeKey(node.key);
              }}
            >
              <sphereGeometry args={[radius, 18, 18]} />
              <meshBasicMaterial color={style.core} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[radius * 1.42, 18, 18]} />
              <meshBasicMaterial color={style.halo} transparent opacity={0.14} toneMapped={false} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[radius * 1.8, 0.012, 8, 48]} />
              <meshBasicMaterial color={style.halo} transparent opacity={0.74} toneMapped={false} />
            </mesh>
            {style.responseRing && (
              <mesh rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[radius * 2.08, 0.012, 8, 48]} />
                <meshBasicMaterial color={style.responseRing} transparent opacity={0.72} toneMapped={false} />
              </mesh>
            )}
            {isSelected && (
              <>
                <mesh>
                  <sphereGeometry args={[radius * 1.72, 24, 24]} />
                  <meshBasicMaterial color="#7e1bfd" transparent opacity={0.18} toneMapped={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[radius * 2.2, 0.018, 8, 72]} />
                  <meshBasicMaterial color="#ffe66d" transparent opacity={0.9} toneMapped={false} />
                </mesh>
              </>
            )}
            <Text
              position={[0, radius + 0.28, 0]}
              fontSize={0.18}
              color={style.label}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.006}
              outlineColor="#080b14"
            >
              {label}
            </Text>
          </group>
        );
      })}
      {antiFileClusters.map((cluster) => (
        <group key={`anti-file-${cluster.root.key}`}>
          <Line
            points={[coordinatesForKey(cluster.root.key), mirrorPosition(coordinatesForKey(cluster.root.key))]}
            color="#ff0000"
            lineWidth={2.2}
            transparent
            opacity={0.82}
          />
          {cluster.links.map((link) => (
            <Line
              key={`anti-${link.sourceKey}->${link.targetKey}:${link.type}`}
              points={[mirrorPosition(coordinatesForKey(link.sourceKey)), mirrorPosition(coordinatesForKey(link.targetKey))]}
              color="#ff0000"
              lineWidth={0.9}
              transparent
              opacity={0.34}
            />
          ))}
          {cluster.nodes.map((node) => {
            const position = mirrorPosition(coordinatesForKey(node.key));
            const relationCount = node.links.length + node.backlinks.length;
            const isRoot = node.key === cluster.root.key;
            const radius = (0.22 + Math.min(relationCount, 8) * 0.035 + getNodeVisualStyle(node).radiusBoost) * (isRoot ? 0.9 : 0.74);
            const label = isRoot ? `ANTI ${node.key.split("::").slice(-1)[0]?.slice(0, 18) ?? "Archivo"}` : "";

            return (
              <group key={`anti-node-${node.key}`} position={position}>
                <mesh>
                  <sphereGeometry args={[radius, 18, 18]} />
                  <meshBasicMaterial color="#ff0000" toneMapped={false} />
                </mesh>
                <mesh>
                  <sphereGeometry args={[radius * 1.35, 18, 18]} />
                  <meshBasicMaterial color="#ff2020" transparent opacity={0.12} toneMapped={false} />
                </mesh>
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[radius * 1.7, 0.01, 8, 48]} />
                  <meshBasicMaterial color="#ff0000" transparent opacity={0.64} toneMapped={false} />
                </mesh>
                {isRoot && (
                  <Text
                    position={[0, radius + 0.26, 0]}
                    fontSize={0.16}
                    color="#ffb3b3"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.006}
                    outlineColor="#080b14"
                  >
                    {label}
                  </Text>
                )}
              </group>
            );
          })}
        </group>
      ))}
    </group>
  );
}

export default WikiLinksMesh;
