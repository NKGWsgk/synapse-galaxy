import * as d3 from "d3-force";
import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointWorkKey, endpointDisplayUrl, type WorkEndpointMap } from "@/lib/workEndpoint";

// Mirror the constants from GraphView.tsx so server and client agree on geometry.
const NODE_RADIUS = 92;
const LINK_DISTANCE = 323;
const RING_SLOT_PRESETS = [3, 6, 9, 12, 18, 24, 36];
const ISLAND_ANCHOR_RADIUS = LINK_DISTANCE * 1.75;
const ISLAND_SECTOR_COUNT = 24;

type LNode = {
  norm: string;
  dimAnchorX: number;
  dimAnchorY: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type LLink = {
  source: string | LNode;
  target: string | LNode;
};

type NeighborMap = Map<string, Set<string>>;

function buildNeighborMap(
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): { neighbors: NeighborMap; urlForKey: Map<string, string> } {
  const neighbors: NeighborMap = new Map();
  const urlForKey = new Map<string, string>();
  for (const s of synapses) {
    const sK = endpointWorkKey(s.source_url, workMap);
    const tK = endpointWorkKey(s.target_url, workMap);
    if (!urlForKey.has(sK)) urlForKey.set(sK, endpointDisplayUrl(s.source_url, workMap));
    if (!urlForKey.has(tK)) urlForKey.set(tK, endpointDisplayUrl(s.target_url, workMap));
    if (!neighbors.has(sK)) neighbors.set(sK, new Set());
    if (!neighbors.has(tK)) neighbors.set(tK, new Set());
    neighbors.get(sK)!.add(tK);
    neighbors.get(tK)!.add(sK);
  }
  return { neighbors, urlForKey };
}

function hashLayoutOffset(s: string): { ox: number; oy: number } {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xdeadbeef >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  const ox = (((h1 & 0xffff) / 0xffff) - 0.5) * 100;
  const oy = (((h2 & 0xffff) / 0xffff) - 0.5) * 100;
  return { ox, oy };
}

function findConnectedComponents(allNorms: string[], neighbors: NeighborMap): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const start of [...allNorms].sort()) {
    if (visited.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of [...(neighbors.get(cur) ?? [])].sort()) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    comp.sort();
    components.push(comp);
  }
  return components;
}

function pickComponentAnchor(
  componentNorms: string[],
  neighbors: NeighborMap,
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): string {
  const compSet = new Set(componentNorms);
  const likesByNorm = new Map<string, number>();
  for (const s of synapses) {
    const sK = endpointWorkKey(s.source_url, workMap);
    const tK = endpointWorkKey(s.target_url, workMap);
    if (!compSet.has(sK) && !compSet.has(tK)) continue;
    const l = s.likes_count ?? 0;
    if (compSet.has(sK)) likesByNorm.set(sK, (likesByNorm.get(sK) ?? 0) + l);
    if (compSet.has(tK)) likesByNorm.set(tK, (likesByNorm.get(tK) ?? 0) + l);
  }
  let bestNorm = componentNorms[0];
  let bestDeg = -1;
  let bestLikes = -1;
  for (const norm of componentNorms) {
    const deg = [...(neighbors.get(norm) ?? [])].filter((nb) => compSet.has(nb)).length;
    const likes = likesByNorm.get(norm) ?? 0;
    if (
      deg > bestDeg ||
      (deg === bestDeg && likes > bestLikes) ||
      (deg === bestDeg && likes === bestLikes && norm < bestNorm)
    ) {
      bestNorm = norm;
      bestDeg = deg;
      bestLikes = likes;
    }
  }
  return bestNorm;
}

function angleToSectorIndex(angle: number, sectorCount: number): number {
  const normalized = (angle + Math.PI) / (2 * Math.PI);
  return Math.min(sectorCount - 1, Math.max(0, Math.floor(normalized * sectorCount)));
}

function computeAngularOccupancy(
  positions: Iterable<{ x: number; y: number }>,
  sectorCount: number,
): number[] {
  const occ = new Array<number>(sectorCount).fill(0);
  for (const p of positions) {
    const r = Math.hypot(p.x, p.y);
    if (r < 1) continue;
    const sector = angleToSectorIndex(Math.atan2(p.y, p.x), sectorCount);
    const w = 1 + 2 / (1 + r / LINK_DISTANCE);
    occ[sector] += w;
    occ[(sector + 1) % sectorCount] += w * 0.3;
    occ[(sector - 1 + sectorCount) % sectorCount] += w * 0.3;
  }
  return occ;
}

function rankIslandSectorCandidates(occupancy: number[], preferredAngle: number): number[] {
  const sectorCount = occupancy.length;
  const preferredSector = angleToSectorIndex(preferredAngle, sectorCount);
  return Array.from({ length: sectorCount }, (_, i) => {
    const circDiff = Math.min(
      Math.abs(i - preferredSector),
      sectorCount - Math.abs(i - preferredSector),
    );
    return { i, score: occupancy[i] * 10 + circDiff };
  })
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map((entry) => entry.i);
}

function sectorIndexToAngle(sector: number, sectorCount: number): number {
  return (sector / sectorCount) * 2 * Math.PI - Math.PI + Math.PI / sectorCount;
}

function islandPlacementCollides(
  localPositions: Map<string, { x: number; y: number }>,
  offset: { x: number; y: number },
  existingPositions: Iterable<{ x: number; y: number }>,
): boolean {
  const minDist = 2 * NODE_RADIUS;
  for (const local of localPositions.values()) {
    const wx = offset.x + local.x;
    const wy = offset.y + local.y;
    for (const existing of existingPositions) {
      if (Math.hypot(wx - existing.x, wy - existing.y) < minDist) return true;
    }
  }
  return false;
}

function pickIslandPlacementOffset(
  localPositions: Map<string, { x: number; y: number }>,
  occupancy: number[],
  preferredAngle: number,
  baseAnchorRadius: number,
  existingPositions: Iterable<{ x: number; y: number }>,
): { x: number; y: number } {
  const sectorCandidates = rankIslandSectorCandidates(occupancy, preferredAngle);
  const maxRadiusSteps = 8;
  const radiusStep = LINK_DISTANCE * 0.35;

  for (let radiusStepIdx = 0; radiusStepIdx <= maxRadiusSteps; radiusStepIdx++) {
    const anchorRadius = baseAnchorRadius + radiusStepIdx * radiusStep;
    for (const sector of sectorCandidates) {
      const offset = {
        x: Math.cos(sectorIndexToAngle(sector, ISLAND_SECTOR_COUNT)) * anchorRadius,
        y: Math.sin(sectorIndexToAngle(sector, ISLAND_SECTOR_COUNT)) * anchorRadius,
      };
      if (!islandPlacementCollides(localPositions, offset, existingPositions)) return offset;
    }
  }

  const fallbackSector = sectorCandidates[0] ?? 0;
  const fallbackRadius = baseAnchorRadius + maxRadiusSteps * radiusStep;
  return {
    x: Math.cos(sectorIndexToAngle(fallbackSector, ISLAND_SECTOR_COUNT)) * fallbackRadius,
    y: Math.sin(sectorIndexToAngle(fallbackSector, ISLAND_SECTOR_COUNT)) * fallbackRadius,
  };
}

function bfsHopsInComponent(
  anchorNorm: string,
  componentSet: Set<string>,
  neighbors: NeighborMap,
): Map<string, number> {
  const hopByNorm = new Map<string, number>();
  hopByNorm.set(anchorNorm, 0);
  let frontier = [anchorNorm];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const cur of [...frontier].sort()) {
      const curHop = hopByNorm.get(cur)!;
      for (const nb of [...(neighbors.get(cur) ?? [])].sort()) {
        if (!componentSet.has(nb) || hopByNorm.has(nb)) continue;
        hopByNorm.set(nb, curHop + 1);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return hopByNorm;
}

function snapComponentToRings(
  componentNorms: string[],
  anchorNorm: string,
  neighbors: NeighborMap,
): Map<string, { x: number; y: number }> {
  const componentSet = new Set(componentNorms);
  const hopByNorm = bfsHopsInComponent(anchorNorm, componentSet, neighbors);
  const fallbackAngle = new Map<string, number>();
  for (const norm of componentNorms) {
    if (norm === anchorNorm) continue;
    const { ox, oy } = hashLayoutOffset(norm);
    fallbackAngle.set(norm, Math.atan2(oy, ox));
  }

  const ringGroups = new Map<number, string[]>();
  for (const norm of componentNorms) {
    const hop = hopByNorm.get(norm) ?? 1;
    if (!ringGroups.has(hop)) ringGroups.set(hop, []);
    ringGroups.get(hop)!.push(norm);
  }

  const snappedById = new Map<string, { x: number; y: number }>();
  snappedById.set(anchorNorm, { x: 0, y: 0 });

  function circularMean(angles: number[]): number {
    if (angles.length === 0) return 0;
    let sx = 0, sy = 0;
    for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a); }
    return Math.atan2(sy, sx);
  }

  const ringIndices = [...ringGroups.keys()].sort((a, b) => a - b);
  for (const hop of ringIndices) {
    if (hop === 0) continue;
    const group = ringGroups.get(hop)!;
    const ringR = hop * LINK_DISTANCE;
    const N = group.length;
    if (N === 0) continue;

    type WithAngle = { norm: string; prefAngle: number; placedNeighborCount: number };
    const withAngle: WithAngle[] = group.map((norm) => {
      const ns = neighbors.get(norm);
      const placedAngles: number[] = [];
      if (ns) {
        for (const nb of ns) {
          if (!componentSet.has(nb)) continue;
          const p = snappedById.get(nb);
          if (p) placedAngles.push(Math.atan2(p.y, p.x));
        }
      }
      let prefAngle = placedAngles.length > 0
        ? circularMean(placedAngles)
        : (fallbackAngle.get(norm) ?? 0);
      if (!isFinite(prefAngle)) prefAngle = 0;
      return { norm, prefAngle, placedNeighborCount: placedAngles.length };
    });

    withAngle.sort((a, b) => {
      if (a.placedNeighborCount !== b.placedNeighborCount) return b.placedNeighborCount - a.placedNeighborCount;
      if (a.prefAngle !== b.prefAngle) return a.prefAngle - b.prefAngle;
      return a.norm.localeCompare(b.norm);
    });

    const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
    const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, N))
      ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
    const slotAngles: number[] = [];
    for (let i = 0; i < slotCount; i++) slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);

    const takenSlots = new Set<number>();
    for (const wa of withAngle) {
      let bestSlot = -1, bestDist = Infinity;
      for (let i = 0; i < slotCount; i++) {
        if (takenSlots.has(i)) continue;
        let d = Math.abs(wa.prefAngle - slotAngles[i]);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < bestDist) { bestDist = d; bestSlot = i; }
      }
      if (bestSlot < 0) continue;
      takenSlots.add(bestSlot);
      const a = slotAngles[bestSlot];
      snappedById.set(wa.norm, { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
    }
  }

  const BARYCENTER_ITERATIONS = 3;
  for (let iter = 0; iter < BARYCENTER_ITERATIONS; iter++) {
    for (const hop of ringIndices) {
      if (hop === 0) continue;
      const group = ringGroups.get(hop)!;
      const ringR = hop * LINK_DISTANCE;
      if (group.length === 0) continue;
      const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
      const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, group.length))
        ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
      const slotAngles: number[] = [];
      for (let i = 0; i < slotCount; i++) slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);
      const newPrefs = group.map((norm) => {
        const ns = neighbors.get(norm);
        const placedAngles: number[] = [];
        if (ns) {
          for (const nb of ns) {
            if (!componentSet.has(nb)) continue;
            const p = snappedById.get(nb);
            if (p) placedAngles.push(Math.atan2(p.y, p.x));
          }
        }
        let sx = 0, sy = 0;
        for (const a of placedAngles) { sx += Math.cos(a); sy += Math.sin(a); }
        return { norm, prefAngle: placedAngles.length > 0 ? Math.atan2(sy, sx) : 0 };
      });
      newPrefs.sort((a, b) => a.norm.localeCompare(b.norm));
      const takenSlots = new Set<number>();
      for (const wa of newPrefs) {
        let bestSlot = -1, bestDist = Infinity;
        for (let i = 0; i < slotCount; i++) {
          if (takenSlots.has(i)) continue;
          let d = Math.abs(wa.prefAngle - slotAngles[i]);
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < bestDist) { bestDist = d; bestSlot = i; }
        }
        if (bestSlot < 0) continue;
        takenSlots.add(bestSlot);
        const a = slotAngles[bestSlot];
        snappedById.set(wa.norm, { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
      }
    }
  }

  return snappedById;
}

function placeIslandComponents(
  islandComponents: string[][],
  neighbors: NeighborMap,
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
  mainPositions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (islandComponents.length === 0) return result;

  let occupancy = computeAngularOccupancy(mainPositions.values(), ISLAND_SECTOR_COUNT);
  const existingPositions: { x: number; y: number }[] = [...mainPositions.values()];

  const sorted = [...islandComponents].sort((a, b) => {
    const anchorA = pickComponentAnchor(a, neighbors, synapses, workMap);
    const anchorB = pickComponentAnchor(b, neighbors, synapses, workMap);
    return anchorA.localeCompare(anchorB);
  });

  for (const comp of sorted) {
    if (comp.length === 0) continue;
    const anchor = pickComponentAnchor(comp, neighbors, synapses, workMap);
    const localPositions = snapComponentToRings(comp, anchor, neighbors);

    let maxInternalHop = 0;
    for (const norm of comp) {
      const hop = Math.hypot(
        (localPositions.get(norm)?.x ?? 0),
        (localPositions.get(norm)?.y ?? 0),
      ) / LINK_DISTANCE;
      if (hop > maxInternalHop) maxInternalHop = hop;
    }
    const anchorRadius = ISLAND_ANCHOR_RADIUS + Math.max(0, maxInternalHop - 1) * LINK_DISTANCE * 0.15;

    // Islands are placed at their hash-offset angle (no FocusCompass dim profile needed)
    const { ox, oy } = hashLayoutOffset(anchor);
    const prefAngle = Math.atan2(oy, ox);

    const offset = pickIslandPlacementOffset(
      localPositions,
      occupancy,
      prefAngle,
      anchorRadius,
      existingPositions,
    );

    const placedThisIsland: { x: number; y: number }[] = [];
    for (const norm of comp) {
      const local = localPositions.get(norm);
      if (!local) continue;
      const worldPos = { x: offset.x + local.x, y: offset.y + local.y };
      result.set(norm, worldPos);
      placedThisIsland.push(worldPos);
      existingPositions.push(worldPos);
    }
    const islandOcc = computeAngularOccupancy(placedThisIsland, ISLAND_SECTOR_COUNT);
    for (let i = 0; i < ISLAND_SECTOR_COUNT; i++) occupancy[i] += islandOcc[i];
  }

  return result;
}

/**
 * Compute graph layout positions for all nodes.
 * Pure function — no React, no DOM. Safe to run in Node.js API routes.
 *
 * Dim-anchor gravity is omitted (strength 0.003 — negligible effect on final positions).
 */
export function computeGalaxyLayout(
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): Map<string, { x: number; y: number }> {
  const { neighbors, urlForKey } = buildNeighborMap(synapses, workMap);
  const allNorms = Array.from(neighbors.keys());

  // Pick most-connected node as the layout anchor
  function pickStartNorm(): string | null {
    let bestNorm: string | null = null;
    let bestDeg = -1;
    let bestLikes = -1;
    const likesByNorm = new Map<string, number>();
    for (const s of synapses) {
      const sK = endpointWorkKey(s.source_url, workMap);
      const tK = endpointWorkKey(s.target_url, workMap);
      const l = s.likes_count ?? 0;
      likesByNorm.set(sK, (likesByNorm.get(sK) ?? 0) + l);
      likesByNorm.set(tK, (likesByNorm.get(tK) ?? 0) + l);
    }
    for (const [norm, set] of neighbors) {
      const deg = set.size;
      if (deg === 0) continue;
      const likes = likesByNorm.get(norm) ?? 0;
      if (
        deg > bestDeg ||
        (deg === bestDeg && likes > bestLikes) ||
        (deg === bestDeg && likes === bestLikes && (bestNorm == null || norm < bestNorm))
      ) {
        bestNorm = norm;
        bestDeg = deg;
        bestLikes = likes;
      }
    }
    return bestNorm;
  }
  const startNorm = pickStartNorm();

  // BFS to assign hop distances
  const hopByNorm = new Map<string, number>();
  if (startNorm) {
    hopByNorm.set(startNorm, 0);
    let frontier: string[] = [startNorm];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const cur of [...frontier].sort()) {
        const ns = neighbors.get(cur);
        if (!ns) continue;
        const curHop = hopByNorm.get(cur)!;
        for (const nb of [...ns].sort()) {
          if (hopByNorm.has(nb)) continue;
          hopByNorm.set(nb, curHop + 1);
          next.push(nb);
        }
      }
      frontier = next;
    }
  }
  const mainNormSet = new Set(hopByNorm.keys());

  // Build nodes (dim anchors are zero — dim gravity is negligible at 0.003 strength)
  const worldNodes: LNode[] = allNorms.map((norm) => {
    const { ox, oy } = hashLayoutOffset(norm);
    const isStart = norm === startNorm;
    return {
      norm,
      dimAnchorX: 0,
      dimAnchorY: 0,
      x: isStart ? 0 : ox,
      y: isStart ? 0 : oy,
      ...(isStart ? { fx: 0, fy: 0 } : {}),
    };
  });

  // Build links (aggregate per directed pair)
  const worldLinksByPair = new Map<string, LLink>();
  for (const s of synapses) {
    const sK = endpointWorkKey(s.source_url, workMap);
    const tK = endpointWorkKey(s.target_url, workMap);
    if (sK === tK) continue;
    const key = `${sK}::${tK}`;
    if (!worldLinksByPair.has(key)) {
      worldLinksByPair.set(key, { source: sK, target: tK });
    }
  }
  const worldLinks: LLink[] = Array.from(worldLinksByPair.values());

  if (worldNodes.length === 0) return new Map();

  const mainWorldNodes = worldNodes.filter((n) => mainNormSet.has(n.norm));
  const mainWorldLinks = worldLinks.filter((l) => {
    const sN = typeof l.source === "string" ? l.source : (l.source as LNode).norm;
    const tN = typeof l.target === "string" ? l.target : (l.target as LNode).norm;
    return mainNormSet.has(sN) && mainNormSet.has(tN);
  });

  // Triangle detection for stronger link strength
  const undirectedNeighborSets = new Map<string, Set<string>>();
  for (const l of mainWorldLinks) {
    const sN = typeof l.source === "string" ? l.source : (l.source as LNode).norm;
    const tN = typeof l.target === "string" ? l.target : (l.target as LNode).norm;
    if (!undirectedNeighborSets.has(sN)) undirectedNeighborSets.set(sN, new Set());
    if (!undirectedNeighborSets.has(tN)) undirectedNeighborSets.set(tN, new Set());
    undirectedNeighborSets.get(sN)!.add(tN);
    undirectedNeighborSets.get(tN)!.add(sN);
  }
  const triangleLinkKeys = new Set<string>();
  for (const l of mainWorldLinks) {
    const sN = typeof l.source === "string" ? l.source : (l.source as LNode).norm;
    const tN = typeof l.target === "string" ? l.target : (l.target as LNode).norm;
    const sNeighbors = undirectedNeighborSets.get(sN)!;
    const tNeighbors = undirectedNeighborSets.get(tN)!;
    let inTriangle = false;
    for (const n of sNeighbors) {
      if (n !== tN && tNeighbors.has(n)) { inTriangle = true; break; }
    }
    if (inTriangle) {
      triangleLinkKeys.add(`${sN}::${tN}`);
      triangleLinkKeys.add(`${tN}::${sN}`);
    }
  }

  // d3-force simulation (200 ticks — for angular arrangement only)
  const sim = d3
    .forceSimulation<LNode, LLink>(mainWorldNodes)
    .force(
      "link",
      d3.forceLink<LNode, LLink>(mainWorldLinks)
        .id((d) => d.norm)
        .distance(LINK_DISTANCE)
        .strength((l) => {
          const sN = typeof l.source === "string" ? l.source : (l.source as LNode).norm;
          const tN = typeof l.target === "string" ? l.target : (l.target as LNode).norm;
          return triangleLinkKeys.has(`${sN}::${tN}`) ? 1.5 : 1.0;
        }),
    )
    .force("charge", d3.forceManyBody<LNode>().strength(-1200))
    .force("collide", d3.forceCollide<LNode>().radius(NODE_RADIUS).strength(0.92))
    .force("dimX", d3.forceX<LNode>((n) => n.dimAnchorX).strength(0.003))
    .force("dimY", d3.forceY<LNode>((n) => n.dimAnchorY).strength(0.003))
    .force(
      "radial",
      d3.forceRadial<LNode>((n) => (hopByNorm.get(n.norm) ?? 1) * LINK_DISTANCE, 0, 0).strength(0.4),
    )
    .alpha(1)
    .alphaDecay(0.012)
    .velocityDecay(0.4);

  sim.stop();
  for (let i = 0; i < 200; i++) sim.tick();

  // Snap post-process: assign nodes to ring slots
  const RADIUS_STEP = LINK_DISTANCE;
  const ringGroups = new Map<number, LNode[]>();
  for (const n of mainWorldNodes) {
    const hop = hopByNorm.get(n.norm) ?? 1;
    if (!ringGroups.has(hop)) ringGroups.set(hop, []);
    ringGroups.get(hop)!.push(n);
  }

  const snappedById = new Map<string, { x: number; y: number }>();
  if (startNorm) snappedById.set(startNorm, { x: 0, y: 0 });

  const ringIndices = [...ringGroups.keys()].sort((a, b) => a - b);

  for (const hop of ringIndices) {
    if (hop === 0) continue;
    const group = ringGroups.get(hop)!;
    const ringR = hop * RADIUS_STEP;
    const N = group.length;
    if (N === 0) continue;

    function circularMean(angles: number[]): number {
      if (angles.length === 0) return 0;
      let sx = 0, sy = 0;
      for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a); }
      return Math.atan2(sy, sx);
    }

    type WithAngle = { node: LNode; prefAngle: number; placedNeighborCount: number };
    const withAngle: WithAngle[] = group.map((n) => {
      const ns = neighbors.get(n.norm);
      const placedAngles: number[] = [];
      if (ns) {
        for (const nb of ns) {
          const p = snappedById.get(nb);
          if (p) placedAngles.push(Math.atan2(p.y, p.x));
        }
      }
      let prefAngle = placedAngles.length > 0 ? circularMean(placedAngles) : Math.atan2(n.y ?? 0, n.x ?? 0);
      if (!isFinite(prefAngle)) prefAngle = 0;
      return { node: n, prefAngle, placedNeighborCount: placedAngles.length };
    });

    withAngle.sort((a, b) => {
      if (a.placedNeighborCount !== b.placedNeighborCount) return b.placedNeighborCount - a.placedNeighborCount;
      if (a.prefAngle !== b.prefAngle) return a.prefAngle - b.prefAngle;
      return a.node.norm.localeCompare(b.node.norm);
    });

    const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
    const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, N)) ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
    const slotAngles: number[] = [];
    for (let i = 0; i < slotCount; i++) slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);

    const takenSlots = new Set<number>();
    for (const wa of withAngle) {
      let bestSlot = -1, bestDist = Infinity;
      for (let i = 0; i < slotCount; i++) {
        if (takenSlots.has(i)) continue;
        let d = Math.abs(wa.prefAngle - slotAngles[i]);
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < bestDist) { bestDist = d; bestSlot = i; }
      }
      if (bestSlot < 0) continue;
      takenSlots.add(bestSlot);
      const a = slotAngles[bestSlot];
      snappedById.set(wa.node.norm, { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
    }
  }

  // Barycenter refinement (3 iterations)
  const BARYCENTER_ITERATIONS = 3;
  for (let iter = 0; iter < BARYCENTER_ITERATIONS; iter++) {
    for (const hop of ringIndices) {
      if (hop === 0) continue;
      const group = ringGroups.get(hop)!;
      const ringR = hop * RADIUS_STEP;
      if (group.length === 0) continue;
      const idealSlotCount = Math.ceil((2 * Math.PI * ringR) / LINK_DISTANCE);
      const slotCount = RING_SLOT_PRESETS.find((p) => p >= Math.max(idealSlotCount, group.length)) ?? RING_SLOT_PRESETS[RING_SLOT_PRESETS.length - 1];
      const slotAngles: number[] = [];
      for (let i = 0; i < slotCount; i++) slotAngles.push((i / slotCount) * 2 * Math.PI - Math.PI);
      const newPrefs = group.map((n) => {
        const ns = neighbors.get(n.norm);
        const placedAngles: number[] = [];
        if (ns) {
          for (const nb of ns) {
            const p = snappedById.get(nb);
            if (p) placedAngles.push(Math.atan2(p.y, p.x));
          }
        }
        let sx = 0, sy = 0;
        for (const a of placedAngles) { sx += Math.cos(a); sy += Math.sin(a); }
        return { node: n, prefAngle: placedAngles.length > 0 ? Math.atan2(sy, sx) : 0 };
      });
      newPrefs.sort((a, b) => a.node.norm.localeCompare(b.node.norm));
      const takenSlots = new Set<number>();
      for (const wa of newPrefs) {
        let bestSlot = -1, bestDist = Infinity;
        for (let i = 0; i < slotCount; i++) {
          if (takenSlots.has(i)) continue;
          let d = Math.abs(wa.prefAngle - slotAngles[i]);
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < bestDist) { bestDist = d; bestSlot = i; }
        }
        if (bestSlot < 0) continue;
        takenSlots.add(bestSlot);
        const a = slotAngles[bestSlot];
        snappedById.set(wa.node.norm, { x: Math.cos(a) * ringR, y: Math.sin(a) * ringR });
      }
    }
  }

  // Place disconnected island components
  if (startNorm) {
    const islandComponents = findConnectedComponents(allNorms, neighbors).filter(
      (comp) => !comp.includes(startNorm),
    );
    const islandPositions = placeIslandComponents(
      islandComponents,
      neighbors,
      synapses,
      workMap,
      snappedById,
    );
    for (const [norm, pos] of islandPositions) snappedById.set(norm, pos);
  }

  // Collect final positions
  const result = new Map<string, { x: number; y: number }>();
  for (const n of worldNodes) {
    const snapped = snappedById.get(n.norm);
    if (snapped) {
      result.set(n.norm, snapped);
    } else if (typeof n.x === "number" && typeof n.y === "number") {
      result.set(n.norm, { x: n.x, y: n.y });
    }
  }
  return result;
}
