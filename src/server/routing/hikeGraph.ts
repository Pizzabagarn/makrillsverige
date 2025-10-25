import * as turf from '@turf/turf';
import { overpassQuery } from './overpassClient';

type NodeId = string;

interface GraphNode { id: NodeId; coord: [number, number] }
interface GraphEdge { from: NodeId; to: NodeId; length: number }

export interface HikeGraph { nodes: Map<NodeId, GraphNode>; edges: Map<NodeId, GraphEdge[]> }

function idFor(pt: [number, number]): NodeId {
  return `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
}

export async function buildHikeGraphAround(target: [number, number], radiusKm = 50): Promise<HikeGraph | null> {
  const [lng, lat] = target;
  const latDegPerKm = 1 / 110.574;
  const lngDegPerKm = 1 / (111.320 * Math.cos(lat * Math.PI / 180));
  const bbox = { south: lat - radiusKm * latDegPerKm, north: lat + radiusKm * latDegPerKm, west: lng - radiusKm * lngDegPerKm, east: lng + radiusKm * lngDegPerKm };
  const ql = `
    [out:json][timeout:25];
    (
      way["highway"~"^(path|footway|cycleway|track)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["route"="hiking"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out geom;
  `;
  const data = await overpassQuery(ql, 25);
  if (!data?.elements?.length) return null;
  const nodes = new Map<NodeId, GraphNode>();
  const edges = new Map<NodeId, GraphEdge[]>();
  const pushEdge = (a: [number, number], b: [number, number]) => {
    const ida = idFor(a); const idb = idFor(b);
    if (!nodes.has(ida)) nodes.set(ida, { id: ida, coord: a });
    if (!nodes.has(idb)) nodes.set(idb, { id: idb, coord: b });
    const length = turf.distance(turf.point(a) as any, turf.point(b) as any, { units: 'meters' } as any) as number;
    const list = edges.get(ida) || [];
    list.push({ from: ida, to: idb, length });
    edges.set(ida, list);
  };
  for (const el of data.elements) {
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      for (let i = 1; i < el.geometry.length; i++) {
        const a = [el.geometry[i - 1].lon, el.geometry[i - 1].lat] as [number, number];
        const b = [el.geometry[i].lon, el.geometry[i].lat] as [number, number];
        pushEdge(a, b);
        pushEdge(b, a);
      }
    }
  }
  return { nodes, edges };
}

export function aStarPath(graph: HikeGraph, start: [number, number], goal: [number, number]): [number, number][] | null {
  // snap start/goal to nearest nodes
  const allNodes = Array.from(graph.nodes.values());
  const nearest = (p: [number, number]) => allNodes.reduce((best, n) => {
    const d = turf.distance(turf.point(p) as any, turf.point(n.coord) as any, { units: 'meters' } as any) as number;
    return (!best || d < best.d) ? { n, d } : best;
  }, null as any);
  const ns = nearest(start); const ng = nearest(goal);
  if (!ns || !ng) return null;

  const h = (id: NodeId) => turf.distance(turf.point(graph.nodes.get(id)!.coord) as any, turf.point(ng.n.coord) as any, { units: 'meters' } as any) as number;
  const open = new Set<NodeId>([ns.n.id]);
  const came = new Map<NodeId, NodeId | null>();
  const gScore = new Map<NodeId, number>();
  const fScore = new Map<NodeId, number>();
  for (const id of graph.nodes.keys()) { gScore.set(id, Infinity); fScore.set(id, Infinity); came.set(id, null); }
  gScore.set(ns.n.id, 0); fScore.set(ns.n.id, h(ns.n.id));

  const getLowest = () => {
    let best: NodeId | null = null; let bestF = Infinity;
    for (const id of open) { const f = fScore.get(id) || Infinity; if (f < bestF) { bestF = f; best = id; } }
    return best;
  };

  while (open.size) {
    const current = getLowest();
    if (!current) break;
    if (current === ng.n.id) {
      // reconstruct
      const path: NodeId[] = [current];
      let c: NodeId | null = current;
      while (c) { c = came.get(c) || null; if (c) path.unshift(c); }
      return path.map(id => graph.nodes.get(id)!.coord);
    }
    open.delete(current);
    const neighbors = graph.edges.get(current) || [];
    for (const e of neighbors) {
      const tentative = (gScore.get(current) || Infinity) + e.length;
      if (tentative < (gScore.get(e.to) || Infinity)) {
        came.set(e.to, current);
        gScore.set(e.to, tentative);
        fScore.set(e.to, tentative + h(e.to));
        open.add(e.to);
      }
    }
  }
  return null;
}


