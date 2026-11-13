import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";

/** Distance between adjacent corners of the honeycomb grid (card centres sit on the corners).
 *  370 keeps a horizontal edge long enough for the widest label pill (220) between two cards. */
const D = 370;
const SQ3 = Math.sqrt(3);
/** Lattice extent in cells per direction; generous for the current dataset. */
const GRID_CELLS = 14;
/** A card must stay at least this far (in D) from any other group's cards: one blank corner between groups. */
const ISLAND_MARGIN = 1.7;

type Pt = { x: number; y: number };
type NeighborMap = Map<string, Set<string>>;

function buildNeighborMap(synapses: SynapseRow[], workMap: WorkEndpointMap): NeighborMap {
  const neighbors: NeighborMap = new Map();
  for (const s of synapses) {
    const sK = endpointWorkKey(s.source_url, workMap);
    const tK = endpointWorkKey(s.target_url, workMap);
    if (!neighbors.has(sK)) neighbors.set(sK, new Set());
    if (!neighbors.has(tK)) neighbors.set(tK, new Set());
    if (sK === tK) continue;
    neighbors.get(sK)!.add(tK);
    neighbors.get(tK)!.add(sK);
  }
  return neighbors;
}

/** Corners of flat-top hexagons: every corner has exactly 3 neighbours at distance D. */
function buildLattice(cells: number): Pt[] {
  const out: Pt[] = [];
  for (let i = -cells; i <= cells; i++) {
    for (let j = -cells; j <= cells; j++) {
      const x = 1.5 * D * j;
      const y = SQ3 * D * i + (SQ3 * D * j) / 2;
      out.push({ x, y }, { x: x + D, y });
    }
  }
  return out;
}

function findComponents(neighbors: NeighborMap): string[][] {
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of [...neighbors.keys()].sort()) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of [...(neighbors.get(cur) ?? [])].sort()) {
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    comps.push(comp.sort());
  }
  return comps;
}

/** Most-connected node (ties: most likes, then lowest key). */
function pickRoot(
  nodes: string[],
  neighbors: NeighborMap,
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): string {
  const inComp = new Set(nodes);
  const likes = new Map<string, number>();
  for (const s of synapses) {
    const sK = endpointWorkKey(s.source_url, workMap);
    const tK = endpointWorkKey(s.target_url, workMap);
    const l = s.likes_count ?? 0;
    if (inComp.has(sK)) likes.set(sK, (likes.get(sK) ?? 0) + l);
    if (inComp.has(tK)) likes.set(tK, (likes.get(tK) ?? 0) + l);
  }
  let best = nodes[0];
  for (const n of nodes) {
    const degN = neighbors.get(n)?.size ?? 0;
    const degB = neighbors.get(best)?.size ?? 0;
    const likesN = likes.get(n) ?? 0;
    const likesB = likes.get(best) ?? 0;
    if (degN > degB || (degN === degB && likesN > likesB)) best = n;
  }
  return best;
}

function distPointSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True when segments ab and cd cross at an interior point. */
function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const eps = 1e-6;
  return o1 * o2 < -eps && o3 * o4 < -eps;
}

/**
 * Greedy placement of one connected component onto honeycomb corners.
 * The root takes the corner at (0,0); each next node (breadth-first, bigger
 * branches first) takes the free corner that is closest to its placed
 * neighbours, away from other cards, and not behind another card or edge.
 * Corners that no work claims stay blank.
 */
function placeComponent(
  nodes: string[],
  root: string,
  neighbors: NeighborMap,
  lattice: Pt[],
): Map<string, Pt> {
  const inComp = new Set(nodes);

  const parent = new Map<string, string | null>([[root, null]]);
  const levels: string[][] = [[root]];
  for (;;) {
    const next: string[] = [];
    for (const cur of levels[levels.length - 1]) {
      for (const nb of [...(neighbors.get(cur) ?? [])].sort()) {
        if (!inComp.has(nb) || parent.has(nb)) continue;
        parent.set(nb, cur);
        next.push(nb);
      }
    }
    if (next.length === 0) break;
    levels.push(next);
  }
  const size = new Map<string, number>();
  for (let l = levels.length - 1; l >= 0; l--) {
    for (const n of levels[l]) {
      size.set(n, (size.get(n) ?? 0) + 1);
      const p = parent.get(n);
      if (p) size.set(p, (size.get(p) ?? 0) + (size.get(n) ?? 0));
    }
  }

  const rootCorner = lattice.find((v) => v.x === 0 && v.y === 0)!;
  const placed = new Map<string, Pt>([[root, rootCorner]]);
  const usedCorners = new Set<Pt>([rootCorner]);
  const edges: Array<[Pt, Pt]> = [];

  for (let l = 1; l < levels.length; l++) {
    const order = [...levels[l]].sort((a, b) => (size.get(b)! - size.get(a)!) || a.localeCompare(b));
    for (const v of order) {
      const anchors = [...(neighbors.get(v) ?? [])].filter((n) => placed.has(n)).map((n) => placed.get(n)!);
      const others = [...placed.entries()].filter(([n]) => !(neighbors.get(v)?.has(n))).map(([, p]) => p);

      let best: Pt | null = null;
      let bestCost = Infinity;
      for (const u of lattice) {
        if (usedCorners.has(u)) continue;
        let cost = 0;
        for (const a of anchors) cost += (Math.hypot(u.x - a.x, u.y - a.y) / D) ** 2;
        if (cost > 40) continue;
        cost += 0.2 * (Math.hypot(u.x, u.y) / D) ** 2;
        for (const q of others) {
          const gap = 1.8 - Math.hypot(u.x - q.x, u.y - q.y) / D;
          if (gap > 0) cost += 1.5 * gap * gap;
        }
        for (const a of anchors) {
          for (const [, q] of placed) {
            if (q === a) continue;
            if (distPointSeg(q, u, a) < 0.3 * D) cost += 50;
          }
          for (const [e1, e2] of edges) {
            if (e1 === a || e2 === a) continue;
            if (segmentsCross(u, a, e1, e2)) cost += 8;
          }
        }
        for (const [e1, e2] of edges) {
          if (distPointSeg(u, e1, e2) < 0.3 * D) cost += 50;
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = u;
        }
      }
      const chosen = best!;
      placed.set(v, chosen);
      usedCorners.add(chosen);
      for (const a of anchors) edges.push([chosen, a]);
    }
  }
  return placed;
}

/**
 * Honeycomb layout: works sit on the corners of a hexagonal grid (the hub on
 * one corner, others on the nearest free corners, empty corners stay blank).
 * Disconnected groups are laid out the same way and dropped onto the same grid,
 * packed as close to the main group as the margin allows. Pure function — safe for Node and browser.
 */
export function computeGalaxyLayout(
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): Map<string, { x: number; y: number }> {
  const neighbors = buildNeighborMap(synapses, workMap);
  const result = new Map<string, Pt>();
  if (neighbors.size === 0) return result;

  const lattice = buildLattice(GRID_CELLS);
  const comps = findComponents(neighbors);

  const mainRoot = pickRoot([...neighbors.keys()].sort(), neighbors, synapses, workMap);
  const mainComp = comps.find((c) => c.includes(mainRoot))!;
  const mainPlaced = placeComponent(mainComp, mainRoot, neighbors, lattice);
  for (const [n, p] of mainPlaced) result.set(n, p);

  const islands = comps
    .filter((c) => c !== mainComp)
    .map((nodes) => {
      const root = pickRoot(nodes, neighbors, synapses, workMap);
      return { nodes, local: placeComponent(nodes, root, neighbors, lattice), root };
    })
    .sort((a, b) => b.nodes.length - a.nodes.length || a.root.localeCompare(b.root));

  let mainRadius = 0;
  for (const p of mainPlaced.values()) mainRadius = Math.max(mainRadius, Math.hypot(p.x, p.y));

  const offsets: Pt[] = [];
  const M = GRID_CELLS * 2;
  for (let i = -M; i <= M; i++) {
    for (let j = -M; j <= M; j++) offsets.push({ x: 1.5 * D * j, y: SQ3 * D * i + (SQ3 * D * j) / 2 });
  }

  // Rotations by 120 degrees and a mirror keep a corner-rooted group on the grid.
  const orientations: Array<(p: Pt) => Pt> = [];
  for (let r = 0; r < 3; r++) {
    for (const mirror of [false, true]) {
      const c = Math.cos((r * 2 * Math.PI) / 3);
      const sn = Math.sin((r * 2 * Math.PI) / 3);
      orientations.push((p) => {
        const y = mirror ? -p.y : p.y;
        return { x: p.x * c - y * sn, y: p.x * sn + y * c };
      });
    }
  }

  islands.forEach((isl) => {
    const occupied = [...result.values()];
    const gx = occupied.reduce((sum, o) => sum + o.x, 0) / occupied.length;
    const gy = occupied.reduce((sum, o) => sum + o.y, 0) / occupied.length;

    let best: { shift: Pt; orient: (p: Pt) => Pt } | null = null;
    let bestCost = Infinity;
    for (const orient of orientations) {
      const pts = [...isl.local.values()].map(orient);
      const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
      const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
      for (const t of offsets) {
        let nearest = Infinity;
        for (const p of pts) {
          for (const o of occupied) nearest = Math.min(nearest, Math.hypot(p.x + t.x - o.x, p.y + t.y - o.y));
        }
        if (nearest < ISLAND_MARGIN * D) continue;
        // Closest approach to the existing cards dominates; the centroid only breaks ties.
        const cost = 20 * nearest + Math.hypot(t.x + cx - gx, t.y + cy - gy);
        if (cost < bestCost) {
          bestCost = cost;
          best = { shift: t, orient };
        }
      }
    }
    const chosen = best ?? { shift: { x: mainRadius + 2 * D * isl.nodes.length, y: 0 }, orient: orientations[0] };
    for (const [n, p] of isl.local) {
      const q = chosen.orient(p);
      result.set(n, { x: q.x + chosen.shift.x, y: q.y + chosen.shift.y });
    }
  });

  return new Map([...result.entries()].map(([n, p]) => [n, { x: p.x, y: p.y }]));
}
