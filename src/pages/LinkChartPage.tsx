/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LinkChartPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMutation, useQuery} from "@apollo/client";
import {
  GENERATE_LINKS,
  LINKCHART_QUERY,
  NETWORK_FLOW_QUERY,
} from "../graphql/queries";
import {
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  SankeyChart,
} from "../components/kit";
import {riskClass} from "../lib/format";
import NetworkGraph from "../components/NetworkGraph";
import {buildNetwork} from "../lib/networkGraph";
import type {SuspectLinkType} from "../types";

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

const LINK_COLOR: Record<string, string> = {
  FINANCIAL_TRANSFER : "#00E676",
  PHONE_CONTACT      : "#00E5FF",
  SHARED_ADDRESS     : "#E040FB",
  SHARED_DEVICE      : "#FF6D00",
};

const RISK_COLOR: Record<string, string> = {
  CRITICAL : "#FF0040",
  HIGH     : "#FF1744",
  MEDIUM   : "#FFAB00",
  LOW      : "#00E676",
};

export default function LinkChartPage() {
  const {data, loading, refetch} = useQuery<LcData>(LINKCHART_QUERY);
  const flowQ = useQuery<{networkFlow: {
    nodeLabels: string[]; nodeColors: string[]; sourceIndices: number[];
    targetIndices: number[]; values: number[]; linkColors: string[];
  }}>(NETWORK_FLOW_QUERY);
  const [generate, {loading: generating}] = useMutation(GENERATE_LINKS);

  async function onGenerate() {
    await generate();
    await refetch();
  }

  const actions = (
    <button className="btn btn-primary" onClick={onGenerate} disabled={generating}>
      {generating ? "БОЛОВСРУУЛЖ БАЙНА..." : "ХОЛБООС ҮҮСГЭХ"}
    </button>
  );

  if (loading || !data) {
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
  const network = buildNetwork(suspects, data.suspectLinks);

  return (
    <div className="page-container">
      <PageHeader icon="🕸" title="Холбоосын зураглал"
        subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />

      <Card title={`Сүлжээ (${network.nodes.length} зангилаа, ${network.links.length} холбоос)`}
        style={{marginBottom: 16}}>
        {network.nodes.length > 0 ? (
          <NetworkGraph nodes={network.nodes} links={network.links} />
        ) : (
          <Empty message="Сүлжээ алга — сэжигтэн бүртгэгдээгүй байна" />
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
