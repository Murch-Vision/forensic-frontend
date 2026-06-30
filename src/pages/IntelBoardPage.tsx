/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : IntelBoardPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useLazyQuery, useMutation, useQuery} from "@apollo/client";
import {
  ANB_CHART_DATA,
  ANB_EXPORT,
  ASSOCIATION_MATRIX,
  GENERATE_ANB,
  INTELBOARD_QUERY,
} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import NetworkGraph from "../components/NetworkGraph";
import {buildNetwork} from "../lib/networkGraph";
import {formatDateTime, formatMoney, riskClass, sevClass} from "../lib/format";

function downloadText(filename: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], {type: mime}));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface AssocCell {
  rowLabel: string;
  colLabel: string;
  linkCount: number;
  totalFinancialValue: number;
  totalCallCount: number;
  strongestLinkType: string;
  strength: number;
}

interface ChartEntity {
  id: number;
  entityId: string;
  entityType: string;
  label: string;
  description: string | null;
  gradeOfInformation: string | null;
  attributes: string | null;
}

interface ChartEvent {
  id: number;
  timestamp: string;
  eventType: string;
  title: string;
  description: string | null;
  severity: string;
  amount: number | null;
  location: string | null;
}

interface IbData {
  dashboardStats: {
    totalSuspects: number;
    highRiskSuspects: number;
    totalLinks: number;
    flaggedTransactions: number;
    totalTransactionVolume: number;
    openCases: number;
  };
  suspects: {
    id: number;
    suspectId: string;
    fullName: string;
    riskLevel: string;
    occupation: string | null;
    organization: string | null;
    city: string | null;
  }[];
  suspectLinks: {
    id: number;
    sourceSuspectId: number;
    targetSuspectId: number;
    linkType: string;
    strength: number;
    confidenceLevel: string;
  }[];
  caseFiles: {
    id: number;
    caseId: string;
    caseName: string;
    status: string;
    priority: string;
  }[];
}

type Tab = "Chart" | "Entities" | "Matrix" | "Events";
const TABS: {key: Tab; label: string}[] = [
  {key: "Chart", label: "Граф"},
  {key: "Entities", label: "Оюун ухаан"},
  {key: "Matrix", label: "Матриц"},
  {key: "Events", label: "Үйл явдлууд"},
];

const EVENT_ICON: Record<string, string> = {
  Financial: "$",
  Communication: "C",
  Movement: "M",
};

// Cell shade scales with the association strength (0..1).
function cellColor(strength: number): string {
  const a = 0.12 + Math.min(1, strength) * 0.78;
  return `rgba(0,229,255,${a.toFixed(2)})`;
}

export default function IntelBoardPage() {
  const [tab, setTab] = useState<Tab>("Chart");
  const {data, loading} = useQuery<IbData>(INTELBOARD_QUERY);
  const matrixQ = useQuery<{associationMatrix: AssocCell[]}>(ASSOCIATION_MATRIX);
  const chartQ = useQuery<{chartEntities: ChartEntity[];
    chartEvents: ChartEvent[]}>(ANB_CHART_DATA);
  const [generateAnb, genM] = useMutation(GENERATE_ANB);
  const [getExport] = useLazyQuery<{anbExport: {
    entitiesCsv: string; linksCsv: string; anx: string;
  }}>(ANB_EXPORT, {fetchPolicy: "no-cache"});

  async function onGenerate() {
    await generateAnb();
    await Promise.all([matrixQ.refetch(), chartQ.refetch()]);
  }

  async function onExport(kind: "entities" | "links" | "anx") {
    const r = await getExport();
    const e = r.data?.anbExport;
    if (!e) return;
    if (kind === "entities") {
      downloadText("anb-entities.csv", "text/csv", e.entitiesCsv);
    } else if (kind === "links") {
      downloadText("anb-links.csv", "text/csv", e.linksCsv);
    } else {
      downloadText("chart.anx", "application/xml", e.anx);
    }
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="📋" title="Мэдээллийн самбар"
          subtitle="ОЛОН ЭХ СУРВАЛЖИЙН ТОЙМ" />
        <Loading />
      </div>
    );
  }

  const s = data.dashboardStats;
  const nameById = new Map(data.suspects.map((x) => [x.id, x.fullName]));
  const network = buildNetwork(data.suspects, data.suspectLinks);
  const entities = chartQ.data?.chartEntities ?? [];
  const events = [...(chartQ.data?.chartEvents ?? [])]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const cells = matrixQ.data?.associationMatrix ?? [];
  const labels = [...new Set(cells.flatMap((c) => [c.rowLabel, c.colLabel]))]
    .sort();
  const cellMap = new Map<string, AssocCell>();
  for (const c of cells) cellMap.set(`${c.rowLabel}|${c.colLabel}`, c);

  const actions = (
    <>
      <button className="btn btn-primary" onClick={onGenerate}
        disabled={genM.loading} style={{marginRight: 6}}>
        {genM.loading ? "ҮҮСГЭЖ БАЙНА..." : "ГРАФ ҮҮСГЭХ"}
      </button>
      <button className="btn btn-sm" onClick={() => onExport("entities")}
        style={{marginRight: 6}}>CSV</button>
      <button className="btn btn-sm" onClick={() => onExport("anx")}>ANX</button>
    </>
  );

  return (
    <div className="page-container">
      <PageHeader icon="📋" title="Мэдээллийн самбар"
        subtitle="ОЛОН ЭХ СУРВАЛЖИЙН ТОЙМ" actions={actions} />

      <div className="metrics-grid">
        <StatCard label="Сэжигтэн" value={s.totalSuspects} />
        <StatCard label="Өндөр эрсдэл" value={s.highRiskSuspects}
          color="red" />
        <StatCard label="Холбоос" value={s.totalLinks} />
        <StatCard label="Объект" value={entities.length} color="purple" />
        <StatCard label="Үйл явдал" value={events.length} color="blue" />
        <StatCard label="Нийт дүн" value={formatMoney(s.totalTransactionVolume)}
          color="green" />
      </div>

      <div style={{display: "flex", gap: 6, margin: "16px 0"}}>
        {TABS.map((t) => (
          <button key={t.key}
            className={tab === t.key ? "btn btn-primary" : "btn btn-sm"}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "Chart" && (
        <>
          <Card title={`Сүлжээний граф (${network.nodes.length} зангилаа)`}
            style={{marginBottom: 16}}>
            {network.nodes.length > 0 ? (
              <NetworkGraph nodes={network.nodes} links={network.links} />
            ) : (
              <Empty message="Сүлжээ алга" />
            )}
          </Card>
          <div style={{display: "flex", gap: 16, alignItems: "flex-start"}}>
            <div style={{flex: 1}}>
              <Card title="Сэжигтнүүд" noPadding>
                <DataTable
                  rows={data.suspects}
                  rowKey={(x) => x.id}
                  columns={[
                    {header: "Нэр", render: (x) => x.fullName},
                    {header: "Байгууллага", render: (x) => x.organization ?? "—"},
                    {header: "Эрсдэл", render: (x) => (
                      <Badge text={x.riskLevel} kind={riskClass(x.riskLevel)} />
                    )},
                  ]}
                />
              </Card>
            </div>
            <div style={{flex: 1}}>
              <Card title="Кейсүүд" noPadding>
                <DataTable
                  rows={data.caseFiles}
                  rowKey={(c) => c.id}
                  columns={[
                    {header: "Дугаар", render: (c) => c.caseId},
                    {header: "Нэр", render: (c) => c.caseName},
                    {header: "Чухал", render: (c) => (
                      <Badge text={c.priority} kind={sevClass(c.priority)} />
                    )},
                  ]}
                />
              </Card>
            </div>
          </div>
          <Card title="Холбоосууд" noPadding style={{marginTop: 16}}>
            <DataTable
              rows={data.suspectLinks}
              rowKey={(l) => l.id}
              columns={[
                {header: "Эх сурвалж",
                  render: (l) => nameById.get(l.sourceSuspectId)
                    ?? l.sourceSuspectId},
                {header: "Зорилго",
                  render: (l) => nameById.get(l.targetSuspectId)
                    ?? l.targetSuspectId},
                {header: "Төрөл",
                  render: (l) => <Badge text={l.linkType} kind="info" />},
                {header: "Хүч", align: "right", render: (l) => l.strength},
                {header: "Итгэл", render: (l) => l.confidenceLevel},
              ]}
            />
          </Card>
        </>
      )}

      {tab === "Entities" && (
        <Card title={`Объектууд (${entities.length})`} noPadding>
          <DataTable
            rows={entities}
            rowKey={(e) => e.id}
            empty="Объект алга — 'ГРАФ ҮҮСГЭХ' дарна уу"
            columns={[
              {header: "Төрөл",
                render: (e) => <Badge text={e.entityType} kind="info" />},
              {header: "Нэр", render: (e) => e.label},
              {header: "Тайлбар", render: (e) => e.description ?? "—"},
              {header: "Зэрэглэл", render: (e) => e.gradeOfInformation ?? "—"},
              {header: "Шинж чанар", render: (e) => e.attributes ?? "—"},
            ]}
          />
        </Card>
      )}

      {tab === "Matrix" && (
        <Card title="Холбооны матриц (i2 ANB)" style={{overflowX: "auto"}}>
          {labels.length === 0 ? (
            <Empty message="Матриц хоосон — 'ГРАФ ҮҮСГЭХ' дарна уу" />
          ) : (
            <div style={{display: "grid", gap: 2, fontSize: 10,
              gridTemplateColumns: `120px repeat(${labels.length}, minmax(54px, 1fr))`}}>
              <div />
              {labels.map((l) => (
                <div key={l} style={{padding: 4, fontWeight: 600,
                  color: "var(--text-muted)", whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis"}} title={l}>
                  {l}
                </div>
              ))}
              {labels.map((row) => (
                <Row key={row} row={row} labels={labels} cellMap={cellMap} />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "Events" && (
        <Card title={`Үйл явдлууд (${events.length})`} noPadding>
          <div style={{maxHeight: 560, overflowY: "auto"}}>
            {events.length === 0 ? (
              <Empty message="Үйл явдал алга — 'ГРАФ ҮҮСГЭХ' дарна уу" />
            ) : (
              events.map((e) => (
                <div key={e.id} style={{display: "flex", gap: 12,
                  alignItems: "flex-start", padding: "10px 14px",
                  borderBottom: "1px solid var(--border-primary)"}}>
                  <div style={{width: 22, height: 22, borderRadius: "50%",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 700,
                    background: "var(--bg-secondary)",
                    color: "var(--accent-cyan)"}}>
                    {EVENT_ICON[e.eventType] ?? "?"}
                  </div>
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{display: "flex", gap: 8,
                      alignItems: "center"}}>
                      <span style={{fontSize: 12, fontWeight: 600}}>
                        {e.title}
                      </span>
                      <Badge text={e.severity} kind={sevClass(e.severity)} />
                      <Badge text={e.eventType} kind="info" />
                    </div>
                    <div style={{fontSize: 11, color: "var(--text-secondary)"}}>
                      {e.description ?? ""}
                      {e.amount ? ` · ${formatMoney(e.amount)}` : ""}
                    </div>
                    <div style={{fontSize: 10, color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)"}}>
                      {formatDateTime(e.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Row(props: {
  row: string;
  labels: string[];
  cellMap: Map<string, AssocCell>;
}) {
  return (
    <>
      <div style={{padding: 4, fontWeight: 600, whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis"}} title={props.row}>
        {props.row}
      </div>
      {props.labels.map((col) => {
        const c = props.cellMap.get(`${props.row}|${col}`)
          ?? props.cellMap.get(`${col}|${props.row}`);
        if (props.row === col || !c || c.strength <= 0) {
          return (
            <div key={col} style={{padding: 4, textAlign: "center",
              color: "var(--text-muted)"}}>-</div>
          );
        }
        return (
          <div key={col} title={`${props.row} - ${col}: ${c.strength.toFixed(2)}`}
            style={{padding: 4, textAlign: "center", color: "#04121a",
              fontWeight: 700, borderRadius: 3,
              background: cellColor(c.strength)}}>
            {c.strength.toFixed(1)}
          </div>
        );
      })}
    </>
  );
}
