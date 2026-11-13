import type { SynapseRow } from "@/lib/supabase/clients";
import { endpointWorkKey, type WorkEndpointMap } from "@/lib/workEndpoint";
import { measureEdgeKeywordPill } from "@/lib/edgeKeywordDisplay";

/** Distance between neighbouring slots on a ring (and between rings). */
const D = 320;
/** Card half extents incl. padding, matching the label-overlap test in GraphView. */
const CARD_HALF_W = 76;
const CARD_HALF_H = 61;
/** A card must stay at least this far (in D) from any other group's cards. */
const ISLAND_MARGIN = 1.7;

type Pt = { x: number; y: number };
type NeighborMap = Map<string, Set<string>>;
type LabelBox = { hw: number; hh: number };

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

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

/** Half extents of each edge's label pill (the most-liked synapse's first keyword, as GraphView shows it). */
function buildLabelBoxes(synapses: SynapseRow[], workMap: WorkEndpointMap): Map<string, LabelBox> {
  const bestByPair = new Map<string, SynapseRow>();
  for (const s of synapses) {
    const a = endpointWorkKey(s.source_url, workMap);
    const b = endpointWorkKey(s.target_url, workMap);
    if (a === b) continue;
    const k = pairKey(a, b);
    const cur = bestByPair.get(k);
    if (!cur || (s.likes_count ?? 0) > (cur.likes_count ?? 0)) bestByPair.set(k, s);
  }
  const boxes = new Map<string, LabelBox>();
  for (const [k, s] of bestByPair) {
    const kw = s.keywords?.find((x) => x && x.trim());
    if (!kw) continue;
    const { w, h } = measureEdgeKeywordPill(kw.trim());
    boxes.set(k, { hw: w / 2 + 3, hh: h / 2 + 3 });
  }
  return boxes;
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

const wrapAngle = (a: number) => {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x < -Math.PI) x += 2 * Math.PI;
  return x;
};

function circularMean(angles: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  return Math.atan2(sy, sx);
}

/**
 * Radial placement of one connected component around its root (at 0,0).
 * Ring k (k hops from the root) has 6k slots on a regular polygon — hexagon,
 * 12-gon, 18-gon … — so neighbouring slots are about D apart. Each work takes
 * the free slot closest to the direction of the works it connects to; slots
 * nobody claims stay blank. Ring 1 spreads its works evenly around the root.
 */
function placeRings(
  nodes: string[],
  root: string,
  neighbors: NeighborMap,
  labels: Map<string, LabelBox>,
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

  const placed = new Map<string, Pt>([[root, { x: 0, y: 0 }]]);
  const angleOf = new Map<string, number>();
  let prevRadius = 0;

  for (let k = 1; k < levels.length; k++) {
    const group = [...levels[k]].sort((a, b) => (size.get(b)! - size.get(a)!) || a.localeCompare(b));
    const slots = 6 * Math.max(k, Math.ceil(group.length / 6));
    const step = (2 * Math.PI) / slots;
    const radius = Math.max(prevRadius + D, D / (2 * Math.sin(Math.PI / slots)));
    prevRadius = radius;

    const kids = new Map<string, string[]>();
    for (const v of group) {
      const p = parent.get(v)!;
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(v);
    }

    const pref = new Map<string, number>();
    group.forEach((v, i) => {
      if (k === 1) {
        // Two works would otherwise sit on opposite sides, i.e. in one straight line: use a V instead.
        const spread = group.length === 2 ? (2 * Math.PI) / 3 : (2 * Math.PI) / group.length;
        pref.set(v, wrapAngle(i * spread));
        return;
      }
      const around = [...(neighbors.get(v) ?? [])]
        .filter((n) => angleOf.has(n))
        .map((n) => angleOf.get(n)!);
      let a = around.length > 0 ? circularMean(around) : 0;
      // Fan the children of one work out around its direction, one slot apart.
      const p = parent.get(v)!;
      const siblings = kids.get(p)!;
      a += (siblings.indexOf(v) - (siblings.length - 1) / 2) * step;
      // An only child two hops out along one spoke would continue the straight line: bend it one slot.
      const g = parent.get(p);
      if (siblings.length === 1 && g && g !== root && Math.abs(wrapAngle(angleOf.get(p)! - angleOf.get(g)!)) < 1e-6) {
        let h = 0;
        for (const ch of v) h += ch.charCodeAt(0);
        a += (h % 2 === 0 ? 1 : -1) * step;
      }
      pref.set(v, wrapAngle(a));
    });

    const taken = new Set<number>();
    for (const v of group) {
      const neighborsPlaced = [...(neighbors.get(v) ?? [])].filter((n) => placed.has(n));
      let bestSlot = -1;
      let bestCost = Infinity;
      for (let s = 0; s < slots; s++) {
        if (taken.has(s)) continue;
        const ang = s * step;
        const ux = Math.cos(ang) * radius;
        const uy = Math.sin(ang) * radius;
        let cost = Math.abs(wrapAngle(ang - pref.get(v)!)) / step;
        for (const n of neighborsPlaced) {
          const box = labels.get(pairKey(v, n));
          if (!box) continue;
          const q = placed.get(n)!;
          if (Math.abs(ux - q.x) / 2 < CARD_HALF_W + box.hw && Math.abs(uy - q.y) / 2 < CARD_HALF_H + box.hh) {
            cost += 1.5;
          }
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestSlot = s;
        }
      }
      taken.add(bestSlot);
      const ang = bestSlot * step;
      angleOf.set(v, ang);
      placed.set(v, { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius });
    }
  }
  return placed;
}

/**
 * Radial layout: the hub in the centre, its works on a hexagon around it, their
 * works on a 12-gon, and so on; empty slots stay blank. Disconnected groups are
 * laid out the same way and tucked next to the main group with one blank slot
 * between them. Pure function — safe for Node and browser.
 */
export function computeGalaxyLayout(
  synapses: SynapseRow[],
  workMap: WorkEndpointMap,
): Map<string, { x: number; y: number }> {
  const neighbors = buildNeighborMap(synapses, workMap);
  const result = new Map<string, Pt>();
  if (neighbors.size === 0) return result;

  const labels = buildLabelBoxes(synapses, workMap);
  const comps = findComponents(neighbors);

  const mainRoot = pickRoot([...neighbors.keys()].sort(), neighbors, synapses, workMap);
  const mainComp = comps.find((c) => c.includes(mainRoot))!;
  for (const [n, p] of placeRings(mainComp, mainRoot, neighbors, labels)) result.set(n, p);

  const islands = comps
    .filter((c) => c !== mainComp)
    .map((nodes) => {
      const root = pickRoot(nodes, neighbors, synapses, workMap);
      return { nodes, root, local: placeRings(nodes, root, neighbors, labels) };
    })
    .sort((a, b) => b.nodes.length - a.nodes.length || a.root.localeCompare(b.root));

  // Rotating by 60 degrees keeps every ring slot on a slot.
  const rotations = [0, 1, 2, 3, 4, 5].map((j) => (j * Math.PI) / 3);
  const directions = 48;
  const radialStep = 24;
  const margin = ISLAND_MARGIN * D;

  for (const isl of islands) {
    const occupied = [...result.values()];
    const gx = occupied.reduce((sum, o) => sum + o.x, 0) / occupied.length;
    const gy = occupied.reduce((sum, o) => sum + o.y, 0) / occupied.length;
    let reach = 0;
    for (const o of occupied) reach = Math.max(reach, Math.hypot(o.x, o.y));
    const maxR = reach + 4 * D * Math.sqrt(isl.nodes.length) + 2 * margin;

    let best: { shift: Pt; rot: number } | null = null;
    let bestCost = Infinity;
    for (const rot of rotations) {
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const pts = [...isl.local.values()].map((p) => ({ x: p.x * c - p.y * sn, y: p.x * sn + p.y * c }));
      const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
      const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
      for (let d = 0; d < directions; d++) {
        const theta = (d / directions) * 2 * Math.PI;
        for (let r = 0; r <= maxR; r += radialStep) {
          const tx = Math.cos(theta) * r;
          const ty = Math.sin(theta) * r;
          let nearest = Infinity;
          for (const p of pts) {
            for (const o of occupied) nearest = Math.min(nearest, Math.hypot(p.x + tx - o.x, p.y + ty - o.y));
          }
          if (nearest < margin) continue;
          const cost = 20 * nearest + Math.hypot(tx + cx - gx, ty + cy - gy);
          if (cost < bestCost) {
            bestCost = cost;
            best = { shift: { x: tx, y: ty }, rot };
          }
          break;
        }
      }
    }
    const chosen = best ?? { shift: { x: 0, y: maxR }, rot: 0 };
    const c = Math.cos(chosen.rot);
    const sn = Math.sin(chosen.rot);
    for (const [n, p] of isl.local) {
      result.set(n, { x: p.x * c - p.y * sn + chosen.shift.x, y: p.x * sn + p.y * c + chosen.shift.y });
    }
  }

  return new Map([...result.entries()].map(([n, p]) => [n, { x: p.x, y: p.y }]));
}
