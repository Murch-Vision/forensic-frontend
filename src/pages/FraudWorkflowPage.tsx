/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : FraudWorkflowPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  EVIDENCE_FOR_CASE,
  FRAUD_WORKFLOW,
  TAG_EVIDENCE,
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
import Plot from "../components/Plot";
import {sevClass} from "../lib/format";

interface WfViolation {
  ruleId      : number;
  ruleName    : string;
  severity    : string;
  description : string;
  score       : number;
}

interface WfResult {
  bankAccountId : number;
  accountName   : string;
  analysis      : {riskLevel: string; overallRisk: number};
  ruleResult    : {
    finalScore    : number;
    finalAction   : string;
    finalRisk     : string;
    criticalFlags : number;
    highFlags     : number;
    baseScore     : number;
    ruleBoost     : number;
    violations    : WfViolation[];
  };
}

const ACTION_COLORS: Record<string, string> = {
  "BLOCK": "#FF1744",
  "HOLD FOR REVIEW": "#FFAB00",
  "MONITOR": "#448AFF",
  "ALLOW": "#00E676",
};

const SEV_RANK: Record<string, number> = {
  CRITICAL : 4,
  HIGH     : 3,
  MEDIUM   : 2,
  LOW      : 1,
};

// Static rule catalogue — mirrors the C# rule-engine configuration list and
// also drives the account×rule heatmap columns.
const RULE_DEFINITIONS: {
  id: number; name: string; description: string;
  severity: string; baseScore: number;
}[] = [
  {id: 1, name: "Velocity Attack",
    description: ">5 txns in 10 minutes window",
    severity: "HIGH", baseScore: 0.30},
  {id: 2, name: "Amount Anomaly",
    description: "Z-score > 3 standard deviations from mean",
    severity: "HIGH", baseScore: 0.20},
  {id: 5, name: "Round Amount Pattern",
    description: ">=5 of last 10 txns are round numbers",
    severity: "MEDIUM", baseScore: 0.15},
  {id: 6, name: "New Recipient Surge",
    description: ">10 unique recipients in a single day",
    severity: "HIGH", baseScore: 0.25},
  {id: 7, name: "Suspicious Night Activity",
    description: "Txns >$1,000 between 2-5 AM",
    severity: "MEDIUM", baseScore: 0.15},
  {id: 10, name: "Mule Account Pattern",
    description: "Inflow >$10k, outflow >90% same day",
    severity: "CRITICAL", baseScore: 0.40},
  {id: 11, name: "Smurfing Detection",
    description: "Multiple small deposits from 3+ sources >$9k",
    severity: "CRITICAL", baseScore: 0.35},
  {id: 12, name: "Round-Trip Transfer",
    description: "Credit/debit pair within 5% of amount",
    severity: "HIGH", baseScore: 0.20},
];

const ROW: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16,
};

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function FraudWorkflowPage() {
  const {data, loading} = useQuery<{fraudWorkflow: WfResult[]}>(FRAUD_WORKFLOW);
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;
  const evidenceQ = useQuery<{evidenceForCase: {sourceType: string;
    sourceId: number; exhibitNumber: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId: activeCase?.id ?? 0}, skip: !activeCase});
  const [tagEvidence] = useMutation(TAG_EVIDENCE);

  const exhibitByAccount = new Map<number, number>();
  for (const e of evidenceQ.data?.evidenceForCase ?? []) {
    if (e.sourceType === "BANK_ACCOUNT") {
      exhibitByAccount.set(e.sourceId, e.exhibitNumber);
    }
  }

  async function onTag(r: WfResult) {
    if (!activeCase) return;
    await tagEvidence({variables: {
      caseFileId: activeCase.id, sourceType: "BANK_ACCOUNT",
      sourceId: r.bankAccountId,
      description: `${r.accountName} (${r.ruleResult.finalAction})`,
      severity: r.ruleResult.finalRisk === "HIGH" ? "HIGH"
        : r.ruleResult.finalRisk === "MEDIUM" ? "MEDIUM" : "INFO",
    }});
    await evidenceQ.refetch();
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="🛡" title="Залилангийн урсгал"
          subtitle="ДҮРМИЙН ХӨДӨЛГҮҮР" />
        <Loading />
      </div>
    );
  }

  const results = [...data.fraudWorkflow]
    .sort((a, b) => b.ruleResult.finalScore - a.ruleResult.finalScore);

  if (results.length === 0) {
    return (
      <div className="page-container">
        <PageHeader icon="🛡" title="Залилангийн урсгал"
          subtitle="ДҮРМИЙН ХӨДӨЛГҮҮР (Rule Engine) — бүх данс" />
        <Card>
          <Empty message="Дансны өгөгдөл алга — бүх данс дээр дүрмийн шалгалт ажиллуулна уу" />
        </Card>
      </div>
    );
  }

  const action = (a: string) =>
    results.filter((r) => r.ruleResult.finalAction === a).length;
  const actionCounts = new Map<string, number>();
  const ruleCounts = new Map<string, number>();
  for (const r of results) {
    actionCounts.set(r.ruleResult.finalAction,
      (actionCounts.get(r.ruleResult.finalAction) ?? 0) + 1);
    for (const v of r.ruleResult.violations) {
      ruleCounts.set(v.ruleName, (ruleCounts.get(v.ruleName) ?? 0) + 1);
    }
  }
  const actionLabels = [...actionCounts.keys()];
  const ruleEntries = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]);

  const scores = results.map((r) => r.ruleResult.finalScore);
  const avgScore = scores.reduce((a, s) => a + s, 0) / results.length;
  const funnelY = ["Нийт данс", "Оноо ≥ 30%", "Оноо ≥ 50%", "Оноо ≥ 75%"];
  const funnelX = [
    results.length,
    scores.filter((s) => s >= 0.30).length,
    scores.filter((s) => s >= 0.50).length,
    scores.filter((s) => s >= 0.75).length,
  ];

  // Composite-score waterfall for the worst account.
  const top = results[0];
  const wfMeasure: string[] = [];
  const wfX: string[] = [];
  const wfY: number[] = [];
  for (const v of top.ruleResult.violations) {
    wfMeasure.push("relative");
    wfX.push(trunc(v.ruleName, 18));
    wfY.push(v.score * 100);
  }
  if (top.ruleResult.ruleBoost > 0) {
    wfMeasure.push("relative");
    wfX.push("Дүрмийн өсөлт");
    wfY.push(top.ruleResult.ruleBoost * 100);
  }
  wfMeasure.push("total");
  wfX.push("Эцсийн оноо");
  wfY.push(0);

  // Account × rule severity heatmap (top 15 accounts).
  const heatAccounts = results.slice(0, 15);
  const heatZ = heatAccounts.map((r) => {
    const byId = new Map(r.ruleResult.violations.map((v) => [v.ruleId, v.severity]));
    return RULE_DEFINITIONS.map((rd) => {
      const sev = byId.get(rd.id);
      return sev ? SEV_RANK[sev] ?? 1 : 0;
    });
  });

  // Parallel-coordinates dimensions across all accounts.
  const dimensions = [
    {label: "Суурь", range: [0, 100],
      values: results.map((r) => r.ruleResult.baseScore * 100)},
    {label: "Өсөлт", range: [0, 30],
      values: results.map((r) => r.ruleResult.ruleBoost * 100)},
    {label: "Эцсийн", range: [0, 100],
      values: results.map((r) => r.ruleResult.finalScore * 100)},
    {label: "Зөрчил", range: [0, 10],
      values: results.map((r) => r.ruleResult.violations.length)},
    {label: "Критик", range: [0, 5],
      values: results.map((r) => r.ruleResult.criticalFlags)},
    {label: "Эрсдэл", range: [0, 100],
      values: results.map((r) => r.analysis.overallRisk)},
  ];

  return (
    <div className="page-container">
      <PageHeader icon="🛡" title="Залилангийн урсгал"
        subtitle="ДҮРМИЙН ХӨДӨЛГҮҮР (Rule Engine) — бүх данс" />

      <div className="metrics-grid">
        <StatCard label="Данс" value={results.length} color="cyan" />
        <StatCard label="Хоригдсон" value={action("BLOCK")} color="red" />
        <StatCard label="Хяналтад" value={action("HOLD FOR REVIEW")}
          color="amber" />
        <StatCard label="Ажиглах" value={action("MONITOR")} color="blue" />
        <StatCard label="Зөвшөөрсөн" value={action("ALLOW")} color="green" />
        <StatCard label="Нийт зөрчил"
          value={results.reduce((a, r) => a + r.ruleResult.violations.length, 0)}
          color="purple" />
        <StatCard label="Критик"
          value={results.reduce((a, r) => a + r.ruleResult.criticalFlags, 0)}
          color="red" />
        <StatCard label="Дундаж оноо"
          value={`${(avgScore * 100).toFixed(0)}%`} color="amber" />
      </div>

      <div style={ROW}>
        <Card title="Шийдвэрийн юүлүүр">
          <Plot
            height={260}
            data={[{
              type: "funnel", y: funnelY, x: funnelX,
              marker: {color: ["#448AFF", "#448AFF", "#FFAB00", "#FF1744"]},
              textinfo: "value+percent initial",
            }]}
            layout={{margin: {l: 110, r: 16, t: 16, b: 30}}}
          />
        </Card>
        <Card title="Шийдвэрийн хуваарилалт">
          <Plot
            height={260}
            data={[{
              type: "pie", hole: 0.5, labels: actionLabels,
              values: actionLabels.map((a) => actionCounts.get(a) ?? 0),
              marker: {colors: actionLabels.map((a) =>
                ACTION_COLORS[a] ?? "#90A4AE")},
            }]}
          />
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Эрсдлийн онооны тархалт">
          <Plot
            height={260}
            data={[{
              type: "histogram",
              x: results.map((r) => Math.round(r.ruleResult.finalScore * 100)),
              marker: {color: "#B388FF"}, nbinsx: 10,
            }]}
          />
        </Card>
        <Card title="Дүрмийн зөрчлийн давтамж">
          {ruleEntries.length > 0 ? (
            <Plot
              height={260}
              data={[{
                type: "bar", orientation: "h",
                y: ruleEntries.map((e) => e[0]).reverse(),
                x: ruleEntries.map((e) => e[1]).reverse(),
                marker: {color: "#00E5FF"},
              }]}
              layout={{margin: {l: 220, r: 16, t: 16, b: 40}}}
            />
          ) : (
            <Empty message="Зөрчил алга" />
          )}
        </Card>
      </div>

      <div style={ROW}>
        <Card title={`Нийлмэл онооны задаргаа — ${trunc(top.accountName, 24)}`}>
          <Plot
            height={300}
            data={[{
              type: "waterfall", orientation: "v",
              measure: wfMeasure, x: wfX, y: wfY,
              connector: {line: {color: "#3a4a6a"}},
            }]}
            layout={{margin: {l: 40, r: 16, t: 16, b: 120},
              xaxis: {tickangle: -30}}}
          />
        </Card>
        <Card title="Данс × дүрмийн ноцтой байдал">
          <Plot
            height={300}
            data={[{
              type: "heatmap", z: heatZ,
              x: RULE_DEFINITIONS.map((r) => `R${r.id}`),
              y: heatAccounts.map((r) => trunc(r.accountName, 20)),
              colorscale: "Jet", showscale: true, zmin: 0, zmax: 4,
            }]}
            layout={{margin: {l: 150, r: 16, t: 16, b: 30}}}
          />
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Олон хэмжээст эрсдлийн профайл">
          <Plot
            height={320}
            data={[{
              type: "parcoords",
              line: {color: results.map((r) => r.ruleResult.finalScore * 100),
                colorscale: "Jet", cmin: 0, cmax: 100},
              dimensions,
            }]}
            layout={{margin: {l: 60, r: 40, t: 30, b: 20}}}
          />
        </Card>
        <Card title="Дансны эрсдлийн хэмжүүр (эхний 8)" noPadding>
          <div style={{display: "grid",
            gridTemplateColumns: "1fr 1fr", gap: 10, padding: 14}}>
            {results.slice(0, 8).map((r) => {
              const pct = Math.round(r.ruleResult.finalScore * 100);
              const color = ACTION_COLORS[r.ruleResult.finalAction] ?? "#90A4AE";
              return (
                <div key={r.bankAccountId} style={{
                  border: "1px solid var(--border-primary)",
                  borderRadius: 8, padding: "10px 12px"}}>
                  <div style={{fontSize: 11, color: "var(--text-secondary)",
                    whiteSpace: "nowrap", overflow: "hidden",
                    textOverflow: "ellipsis"}}>
                    {r.accountName}
                  </div>
                  <div style={{display: "flex", alignItems: "baseline",
                    justifyContent: "space-between", margin: "4px 0"}}>
                    <span style={{fontSize: 20, fontWeight: 800, color}}>
                      {pct}%
                    </span>
                    <span style={{fontSize: 9, color: "var(--text-muted)"}}>
                      {r.ruleResult.finalAction}
                    </span>
                  </div>
                  <div style={{height: 6, borderRadius: 3,
                    background: "var(--border-primary)"}}>
                    <div style={{width: `${pct}%`, height: "100%",
                      borderRadius: 3, background: color}} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Дансны шийдвэр" noPadding style={{marginBottom: 16}}>
        <DataTable
          rows={results}
          rowKey={(r) => r.bankAccountId}
          columns={[
            {header: "Данс", render: (r) => r.accountName},
            {header: "Суурь оноо", align: "right",
              render: (r) => `${(r.ruleResult.baseScore * 100).toFixed(0)}%`},
            {header: "Дүрмийн өсөлт", align: "right", render: (r) => (
              <span style={{color: "var(--accent-amber)"}}>
                +{(r.ruleResult.ruleBoost * 100).toFixed(0)}%
              </span>
            )},
            {header: "Эцсийн оноо", align: "right",
              render: (r) => `${(r.ruleResult.finalScore * 100).toFixed(0)}%`},
            {header: "Үйлдэл", render: (r) => (
              <Badge text={r.ruleResult.finalAction}
                kind={sevClass(r.ruleResult.finalRisk === "NORMAL"
                  ? "INFO" : r.ruleResult.finalRisk)} />
            )},
            {header: "Эгзэгтэй", align: "right",
              render: (r) => r.ruleResult.criticalFlags},
            {header: "Өндөр", align: "right",
              render: (r) => r.ruleResult.highFlags},
            {header: "Зөрчил", align: "right",
              render: (r) => r.ruleResult.violations.length},
            {header: "Аюулын хүчин зүйлс", render: (r) => (
              <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                {r.ruleResult.violations.slice(0, 3).map((v, i) => (
                  <Badge key={i} text={trunc(v.ruleName, 16)}
                    kind={sevClass(v.severity)} />
                ))}
                {r.ruleResult.violations.length > 3 && (
                  <span style={{fontSize: 10, color: "var(--text-muted)"}}>
                    +{r.ruleResult.violations.length - 3}
                  </span>
                )}
              </div>
            )},
            {header: "Нотлох баримт", render: (r) =>
              !activeCase ? <span style={{color: "var(--text-muted)"}}>—</span>
                : exhibitByAccount.has(r.bankAccountId)
                  ? (
                    <span className="badge info">
                      #{exhibitByAccount.get(r.bankAccountId)}
                    </span>
                  )
                  : (
                    <button className="btn btn-sm" onClick={() => onTag(r)}>
                      + ТЭМДЭГЛЭХ
                    </button>
                  )},
          ]}
        />
      </Card>

      <div style={ROW}>
        <Card title="Бүлгэлсэн шийдвэрийн логик">
          <div style={{fontSize: 11, color: "var(--text-secondary)",
            lineHeight: 1.7}}>
            <div style={{color: "var(--accent-cyan)", fontWeight: 700,
              marginBottom: 6}}>ОНООНЫ ЗАГВАР</div>
            <div>1. Дүрмийн зөрчил бүрийн онааг цуглуулна.</div>
            <div>2. Суурь оноо = Σ(зөрчлийн оноо) [дээд тал 1.0].</div>
            <div>3. Дүрмийн өсөлт = ЭГЗЭГТЭЙ×0.10 + ӨНДӨР×0.05.</div>
            <div>4. Эцсийн оноо = Суурь + Өсөлт [дээд тал 1.0].</div>
          </div>
          <div style={{color: "var(--accent-cyan)", fontWeight: 700,
            margin: "12px 0 8px", fontSize: 11}}>ШИЙДВЭРИЙН ТҮВШИНҮҮД</div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 8}}>
            {[
              {t: "≥ 75% → BLOCK", c: "#FF1744"},
              {t: "50–74% → HOLD FOR REVIEW", c: "#FFAB00"},
              {t: "30–49% → MONITOR", c: "#448AFF"},
              {t: "< 30% → ALLOW", c: "#00E676"},
            ].map((d) => (
              <div key={d.t} style={{fontSize: 11, fontWeight: 600,
                color: d.c, border: `1px solid ${d.c}`, borderRadius: 6,
                padding: "8px 10px"}}>{d.t}</div>
            ))}
          </div>
        </Card>
        <Card title="Дүрмийн хөдөлгүүрийн тохиргоо" noPadding>
          <div style={{maxHeight: 300, overflowY: "auto"}}>
            {RULE_DEFINITIONS.map((rd) => (
              <div key={rd.id} style={{padding: "10px 14px",
                borderBottom: "1px solid var(--border-primary)",
                display: "flex", justifyContent: "space-between", gap: 8}}>
                <div>
                  <div style={{fontSize: 11, fontWeight: 600}}>
                    <span style={{color: "var(--accent-cyan)"}}>R{rd.id}</span>
                    {" "}{rd.name}
                  </div>
                  <div style={{fontSize: 10, color: "var(--text-muted)"}}>
                    {rd.description}
                  </div>
                </div>
                <div style={{textAlign: "right", whiteSpace: "nowrap"}}>
                  <Badge text={rd.severity} kind={sevClass(rd.severity)} />
                  <div style={{fontSize: 10, color: "var(--accent-amber)",
                    marginTop: 2}}>+{(rd.baseScore * 100).toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
