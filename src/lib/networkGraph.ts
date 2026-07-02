/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : networkGraph.ts
 * Created at  : 2026-06-30
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/

import {formatMoney, formatNum} from "./format";

// Builds the link-chart force graph from the case's REAL evidence: suspects,
// their bank accounts and phones, transactions aggregated per account pair
// and calls aggregated per phone pair. Counterparty account numbers are
// matched against known accounts so money paths BETWEEN suspects surface as
// direct edges; unmatched counterparties become external nodes (top-N by
// volume so the chart stays readable — the hidden remainder is reported).

export type NetworkNodeType =
  | "PERSON"
  | "GROUP"
  | "ACCOUNT"
  | "PHONE"
  | "EXTERNAL";

export type NetworkLinkKind = "owns" | "txn" | "call" | "intel";

export interface NetworkNode {
  id    : string;
  label : string;
  type  : NetworkNodeType;
  // Relative emphasis 0.6..1.6 — scales the rendered radius.
  weight : number;
  // Cell this node belongs to — used for cluster layout.
  cluster : string;
  // Secondary line under the label (account number, phone, …).
  sub? : string;
  // [label, value] rows for the detail panel.
  stats : Array<[string, string]>;
}

export interface NetworkLink {
  source : string;
  target : string;
  // 1 weak .. 4 strong — scales stroke width.
  strength : number;
  kind : NetworkLinkKind;
  // Shown at the edge midpoint while hovered.
  label? : string;
}

interface GraphSuspect {
  id           : number;
  fullName     : string;
  riskLevel    : string;
  organization : string | null;
}

interface GraphSuspectLink {
  sourceSuspectId : number;
  targetSuspectId : number;
  linkType        : string;
  strength        : number;
}

interface GraphAccount {
  id            : number;
  accountNumber : string;
  bankName      : string;
  maskedNumber  : string;
  suspectId     : number | null;
}

interface GraphTransaction {
  bankAccountId       : number;
  amount              : number;
  type                : string;
  counterpartyAccount : string | null;
  counterpartyName    : string | null;
}

interface GraphCall {
  callerNumber    : string;
  calledNumber    : string;
  durationSeconds : number;
  direction       : string | null;
  suspectId       : number | null;
}

interface GraphPhone {
  suspectId : number;
  number    : string;
}

// Higher risk draws a bigger node.
const RISK_WEIGHT: Record<string, number> = {
  CRITICAL : 1.5,
  HIGH     : 1.25,
  MEDIUM   : 1.0,
  LOW      : 0.8,
};

const RISK_LABEL: Record<string, string> = {
  CRITICAL : "Ноцтой",
  HIGH     : "Өндөр",
  MEDIUM   : "Дунд",
  LOW      : "Бага",
};

// Keep only this many external counterparty accounts / phone numbers (by
// volume) so a big statement import doesn't turn the chart into a hairball.
const MAX_EXTERNAL = 15;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const last8 = (s: string) => digits(s).slice(-8);

function txnStrength(count: number): number {
  return count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
}

export function buildEvidenceNetwork(
  suspects     : GraphSuspect[],
  suspectLinks : GraphSuspectLink[],
  accounts     : GraphAccount[],
  transactions : GraphTransaction[],
  calls        : GraphCall[],
  phones       : GraphPhone[]
): {nodes: NetworkNode[]; links: NetworkLink[]; hiddenExternal: number} {
  const nodes = new Map<string, NetworkNode>();
  const links: NetworkLink[] = [];
  const suspectNode = new Map<number, string>();
  const orgIds = new Map<string, string>();

  // --- Suspects (+ their organizations as hub nodes) -----------------------
  for (const s of suspects) {
    const personId = `s:${s.id}`;
    suspectNode.set(s.id, personId);
    nodes.set(personId, {
      id      : personId,
      label   : s.fullName,
      type    : "PERSON",
      weight  : RISK_WEIGHT[s.riskLevel] ?? 1.0,
      cluster : personId,
      sub     : s.organization ?? undefined,
      stats   : [["Эрсдэл", RISK_LABEL[s.riskLevel] ?? s.riskLevel]],
    });
    const org = s.organization?.trim();
    if (org) {
      let orgId = orgIds.get(org);
      if (!orgId) {
        orgId = `org:${org}`;
        orgIds.set(org, orgId);
        nodes.set(orgId, {
          id      : orgId,
          label   : org,
          type    : "GROUP",
          weight  : 1.3,
          cluster : orgId,
          stats   : [],
        });
      }
      links.push({source: personId, target: orgId, strength: 2, kind: "owns"});
    }
  }

  // --- Owned bank accounts --------------------------------------------------
  // Known account numbers → node ids, so counterparty numbers can be matched
  // back to accounts inside the case (suspect ↔ suspect money paths).
  const accountByNumber = new Map<string, string>();
  for (const a of accounts) {
    const accId = `a:${a.id}`;
    const owner = a.suspectId != null ? suspectNode.get(a.suspectId) : null;
    nodes.set(accId, {
      id      : accId,
      label   : a.bankName || "Данс",
      type    : "ACCOUNT",
      weight  : 0.9,
      cluster : owner ?? accId,
      sub     : a.maskedNumber || a.accountNumber,
      stats   : [["Дансны дугаар", a.accountNumber]],
    });
    const num = digits(a.accountNumber);
    if (num) accountByNumber.set(num, accId);
    if (owner) {
      links.push({source: owner, target: accId, strength: 2, kind: "owns"});
    }
  }

  // --- Transactions aggregated per (account, counterparty) pair -------------
  interface TxnAgg {
    from: string; toKey: string; toName: string;
    count: number; total: number; inflow: number; outflow: number;
  }
  const txnAgg = new Map<string, TxnAgg>();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  for (const t of transactions) {
    if (!accById.has(t.bankAccountId)) continue;
    const from = `a:${t.bankAccountId}`;
    const cpNum = digits(t.counterpartyAccount);
    const matched = cpNum ? accountByNumber.get(cpNum) : undefined;
    const toKey = matched
      ?? (cpNum ? `x:${cpNum}`
        : t.counterpartyName ? `x:${t.counterpartyName.trim().toLowerCase()}`
        : "");
    if (!toKey || toKey === from) continue;
    const key = from < toKey ? `${from}|${toKey}` : `${toKey}|${from}`;
    let agg = txnAgg.get(key);
    if (!agg) {
      agg = {from, toKey,
        toName: t.counterpartyName?.trim()
          || t.counterpartyAccount?.trim() || "Тодорхойгүй",
        count: 0, total: 0, inflow: 0, outflow: 0};
      txnAgg.set(key, agg);
    }
    agg.count += 1;
    agg.total += Math.abs(t.amount);
    if (t.amount >= 0) agg.inflow += t.amount;
    else agg.outflow += -t.amount;
  }

  // External counterparties: keep the top MAX_EXTERNAL by moved volume.
  const extVolume = new Map<string, number>();
  for (const agg of txnAgg.values()) {
    if (agg.toKey.startsWith("x:")) {
      extVolume.set(agg.toKey,
        (extVolume.get(agg.toKey) ?? 0) + agg.total);
    }
  }
  const keptExt = new Set([...extVolume.entries()]
    .sort((p, q) => q[1] - p[1])
    .slice(0, MAX_EXTERNAL)
    .map(([k]) => k));
  let hiddenExternal = extVolume.size - keptExt.size;

  const extStats = new Map<string, {count: number; total: number}>();
  for (const agg of txnAgg.values()) {
    const isExt = agg.toKey.startsWith("x:");
    if (isExt && !keptExt.has(agg.toKey)) continue;
    if (isExt && !nodes.has(agg.toKey)) {
      nodes.set(agg.toKey, {
        id      : agg.toKey,
        label   : agg.toName,
        type    : "EXTERNAL",
        weight  : 0.8,
        cluster : agg.from,
        sub     : agg.toKey.startsWith("x:") && /^\d+$/.test(agg.toKey.slice(2))
          ? agg.toKey.slice(2) : undefined,
        stats   : [],
      });
    }
    if (isExt) {
      const st = extStats.get(agg.toKey) ?? {count: 0, total: 0};
      st.count += agg.count;
      st.total += agg.total;
      extStats.set(agg.toKey, st);
    }
    links.push({
      source   : agg.from,
      target   : agg.toKey,
      strength : txnStrength(agg.count),
      kind     : "txn",
      label    : `${agg.count} гүйлгээ · ${formatMoney(agg.total)}`,
    });
  }
  for (const [id, st] of extStats) {
    nodes.get(id)!.stats.push(
      ["Гүйлгээ", formatNum(st.count)],
      ["Нийт дүн", formatMoney(st.total)]);
  }

  // Per-account transaction totals for the detail panel.
  const accTotals = new Map<number, {n: number; inflow: number; outflow: number}>();
  for (const t of transactions) {
    const st = accTotals.get(t.bankAccountId) ?? {n: 0, inflow: 0, outflow: 0};
    st.n += 1;
    if (t.amount >= 0) st.inflow += t.amount;
    else st.outflow += -t.amount;
    accTotals.set(t.bankAccountId, st);
  }
  for (const a of accounts) {
    const st = accTotals.get(a.id);
    if (!st) continue;
    nodes.get(`a:${a.id}`)!.stats.push(
      ["Гүйлгээ", formatNum(st.n)],
      ["Орлого", formatMoney(st.inflow)],
      ["Зарлага", formatMoney(st.outflow)]);
  }

  // --- Suspect phones + calls aggregated per number pair ---------------------
  const phoneNode = new Map<string, string>();  // last8 → node id
  for (const p of phones) {
    const key = last8(p.number);
    if (!key || phoneNode.has(key)) continue;
    const owner = suspectNode.get(p.suspectId);
    const phoneId = `p:${key}`;
    phoneNode.set(key, phoneId);
    nodes.set(phoneId, {
      id      : phoneId,
      label   : p.number,
      type    : "PHONE",
      weight  : 0.75,
      cluster : owner ?? phoneId,
      stats   : [],
    });
    if (owner) {
      links.push({source: owner, target: phoneId, strength: 2, kind: "owns"});
    }
  }

  interface CallAgg {a: string; b: string; count: number; seconds: number}
  const callAgg = new Map<string, CallAgg>();
  const extCallCount = new Map<string, number>();
  for (const c of calls) {
    const own = suspectNode.get(c.suspectId ?? -1) ?? null;
    const callerKey = last8(c.callerNumber);
    const calledKey = last8(c.calledNumber);
    let a = callerKey ? phoneNode.get(callerKey) ?? null : null;
    let b = calledKey ? phoneNode.get(calledKey) ?? null : null;
    // When neither number is a registered phone, the record's suspect stands
    // in for THEIR side of the call (picked by direction); the other side
    // stays an external number — never both, or the edge would collapse.
    if (!a && !b && own) {
      if (c.direction === "INCOMING") {
        b = own;
        a = callerKey ? `xp:${callerKey}` : null;
      } else {
        a = own;
        b = calledKey ? `xp:${calledKey}` : null;
      }
    } else {
      if (!a) a = callerKey ? `xp:${callerKey}` : own;
      if (!b) b = calledKey ? `xp:${calledKey}` : own;
    }
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let agg = callAgg.get(key);
    if (!agg) {
      agg = {a, b, count: 0, seconds: 0};
      callAgg.set(key, agg);
    }
    agg.count += 1;
    agg.seconds += c.durationSeconds;
    for (const side of [a, b]) {
      if (side.startsWith("xp:")) {
        extCallCount.set(side, (extCallCount.get(side) ?? 0) + 1);
      }
    }
  }

  const keptExtPhones = new Set([...extCallCount.entries()]
    .sort((p, q) => q[1] - p[1])
    .slice(0, MAX_EXTERNAL)
    .map(([k]) => k));
  hiddenExternal += extCallCount.size - keptExtPhones.size;

  const phoneTotals = new Map<string, {count: number; seconds: number}>();
  for (const agg of callAgg.values()) {
    const drop = [agg.a, agg.b].some(
      (s) => s.startsWith("xp:") && !keptExtPhones.has(s));
    if (drop) continue;
    for (const side of [agg.a, agg.b]) {
      if (side.startsWith("xp:") && !nodes.has(side)) {
        const other = side === agg.a ? agg.b : agg.a;
        nodes.set(side, {
          id      : side,
          label   : side.slice(3),
          type    : "EXTERNAL",
          weight  : 0.75,
          cluster : nodes.get(other)?.cluster ?? side,
          stats   : [],
        });
      }
      const st = phoneTotals.get(side) ?? {count: 0, seconds: 0};
      st.count += agg.count;
      st.seconds += agg.seconds;
      phoneTotals.set(side, st);
    }
    links.push({
      source   : agg.a,
      target   : agg.b,
      strength : txnStrength(agg.count),
      kind     : "call",
      label    : `${agg.count} дуудлага · ${Math.round(agg.seconds / 60)} мин`,
    });
  }
  for (const [id, st] of phoneTotals) {
    const n = nodes.get(id);
    if (!n || (n.type !== "PHONE" && n.type !== "EXTERNAL")) continue;
    if (n.stats.some(([l]) => l === "Дуудлага")) continue;
    n.stats.push(
      ["Дуудлага", formatNum(st.count)],
      ["Нийт хугацаа", `${Math.round(st.seconds / 60)} мин`]);
  }

  // --- Intelligence links (suspect ↔ suspect) --------------------------------
  for (const l of suspectLinks) {
    const source = suspectNode.get(l.sourceSuspectId);
    const target = suspectNode.get(l.targetSuspectId);
    if (!source || !target || source === target) continue;
    links.push({source, target, strength: Math.max(1, l.strength),
      kind: "intel", label: l.linkType});
  }

  // Person summary rows now that everything is counted.
  for (const s of suspects) {
    const personId = suspectNode.get(s.id)!;
    const person = nodes.get(personId)!;
    const nAcc = accounts.filter((a) => a.suspectId === s.id).length;
    const nPhones = phones.filter((p) => p.suspectId === s.id).length;
    if (nAcc) person.stats.push(["Данс", formatNum(nAcc)]);
    if (nPhones) person.stats.push(["Утас", formatNum(nPhones)]);
  }

  return {nodes: [...nodes.values()], links, hiddenExternal};
}
