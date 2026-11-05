export type Vector3Tuple = [number, number, number];

export type FractalProjectionInput = {
  key: string;
  coordinates?: Vector3Tuple;
  antiCoordinates?: Vector3Tuple;
};

export type FractalProjectionOutput = FractalProjectionInput & {
  physicalCoordinates?: Vector3Tuple;
  physicalAntiCoordinates?: Vector3Tuple;
  visualCoordinates?: Vector3Tuple;
  visualAntiCoordinates?: Vector3Tuple;
  parentKey?: string;
  parentCoordinates?: Vector3Tuple;
  fractalDepth: number;
};

const ROOT: Vector3Tuple = [0, 0, 0];
const registry = new Map<string, FractalProjectionOutput>();

function isVector3(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

export function normalizeFractalKey(key: string): string {
  return key.normalize("NFC").trim();
}

export function getParentKey(key: string): string | undefined {
  const normalized = normalizeFractalKey(key);
  const parts = normalized.split("::").filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join("::");
}

export function getAncestorKeys(key: string): string[] {
  const parts = normalizeFractalKey(key).split("::").filter(Boolean);
  const ancestors: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    ancestors.push(parts.slice(0, i).join("::"));
  }
  return ancestors;
}

function getDepth(key: string): number {
  return Math.max(0, normalizeFractalKey(key).split("::").filter(Boolean).length - 1);
}

function add(a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function invert(v: Vector3Tuple): Vector3Tuple {
  return [-v[0], -v[1], -v[2]];
}

function scale(v: Vector3Tuple, factor: number): Vector3Tuple {
  return [v[0] * factor, v[1] * factor, v[2] * factor];
}

function localizeVector(globalVector: Vector3Tuple, depth: number): Vector3Tuple {
  const attenuation = Math.max(0.18, 1 / Math.pow(1.72, Math.max(0, depth)));
  const radialNoise: Vector3Tuple = [
    Math.sin(globalVector[0] + depth) * 0.35,
    Math.cos(globalVector[1] - depth) * 0.35,
    Math.sin(globalVector[2] * 0.5) * 0.35,
  ];
  return add(scale(globalVector, attenuation), radialNoise);
}

export function projectFractalNode(input: FractalProjectionInput): FractalProjectionOutput {
  const key = normalizeFractalKey(input.key);
  const physicalCoordinates = input.coordinates;
  const physicalAntiCoordinates = input.antiCoordinates ?? (physicalCoordinates ? invert(physicalCoordinates) : undefined);
  const parentKey = getParentKey(key);
  const depth = getDepth(key);
  const parent = parentKey ? registry.get(parentKey) : undefined;
  const parentCoordinates = parent?.visualCoordinates ?? ROOT;

  const visualCoordinates =
    physicalCoordinates && parentKey && parent
      ? add(parentCoordinates, localizeVector(physicalCoordinates, depth))
      : physicalCoordinates;

  const visualAntiCoordinates = visualCoordinates ? invert(visualCoordinates) : physicalAntiCoordinates;

  const output: FractalProjectionOutput = {
    ...input,
    key,
    coordinates: visualCoordinates ?? input.coordinates,
    antiCoordinates: visualAntiCoordinates ?? input.antiCoordinates,
    physicalCoordinates,
    physicalAntiCoordinates,
    visualCoordinates,
    visualAntiCoordinates,
    parentKey,
    parentCoordinates: parent ? parentCoordinates : undefined,
    fractalDepth: depth,
  };

  if (visualCoordinates) registry.set(key, output);
  return output;
}

export function ensureFractalAncestors(key: string): void {
  for (const ancestorKey of getAncestorKeys(key)) {
    if (!registry.has(ancestorKey)) {
      registry.set(ancestorKey, {
        key: ancestorKey,
        fractalDepth: getDepth(ancestorKey),
        parentKey: getParentKey(ancestorKey),
      });
    }
  }
}

export function registerFractalNode(input: FractalProjectionInput): FractalProjectionOutput {
  return projectFractalNode(input);
}

export function getFractalNode(key: string): FractalProjectionOutput | undefined {
  return registry.get(normalizeFractalKey(key));
}

export function clearFractalRegistry(): void {
  registry.clear();
}

export function enrichPayloadWithFractalProjection<T extends Record<string, unknown>>(payload: T): T {
  const key = payload.key ?? payload.clave ?? payload.dataKey;
  const coordinates = payload.coordinates ?? payload.coordenadas;
  const antiCoordinates = payload.antiCoordinates ?? payload.antiCoordenadas;
  if (typeof key !== "string" || !isVector3(coordinates)) return payload;
  ensureFractalAncestors(key);

  const projection = registerFractalNode({
    key,
    coordinates,
    antiCoordinates: isVector3(antiCoordinates) ? antiCoordinates : undefined,
  });

  return {
    ...payload,
    coordinates: projection.coordinates,
    coordenadas: projection.coordinates,
    antiCoordinates: projection.antiCoordinates,
    antiCoordenadas: projection.antiCoordinates,
    physicalCoordinates: projection.physicalCoordinates,
    physicalAntiCoordinates: projection.physicalAntiCoordinates,
    parentKey: projection.parentKey,
    parentCoordinates: projection.parentCoordinates,
    fractalDepth: projection.fractalDepth,
    visualProjectionMode: "FRACTAL_RELATIVE",
  };
}
