import type {NetworkLink, NetworkNode} from "./networkGraph";

/** Induced person-only scene: ordinary contacts never expand a red hub. */
export function offenderOnlyScene(nodes: NetworkNode[], links: NetworkLink[]) {
  const people = nodes.filter(n => n.type === "PERSON" && n.offender === true);
  const ids = new Set(people.map(n => n.id));
  const owner = new Map(links.filter(l => l.kind === "owns").map(l => [l.target, l.source]));
  const edges = links.filter(l => l.kind !== "owns").flatMap(l => {
    const source = owner.get(l.source) ?? l.source;
    const target = owner.get(l.target) ?? l.target;
    return source !== target && ids.has(source) && ids.has(target)
      ? [{...l, source, target}] : [];
  });
  // Isolated offenders still belong in this view. Phone/account evidence
  // between two offenders is drawn between their owners; the list keeps IDs.
  return {nodes: people, links: edges};
}

/** Same shared bridge definition as the on-screen and printed conclusions. */
export function sharedGraphRelations(nodes: NetworkNode[], links: NetworkLink[]) {
  // "Primary people" are the people whose OWN statements are loaded: the
  // builder adds a Гүйлгээ summary only to an endpoint that owns imported
  // statement rows. They are the investigation centers, never intermediaries.
  const primary = nodes.filter((p) => p.type === "PERSON").filter((p) =>
    p.stats.some(([label]) => label === "Гүйлгээ"));
  const primaryIds = new Set(primary.map((p) => p.id));

  // A real intermediary is a NON-primary node sitting equally close (within
  // two hops) to two or more primary people. Keep account nodes intact: one
  // unknown bank account
  // used by several investigated people is exactly the signal this page must
  // surface, not project away as generic person centrality.
  const incident = new Map<string, NetworkLink[]>();
  const adjacency = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  const addIncident = (id: string, link: NetworkLink) => {
    const list = incident.get(id) ?? [];
    list.push(link);
    incident.set(id, list);
  };
  for (const l of links) {
    if (l.kind === "owns") continue;
    addIncident(l.source, l);
    addIncident(l.target, l);
    adjacency.get(l.source)?.add(l.target);
    adjacency.get(l.target)?.add(l.source);
  }
  const distances = new Map<string, Map<string, number>>();
  for (const root of primary) {
    const dist = new Map([[root.id, 0]]);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      if ((dist.get(current) ?? 0) >= 2) continue;
      for (const next of adjacency.get(current) ?? []) {
        if (dist.has(next)) continue;
        dist.set(next, (dist.get(current) ?? 0) + 1);
        queue.push(next);
      }
    }
    distances.set(root.id, dist);
  }
  const shared = nodes.flatMap((node) => {
    if (primaryIds.has(node.id)) return [];
    const edges = incident.get(node.id) ?? [];
    const reached = primary.flatMap((root) => {
      const distance = distances.get(root.id)?.get(node.id);
      return distance == null ? [] : [{root, distance}];
    });
    const minDistance = Math.min(...reached.map((x) => x.distance));
    const roots = reached.filter((x) => x.distance === minDistance)
      .map((x) => x.root);
    // One or two hops catches the visible bridge band without declaring every
    // distant boundary in a large component an intermediary.
    if (roots.length < 2 || minDistance > 2) return [];
    let money = 0;
    let txns = 0;
    let calls = 0;
    for (const l of edges) {
      money += l.facts?.txnTotal ?? 0;
      txns += l.facts?.txnCount ?? 0;
      calls += l.facts?.callCount ?? 0;
    }
    return [{node, roots, distance: minDistance, money, txns, calls}];
  }).sort((a, b) => b.roots.length - a.roots.length
    || b.money - a.money || b.txns - a.txns || b.calls - a.calls);

  return shared;
}

export interface MoneyFlowRow {
  id: string;
  source: NetworkNode;
  target: NetworkNode;
  amount: number;
  directed: boolean;
  soft: boolean;
}

/** Derive every lower panel from the already case/noise/visibility-scoped scene. */
export function analyseGraph(nodes: NetworkNode[], input: NetworkLink[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = input.filter(l => byId.has(l.source) && byId.has(l.target));
  const owner = new Map(links.filter(l => l.kind === "owns")
    .map(l => [l.target, l.source]));
  const person = (id: string) => byId.get(owner.get(id) ?? id)!;
  const flow: MoneyFlowRow[] = [];
  links.forEach((l, i) => {
    if (l.kind !== "txn") return;
    const source = byId.get(l.source)!, target = byId.get(l.target)!;
    const add = (suffix: string, from: NetworkNode, to: NetworkNode,
      amount: number, directed: boolean) => {
      if (Number.isFinite(amount) && amount > 0) flow.push({
        id: `${i}:${suffix}`, source: from, target: to, amount, directed, soft: !!l.soft});
    };
    // Inferred/name-only edges carry no verified direction, even if a future
    // caller supplies directional facts on them.
    const out = l.soft ? 0 : Math.max(0, l.facts?.moneyOut ?? 0);
    const incoming = l.soft ? 0 : Math.max(0, l.facts?.moneyIn ?? 0);
    add("out", source, target, out, true);
    add("in", target, source, incoming, true);
    add("unknown", source, target,
      Math.max(0, (l.facts?.txnTotal ?? 0) - out - incoming), false);
  });
  flow.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  // Include structural ownership only as context, never as an evidence row.
  const scene = (evidence: NetworkLink[]) => {
    const keep = new Set(evidence.flatMap(l => [l.source, l.target]));
    for (const id of [...keep]) if (owner.has(id)) keep.add(owner.get(id)!);
    const selectedLinks = new Set(evidence);
    return {nodes: nodes.filter(n => keep.has(n.id)), links: links.filter(l =>
      selectedLinks.has(l) || (l.kind === "owns" && keep.has(l.source) && keep.has(l.target)))};
  };

  const shared = sharedGraphRelations(nodes, links);
  const sharedIds = new Set(shared.map(s => s.node.id));
  const sharedEdges = new Set(links.filter(l => l.kind !== "owns"
    && (sharedIds.has(l.source) || sharedIds.has(l.target))));
  const incident = new Map<string, NetworkLink[]>();
  for (const l of links) {
    if (l.kind === "owns") continue;
    for (const id of [l.source, l.target]) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id)!.push(l);
    }
  }
  // Complete each listed two-hop bridge to its named investigation centers.
  for (const item of shared) {
    for (const root of item.roots) {
      if (item.distance !== 2) continue;
      for (const first of incident.get(item.node.id) ?? []) {
        const mid = first.source === item.node.id ? first.target
          : first.target === item.node.id ? first.source : null;
        if (!mid) continue;
        for (const last of incident.get(root.id) ?? []) {
          if ((last.source === mid && last.target === root.id)
            || (last.target === mid && last.source === root.id)) {
            sharedEdges.add(first); sharedEdges.add(last);
          }
        }
      }
    }
  }
  const red = links.filter(l => l.kind !== "owns"
    && (person(l.source).offender || person(l.target).offender))
    .map((link, i) => ({id: String(i), link, source: byId.get(link.source)!,
      target: byId.get(link.target)!, sourcePerson: person(link.source),
      targetPerson: person(link.target)}))
    .sort((a, b) => (b.link.facts?.txnTotal ?? 0) - (a.link.facts?.txnTotal ?? 0)
      || (b.link.facts?.callCount ?? 0) - (a.link.facts?.callCount ?? 0));
  const unknownPairs = new Set(flow.filter(r => !r.directed)
    .map(r => JSON.stringify([r.source.id, r.target.id])));
  return {flow, shared, red, sharedScene: scene([...sharedEdges]),
    redScene: offenderOnlyScene(nodes, links),
    undirectedScene: scene(links.filter(l => l.kind === "txn"
      && unknownPairs.has(JSON.stringify([l.source, l.target]))))};
}
