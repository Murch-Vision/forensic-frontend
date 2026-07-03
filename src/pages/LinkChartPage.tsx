/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LinkChartPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {useMutation, useQuery} from "@apollo/client";
import {
  CALL_RECORDS_QUERY,
  GENERATE_LINKS,
  LINKCHART_QUERY,
  NETWORK_FLOW_QUERY,
  TRANSACTIONS_QUERY,
} from "../graphql/queries";
import {
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  SankeyChart,
} from "../components/kit";
import NetworkGraph from "../components/NetworkGraph";
import CaseGate from "../components/CaseGate";
import {useDrilldown} from "../lib/drilldown";
import {
  ignorePairs,
  isBelowMin,
  matchesDescRules,
  pairKey,
  setMinAmount,
  useIgnoredDesc,
  useIgnoredPairs,
  useIgnoredTxns,
  useMinAmount,
} from "../lib/ignoredPairs";
import {formatMoney} from "../lib/format";
import {buildEvidenceNetwork} from "../lib/networkGraph";
import type {NetworkLink, NetworkNode} from "../lib/networkGraph";
import type {SuspectLinkType} from "../types";

// The case's connection map: suspects, accounts and phones from the ACTUAL
// imported evidence, with transactions/calls aggregated into weighted edges.

interface LcSuspect {
  id           : number;
  suspectId    : string;
  fullName     : string;
  riskLevel    : string;
  organization : string | null;
  initials     : string;
  photoData    : string | null;
}

interface LcLink {
  id              : number;
  sourceSuspectId : number;
  targetSuspectId : number;
  linkType        : SuspectLinkType;
  description     : string | null;
  strength        : number;
  totalFinancialValue : number | null;
  totalCallCount  : number | null;
  confidenceLevel : string;
}

interface LcData {
  suspects     : LcSuspect[];
  suspectLinks : LcLink[];
}

interface TxData {
  bankAccounts: Array<{
    id: number; accountNumber: string; bankName: string;
    maskedNumber: string; suspectId: number | null;
  }>;
  transactions: Array<{
    id: number; bankAccountId: number; amount: number; type: string;
    counterpartyAccount: string | null; counterpartyName: string | null;
    description: string | null;
  }>;
}

interface CallData {
  callRecords: Array<{
    id: number; callerNumber: string; calledNumber: string;
    durationSeconds: number; direction: string | null;
    suspectId: number | null;
  }>;
  suspects: Array<{
    id: number; fullName: string; riskLevel: string;
    phoneNumbers: Array<{id: number; number: string}>;
  }>;
}

const NODE_TYPE_LABEL: Record<string, string> = {
  PERSON  : "Сэжигтэн",
  ACCOUNT : "Данс",
  PHONE   : "Утас",
};

export default function LinkChartPage() {
  const {data, loading, refetch} = useQuery<LcData>(LINKCHART_QUERY);
  const txQ = useQuery<TxData>(TRANSACTIONS_QUERY);
  const callQ = useQuery<CallData>(CALL_RECORDS_QUERY);
  const flowQ = useQuery<{networkFlow: {
    nodeLabels: string[]; nodeColors: string[]; sourceIndices: number[];
    targetIndices: number[]; values: number[]; linkColors: string[];
  }}>(NETWORK_FLOW_QUERY);
  const [generate, {loading: generating}] = useMutation(GENERATE_LINKS);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  // Clicked EDGE — the noise-removal target (a whole connection at once).
  const [selectedLink, setSelectedLink] = useState<NetworkLink | null>(null);
  // Money floor input (commits on button/Enter — nothing while typing).
  const [floorText, setFloorText] = useState("");
  // Selected node = a drilldown; surface it in the header breadcrumb.
  useDrilldown(selected?.label ?? null);
  // Pairs the analyst marked "not important" on the Transactions page. Both
  // their edge AND the counterparty node are removed from the graph here.
  const ignoredPairs = useIgnoredPairs();
  const ignoredTxns = useIgnoredTxns();
  const descRules = useIgnoredDesc();
  const minAmount = useMinAmount();
  // Nodes the analyst removed by clicking them in the graph. Persisted so the
  // decluttered view survives reloads.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(
        localStorage.getItem("forensic.hiddenNodes") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  function saveHidden(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem("forensic.hiddenNodes", JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  function hideNode(id: string) {
    const next = new Set(hidden);
    next.add(id);
    saveHidden(next);
    setSelected(null);
  }
  function restoreNodes() {
    saveHidden(new Set());
  }

  async function onGenerate() {
    await generate();
    await refetch();
  }

  // Commit the money floor typed on the graph card — every transaction below
  // it drops from the graph (and the whole Transactions page) instantly.
  function commitFloor() {
    setMinAmount(Number(floorText.replace(/[^\d.]/g, "")) || 0);
  }

  // Remove a clicked transaction edge: mark EVERY account→counterparty pair
  // that feeds this graph edge (both directions) unimportant. Shares the
  // ignored-pairs store with the Transactions page, so it is restorable from
  // /transactions?view=removed.
  function removeTxnEdge(link: NetworkLink) {
    if (!txQ.data) return;
    const aId = Number(link.source.slice(2));  // "a:12" → 12
    const bId = Number(link.target.slice(2));
    const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const idByNumber = new Map(txQ.data.bankAccounts
      .map((a) => [onlyDigits(a.accountNumber), a.id]));
    const keys = new Set<string>();
    for (const t of txQ.data.transactions) {
      const cp = t.counterpartyAccount?.trim();
      if (!cp) continue;
      const toId = idByNumber.get(onlyDigits(cp));
      if (toId == null) continue;
      if ((t.bankAccountId === aId && toId === bId)
        || (t.bankAccountId === bId && toId === aId)) {
        keys.add(pairKey(t.bankAccountId, cp));
      }
    }
    if (keys.size) ignorePairs([...keys]);
    setSelectedLink(null);
  }

  const network = useMemo(() => {
    if (!data || !txQ.data || !callQ.data) return null;
    const accounts = txQ.data.bankAccounts;
    const phones = callQ.data.suspects.flatMap((s) =>
      s.phoneNumbers.map((p) => ({suspectId: s.id, number: p.number})));

    const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const idByNumber = new Map(
      accounts.map((a) => [onlyDigits(a.accountNumber), a.id]));
    const canon = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;

    // Each ignored pair "A→B": drop the A↔B edge (both directions). A node
    // only disappears once it has NO money edges left — so a big counterparty
    // that also happens to be in a small (removed) pair is NOT lost.
    const ignoredEdges = new Set<string>();
    for (const key of ignoredPairs) {
      const [fromStr, cpNum] = key.split("→");
      const fromId = Number(fromStr);
      const toId = idByNumber.get(onlyDigits(cpNum));
      if (toId != null) ignoredEdges.add(canon(fromId, toId));
    }
    const txns = txQ.data.transactions.filter((t) => {
      // Individually removed on the Txns page — never an edge.
      if (ignoredTxns.has(t.id)) return false;
      // Small money the analyst floored out on the Txns page — never an edge.
      if (isBelowMin(t.amount, minAmount)) return false;
      // Description-noise (organisation formats) marked on the Txns page.
      if (matchesDescRules(t.description, descRules)) return false;
      const toId = t.counterpartyAccount
        ? idByNumber.get(onlyDigits(t.counterpartyAccount)) : undefined;
      if (toId == null) return true;  // external counterparty — never an edge
      return !ignoredEdges.has(canon(t.bankAccountId, toId));
    });

    const net = buildEvidenceNetwork(
      data.suspects,
      data.suspectLinks,
      accounts,
      txns,
      callQ.data.callRecords,
      phones
    );

    // Money/call flow only (the auto-generated "intel" links connect nearly
    // everyone — the purple hairball — so they don't keep a node alive).
    const flow = new Set<string>();
    for (const l of net.links) {
      if (l.kind === "txn" || l.kind === "call") {
        flow.add(l.source);
        flow.add(l.target);
      }
    }
    const owner = new Map<string, string>();  // account/phone id → person id
    for (const l of net.links) {
      if (l.kind === "owns") owner.set(l.target, l.source);
    }
    // Keep flow nodes + the owner person of any kept account. Accounts nobody
    // transacts with (edges all removed) and isolated ownership avatars drop.
    const keep = new Set(flow);
    for (const id of flow) {
      const o = owner.get(id);
      if (o) keep.add(o);
    }
    const nodes = net.nodes.filter((n) => keep.has(n.id) && !hidden.has(n.id));
    const links = net.links.filter((l) =>
      keep.has(l.source) && keep.has(l.target)
      && !hidden.has(l.source) && !hidden.has(l.target));
    return {nodes, links};
  }, [data, txQ.data, callQ.data, ignoredPairs, ignoredTxns, descRules,
    minAmount, hidden]);

  const actions = (
    <button className="btn btn-primary" onClick={onGenerate} disabled={generating}>
      {generating ? "БОЛОВСРУУЛЖ БАЙНА..." : "ХОЛБООС ҮҮСГЭХ"}
    </button>
  );

  if (loading || !data || !network) {
    return (
      <div className="page-container">
        <PageHeader icon="🕸" title="Холбоосын зураглал"
          subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />
        <CaseGate>
          <Loading />
        </CaseGate>
      </div>
    );
  }

  const suspects = data.suspects;
  const nameById = new Map(suspects.map((s) => [s.id, s.fullName]));
  const counts = {
    txn  : network.links.filter((l) => l.kind === "txn").length,
    call : network.links.filter((l) => l.kind === "call").length,
  };
  // Keep the links list consistent with the (filtered) graph: only links whose
  // BOTH suspects still appear as nodes. Otherwise the count contradicts what's
  // actually drawn after removing unimportant pairs.
  const shownSuspectIds = new Set(
    network.nodes.filter((n) => n.type === "PERSON")
      .map((n) => Number(n.id.slice(2))));
  const shownLinks = data.suspectLinks.filter((l) =>
    shownSuspectIds.has(l.sourceSuspectId)
    && shownSuspectIds.has(l.targetSuspectId));

  return (
    <div className="page-container">
      <PageHeader icon="🕸" title="Холбоосын зураглал"
        subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />
      <CaseGate>

      <Card
        title={`Нотлох баримтын сүлжээ — ${network.nodes.length} зангилаа, `
          + `${counts.txn} гүйлгээний + ${counts.call} дуудлагын холбоос`}
        actions={
          <div style={{display: "flex", gap: 8, alignItems: "center",
            flexWrap: "wrap"}}>
            {minAmount > 0 ? (
              <span className="badge" style={{display: "inline-flex",
                alignItems: "center", gap: 6}}>
                💰 {formatMoney(minAmount)}-с доош нуугдсан
                <button className="modal-close" style={{fontSize: 14}}
                  title="Босго арилгах"
                  onClick={() => {setMinAmount(0); setFloorText("");}}>
                  ×
                </button>
              </span>
            ) : (
              <>
                <input type="text" inputMode="numeric" className="form-input"
                  value={floorText}
                  onChange={(e) => setFloorText(e.target.value)}
                  onKeyDown={(e) => {if (e.key === "Enter") commitFloor();}}
                  placeholder="Хамгийн бага дүн ₮"
                  title="Энэ дүнгээс доош гүйлгээг зураглалаас нуух"
                  style={{width: 160}} />
                <button className="btn btn-danger" onClick={commitFloor}
                  disabled={!Number(floorText.replace(/[^\d.]/g, ""))}>
                  Нуух
                </button>
              </>
            )}
            {(ignoredPairs.size > 0 || minAmount > 0) && (
              <Link to="/transactions?view=removed" className="btn"
                title="Хассан бүх зүйлийг харах, буцаах">
                ↩ Хасагдсаныг сэргээх
              </Link>
            )}
            {hidden.size > 0 && (
              <button className="btn" onClick={restoreNodes}
                title="Хасагдсан зангилаануудыг буцааж харуулах">
                ↩ Зангилаа ({hidden.size})
              </button>
            )}
          </div>
        }
        style={{marginBottom: 16}}>
        {network.nodes.length > 0 ? (
          <div style={{position: "relative"}}>
            <NetworkGraph nodes={network.nodes} links={network.links}
              onNodeClick={setSelected} onLinkClick={setSelectedLink} />
            {selected && (
              <div className="graph-detail-panel">
                <div className="graph-detail-head">
                  <div>
                    <div className="graph-detail-type">
                      {NODE_TYPE_LABEL[selected.type] ?? selected.type}
                    </div>
                    <div className="graph-detail-title">{selected.label}</div>
                    {selected.sub && (
                      <div className="graph-detail-sub">{selected.sub}</div>
                    )}
                  </div>
                  <button className="graph-detail-close"
                    onClick={() => setSelected(null)}
                    aria-label="Хаах">×</button>
                </div>
                {selected.stats.length > 0 ? (
                  <div className="graph-detail-stats">
                    {selected.stats.map(([label, value]) => (
                      <div key={label} className="graph-detail-row">
                        <span>{label}</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="graph-detail-sub" style={{marginTop: 8}}>
                    Нэмэлт мэдээлэл алга.
                  </div>
                )}
                <button className="btn btn-danger btn-sm"
                  style={{width: "100%", marginTop: 12}}
                  onClick={() => hideNode(selected.id)}
                  title="Энэ зангилааг зураглалаас хасах">
                  ✕ Энэ зангилааг хасах
                </button>
              </div>
            )}
            {selectedLink && !selected && (() => {
              const l = selectedLink;
              const src = network.nodes.find((n) => n.id === l.source);
              const tgt = network.nodes.find((n) => n.id === l.target);
              const kindLabel = l.kind === "txn" ? "Гүйлгээний холбоос"
                : l.kind === "call" ? "Дуудлагын холбоос" : "Хамаарал";
              return (
                <div className="graph-detail-panel">
                  <div className="graph-detail-head">
                    <div>
                      <div className="graph-detail-type">{kindLabel}</div>
                      <div className="graph-detail-title">
                        {src?.label ?? l.source} ↔ {tgt?.label ?? l.target}
                      </div>
                      {(src?.sub || tgt?.sub) && (
                        <div className="graph-detail-sub">
                          {src?.sub ?? "—"} ↔ {tgt?.sub ?? "—"}
                        </div>
                      )}
                    </div>
                    <button className="graph-detail-close"
                      onClick={() => setSelectedLink(null)}
                      aria-label="Хаах">×</button>
                  </div>
                  {l.label && (
                    <div className="graph-detail-stats">
                      <div className="graph-detail-row">
                        <span>Нийт</span>
                        <span>{l.label}</span>
                      </div>
                    </div>
                  )}
                  {l.kind === "txn" ? (
                    <button className="btn btn-danger btn-sm"
                      style={{width: "100%", marginTop: 12}}
                      onClick={() => removeTxnEdge(l)}
                      title={"Энэ хоёр дансны хоорондох бүх гүйлгээг хэрэггүй "
                        + "гэж хасах — Сэргээх хуудаснаас буцаана"}>
                      ✕ Энэ холбоосыг хасах
                    </button>
                  ) : (
                    <div className="graph-detail-sub" style={{marginTop: 10}}>
                      Зөвхөн гүйлгээний холбоосыг хасах боломжтой.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <Empty message="Сүлжээ алга — сэжигтэн, гүйлгээ, дуудлага импортлогдоогүй байна" />
        )}
      </Card>

      <Card title={`Холбоосын жагсаалт (${shownLinks.length})`}
        style={{marginBottom: 16}} noPadding>
        <div className="scroll-container" style={{maxHeight: 420}}>
          <DataTable
            rows={shownLinks}
            rowKey={(l) => l.id}
            empty="Холбоос алга — 'ХОЛБООС ҮҮСГЭХ' дарна уу"
            columns={[
              {header: "Эх сурвалж", render: (l) => nameById.get(l.sourceSuspectId) ?? l.sourceSuspectId},
              {header: "Зорилго", render: (l) => nameById.get(l.targetSuspectId) ?? l.targetSuspectId},
              {header: "Төрөл", render: (l) => (
                <span className="badge info">{l.linkType}</span>
              )},
              {header: "Хүч", align: "right", render: (l) => l.strength},
              {header: "Итгэл", render: (l) => l.confidenceLevel},
              {header: "Тайлбар", render: (l) => l.description ?? "—"},
            ]}
          />
        </div>
      </Card>

      <Card title="Мөнгөн урсгал (Sankey)" style={{marginTop: 16}}>
        {flowQ.data && flowQ.data.networkFlow.nodeLabels.length > 0 ? (
          <SankeyChart
            labels={flowQ.data.networkFlow.nodeLabels}
            source={flowQ.data.networkFlow.sourceIndices}
            target={flowQ.data.networkFlow.targetIndices}
            value={flowQ.data.networkFlow.values}
            nodeColors={flowQ.data.networkFlow.nodeColors}
            linkColors={flowQ.data.networkFlow.linkColors}
          />
        ) : (
          <Empty message="Мөнгөн урсгал илрээгүй" />
        )}
      </Card>
      </CaseGate>
    </div>
  );
}
