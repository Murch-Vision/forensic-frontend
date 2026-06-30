/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : networkGraph.ts
 * Created at  : 2026-06-30
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

// Builds the link-chart force graph from real suspects + suspect links. Each
// suspect becomes a PERSON node; every distinct organization becomes a GROUP
// hub its members attach to, which also pulls the layout into per-org blobs.
// Suspect links become person-to-person edges, so the graph mirrors the
// "Холбоосын жагсаалт" table exactly — no fabricated data.

export type NetworkNodeType =
  | "COMMAND"
  | "GROUP"
  | "PERSON"
  | "LOCATION"
  | "EXTERNAL";

export interface NetworkNode {
  id    : string;
  label : string;
  type  : NetworkNodeType;
  // Relative emphasis 0.6..1.6 — scales the rendered radius.
  weight : number;
  // Cell this node belongs to — used for cluster layout.
  cluster : string;
}

export interface NetworkLink {
  source : string;
  target : string;
  // 1 weak .. 4 strong — scales stroke width.
  strength : number;
}

interface GraphSuspect {
  id           : number;
  fullName     : string;
  riskLevel    : string;
  organization : string | null;
}

interface GraphLink {
  sourceSuspectId : number;
  targetSuspectId : number;
  strength        : number;
}

// Higher risk draws a bigger node.
const RISK_WEIGHT: Record<string, number> = {
  CRITICAL : 1.5,
  HIGH     : 1.25,
  MEDIUM   : 1.0,
  LOW      : 0.8,
};

const NO_ORG = "Байгууллагагүй";

export function buildNetwork(
  suspects : GraphSuspect[],
  links    : GraphLink[]
): {nodes: NetworkNode[]; links: NetworkLink[]} {
  const nodes: NetworkNode[] = [];
  const out: NetworkLink[] = [];
  const orgIds = new Map<string, string>();

  for (const s of suspects) {
    const org = s.organization?.trim() || NO_ORG;
    if (org !== NO_ORG && !orgIds.has(org)) {
      const orgId = `org:${org}`;
      orgIds.set(org, orgId);
      nodes.push({
        id      : orgId,
        label   : org,
        type    : "GROUP",
        weight  : 1.3,
        cluster : org,
      });
    }
    const personId = `s:${s.id}`;
    nodes.push({
      id      : personId,
      label   : s.fullName,
      type    : "PERSON",
      weight  : RISK_WEIGHT[s.riskLevel] ?? 1.0,
      cluster : org,
    });
    const orgId = orgIds.get(org);
    if (orgId) out.push({source: personId, target: orgId, strength: 2});
  }

  const present = new Set(nodes.map((n) => n.id));
  for (const l of links) {
    const source = `s:${l.sourceSuspectId}`;
    const target = `s:${l.targetSuspectId}`;
    if (!present.has(source) || !present.has(target)) continue;
    out.push({source, target, strength: Math.max(1, l.strength)});
  }

  return {nodes, links: out};
}
