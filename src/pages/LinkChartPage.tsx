/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LinkChartPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
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
import {buildEvidenceNetwork} from "../lib/networkGraph";
import type {NetworkNode} from "../lib/networkGraph";
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

  async function onGenerate() {
    await generate();
    await refetch();
  }

  const network = useMemo(() => {
    if (!data || !txQ.data || !callQ.data) return null;
    const phones = callQ.data.suspects.flatMap((s) =>
      s.phoneNumbers.map((p) => ({suspectId: s.id, number: p.number})));
    return buildEvidenceNetwork(
      data.suspects,
      data.suspectLinks,
      txQ.data.bankAccounts,
      txQ.data.transactions,
      callQ.data.callRecords,
      phones
    );
  }, [data, txQ.data, callQ.data]);

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
        <Loading />
      </div>
    );
  }

  const suspects = data.suspects;
  const nameById = new Map(suspects.map((s) => [s.id, s.fullName]));
  const counts = {
    txn  : network.links.filter((l) => l.kind === "txn").length,
    call : network.links.filter((l) => l.kind === "call").length,
  };

  return (
    <div className="page-container">
      <PageHeader icon="🕸" title="Холбоосын зураглал"
        subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />

      <Card
        title={`Нотлох баримтын сүлжээ — ${network.nodes.length} зангилаа, `
          + `${counts.txn} гүйлгээний + ${counts.call} дуудлагын холбоос`}
        style={{marginBottom: 16}}>
        {network.nodes.length > 0 ? (
          <div style={{position: "relative"}}>
            <NetworkGraph nodes={network.nodes} links={network.links}
              onNodeClick={setSelected} />
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
              </div>
            )}
          </div>
        ) : (
          <Empty message="Сүлжээ алга — сэжигтэн, гүйлгээ, дуудлага импортлогдоогүй байна" />
        )}
      </Card>

      <Card title="Холбоосын жагсаалт" noPadding>
        <DataTable
          rows={data.suspectLinks}
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
    </div>
  );
}
