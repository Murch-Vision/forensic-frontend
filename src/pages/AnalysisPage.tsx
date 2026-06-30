/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AnalysisPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useQuery} from "@apollo/client";
import {FRAUD_WORKFLOW} from "../graphql/queries";
import {
  Badge,
  BenfordChart,
  Card,
  Loading,
  PageHeader,
  RadarChart,
  StatCard,
} from "../components/kit";
import Plot from "../components/Plot";
import {riskClass, sevClass} from "../lib/format";
import type {RiskLevel} from "../types";

interface WfAnalysis {
  riskLevel: RiskLevel;
  overallRisk: number;
  verdict: string | null;
  benfordPasses: boolean;
  benfordChiSquared: number;
  avgTransactionsPerDay: number;
  maxTransactionsPerDay: number;
  nearThresholdPercentage: number;
  roundNumberPercentage: number;
  offHoursPercentage: number;
  weekendPercentage: number;
  velocityScore: number;
  amountVarianceScore: number;
  roundNumberScore: number;
  offHoursScore: number;
  nearThresholdScore: number;
  categoryDiversityScore: number;
}

interface WfResult {
  bankAccountId: number;
  accountName: string;
  benfordObserved: number[];
  analysis: WfAnalysis;
  ruleResult: {
    finalScore: number;
    finalAction: string;
    finalRisk: string;
    criticalFlags: number;
    highFlags: number;
    modelScore: number | null;
    modelAction: string;
    violations: {ruleId: number; ruleName: string; severity: string;
      description: string}[];
  };
}

const RADAR_AXES = ["Хурд", "Хэлбэлзэл", "Бүтэн тоо", "Шөнө", "Босго", "Ангилал"];

export default function AnalysisPage() {
  const {data, loading, refetch} = useQuery<{fraudWorkflow: WfResult[]}>(
    FRAUD_WORKFLOW
  );

  const actions = (
    <button className="btn btn-primary" onClick={() => refetch()}
      disabled={loading}>БҮТЭН АНАЛИЗЫГ ЭХЛҮҮЛЭХ</button>
  );

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="🔍" title="Нарийвчилсан Анализ"
          subtitle="ДҮРЭМ ХӨДӨЛГҮҮР" actions={actions} />
        <Loading />
      </div>
    );
  }

  const results = data.fraudWorkflow;
  const high = results.filter((r) =>
    r.analysis.riskLevel === "HIGH" || r.analysis.riskLevel === "CRITICAL").length;
  const medium = results.filter((r) => r.analysis.riskLevel === "MEDIUM").length;
  const low = results.filter((r) => r.analysis.riskLevel === "LOW").length;
  const violations = results.reduce((a, r) => a + r.ruleResult.violations.length, 0);
  const blocked = results.filter((r) => r.ruleResult.finalAction === "BLOCK").length;

  return (
    <div className="page-container">
      <PageHeader icon="🔍" title="Нарийвчилсан Анализ"
        subtitle="ДҮРЭМ ХӨДӨЛГҮҮР БА БЕНФОРД" actions={actions} />

      <div className="metrics-grid">
        <StatCard label="Анализ хийсэн данс" value={results.length} color="cyan" />
        <StatCard label="Ноцтой/Өндөр" value={high} color="red" />
        <StatCard label="Дунд" value={medium} color="amber" />
        <StatCard label="Бага" value={low} color="green" />
        <StatCard label="Дүрмийн зөрчил" value={violations} color="purple" />
        <StatCard label="Хоригдсон" value={blocked} color="red" />
      </div>

      {results.length > 0 && (
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: 16, marginBottom: 16}}>
          <Card title="Олон хэмжээст аюулын профайл">
            <Plot
              height={360}
              data={[{
                type: "parcoords",
                line: {color: results.map((r) => r.analysis.overallRisk),
                  colorscale: "Jet", cmin: 0, cmax: 100, showscale: true},
                dimensions: [
                  {label: "Velocity", range: [0, 100],
                    values: results.map((r) => r.analysis.velocityScore)},
                  {label: "Variance", range: [0, 100],
                    values: results.map((r) => r.analysis.amountVarianceScore)},
                  {label: "Round Amt", range: [0, 100],
                    values: results.map((r) => r.analysis.roundNumberScore)},
                  {label: "Off-Hours", range: [0, 100],
                    values: results.map((r) => r.analysis.offHoursScore)},
                  {label: "Threshold", range: [0, 100],
                    values: results.map((r) => r.analysis.nearThresholdScore)},
                  {label: "Categories", range: [0, 100],
                    values: results.map((r) => r.analysis.categoryDiversityScore)},
                ],
              }]}
              layout={{margin: {l: 60, r: 40, t: 30, b: 20}}}
            />
          </Card>
          <Card title="Аюулын оноогийн тархалт">
            <Plot
              height={360}
              data={[{
                type: "histogram",
                x: results.map((r) => r.analysis.overallRisk),
                marker: {color: "#00E5FF"},
                xbins: {start: 0, end: 100, size: 10},
              }]}
              layout={{xaxis: {range: [0, 100]}, bargap: 0.05}}
            />
          </Card>
        </div>
      )}

      {results.map((r) => (
        <Card key={r.bankAccountId} style={{marginBottom: 16}}
          title={
            <span>
              {r.accountName}{" "}
              <Badge text={r.analysis.riskLevel}
                kind={riskClass(r.analysis.riskLevel)} />
            </span>
          }
          actions={
            <span style={{display: "flex", gap: 8, alignItems: "center"}}>
              <Badge text={r.ruleResult.finalAction}
                kind={sevClass(r.ruleResult.finalRisk === "NORMAL"
                  ? "INFO" : r.ruleResult.finalRisk)} />
              <span style={{fontFamily: "var(--font-mono)", fontSize: 12,
                fontWeight: 700}}>
                {(r.ruleResult.finalScore * 100).toFixed(0)}%
              </span>
              {r.ruleResult.modelScore != null && (
                <span style={{fontSize: 10, padding: "3px 8px",
                  border: "1px dashed var(--accent-purple)", borderRadius: 4,
                  color: "var(--accent-purple)"}}>
                  ML: {r.ruleResult.modelAction}{" "}
                  {(r.ruleResult.modelScore * 100).toFixed(0)}%
                </span>
              )}
            </span>
          }>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16}}>
            <div>
              <div className="metric-label">АЮУЛЫН ПРОФАЙЛ</div>
              <RadarChart axes={RADAR_AXES} values={[
                r.analysis.velocityScore, r.analysis.amountVarianceScore,
                r.analysis.roundNumberScore, r.analysis.offHoursScore,
                r.analysis.nearThresholdScore, r.analysis.categoryDiversityScore,
              ]} />
            </div>
            <div>
              <div className="metric-label">БЕНФОРДЫН ХУУЛЬ</div>
              <BenfordChart observed={r.benfordObserved} />
            </div>
            <div>
              <div className="metric-label">ҮЗҮҮЛЭЛТҮҮД</div>
              <Stat label="Хурд (өдөрт)" value={r.analysis.avgTransactionsPerDay.toFixed(1)} />
              <Stat label="Өдөрт их" value={String(r.analysis.maxTransactionsPerDay)} />
              <Stat label="Бүтэц %" value={`${r.analysis.nearThresholdPercentage.toFixed(1)}%`}
                warn={r.analysis.nearThresholdPercentage > 10} />
              <Stat label="Бүтэн дүн %" value={`${r.analysis.roundNumberPercentage.toFixed(1)}%`} />
              <Stat label="Шөнийн %" value={`${r.analysis.offHoursPercentage.toFixed(1)}%`} />
              <Stat label="Амралтын %" value={`${r.analysis.weekendPercentage.toFixed(1)}%`} />
              <Stat label="Бенфорд" value={r.analysis.benfordPasses ? "ДАРААЛАЛ" : "БҮТЦЭГҮЙ"}
                warn={!r.analysis.benfordPasses} />
              <Stat label="Чи-квадрат" value={r.analysis.benfordChiSquared.toFixed(2)} />
            </div>
          </div>
          {r.ruleResult.violations.length > 0 && (
            <div style={{marginTop: 12}}>
              <div className="metric-label">ДҮРМИЙН ЗӨРЧИЛҮҮД</div>
              {r.ruleResult.violations.map((v, i) => (
                <div key={i} style={{padding: "4px 0", fontSize: 11,
                  borderBottom: "1px solid var(--border-primary)"}}>
                  <Badge text={v.severity} kind={sevClass(v.severity)} />{" "}
                  <span style={{color: "var(--accent-cyan)", fontWeight: 600}}>
                    {v.ruleName}
                  </span>{" — "}{v.description}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Stat({label, value, warn}: {label: string; value: string; warn?: boolean}) {
  return (
    <div style={{display: "flex", justifyContent: "space-between",
      fontSize: 11, padding: "3px 0"}}>
      <span style={{color: "var(--text-muted)"}}>{label}</span>
      <span style={{color: warn ? "var(--risk-high)" : "var(--text-primary)",
        fontWeight: 600}}>{value}</span>
    </div>
  );
}
