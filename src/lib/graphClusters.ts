import type {NetworkLink} from "./networkGraph";

// Evidence determines each hub's own group. Inferred money edges then mark
// only the endpoints that bridge groups as shared; they must not drag whole
// stars into another group or promote a name match into a new hub.
export function graphClusterClaims<N extends {id: string}>(
  nodes: N[], links: NetworkLink[]
) {
  const adj = new Map<string, Set<string>>();
  const owner = new Map<string, string>();
  const touch = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const l of links) {
    if (l.soft) continue;
    touch(l.source, l.target); touch(l.target, l.source);
    if (l.kind === "owns") owner.set(l.target, l.source);
  }
  const degree = (id: string) => adj.get(id)?.size ?? 0;
  const satellites = (id: string) => [...(adj.get(id) ?? [])]
    .filter(nb => owner.get(nb) === id || degree(nb) === 1).length;
  const counts = new Map(nodes.map(n => [n.id, satellites(n.id)]));
  const centers = nodes.filter(n => counts.get(n.id)! >= 2)
    .sort((a, b) => counts.get(b.id)! - counts.get(a.id)!
      || a.id.localeCompare(b.id));
  const centerIds = new Set(centers.map(n => n.id));
  const primary = new Map<string, {centers: Set<string>; dist: number}>();
  const queue = centers.map(n => ({id: n.id, root: n.id, dist: 0}));
  for (const c of centers) primary.set(c.id, {centers: new Set([c.id]), dist: 0});
  for (let i = 0; i < queue.length; i++) {
    const f = queue[i];
    for (const nb of adj.get(f.id) ?? []) {
      if (centerIds.has(nb)) continue;
      const dist = f.dist + 1;
      let cl = primary.get(nb);
      if (!cl) {cl = {centers: new Set(), dist}; primary.set(nb, cl);}
      if (cl.dist !== dist || cl.centers.has(f.root)) continue;
      cl.centers.add(f.root);
      // Propagate equal-distance claims too, so descendants of a shared
      // account/phone remain in the same middle group.
      queue.push({id: nb, root: f.root, dist});
    }
  }
  const claim = new Map([...primary].map(([id, cl]) =>
    [id, {centers: new Set(cl.centers), dist: cl.dist}]));
  for (const l of links) {
    if (!l.soft) continue;
    const a = primary.get(l.source), b = primary.get(l.target);
    if (!a || !b) continue;
    const roots = new Set([...a.centers, ...b.centers]);
    if (roots.size < 2) continue;
    for (const id of [l.source, l.target]) {
      if (centerIds.has(id)) continue;
      for (const root of roots) claim.get(id)!.centers.add(root);
    }
  }
  return {centers, claim};
}
