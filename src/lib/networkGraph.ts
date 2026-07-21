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
// direct edges. Only case entities are drawn (user wish): no organization
// hubs and no external-party nodes — an edge exists only when BOTH ends are
// a known suspect / account / phone.

export type NetworkNodeType = "PERSON" | "ACCOUNT" | "PHONE";

export type NetworkLinkKind = "owns" | "txn" | "call" | "intel" | "manual";

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
  // For PERSON nodes: the suspect's photo (data URI), drawn in place of the
  // generic 👤 icon when present.
  photoData? : string | null;
}

export interface NetworkLink {
  source : string;
  target : string;
  // 1 weak .. 4 strong — scales stroke width.
  strength : number;
  kind : NetworkLinkKind;
  // Shown at the edge midpoint while hovered.
  label? : string;
  // For analyst-drawn "manual" links: the suspect_links row id, so the edge
  // can be edited / deleted straight from the graph.
  linkId? : number;
  // A "soft" edge draws only between nodes that are ALREADY visible — it never
  // pulls a new node onto the canvas. Used for name-matched FINANCIAL_TRANSFER
  // links that are merged into the money view: they enrich the graph without
  // re-bushing it with everyone the generator connected by name alone.
  soft? : boolean;
}

interface GraphSuspect {
  id           : number;
  fullName     : string;
  riskLevel    : string;
  organization : string | null;
  photoData?   : string | null;
}

interface GraphSuspectLink {
  id              : number;
  sourceSuspectId : number;
  targetSuspectId : number;
  linkType        : string;
  description     : string | null;
  strength        : number;
  totalFinancialValue? : number | null;
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
): {nodes: NetworkNode[]; links: NetworkLink[]} {
  const nodes = new Map<string, NetworkNode>();
  const links: NetworkLink[] = [];
  const suspectNode = new Map<number, string>();

  // --- Suspects --------------------------------------------------------------
  // A "real" suspect has an actual name. Imports create ONE placeholder record
  // (name "-", UNKNOWN) and pile every account they couldn't attribute onto it,
  // so folding those dozens of unrelated accounts into that single node would
  // invent a giant false "unknown person" hub. Skip such placeholder people —
  // their accounts fall back to standalone account nodes (holder unknown).
  const hasRealName = (name: string | null | undefined) =>
    /[\p{L}\p{N}]/u.test(name ?? "");
  for (const s of suspects) {
    if (!hasRealName(s.fullName)) continue;
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
      photoData : s.photoData ?? null,
    });
  }

  // --- Bank accounts --------------------------------------------------------
  // An account OWNED by a known suspect is folded straight INTO that person —
  // no separate account avatar — so the chart isn't a bush of one-account
  // satellites; its money hangs directly off the owner. An account with NO
  // known owner keeps its own node (fallback) so unattributed money still
  // shows. `accountEndpoint` maps each account id to the node its transactions
  // should attach to (the owner person, or the fallback account node), and
  // `accountByNumber` resolves a counterparty number to that same endpoint.
  const accountByNumber = new Map<string, string>();  // digits → endpoint id
  const accountEndpoint = new Map<number, string>();  // account id → endpoint
  for (const a of accounts) {
    // Skip placeholder accounts (number blank or just "-") — junk from imports.
    if (!hasRealName(a.accountNumber)) continue;
    const owner = a.suspectId != null ? suspectNode.get(a.suspectId) : null;
    let endpoint: string;
    if (owner) {
      // Folded into the person — list the bank + masked number on the owner so
      // the account stays identifiable (and searchable) in the detail panel.
      endpoint = owner;
      nodes.get(owner)?.stats.push(
        [a.bankName || "Данс", a.maskedNumber || a.accountNumber]);
    } else {
      const accId = `a:${a.id}`;
      endpoint = accId;
      nodes.set(accId, {
        id      : accId,
        label   : a.bankName || "Данс",
        type    : "ACCOUNT",
        weight  : 0.9,
        cluster : accId,
        sub     : a.maskedNumber || a.accountNumber,
        stats   : [["Дансны дугаар", a.accountNumber]],
      });
    }
    accountEndpoint.set(a.id, endpoint);
    const num = digits(a.accountNumber);
    if (num) accountByNumber.set(num, endpoint);
  }

  // --- Transactions aggregated per known account pair ------------------------
  // Only counterparties that resolve to an account in the case draw an edge.
  interface TxnAgg {from: string; to: string; count: number; total: number}
  const txnAgg = new Map<string, TxnAgg>();
  const accById = new Map(accounts.map((a) => [a.id, a]));
  for (const t of transactions) {
    if (!accById.has(t.bankAccountId)) continue;
    const from = accountEndpoint.get(t.bankAccountId);
    if (!from) continue;
    const cpNum = digits(t.counterpartyAccount);
    const to = cpNum ? accountByNumber.get(cpNum) : undefined;
    // `to === from` drops internal transfers between one owner's own accounts.
    if (!to || to === from) continue;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    let agg = txnAgg.get(key);
    if (!agg) {
      agg = {from, to, count: 0, total: 0};
      txnAgg.set(key, agg);
    }
    agg.count += 1;
    agg.total += Math.abs(t.amount);
  }
  // Canonical key for an undirected node pair — used to dedupe the money edges
  // that a FINANCIAL_TRANSFER suspect-link would otherwise draw on top of.
  const pairKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const moneyPairs = new Set<string>();
  for (const agg of txnAgg.values()) {
    moneyPairs.add(pairKey(agg.from, agg.to));
    links.push({
      source   : agg.from,
      target   : agg.to,
      strength : txnStrength(agg.count),
      kind     : "txn",
      label    : `${agg.count} гүйлгээ · ${formatMoney(agg.total)}`,
    });
  }

  // Transaction totals for the detail panel, aggregated onto whichever node the
  // account folded into (the owner person, or the fallback account node).
  const endpointTotals =
    new Map<string, {n: number; inflow: number; outflow: number}>();
  for (const t of transactions) {
    const ep = accById.has(t.bankAccountId)
      ? accountEndpoint.get(t.bankAccountId) : undefined;
    if (!ep) continue;
    const st = endpointTotals.get(ep) ?? {n: 0, inflow: 0, outflow: 0};
    st.n += 1;
    if (t.amount >= 0) st.inflow += t.amount;
    else st.outflow += -t.amount;
    endpointTotals.set(ep, st);
  }
  for (const [ep, st] of endpointTotals) {
    const node = nodes.get(ep);
    if (!node) continue;
    node.stats.push(
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
  for (const c of calls) {
    const own = suspectNode.get(c.suspectId ?? -1) ?? null;
    const callerKey = last8(c.callerNumber);
    const calledKey = last8(c.calledNumber);
    let a = callerKey ? phoneNode.get(callerKey) ?? null : null;
    let b = calledKey ? phoneNode.get(calledKey) ?? null : null;
    // The record's suspect stands in for THEIR unregistered side (picked by
    // direction). A side that stays unknown drops the call from the chart —
    // only connections between case entities are drawn.
    if (!a && own && c.direction !== "INCOMING") a = own;
    if (!b && own && c.direction === "INCOMING") b = own;
    if (!a || !b || a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    let agg = callAgg.get(key);
    if (!agg) {
      agg = {a, b, count: 0, seconds: 0};
      callAgg.set(key, agg);
    }
    agg.count += 1;
    agg.seconds += c.durationSeconds;
  }

  const phoneTotals = new Map<string, {count: number; seconds: number}>();
  for (const agg of callAgg.values()) {
    for (const side of [agg.a, agg.b]) {
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
    if (!n || n.type !== "PHONE") continue;
    n.stats.push(
      ["Дуудлага", formatNum(st.count)],
      ["Нийт хугацаа", `${Math.round(st.seconds / 60)} мин`]);
  }

  // --- Suspect ↔ suspect links -----------------------------------------------
  // Auto-generated intelligence links ("intel") share the rendering with the
  // analyst's own hand-drawn relationships ("manual"), but manual ones are kept
  // visible at all times and carry their row id so they can be edited/deleted.
  for (const l of suspectLinks) {
    const source = suspectNode.get(l.sourceSuspectId);
    const target = suspectNode.get(l.targetSuspectId);
    if (!source || !target || source === target) continue;
    if (l.linkType === "MANUAL") {
      links.push({source, target, strength: Math.max(2, l.strength),
        kind: "manual", label: l.description ?? "Холбоос", linkId: l.id});
    } else if (l.linkType === "FINANCIAL_TRANSFER") {
      // A FINANCIAL_TRANSFER suspect-link and a raw-transaction "Гүйлгээ" edge
      // are the SAME money between two people — one matched by account number,
      // the other also by name / national-id. Merge them into ONE green money
      // edge: if this pair already has a Гүйлгээ edge, drop the duplicate;
      // otherwise draw this AS the money edge (it caught a link the raw
      // account-number aggregation missed, e.g. we only hold one side's
      // statement and it merely NAMES the counterparty).
      const key = pairKey(source, target);
      if (moneyPairs.has(key)) continue;
      moneyPairs.add(key);
      // Soft: shown only if BOTH people are already on the canvas (kept by
      // verified money/calls). A name-only match to an otherwise-isolated
      // person stays hidden, so the graph doesn't re-bush.
      links.push({source, target, strength: Math.max(1, l.strength),
        kind: "txn", soft: true,
        label: l.totalFinancialValue != null
          ? `Гүйлгээ · ${formatMoney(l.totalFinancialValue)}`
          : l.description ?? "Гүйлгээ"});
    }
    // Non-financial auto links (PHONE_CONTACT, SHARED_DEVICE, ...) are NOT
    // drawn as a separate purple "Хамаарал" edge: phone contact is already
    // shown by the cyan call edges (person→phone→call→phone→person), so a
    // parallel magenta line was just confusing duplication. Only money (green)
    // and calls (cyan) — plus ownership and manual links — remain.
  }

  // Person summary rows now that everything is counted (owned accounts are
  // already listed individually above, so only the phone count is added here).
  for (const s of suspects) {
    const personId = suspectNode.get(s.id);
    if (!personId) continue;   // skipped placeholder suspect
    const person = nodes.get(personId);
    if (!person) continue;
    const nPhones = phones.filter((p) => p.suspectId === s.id).length;
    if (nPhones) person.stats.push(["Утас", formatNum(nPhones)]);
  }

  return {nodes: [...nodes.values()], links};
}
