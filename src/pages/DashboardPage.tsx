/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : DashboardPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo} from "react";
import {useQuery} from "@apollo/client";
import {DASHBOARD_QUERY, NETWORK_FLOW_QUERY} from "../graphql/queries";
import {
  Badge,
  Card,
  DonutChart,
  Empty,
  Heatmap,
  Loading,
  MultiLineChart,
  PageHeader,
  SankeyChart,
  StatCard,
  TreemapChart,
} from "../components/kit";
import {formatDate, formatMoney, riskClass, sevClass} from "../lib/format";
import type {CaseFile, DashboardStats, PatternAlert, RiskLevel} from "../types";

interface DashSuspect {
  id: number;
  suspectId: string;
  fullName: string;
  riskLevel: RiskLevel;
  occupation: string | null;
  city: string | null;
  country: string | null;
  initials: string;
  bankAccounts: {id: number}[];
  phoneNumbers: {id: number}[];
}

interface DashTxn {
  id: number;
  timestamp: string;
  amount: number;
  type: string;
  category: string | null;
  channel: string | null;
}

interface DashData {
  dashboardStats: DashboardStats;
  patterns: PatternAlert[];
  caseFiles: CaseFile[];
  suspects: DashSuspect[];
  transactions: DashTxn[];
}

interface FlowData {
  networkFlow: {
    nodeLabels: string[];
    nodeColors: string[];
    sourceIndices: number[];
    targetIndices: number[];
    values: number[];
    linkColors: string[];
  };
}

const RISK_LABELS = ["Эгзэгтэй", "Өндөр", "Дунд", "Бага"];
const RISK_COLORS = ["#FF0040", "#FF1744", "#FFAB00", "#00E676"];
const DAY_LABELS = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];
const PALETTE = [
  "#00E5FF", "#00E676", "#B388FF", "#FFAB00", "#FF6D00", "#448AFF",
  "#FF1744", "#E040FB", "#76FF03", "#FFD600", "#FF5252", "#00BCD4",
  "#FF9100", "#69F0AE", "#EA80FC",
];

interface DashCharts {
  riskValues   : number[];
  months       : string[];
  credit       : number[];
  debit        : number[];
  heatmap      : number[][];
  tmLabels     : string[];
  tmParents    : string[];
  tmValues     : number[];
  tmColors     : string[];
  chLabels     : string[];
  chValues     : number[];
  chColors     : string[];
}

// Aggregate suspects + transactions into the six dashboard chart datasets,
// mirroring the C# DashboardPage.BuildChartsAsync projections.
function buildCharts(data: DashData): DashCharts {
  const suspects = data.suspects;
  const txns = data.transactions;

  const riskOf = (level: string) =>
    suspects.filter((s) => s.riskLevel === level).length;
  const riskValues = [
    riskOf("CRITICAL"), riskOf("HIGH"), riskOf("MEDIUM"), riskOf("LOW"),
  ];

  const monthMap = new Map<string, {credit: number; debit: number}>();
  const heatmap = DAY_LABELS.map(() => new Array<number>(24).fill(0));
  const catMap = new Map<string, number>();
  const chanMap = new Map<string, number>();

  for (const t of txns) {
    const d = new Date(t.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1)
      .padStart(2, "0")}`;
    const m = monthMap.get(key) ?? {credit: 0, debit: 0};
    if (t.type === "credit") m.credit += t.amount;
    else if (t.type === "debit") m.debit += t.amount;
    monthMap.set(key, m);

    heatmap[d.getDay()][d.getHours()]++;

    const cat = t.category ?? "Бусад";
    catMap.set(cat, (catMap.get(cat) ?? 0) + t.amount);

    const chan = t.channel ?? "Тодорхойгүй";
    chanMap.set(chan, (chanMap.get(chan) ?? 0) + 1);
  }

  const months = [...monthMap.keys()].sort();
  const credit = months.map((k) => monthMap.get(k)!.credit);
  const debit = months.map((k) => monthMap.get(k)!.debit);

  const cats = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 15);
  const tmLabels = ["Бүх гүйлгээ", ...cats.map((c) => c[0])];
  const tmParents = ["", ...cats.map(() => "Бүх гүйлгээ")];
  const tmValues = [0, ...cats.map((c) => c[1])];
  const tmColors = ["#0F1125", ...cats.map((_c, i) => PALETTE[i % PALETTE.length])];

  const chans = [...chanMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const chLabels = chans.map((c) => c[0]);
  const chValues = chans.map((c) => c[1]);
  const chColors = chans.map((_c, i) => PALETTE[i % PALETTE.length]);

  return {
    riskValues, months, credit, debit, heatmap,
    tmLabels, tmParents, tmValues, tmColors,
    chLabels, chValues, chColors,
  };
}

const ROW: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16,
};

export default function DashboardPage() {
  const {data, loading} = useQuery<DashData>(DASHBOARD_QUERY);
  const flowQ = useQuery<FlowData>(NETWORK_FLOW_QUERY);
  const charts = useMemo(() => (data ? buildCharts(data) : null), [data]);

  if (loading || !data || !charts) {
    return (
      <div className="page-container">
        <PageHeader icon="📊" title="Хяналтын самбар" subtitle="ЕРӨНХИЙ ТОЙМ" />
        <Loading />
      </div>
    );
  }

  const s = data.dashboardStats;
  const active = data.caseFiles.find((c) => c.status === "ACTIVE")
    ?? data.caseFiles[0];
  const txnRange = s.earliestTransaction && s.latestTransaction
    ? `${formatDate(s.earliestTransaction)} — ${formatDate(s.latestTransaction)}`
    : "N/A";
  const flow = flowQ.data?.networkFlow;
  const hasTxns = data.transactions.length > 0;

  return (
    <div className="page-container">
      <PageHeader icon="📊" title="Хяналтын самбар"
        subtitle="ШИНЖИЛГЭЭНИЙ ЕРӨНХИЙ ТОЙМ" />

      <div className="metrics-grid">
        <StatCard label="Сэжигтэн" value={s.totalSuspects} />
        <StatCard label="Банкны данс" value={s.totalBankAccounts} />
        <StatCard label="Гүйлгээ" value={s.totalTransactions} />
        <StatCard label="Дуудлага" value={s.totalCallRecords} />
        <StatCard label="Холбоос" value={s.totalLinks} />
        <StatCard label="Өндөр эрсдэл" value={s.highRiskSuspects}
          color="red" />
        <StatCard label="Тэмдэглэгдсэн" value={s.flaggedTransactions}
          color="amber" />
        <StatCard label="Нээлттэй кейс" value={s.openCases} />
        <StatCard label="Нийт дүн" value={formatMoney(s.totalTransactionVolume)}
          color="green" />
      </div>

      <Card title="Идэвхтэй кейс" style={{marginBottom: 16}}>
        {active ? (
          <div>
            <div style={{fontSize: 14, fontWeight: 600, marginBottom: 4}}>
              {active.caseId} · {active.caseName}{" "}
              <Badge text={active.priority} kind={sevClass(active.priority)} />
            </div>
            <div style={{fontSize: 12, color: "var(--text-secondary)"}}>
              {active.description ?? ""}
            </div>
            <div style={{fontSize: 11, color: "var(--text-muted)", marginTop: 6}}>
              Мөрдөгч: {active.leadInvestigator ?? "—"} · Гүйлгээний хугацаа: {txnRange}
            </div>
          </div>
        ) : (
          <Empty message="Идэвхтэй кейс алга" />
        )}
      </Card>

      <div style={ROW}>
        <Card title="Аюулын тархалт">
          <DonutChart labels={RISK_LABELS} values={charts.riskValues}
            colors={RISK_COLORS} />
        </Card>
        <Card title="Сар бүрийн гүйлгээний дүн">
          {hasTxns ? (
            <MultiLineChart
              x={charts.months}
              series={[
                {name: "Орлого", y: charts.credit, color: "#00E676"},
                {name: "Зарлага", y: charts.debit, color: "#FF5252"},
              ]}
            />
          ) : (
            <Empty message="Гүйлгээ алга" />
          )}
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Санхүүгийн урсгал (Санки)">
          {flow && flow.nodeLabels.length > 0 ? (
            <SankeyChart
              labels={flow.nodeLabels}
              source={flow.sourceIndices}
              target={flow.targetIndices}
              value={flow.values}
              nodeColors={flow.nodeColors}
              linkColors={flow.linkColors}
            />
          ) : (
            <Empty message="Мөнгөн урсгал илрээгүй" />
          )}
        </Card>
        <Card title="Гүйлгээний ангилал">
          {hasTxns ? (
            <TreemapChart labels={charts.tmLabels} parents={charts.tmParents}
              values={charts.tmValues} colors={charts.tmColors} height={420} />
          ) : (
            <Empty message="Гүйлгээ алга" />
          )}
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Гүйлгээний цагийн хуваарь">
          {hasTxns ? (
            <Heatmap data={charts.heatmap} rowLabels={DAY_LABELS} />
          ) : (
            <Empty message="Гүйлгээ алга" />
          )}
        </Card>
        <Card title="Сувгийн тархалт">
          {hasTxns && charts.chLabels.length > 0 ? (
            <DonutChart labels={charts.chLabels} values={charts.chValues}
              colors={charts.chColors} />
          ) : (
            <Empty message="Суваг алга" />
          )}
        </Card>
      </div>

      <div style={{display: "flex", gap: 16, alignItems: "flex-start"}}>
        <div style={{flex: 1}}>
          <Card title={`Сэжигтнүүд (${data.suspects.length})`} noPadding>
            <div style={{maxHeight: 420, overflowY: "auto"}}>
              {data.suspects.map((su) => (
                <div key={su.id} className="suspect-row">
                  <div className={`avatar ${riskClass(su.riskLevel)}`}>
                    {su.initials}
                  </div>
                  <div className="info">
                    <div className="name">{su.fullName}</div>
                    <div className="detail">
                      {su.suspectId} · {su.occupation ?? ""} ·{" "}
                      {su.bankAccounts.length} данс · {su.phoneNumbers.length} утас
                    </div>
                  </div>
                  <Badge text={su.riskLevel} kind={riskClass(su.riskLevel)} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div style={{flex: 1}}>
          <Card title={`Сүүлийн сэрэмжлүүлэг (${data.patterns.length})`} noPadding>
            <div style={{maxHeight: 420, overflowY: "auto"}}>
              {data.patterns.length === 0 ? (
                <Empty message="Сэрэмжлүүлэг алга" />
              ) : (
                data.patterns.slice(0, 10).map((a, i) => (
                  <div key={i} style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border-primary)",
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 4,
                    }}>
                      <span style={{fontSize: 11, fontWeight: 600}}>
                        {a.alertType}
                      </span>
                      <Badge text={a.severity} kind={sevClass(a.severity)} />
                    </div>
                    <div style={{fontSize: 11, color: "var(--text-secondary)"}}>
                      {a.description}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
