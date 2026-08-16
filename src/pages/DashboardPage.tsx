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
  PageHeader,
  StatCard,
} from "../components/kit";
import type {Column} from "../components/kit";
import {MultiSelect} from "../components/inputs";
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
  ownerName     : string | null;
  accountNumber : string;
  txnCount      : number;
  relationCount : number;
  mutualCount   : number;
  creditCount   : number;
  debitCount    : number;
  creditTotal   : number;
  debitTotal    : number;
  netTotal      : number;
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

// Шар = дундын харьцаа. ⛔ THE RED IS GONE, and must not come back while the
// subject list is built by the importer: importService.ensureSuspect() inserts
// a suspect row (`IMP-<регистр>`) for EVERY counterparty регистр it reads out
// of a statement. Measured 2026-08-16 on this database: 226 suspects, 225 with
// a регистр, and 225 of the 313 counterparties "matched" one — every match
// being the row the import had just created from that same counterparty. The
// red therefore marked nothing but "this name was imported", while reading as
// "this person is a known subject".
function relColor(r: {mutual: boolean}): string {
  return r.mutual ? "var(--accent-amber)" : "var(--text-primary)";
}

// Нэр дээрээ, данс доороо — HIS format, and the only one used from here on:
// a name and a seventeen-digit number on one line is read as neither.
function PartyCell({name, account}: {name: string; account?: string | null}) {
  return (
    <div style={{lineHeight: 1.3, minWidth: 0}}>
      <div style={{overflow: "hidden", textOverflow: "ellipsis",
        whiteSpace: "nowrap"}}>{name}</div>
      {account && (
        <div style={{fontSize: 11, color: "var(--text-muted)",
          fontFamily: "var(--font-mono)"}}>{account}</div>
      )}
    </div>
  );
}

// One statement account as a COLUMN: the account and its transaction total on
// top, then whom it dealt with and how many times — the client's own layout.
function AcctColumn({g, nav, link}: {
  g: AccountRelations;
  nav: (to: string) => void;
  link: (r: Relation, accountId?: number) => string;
}) {
  return (
    // Grows to fill the card when there are few columns (one selected account
    // used to leave two thirds of the box empty) and holds 320px when there
    // are many, so the strip scrolls sideways instead of squeezing names.
    <div style={{flex: "1 1 320px", minWidth: 320, display: "flex",
      flexDirection: "column",
      borderRight: "1px solid var(--border-primary)"}}>
      <div title={g.label}
        style={{padding: "8px 12px", fontSize: 11, fontWeight: 700,
          color: "var(--accent-cyan)", background: "var(--bg-input)",
          borderTop: "1px solid var(--border-primary)",
          borderBottom: "1px solid var(--border-primary)"}}>
        <PartyCell name={g.ownerName ?? g.accountNumber}
          account={g.ownerName ? g.accountNumber : null} />
        <div style={{color: "var(--text-secondary)", fontWeight: 400,
          marginTop: 2}}>
          {formatNum(g.txnCount)} гүйлгээ · {formatNum(g.relationCount)} харьцаа
        </div>
      </div>
      <div style={{flex: 1, minHeight: 0, overflowY: "auto"}}>
        {g.relations.map((r) => (
          <div key={`${g.accountId}:${r.key}`}
            style={{display: "flex", gap: 8, alignItems: "center",
              padding: "6px 12px", fontSize: 12, cursor: "pointer",
              borderTop: "1px solid var(--border-primary)"}}
            onClick={() => nav(link(r, g.accountId))}>
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
  );
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
  // Нэр дээрээ, данс доороо — the pieces, not a joined string.
  acctParty: (id: number | null) => {name: string; account: string | null};
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
  const acctParty = (id: number | null) => {
    if (id == null) return {name: "—", account: null};
    const a = acctById.get(id);
    if (!a) return {name: `Данс #${id}`, account: null};
    const owner = a.suspectId != null
      ? suspectById.get(a.suspectId)?.fullName : null;
    const who = owner && !/^-+$/.test(owner.trim()) ? owner : a.bankName;
    return who
      ? {name: who, account: a.accountNumber}
      : {name: a.accountNumber, account: null};
  };

  const topTxns = [...txns].sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    volume, flagged,
    txnRange: range(tMin, tMax),
    callRange: range(cMin, cMax),
    months,
    credit: months.map((k) => monthMap.get(k)!.credit),
    debit: months.map((k) => monthMap.get(k)!.debit),
    topTxns, acctParty,
  };
}

// One rule for every panel that holds a long list: take the row's height,
// never grow past 62vh, scroll inside.
const SCROLL: React.CSSProperties = {
  flex: "1 1 auto", minHeight: 240, maxHeight: "62vh", overflowY: "auto",
};

const META: React.CSSProperties = {
  fontSize: 12, color: "var(--text-secondary)",
};

function CaseDashboard({caseFileId}: {caseFileId: number}) {
  const nav = useNavigate();
  // Which statement accounts the whole page describes. EMPTY = all of them.
  const [acctSel, setAcctSel] = useState<string[]>([]);
  const {data, loading} = useQuery<CaseData>(DASHBOARD_CASE_QUERY);
  const relQ = useQuery<RelationData>(CASE_RELATIONS_QUERY);
  const evQ = useQuery<{evidenceForCase: {id: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId},
  });
  // ONE page-level filter: everything below — the cards, both харьцаа lists,
  // the flow chart, the biggest transactions — describes the selected account.
  // It used to sit inside one card's header, where it looked like a setting
  // for that box alone.
  const shownTxns = useMemo(() => {
    if (!data) return [];
    if (!acctSel.length) return data.transactions;
    const ids = new Set(acctSel.map(Number));
    return data.transactions.filter((t) => ids.has(t.bankAccountId));
  }, [data, acctSel]);
  const d = useMemo(
    () => (data ? derive({...data, transactions: shownTxns}) : null),
    [data, shownTxns]);

  if (loading || !data || !d) {
    return <Shell subtitle="ХЭРГИЙН ТОЙМ"><Loading /></Shell>;
  }

  const cf = data.activeCase;
  const evidenceCount = evQ.data?.evidenceForCase.length ?? 0;
  const hasTxns = data.transactions.length > 0;
  const isEmpty = data.suspects.length === 0 && !hasTxns
    && data.callRecords.length === 0;

  const rel = relQ.data?.caseRelations;
  const groups = rel?.byAccount ?? [];

  const meta = cf && (
    <div style={{display: "flex", alignItems: "center", flexWrap: "wrap",
      gap: 10, margin: "-6px 0 16px"}}>
      {/* Данс сонгох leads the line: it governs everything below it, so it is
          read before the case's own badges, not after them. */}
      {groups.length > 0 && (
        <MultiSelect values={acctSel} onChange={setAcctSel} searchable
          allLabel={`Бүх данс (${groups.length})`}
          manyLabel={(n) => `${n} данс сонгосон`}
          style={{minWidth: 320, maxWidth: "100%", marginRight: 4}}
          options={groups.map((x) => ({
            value: String(x.accountId), label: x.label}))} />
      )}
      <Badge text={STATUS_LABELS[cf.status] ?? cf.status}
        kind={STATUS_BADGE[cf.status] ?? "unknown"} />
      {/* ⛔ No priority badge. "Дунд" is a field on the case record that
          changes nothing on this page and answers no question asked here. */}
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
  // The accounts in view, and one merged counterparty list over exactly those
  // — a person who deals with two of the selected accounts is ONE row whose
  // numbers are the two added together. Money figures come from the same
  // transactions the cards count, so no two figures on the page can disagree.
  const selIds = new Set(acctSel.map(Number));
  const sel = selIds.size
    ? groups.filter((x) => selIds.has(x.accountId)) : groups;
  const merged = new Map<string, Relation>();
  for (const grp of sel) {
    for (const r of grp.relations) {
      const m = merged.get(r.key);
      if (!m) {merged.set(r.key, {...r}); continue;}
      m.txnCount += r.txnCount;
      m.creditCount = (m.creditCount ?? 0) + (r.creditCount ?? 0);
      m.debitCount = (m.debitCount ?? 0) + (r.debitCount ?? 0);
      m.creditTotal += r.creditTotal;
      m.debitTotal += r.debitTotal;
      m.netTotal = m.creditTotal - m.debitTotal;
    }
  }
  const relations = [...merged.values()]
    .sort((x, y) => y.txnCount - x.txnCount || x.name.localeCompare(y.name));
  const mutualCount = relations.filter((r) => r.mutual).length;

  let creditCount = 0, debitCount = 0, creditTotal = 0, debitTotal = 0;
  for (const t of shownTxns) {
    if (t.type === "credit") {creditCount++; creditTotal += t.amount;}
    else if (t.type === "debit") {debitCount++; debitTotal += t.amount;}
  }
  const netTotal = creditTotal - debitTotal;

  const stats: {
    label: string; value: React.ReactNode; color?: string;
  }[] = [
    {label: "Нийт хуулсан данс", value: sel.length},
    {label: "Нийт харьцаа", value: formatNum(relations.length)},
    {label: "Дундын харьцаа", value: formatNum(mutualCount), color: "amber"},
    {label: "Нийт гүйлгээ", value: hasTxns ? formatNum(shownTxns.length) : 0},
    {label: "Орлогын гүйлгээ", value: formatNum(creditCount)},
    {label: "Зарлагын гүйлгээ", value: formatNum(debitCount)},
    {label: "Нийт орлого",
      value: creditTotal !== 0 ? formatMoney(creditTotal) : 0, color: "green"},
    {label: "Нийт зарлага",
      value: debitTotal !== 0 ? formatMoney(debitTotal) : 0, color: "red"},
    // The difference is the point of the pair above, so it shows even at zero.
    {label: "Орлого зарлагын зөрүү", value: formatMoney(netTotal),
      color: netTotal < 0 ? "red" : "green"},
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
    {header: "Данс", render: (t) => {
      const p = d.acctParty(t.bankAccountId);
      return <PartyCell name={p.name} account={p.account} />;
    }},
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
      render: (r) => r.name},
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

  // Данс ↔ харьцаа. ONE ROW PER PAIR — which of our accounts, with whom.
  // ⛔ Not one row per direction: the same person appeared twice (once
  // "Орлого", once "Зарлага") and the two halves of his story sat apart. The
  // direction is in the COLUMNS now, with the зөрүү beside them, and Давтамж
  // is the pair's whole transaction count, not one direction's.
  interface FlowRow {
    key: string; accountId: number; account: string;
    owner: string; ownerAccount: string | null;
    name: string; cpAccount: string | null;
    count: number; creditN: number; debitN: number;
    credit: number; debit: number; net: number; turnover: number;
  }
  const flowRows: FlowRow[] = sel
    .flatMap((grp) => grp.relations.map((r) => ({
      key: `${grp.accountId}:${r.key}`,
      accountId: grp.accountId,
      account: grp.label,
      owner: grp.ownerName ?? grp.accountNumber,
      ownerAccount: grp.ownerName ? grp.accountNumber : null,
      name: r.name,
      cpAccount: r.account,
      count: r.txnCount,
      creditN: r.creditCount ?? 0,
      debitN: r.debitCount ?? 0,
      credit: r.creditTotal,
      debit: r.debitTotal,
      net: r.netTotal,
      turnover: r.creditTotal + r.debitTotal,
    })))
    .sort((a, b) => b.count - a.count || b.turnover - a.turnover)
    .slice(0, 100);

  const amountWithCount = (amount: number, n: number) => (
    <div style={{lineHeight: 1.3}}>
      <div>{money(amount)}</div>
      <div style={{fontSize: 11, color: "var(--text-muted)"}}>
        {n > 0 ? `${formatNum(n)} удаа` : "—"}
      </div>
    </div>
  );

  const flowCols: Column<FlowRow>[] = [
    {header: "Данс", sortValue: (f) => f.account,
      render: (f) => <PartyCell name={f.owner} account={f.ownerAccount} />},
    {header: "Харьцаа", sortValue: (f) => f.name,
      render: (f) => <PartyCell name={f.name} account={f.cpAccount} />},
    {header: "Давтамж", align: "right", sortValue: (f) => f.count,
      title: "Энэ хос хооронд хийгдсэн нийт гүйлгээ",
      render: (f) => `${formatNum(f.count)} удаа`},
    // Money AND how many times it moved — a single 5,890,000₮ and thirty
    // small ones are not the same finding.
    {header: "Орлого", align: "right", sortValue: (f) => f.credit,
      render: (f) => amountWithCount(f.credit, f.creditN)},
    {header: "Зарлага", align: "right", sortValue: (f) => f.debit,
      render: (f) => amountWithCount(f.debit, f.debitN)},
    {header: "Зөрүү", align: "right", sortValue: (f) => f.net,
      render: (f) => (
        <span style={{fontFamily: "var(--font-mono)", color: f.net < 0
          ? "var(--accent-red)" : "var(--accent-green)"}}>
          {formatMoney(f.net)}
        </span>
      )},
  ];

  // Шар өнгө ганцаараа — тайлбартай. (Улаан тэмдэглэгээ авагдсан: relColor.)
  const relLegend = (
    <span style={{fontSize: 11, color: "var(--accent-amber)"}}
      title="Хоёр ба түүнээс дээш хуулсан данстай харьцсан">
      Дундын
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
  // ⛔ Not shown for a single selected account: "дундын" is a statement ABOUT
  // two accounts, so on one account the list answers a question nobody asked.
  const mutual = relations.filter((r) => r.mutual);
  // ⚠️ The card is ALWAYS here, even when it has nothing to say. Dropping it
  // for a single selected account left a hole beside the columns and the page
  // read as broken; an empty box that states its own condition does not.
  const oneAccount = acctSel.length === 1;
  if (rel) {
    sections.push(
      <Card key="mutual"
        title={`Дундын харилцааны жагсаалт (${oneAccount ? 0 : mutual.length})`}
        fill noPadding>
        {oneAccount ? (
          <div style={{...SCROLL, display: "flex", alignItems: "center",
            justifyContent: "center", color: "var(--text-muted)",
            fontSize: 13, textAlign: "center", padding: 24}}>
            Дундын харьцаа хоёр данснаас эхэлнэ — дээрээс өөр данс нэмнэ үү
          </div>
        ) : (
          <DataTable columns={relCols} rows={mutual} scroll={SCROLL}
            rowKey={(r) => r.key} empty="Дундын харьцаа алга"
            pageSize={50}
            onRowClick={(r) => nav(relLink(r))} />
        )}
      </Card>
    );
  }

  // Нийт харьцаанууд — ONE COLUMN PER STATEMENT ACCOUNT, side by side, exactly
  // the layout the client drew: the account and its transaction total as the
  // head, then whom it dealt with and how many times. Stacking the accounts
  // vertically (as this did) meant the second account's list only existed
  // below the fold, and the two could never be compared. More accounts than
  // fit ⇒ the strip scrolls sideways; the filter picks one out.
  if (rel && groups.length > 0) {
    sections.push(
      <Card key="byacct"
        title={`Нийт харьцаа — гүйлгээний тоогоор (${
          formatNum(relations.length)})`}
        actions={relLegend}
        fill noPadding>
        <div style={{...SCROLL, display: "flex", overflowX: "auto"}}>
          {sel.map((col) => (
            <AcctColumn key={col.accountId} g={col} nav={nav}
              link={relLink} />
          ))}
        </div>
      </Card>
    );
  }

  if (flowRows.length > 0) {
    sections.push(
      // Six columns of substance do not fit in half a row — this one takes
      // the whole width instead of cutting the money off the right edge.
      <Card key="topflows" title={`Данс ↔ харьцаа (${flowRows.length})`}
        style={{gridColumn: "1 / -1"}} fill noPadding>
        <DataTable columns={flowCols} rows={flowRows}
            scroll={{...SCROLL, overflowX: "auto"}}
            rowKey={(f) => f.key} empty="Харьцаа алга"
            pageSize={50}
            defaultSort={{col: 2, dir: "desc"}}
            onRowClick={(f) => nav(`/transactions?acct=${f.accountId}&${
              f.name && f.name !== "—"
                ? `cpname=${encodeURIComponent(f.name)}`
                : `cp=${encodeURIComponent(f.cpAccount ?? "")}`}`)} />
      </Card>
    );
  }

  if (hasTxns) {
    sections.push(
      <Card key="toptxns" title="Хамгийн том гүйлгээнүүд" fill noPadding>
        <DataTable columns={txnCols} rows={d.topTxns} scroll={SCROLL}
          rowKey={(t) => t.id}
          empty="Гүйлгээ алга"
          defaultSort={{col: 1, dir: "desc"}}
          onRowClick={(t) => nav(`/transactions?acct=${t.bankAccountId}`)} />
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
