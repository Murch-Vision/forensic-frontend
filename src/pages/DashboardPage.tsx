/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : DashboardPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-05
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {useNavigate} from "react-router-dom";
import {
  ACTIVE_CASE_QUERY,
  CASE_RELATIONS_QUERY,
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
import {Select} from "../components/inputs";
import {
  formatDate, formatDateTime, formatMoney, formatNum,
} from "../lib/format";
import {
  PRIORITY_BADGE, PRIORITY_LABELS, STATUS_BADGE, STATUS_LABELS,
} from "../nav";
import type {DashboardStats, RiskLevel} from "../types";

// Хэрэг-төвтэй самбар. ДҮРЭМ: зөвхөн БАЙГАА өгөгдлийг харуулна — хоосон
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
}

interface DashAccount {
  id: number;
  bankName: string | null;
  accountNumber: string;
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
}

// Харьцаа — server-side counterparty aggregate (see relationService.ts).
interface Relation {
  key         : string;
  name        : string;
  account     : string | null;
  nationalId? : string | null;
  txnCount    : number;
  creditCount?: number;
  debitCount? : number;
  creditTotal : number;
  debitTotal  : number;
  netTotal    : number;
  accountIds? : number[];
  mutual      : boolean;
  subjectMatch: boolean;
}

interface AccountRelations {
  accountId     : number;
  label         : string;
  txnCount      : number;
  relationCount : number;
  relations     : Relation[];
}

interface RelationData {
  caseRelations: {
    statementAccounts : number;
    totalRelations    : number;
    mutualRelations   : number;
    txnCount          : number;
    creditCount       : number;
    debitCount        : number;
    creditTotal       : number;
    debitTotal        : number;
    netTotal          : number;
    unnamedTxnCount   : number;
    relations         : Relation[];
    byAccount         : AccountRelations[];
  };
}

// Улаан нь регистрийн таарсныг, шар нь дундын харьцааг илэрхийлнэ.
function relColor(r: {subjectMatch: boolean; mutual: boolean}): string {
  if (r.subjectMatch) return "var(--accent-red)";
  if (r.mutual) return "var(--accent-amber)";
  return "var(--text-primary)";
}

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

// === Хэрэг сонгоогүй =========================================================

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
    return <Shell subtitle="ХЭРЭГ СОНГООГҮЙ"><Loading /></Shell>;
  }

  const s = data.dashboardStats;
  const stats: {label: string; value: React.ReactNode; color?: string}[] = [
    {label: "Нээлттэй хэрэг", value: s.openCases},
    {label: "Нийт сэжигтэн", value: s.totalSuspects},
    {label: "Нийт гүйлгээ", value: formatNum(s.totalTransactions)},
    {label: "Нийт дуудлага", value: formatNum(s.totalCallRecords)},
    {label: "Өндөр эрсдэл", value: s.highRiskSuspects, color: "red"},
    {label: "Нийт дүн", value: formatMoney(s.totalTransactionVolume),
      color: "green"},
  ].filter((c) => c.value !== 0 && c.value !== "0");

  const cols: Column<CaseRef>[] = [
    {header: "Хэрэг", render: (c) => <b>{c.caseId}</b>,
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
    <Shell subtitle="ХЭРЭГ СОНГООГҮЙ">
      {stats.length > 0 && (
        <div className="metrics-grid">
          {stats.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value}
              color={c.color} />
          ))}
        </div>
      )}
      <Card title="Хэрэг сонгох — мөр дээр дарж идэвхжүүлнэ" noPadding>
        <DataTable columns={cols} rows={data.caseFiles}
          rowKey={(c) => c.id}
          empty="Хэрэг алга"
          onRowClick={(c) => void pick(c.id)} />
      </Card>
    </Shell>
  );
}

// === Хэрэг идэвхтэй ==========================================================

interface Derived {
  volume: number;
  flagged: number;
  txnRange: string;
  callRange: string;
  months: string[];
  credit: number[];
  debit: number[];
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
    return [a.bankName, a.accountNumber, owner].filter(Boolean).join(" · ");
  };

  const topTxns = [...txns].sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    volume, flagged,
    txnRange: range(tMin, tMax),
    callRange: range(cMin, cMax),
    months,
    credit: months.map((k) => monthMap.get(k)!.credit),
    debit: months.map((k) => monthMap.get(k)!.debit),
    topTxns, acctLabel,
  };
}

const META: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};

function CaseDashboard({caseFileId}: {caseFileId: number}) {
  const nav = useNavigate();
  // Which statement account the харьцаа columns show ("All" = every one).
  const [acctFilter, setAcctFilter] = useState("All");
  const {data, loading} = useQuery<CaseData>(DASHBOARD_CASE_QUERY);
  const relQ = useQuery<RelationData>(CASE_RELATIONS_QUERY);
  const evQ = useQuery<{evidenceForCase: {id: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId},
  });
  const d = useMemo(() => (data ? derive(data) : null), [data]);

  if (loading || !data || !d) {
    return <Shell subtitle="ХЭРГИЙН ТОЙМ"><Loading /></Shell>;
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

  // Шинэ / хоосон хэрэг: самбар биш, нэг л мэдэгдэл.
  if (isEmpty) {
    return (
      <Shell subtitle={cf ? `${cf.caseId} · ${cf.caseName}` : "ХЭРГИЙН ТОЙМ"}>
        {meta}
        <div className="case-gate">
          <div className="case-gate-icon">🗂</div>
          <div className="case-gate-title">Энэ хэрэгт өгөгдөл алга</div>
          <p className="case-gate-text">
            <b>Өгөгдөл импорт</b> хуудсаар гүйлгээ, дуудлагын файл оруулах
            эсвэл <b>Субьектийн жагсаалт</b>-аас хүн тэмдэглэхэд самбар идэвхжинэ.
          </p>
        </div>
      </Shell>
    );
  }

  // Тэг картыг харуулахгүй — байгаа өгөгдөл л карт болно.
  // ⛔ The cards do NOT link anywhere. Every one of them opened the same
  // unfiltered /transactions page, so the click promised a drill-down it never
  // performed; the number is the whole point of the card.
  const rel = relQ.data?.caseRelations;
  const stats: {
    label: string; value: React.ReactNode; color?: string;
  }[] = [
    {label: "Нийт хуулсан данс", value: rel ? rel.statementAccounts : 0},
    {label: "Нийт харьцаа", value: rel ? formatNum(rel.totalRelations) : 0},
    {label: "Дундын харьцаа", value: rel ? formatNum(rel.mutualRelations) : 0,
      color: "amber"},
    {label: "Нийт гүйлгээ", value: hasTxns
      ? formatNum(data.transactions.length) : 0},
    {label: "Орлогын гүйлгээ", value: rel ? formatNum(rel.creditCount) : 0},
    {label: "Зарлагын гүйлгээ", value: rel ? formatNum(rel.debitCount) : 0},
    {label: "Нийт орлого",
      value: rel && rel.creditTotal !== 0 ? formatMoney(rel.creditTotal) : 0,
      color: "green"},
    {label: "Нийт зарлага",
      value: rel && rel.debitTotal !== 0 ? formatMoney(rel.debitTotal) : 0,
      color: "red"},
    // The difference is the point of the pair above, so it shows even at zero.
    {label: "Орлого зарлагын зөрүү",
      value: rel ? formatMoney(rel.netTotal) : "—",
      color: rel && rel.netTotal < 0 ? "red" : "green"},
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

  const money = (v: number) => (
    <span style={{fontFamily: "var(--font-mono)"}}>{formatMoney(v)}</span>
  );

  // Дундын харьцаа: нэр | гүйлгээ | орлого | зарлага | зөрүү.
  // ⛔ No "Данс" column and no amber: one person's accounts are merged into a
  // single row now (relationService keys by the PERSON), so a column holding
  // one of his numbers would be picking a favourite. And inside a list whose
  // every row is дундын, painting them all amber says nothing.
  const relCols: Column<Relation>[] = [
    {header: "Харьцаа", sortValue: (r) => r.name,
      render: (r) => (
        <span style={{color: r.subjectMatch
          ? "var(--accent-red)" : "var(--text-primary)"}}>{r.name}</span>
      )},
    {header: "Гүйлгээ", align: "right", sortValue: (r) => r.txnCount,
      render: (r) => formatNum(r.txnCount)},
    {header: "Орлого", align: "right", sortValue: (r) => r.creditTotal,
      render: (r) => money(r.creditTotal)},
    {header: "Зарлага", align: "right", sortValue: (r) => r.debitTotal,
      render: (r) => money(r.debitTotal)},
    {header: "Зөрүү", align: "right", sortValue: (r) => r.netTotal,
      render: (r) => (
        <span style={{fontFamily: "var(--font-mono)", color: r.netTotal < 0
          ? "var(--accent-red)" : "var(--accent-green)"}}>
          {formatMoney(r.netTotal)}
        </span>
      )},
  ];

  // Slide 6 — one row per direction, biggest money first. A counterparty that
  // both received and sent appears once for each, which is what "Төрөл" is for.
  interface FlowRow {
    key: string; name: string; count: number; amount: number; credit: boolean;
  }
  const topFlows: FlowRow[] = (rel?.relations ?? [])
    .flatMap((r) => {
      const rows: FlowRow[] = [];
      if (r.creditTotal > 0) {
        rows.push({key: `${r.key}:in`, name: r.name,
          count: r.creditCount ?? 0, amount: r.creditTotal, credit: true});
      }
      if (r.debitTotal > 0) {
        rows.push({key: `${r.key}:out`, name: r.name,
          count: r.debitCount ?? 0, amount: r.debitTotal, credit: false});
      }
      return rows;
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25);

  const flowCols: Column<FlowRow>[] = [
    {header: "Давтамж", align: "right", sortValue: (f) => f.count,
      render: (f) => `${formatNum(f.count)} удаа`},
    {header: "Дүн", align: "right", sortValue: (f) => f.amount,
      render: (f) => money(f.amount)},
    {header: "Төрөл", render: (f) => (
      <span style={{color: f.credit
        ? "var(--accent-green)" : "var(--accent-red)"}}>
        {f.credit ? "Орлого" : "Зарлага"}
      </span>
    )},
    {header: "Харьцаа", sortValue: (f) => f.name, render: (f) => f.name},
  ];

  // Улаан/шар нь тайлбаргүй бол таагдахгүй — шошго хажууд нь.
  const relLegend = (
    <span style={{display: "inline-flex", gap: 12, fontSize: 11}}>
      <span style={{color: "var(--accent-red)"}}>Регистр таарсан</span>
      <span style={{color: "var(--accent-amber)"}}>Дундын</span>
    </span>
  );
  // The дундын list needs only the red one — see relCols.
  const matchLegend = (
    <span style={{fontSize: 11, color: "var(--accent-red)"}}>
      Регистр таарсан
    </span>
  );
  // Drill-through: the counterparty is a PERSON now, so filter the transaction
  // list by his name — an account number would only carry one of his.
  const relLink = (r: Relation, accountId?: number): string => {
    const q = r.name && r.name !== "—"
      ? `cpname=${encodeURIComponent(r.name)}`
      : `cp=${encodeURIComponent(r.account ?? "")}`;
    return `/transactions?${accountId ? `acct=${accountId}&` : ""}${q}`;
  };

  // Зөвхөн агуулгатай section-ууд — хоосон хайрцаг зурахгүй.
  const sections: React.ReactNode[] = [];

  // Дундын харьцаа — the counterparties seen on more than one of our
  // statement accounts. This replaced the old Сэрэмжлүүлэг panel.
  const mutual = (rel?.relations ?? []).filter((r) => r.mutual);
  if (mutual.length > 0) {
    sections.push(
      <Card key="mutual" title={`Дундын харилцааны жагсаалт (${mutual.length})`}
        actions={matchLegend} noPadding>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          <DataTable columns={relCols} rows={mutual}
            rowKey={(r) => r.key} empty="Дундын харьцаа алга"
            pageSize={50}
            onRowClick={(r) => nav(relLink(r))} />
        </div>
      </Card>
    );
  }

  // Нийт харьцаанууд — ONE COLUMN PER STATEMENT ACCOUNT, side by side, exactly
  // the layout the client drew: the account and its transaction total as the
  // head, then whom it dealt with and how many times. Stacking the accounts
  // vertically (as this did) meant the second account's list only existed
  // below the fold, and the two could never be compared. More accounts than
  // fit ⇒ the strip scrolls sideways; the filter picks one out.
  const shownGroups = acctFilter === "All"
    ? (rel?.byAccount ?? [])
    : (rel?.byAccount ?? []).filter((g) => String(g.accountId) === acctFilter);
  if (rel && rel.byAccount.length > 0) {
    sections.push(
      <Card key="byacct"
        title={`Нийт харьцаа — гүйлгээний тоогоор (${rel.totalRelations})`}
        actions={
          <div style={{display: "flex", gap: 12, alignItems: "center"}}>
            {relLegend}
            <Select value={acctFilter} onChange={setAcctFilter} searchable
              style={{minWidth: 200}}
              options={[
                {value: "All", label: "Бүх данс"},
                ...rel.byAccount.map((g) => ({
                  value: String(g.accountId), label: g.label})),
              ]} />
          </div>
        }
        noPadding>
        <div style={{display: "flex", overflowX: "auto"}}>
          {shownGroups.map((g) => (
            <div key={g.accountId}
              style={{flex: "0 0 320px", minWidth: 320,
                borderRight: "1px solid var(--border-primary)"}}>
              <div title={g.label}
                style={{padding: "8px 12px", fontSize: 11, fontWeight: 700,
                  color: "var(--accent-cyan)", background: "var(--bg-input)",
                  borderTop: "1px solid var(--border-primary)",
                  borderBottom: "1px solid var(--border-primary)"}}>
                <div style={{overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap"}}>{g.label}</div>
                <div style={{color: "var(--text-secondary)", fontWeight: 400,
                  marginTop: 2}}>
                  {formatNum(g.txnCount)} гүйлгээ ·{" "}
                  {formatNum(g.relationCount)} харьцаа
                </div>
              </div>
              <div style={{maxHeight: 420, overflowY: "auto"}}>
                {g.relations.map((r) => (
                  <div key={`${g.accountId}:${r.key}`}
                    style={{display: "flex", gap: 8, alignItems: "center",
                      padding: "6px 12px", fontSize: 12, cursor: "pointer",
                      borderTop: "1px solid var(--border-primary)"}}
                    onClick={() => nav(relLink(r, g.accountId))}>
                    <span style={{flex: 1, minWidth: 0, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                      color: relColor(r)}}
                      title={r.name}>
                      {r.name}
                    </span>
                    <span style={{fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)"}}>
                      {formatNum(r.txnCount)}
                    </span>
                  </div>
                ))}
              </div>
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

  if (topFlows.length > 0) {
    sections.push(
      <Card key="topflows" title="Хамгийн өндөр дүнгээр гүйлгээ хийсэн харьцаа"
        noPadding>
        <div style={{maxHeight: 360, overflowY: "auto"}}>
          <DataTable columns={flowCols} rows={topFlows}
            rowKey={(f) => f.key} empty="Харьцаа алга"
            defaultSort={{col: 1, dir: "desc"}} />
        </div>
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
    <Shell subtitle={cf ? `${cf.caseId} · ${cf.caseName}` : "ХЭРГИЙН ТОЙМ"}>
      {meta}
      {stats.length > 0 && (
        <div className="metrics-grid">
          {stats.map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value}
              color={c.color} />
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
