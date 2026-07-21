/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : DashboardPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-05
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {useNavigate} from "react-router-dom";
import {
  ACTIVE_CASE_QUERY,
  DASHBOARD_CASE_QUERY,
  DASHBOARD_OVERVIEW_QUERY,
  EVIDENCE_FOR_CASE,
  SET_ACTIVE_CASE,
} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  Loading,
  MultiLineChart,
  PageHeader,
  StatCard,
} from "../components/kit";
import type {Column} from "../components/kit";
import {
  formatDate, formatDateTime, formatMoney, formatNum, riskClass, sevClass,
} from "../lib/format";
import {
  PRIORITY_BADGE, PRIORITY_LABELS, STATUS_BADGE, STATUS_LABELS,
} from "../nav";
import type {DashboardStats, PatternAlert, RiskLevel} from "../types";

// Кейс-төвтэй самбар. ДҮРЭМ: зөвхөн БАЙГАА өгөгдлийг харуулна — хоосон
// section, тэг карт, цэс давхардуулсан товч огт байхгүй. Тоо бүр нь өөрийн
// хуудас руу drill-down, алерт нь шүүлттэй /transactions руу үсэрнэ.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
  description: string | null;
  status: string;
  priority: string;
  leadInvestigator: string | null;
  createdAt: string;
}

interface DashSuspect {
  id: number;
  suspectId: string;
  fullName: string;
  riskLevel: RiskLevel;
  occupation: string | null;
  initials: string;
  bankAccounts: {id: number}[];
  phoneNumbers: {id: number; number: string}[];
}

interface DashAccount {
  id: number;
  bankName: string | null;
  maskedNumber: string;
  suspectId: number | null;
}

interface DashTxn {
  id: number;
  bankAccountId: number;
  timestamp: string;
  amount: number;
  type: string;
  flagStatus: string;
}

interface CaseData {
  activeCase: CaseRef | null;
  suspects: DashSuspect[];
  bankAccounts: DashAccount[];
  transactions: DashTxn[];
  callRecords: {id: number; startTime: string}[];
  suspectLinks: {id: number}[];
  patterns: PatternAlert[];
}

const SEV_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, ALERT: 2, MEDIUM: 3, WARNING: 3, LOW: 4, INFO: 5,
};

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--risk-critical)",
  HIGH: "var(--risk-high)",
  MEDIUM: "var(--severity-warning)",
  LOW: "var(--risk-low)",
  INFO: "var(--severity-info)",
};

const RISK_ORDER: Record<string, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4,
};

// analysisService.detectPatterns() alert types.
const ALERT_LABELS: Record<string, string> = {
  RAPID_TRANSACTIONS: "Дараалсан түргэн гүйлгээ",
  ROUND_TRIP: "Буцаан шилжүүлэг",
  SMURFING: "Жижиглэсэн орлого (смөрфинг)",
  BURST_CALLING: "Олон давтан дуудлага",
};

function Shell({subtitle, children}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="page-container">
      <PageHeader icon="📊" title="Хяналтын самбар" subtitle={subtitle} />
      {children}
    </div>
  );
}

// === Кейс сонгоогүй =========================================================

interface OverviewData {
  dashboardStats: DashboardStats;
  caseFiles: CaseRef[];
}

function Overview() {
  const client = useApolloClient();
  const {data, loading} = useQuery<OverviewData>(DASHBOARD_OVERVIEW_QUERY);
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE);

  async function pick(id: number) {
    await setActiveCase({variables: {caseFileId: id}});
    await client.resetStore();
  }

  if (loading || !data) {
    return <Shell subtitle="КЕЙС СОНГООГҮЙ"><Loading /></Shell>;
  }

  const s = data.dashboardStats;
  const stats: {label: string; value: React.ReactNode; color?: string}[] = [
    {label: "Нээлттэй кейс", value: s.openCases},
    {label: "Нийт сэжигтэн", value: s.totalSuspects},
    {label: "Нийт гүйлгээ", value: formatNum(s.totalTransactions)},
    {label: "Нийт дуудлага", value: formatNum(s.totalCallRecords)},
    {label: "Өндөр эрсдэл", value: s.highRiskSuspects, color: "red"},
    {label: "Нийт дүн", value: formatMoney(s.totalTransactionVolume),
      color: "green"},
  ].filter((c) => c.value !== 0 && c.value !== "0");

  const cols: Column<CaseRef>[] = [
    {header: "Кейс", render: (c) => <b>{c.caseId}</b>,
      sortValue: (c) => c.caseId},
    {header: "Нэр", render: (c) => c.caseName},
    {header: "Төлөв", render: (c) => (
      <Badge text={STATUS_LABELS[c.status] ?? c.status}
        kind={STATUS_BADGE[c.status] ?? "unknown"} />
    )},
    {header: "Зэрэглэл", render: (c) => (
      <Badge text={PRIORITY_LABELS[c.priority] ?? c.priority}
        kind={PRIORITY_BADGE[c.priority] ?? "unknown"} />
    )},
    {header: "Мөрдөгч", render: (c) => c.leadInvestigator ?? "—"},
  ];

  return (
    <Shell subtitle="КЕЙС СОНГООГҮЙ">
      {stats.length > 0 && (
        <div className="metrics-grid">
          {stats.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value}
              color={c.color} />
          ))}
        </div>
      )}
      <Card title="Кейс сонгох — мөр дээр дарж идэвхжүүлнэ" noPadding>
        <DataTable columns={cols} rows={data.caseFiles}
          rowKey={(c) => c.id}
          empty="Кейс алга"
          onRowClick={(c) => void pick(c.id)} />
      </Card>
    </Shell>
  );
}

// === Кейс идэвхтэй ==========================================================

interface Derived {
  volume: number;
  flagged: number;
  txnRange: string;
  callRange: string;
  months: string[];
  credit: number[];
  debit: number[];
  alerts: PatternAlert[];
  topSuspects: DashSuspect[];
  topTxns: DashTxn[];
  acctLabel: (id: number | null) => string;
}

function range(min: string | null, max: string | null): string {
  return min && max ? `${formatDate(min)} — ${formatDate(max)}` : "—";
}

function derive(data: CaseData): Derived {
  const {suspects, bankAccounts: accounts, transactions: txns} = data;

  let volume = 0;
  let flagged = 0;
  let tMin: string | null = null, tMax: string | null = null;
  const monthMap = new Map<string, {credit: number; debit: number}>();
  for (const t of txns) {
    volume += t.amount;
    if (t.flagStatus === "FLAGGED" || t.flagStatus === "SUSPICIOUS") flagged++;
    if (!tMin || t.timestamp < tMin) tMin = t.timestamp;
    if (!tMax || t.timestamp > tMax) tMax = t.timestamp;
    const key = t.timestamp.slice(0, 7); // YYYY-MM
    const m = monthMap.get(key) ?? {credit: 0, debit: 0};
    if (t.type === "credit") m.credit += t.amount;
    else m.debit += t.amount;
    monthMap.set(key, m);
  }
  const months = [...monthMap.keys()].sort();

  let cMin: string | null = null, cMax: string | null = null;
  for (const c of data.callRecords) {
    if (!cMin || c.startTime < cMin) cMin = c.startTime;
    if (!cMax || c.startTime > cMax) cMax = c.startTime;
  }

  const acctById = new Map(accounts.map((a) => [a.id, a]));
  const suspectById = new Map(suspects.map((s) => [s.id, s]));
  const acctLabel = (id: number | null) => {
    if (id == null) return "";
    const a = acctById.get(id);
    if (!a) return `Данс #${id}`;
    const owner = a.suspectId != null
      ? suspectById.get(a.suspectId)?.fullName : null;
    return [a.bankName, a.maskedNumber, owner].filter(Boolean).join(" · ");
  };

  // patterns нь глобал — зөвхөн энэ кейсийн данс/дугаарт хамаатайг үлдээнэ.
  const acctIds = new Set(accounts.map((a) => a.id));
  const phones = suspects
    .flatMap((s) => s.phoneNumbers.map((p) => p.number))
    .filter(Boolean);
  const alerts = data.patterns
    .filter((p) => p.relatedAccountId != null
      ? acctIds.has(p.relatedAccountId)
      : phones.some((n) => p.description.includes(n)))
    .sort((a, b) =>
      (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)
      || b.timestamp.localeCompare(a.timestamp));

  const topSuspects = [...suspects].sort((a, b) =>
    (RISK_ORDER[a.riskLevel] ?? 9) - (RISK_ORDER[b.riskLevel] ?? 9)
    || a.fullName.localeCompare(b.fullName));

  const topTxns = [...txns].sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    volume, flagged,
    txnRange: range(tMin, tMax),
    callRange: range(cMin, cMax),
    months,
    credit: months.map((k) => monthMap.get(k)!.credit),
    debit: months.map((k) => monthMap.get(k)!.debit),
    alerts, topSuspects, topTxns, acctLabel,
  };
}

const META: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};

function CaseDashboard({caseFileId}: {caseFileId: number}) {
  const nav = useNavigate();
  const {data, loading} = useQuery<CaseData>(DASHBOARD_CASE_QUERY);
  const evQ = useQuery<{evidenceForCase: {id: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId},
  });
  const d = useMemo(() => (data ? derive(data) : null), [data]);

  if (loading || !data || !d) {
    return <Shell subtitle="КЕЙСИЙН ТОЙМ"><Loading /></Shell>;
  }

  const cf = data.activeCase;
  const evidenceCount = evQ.data?.evidenceForCase.length ?? 0;
  const hasTxns = data.transactions.length > 0;
  const isEmpty = data.suspects.length === 0 && !hasTxns
    && data.callRecords.length === 0;

  const meta = cf && (
    <div style={{display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: 10, margin: "-6px 0 16px"}}>
      <Badge text={STATUS_LABELS[cf.status] ?? cf.status}
        kind={STATUS_BADGE[cf.status] ?? "unknown"} />
      <Badge text={PRIORITY_LABELS[cf.priority] ?? cf.priority}
        kind={PRIORITY_BADGE[cf.priority] ?? "unknown"} />
      {cf.leadInvestigator && (
        <span style={META}>Мөрдөгч: {cf.leadInvestigator}</span>
      )}
      {hasTxns && <span style={META}>Гүйлгээ: {d.txnRange}</span>}
      {data.callRecords.length > 0 && (
        <span style={META}>Дуудлага: {d.callRange}</span>
      )}
    </div>
  );

  // Шинэ / хоосон кейс: самбар биш, нэг л мэдэгдэл.
  if (isEmpty) {
    return (
      <Shell subtitle={cf ? `${cf.caseId} · ${cf.caseName}` : "КЕЙСИЙН ТОЙМ"}>
        {meta}
        <div className="case-gate">
          <div className="case-gate-icon">🗂</div>
          <div className="case-gate-title">Энэ кейст өгөгдөл алга</div>
          <p className="case-gate-text">
            <b>Өгөгдөл импорт</b> хуудсаар гүйлгээ, дуудлагын файл оруулах
            эсвэл <b>Хүмүүсийн сан</b>-гаас хүн тэмдэглэхэд самбар идэвхжинэ.
          </p>
        </div>
      </Shell>
    );
  }

  // Тэг картыг харуулахгүй — байгаа өгөгдөл л карт болно.
  const stats: {
    label: string; value: React.ReactNode; color?: string; to?: string;
  }[] = [
    {label: "Сэжигтэн", value: data.suspects.length, to: "/people"},
    {label: "Данс", value: data.bankAccounts.length, to: "/transactions"},
    {label: "Гүйлгээ", value: hasTxns ? formatNum(data.transactions.length)
      : 0, to: "/transactions"},
    {label: "Дуудлага", value: data.callRecords.length === 0 ? 0
      : formatNum(data.callRecords.length), to: "/calls"},
    {label: "Холбоос", value: data.suspectLinks.length, to: "/linkchart"},
    {label: "Тэмдэглэгдсэн", value: d.flagged, color: "red",
      to: "/transactions"},
    {label: "Эд мөрийн баримт", value: evidenceCount, color: "amber"},
    {label: "Нийт дүн", value: d.volume === 0 ? 0 : formatMoney(d.volume),
      color: "green"},
  ].filter((c) => c.value !== 0);

  const txnCols: Column<DashTxn>[] = [
    {header: "Огноо", render: (t) => formatDateTime(t.timestamp),
      sortValue: (t) => t.timestamp},
    {header: "Дүн", align: "right", sortValue: (t) => t.amount,
      render: (t) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(t.amount)}
        </span>
      )},
    {header: "Төрөл", render: (t) => t.type === "credit"
      ? <span style={{color: "var(--accent-green)"}}>Орлого</span>
      : <span style={{color: "var(--accent-red)"}}>Зарлага</span>},
    {header: "Данс", render: (t) => (
      <span style={{fontSize: 11}}>{d.acctLabel(t.bankAccountId)}</span>
    )},
    {header: "", render: (t) => t.flagStatus === "FLAGGED"
      ? <Badge text="Тэмдэглэсэн" kind="critical" />
      : t.flagStatus === "SUSPICIOUS"
        ? <Badge text="Сэжигтэй" kind="medium" /> : null},
  ];

  // Зөвхөн агуулгатай section-ууд — хоосон хайрцаг зурахгүй.
  const sections: React.ReactNode[] = [];

  if (d.alerts.length > 0) {
    sections.push(
      <Card key="alerts" title={`Сэрэмжлүүлэг (${d.alerts.length})`} noPadding>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          {d.alerts.map((a, i) => (
            <div key={i} className="alert-item"
              style={{cursor: "pointer"}}
              onClick={() => a.relatedAccountId != null
                ? nav(`/transactions?acct=${a.relatedAccountId}`)
                : nav("/calls")}>
              <div className="alert-severity-bar" style={{
                background: SEV_COLOR[a.severity] ?? "var(--text-muted)",
              }} />
              <div style={{flex: 1, minWidth: 0}}>
                <div style={{display: "flex", gap: 8,
                  justifyContent: "space-between"}}>
                  <span style={{fontSize: 12, fontWeight: 600}}>
                    {ALERT_LABELS[a.alertType] ?? a.alertType}
                  </span>
                  <Badge text={a.severity} kind={sevClass(a.severity)} />
                </div>
                <div style={{fontSize: 11, marginTop: 2,
                  color: "var(--text-secondary)"}}>
                  {a.description}
                </div>
                <div style={{fontSize: 10, marginTop: 2,
                  color: "var(--text-muted)"}}>
                  {[d.acctLabel(a.relatedAccountId),
                    formatDateTime(a.timestamp)]
                    .filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (data.suspects.length > 0) {
    sections.push(
      <Card key="suspects" title={`Сэжигтнүүд (${data.suspects.length})`}
        noPadding>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          {d.topSuspects.map((su) => (
            <div key={su.id} className="suspect-row"
              style={{cursor: "pointer"}}
              onClick={() => nav("/people")}>
              <div className={`avatar ${riskClass(su.riskLevel)}`}>
                {su.initials}
              </div>
              <div className="info">
                <div className="name">{su.fullName}</div>
                <div className="detail">
                  {su.suspectId} · {su.occupation ?? "—"} ·{" "}
                  {su.bankAccounts.length} данс ·{" "}
                  {su.phoneNumbers.length} утас
                </div>
              </div>
              <Badge text={su.riskLevel} kind={riskClass(su.riskLevel)} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (d.months.length > 1) {
    sections.push(
      <Card key="flow" title="Мөнгөн урсгал (сараар)">
        <MultiLineChart
          x={d.months}
          series={[
            {name: "Орлого", y: d.credit, color: "#00E676"},
            {name: "Зарлага", y: d.debit, color: "#FF5252"},
          ]}
        />
      </Card>
    );
  }

  if (hasTxns) {
    sections.push(
      <Card key="toptxns" title="Хамгийн том гүйлгээнүүд" noPadding>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          <DataTable columns={txnCols} rows={d.topTxns}
            rowKey={(t) => t.id}
            empty="Гүйлгээ алга"
            defaultSort={{col: 1, dir: "desc"}}
            onRowClick={(t) =>
              nav(`/transactions?acct=${t.bankAccountId}`)} />
        </div>
      </Card>
    );
  }

  return (
    <Shell subtitle={cf ? `${cf.caseId} · ${cf.caseName}` : "КЕЙСИЙН ТОЙМ"}>
      {meta}
      {stats.length > 0 && (
        <div className="metrics-grid">
          {stats.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value}
              color={c.color}
              onClick={c.to ? () => nav(c.to!) : undefined} />
          ))}
        </div>
      )}
      <div style={{display: "grid", gap: 16,
        gridTemplateColumns: sections.length > 1 ? "1fr 1fr" : "1fr"}}>
        {sections}
      </div>
    </Shell>
  );
}

export default function DashboardPage() {
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);

  if (caseQ.loading && !caseQ.data) {
    return <Shell subtitle="ТОЙМ"><Loading /></Shell>;
  }

  const active = caseQ.data?.activeCase ?? null;
  return active ? <CaseDashboard caseFileId={active.id} /> : <Overview />;
}
