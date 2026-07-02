/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : TransactionsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useLazyQuery, useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CALL_RECORDS_QUERY,
  EVIDENCE_FOR_CASE,
  TAG_EVIDENCE,
  TRANSACTIONS_QUERY,
  TRANSACTION_DRILLDOWN,
} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import Plot from "../components/Plot";
import {formatDateTime, formatMoney, sevClass} from "../lib/format";
import type {BankTransaction} from "../types";

interface TxnAccount {
  id            : number;
  accountNumber : string;
  bankName      : string | null;
  maskedNumber  : string;
  suspectId     : number | null;
}

interface CorrCall {
  id            : number;
  callerNumber  : string;
  calledNumber  : string;
  startTime     : string;
  suspectId     : number | null;
}

interface CorrData {
  callRecords : CorrCall[];
  suspects    : {id: number; fullName: string}[];
}

interface TxnData {
  bankAccounts : TxnAccount[];
  transactions : BankTransaction[];
}

interface DrillDown {
  target: BankTransaction | null;
  relatedWindow: {id: number; timestamp: string; amount: number;
    type: string; description: string | null}[];
  ruleResult: {
    finalScore: number; finalAction: string; finalRisk: string;
    criticalFlags: number; highFlags: number;
    violations: {ruleId: number; ruleName: string; severity: string;
      description: string}[];
  };
}

const PALETTE = [
  "#00E5FF", "#00E676", "#B388FF", "#FFAB00",
  "#FF6D00", "#448AFF", "#FF1744", "#E040FB",
];

const ROW: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16,
};

export default function TransactionsPage() {
  const {data, loading} = useQuery<TxnData>(TRANSACTIONS_QUERY);
  const callsQ = useQuery<CorrData>(CALL_RECORDS_QUERY);
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;
  const evidenceQ = useQuery<{evidenceForCase: {sourceType: string;
    sourceId: number; exhibitNumber: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId: activeCase?.id ?? 0}, skip: !activeCase});
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  const [filterAccount, setFilterAccount] = useState("All");
  const [filterType, setFilterType] = useState("");
  const [filterFlag, setFilterFlag] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterDesc, setFilterDesc] = useState("");
  const [topN, setTopN] = useState(10);
  const [corrMin, setCorrMin] = useState(30);
  const [drill, drillQ] = useLazyQuery<{transactionDrillDown: DrillDown}>(
    TRANSACTION_DRILLDOWN, {fetchPolicy: "no-cache"});
  const [drillOpen, setDrillOpen] = useState(false);

  const exhibitByTxn = new Map<number, number>();
  for (const e of evidenceQ.data?.evidenceForCase ?? []) {
    if (e.sourceType === "TRANSACTION") {
      exhibitByTxn.set(e.sourceId, e.exhibitNumber);
    }
  }

  function openDrill(t: BankTransaction) {
    setDrillOpen(true);
    drill({variables: {transactionId: t.id}});
  }

  async function onTag(t: BankTransaction) {
    if (!activeCase) return;
    await tagEvidence({variables: {
      caseFileId: activeCase.id, sourceType: "TRANSACTION", sourceId: t.id,
      description: `${formatMoney(t.amount)} — ${formatDateTime(t.timestamp)}`,
      severity: "INFO",
    }});
    await evidenceQ.refetch();
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="💳" title="Гүйлгээний Анализ"
          subtitle="САНХҮҮГИЙН УРСГАЛЫН АНАЛИЗ" />
        <Loading />
      </div>
    );
  }

  const accounts = data.bankAccounts;
  const allTxns  = data.transactions;
  // Charts, stats and duplicate analysis track the account/date/description
  // filters; the table narrows further by type/flag.
  const descNeedle = filterDesc.trim().toLowerCase();
  const filtered = allTxns.filter((t) =>
    (filterAccount === "All" || t.bankAccountId === Number(filterAccount))
    && (!filterFrom || t.timestamp.slice(0, 10) >= filterFrom)
    && (!filterTo || t.timestamp.slice(0, 10) <= filterTo)
    && (!descNeedle
      || (t.description ?? "").toLowerCase().includes(descNeedle)));
  const tableRows = filtered.filter((t) =>
    (!filterType || t.type === filterType)
    && (!filterFlag || t.flagStatus === filterFlag));
  const hasFilter = filterAccount !== "All" || filterType !== ""
    || filterFlag !== "" || filterFrom !== "" || filterTo !== ""
    || filterDesc !== "";

  function clearFilters() {
    setFilterAccount("All");
    setFilterType("");
    setFilterFlag("");
    setFilterFrom("");
    setFilterTo("");
    setFilterDesc("");
  }

  // Duplicated гүйлгээний утга: identical descriptions used 2+ times.
  const descAgg = new Map<string, {count: number; total: number}>();
  for (const t of filtered) {
    const d = t.description?.trim();
    if (!d) continue;
    const a = descAgg.get(d) ?? {count: 0, total: 0};
    a.count++;
    a.total += t.amount;
    descAgg.set(d, a);
  }
  const dupDescs = [...descAgg.entries()]
    .filter(([, a]) => a.count > 1)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([desc, a]) => ({desc, ...a}));

  // Duplicated transactions between account pairs: within one
  // данс ↔ харьцсан данс pair, the same amount moving 2+ times.
  const acctById = new Map(accounts.map((a) => [a.id, a.maskedNumber]));
  interface PairAgg {
    account: string; counterparty: string;
    txns: number; dupes: number; total: number;
    amounts: Map<number, number>;
  }
  const pairAgg = new Map<string, PairAgg>();
  for (const t of filtered) {
    const cp = t.counterpartyAccount?.trim();
    if (!cp) continue;
    const key = `${t.bankAccountId}→${cp}`;
    const a = pairAgg.get(key) ?? {
      account: acctById.get(t.bankAccountId) ?? String(t.bankAccountId),
      counterparty: cp, txns: 0, dupes: 0, total: 0,
      amounts: new Map<number, number>(),
    };
    a.txns++;
    a.total += t.amount;
    a.amounts.set(t.amount, (a.amounts.get(t.amount) ?? 0) + 1);
    pairAgg.set(key, a);
  }
  const dupPairs = [...pairAgg.values()]
    .map((a) => {
      let dupes = 0;
      for (const n of a.amounts.values()) if (n > 1) dupes += n;
      return {...a, dupes};
    })
    .filter((a) => a.dupes > 0)
    .sort((a, b) => b.dupes - a.dupes)
    .slice(0, topN);

  // Дуудлагын дараах гүйлгээ: for each filtered transaction, the same
  // suspect's nearest preceding call within the chosen window.
  const suspectByAcct = new Map(accounts.map((a) => [a.id, a.suspectId]));
  const nameBySuspect = new Map(
    (callsQ.data?.suspects ?? []).map((s) => [s.id, s.fullName]));
  const calls = callsQ.data?.callRecords ?? [];
  interface CorrRow {
    call: CorrCall; txn: BankTransaction;
    suspectName: string; deltaMin: number;
  }
  const corrRows: CorrRow[] = [];
  for (const t of filtered) {
    const sid = suspectByAcct.get(t.bankAccountId);
    if (sid == null) continue;
    const tt = new Date(t.timestamp).getTime();
    let best: CorrCall | null = null;
    let bestDelta = Infinity;
    for (const c of calls) {
      if (c.suspectId !== sid) continue;
      const delta = (tt - new Date(c.startTime).getTime()) / 60000;
      if (delta >= 0 && delta <= corrMin && delta < bestDelta) {
        best = c;
        bestDelta = delta;
      }
    }
    if (best) {
      corrRows.push({call: best, txn: t,
        suspectName: nameBySuspect.get(sid) ?? `#${sid}`,
        deltaMin: bestDelta});
    }
  }
  corrRows.sort((a, b) => a.deltaMin - b.deltaMin);
  const corrClass = (m: number) =>
    m <= 5 ? "tight" : m <= 15 ? "close" : "near";

  const totalCount   = filtered.length;
  const credits = filtered.filter((t) => t.type === "credit");
  const debits = filtered.filter((t) => t.type === "debit");
  const totalCredits = credits.reduce((sum, t) => sum + t.amount, 0);
  const totalDebits = debits.reduce((sum, t) => sum + t.amount, 0);

  // Daily volume (credit/debit bars) + recomputed running balance line.
  const dayKeys = [...new Set(filtered.map((t) => t.timestamp.slice(0, 10)))]
    .sort();
  const dayCredit = new Map<string, number>();
  const dayDebit = new Map<string, number>();
  for (const t of filtered) {
    const d = t.timestamp.slice(0, 10);
    if (t.type === "credit") {
      dayCredit.set(d, (dayCredit.get(d) ?? 0) + t.amount);
    } else if (t.type === "debit") {
      dayDebit.set(d, (dayDebit.get(d) ?? 0) + t.amount);
    }
  }
  const dCred = dayKeys.map((d) => dayCredit.get(d) ?? 0);
  const dDeb = dayKeys.map((d) => dayDebit.get(d) ?? 0);
  let cum = 0;
  const runningBal = dayKeys.map((_d, i) => {
    cum += dCred[i] - dDeb[i];
    return cum;
  });

  // Category aggregation feeds the waterfall + sunburst.
  const catAgg = new Map<string, {c: number; d: number}>();
  for (const t of filtered) {
    const k = t.category ?? "Бусад";
    const a = catAgg.get(k) ?? {c: 0, d: 0};
    if (t.type === "credit") a.c += t.amount;
    else if (t.type === "debit") a.d += t.amount;
    catAgg.set(k, a);
  }
  const topCats = [...catAgg.entries()]
    .sort((a, b) => (b[1].c + b[1].d) - (a[1].c + a[1].d)).slice(0, 8);

  const wfLabels: string[] = [];
  const wfValues: number[] = [];
  const wfMeasure: string[] = [];
  for (const [k, a] of topCats) {
    wfLabels.push(`${k} +`);
    wfValues.push(a.c);
    wfMeasure.push("relative");
  }
  for (const [k, a] of topCats) {
    wfLabels.push(`${k} −`);
    wfValues.push(-a.d);
    wfMeasure.push("relative");
  }
  wfLabels.push("Цэвэр дүн");
  wfValues.push(0);
  wfMeasure.push("total");

  const sbLabels: string[] = [];
  const sbParents: string[] = [];
  const sbValues: number[] = [];
  const sbColors: string[] = [];
  topCats.forEach(([k, a], i) => {
    sbLabels.push(k);
    sbParents.push("");
    sbValues.push(a.c + a.d);
    sbColors.push(PALETTE[i % PALETTE.length]);
    if (a.c > 0) {
      sbLabels.push(`${k} — Орлого`);
      sbParents.push(k);
      sbValues.push(a.c);
      sbColors.push("#00E676");
    }
    if (a.d > 0) {
      sbLabels.push(`${k} — Зарлага`);
      sbParents.push(k);
      sbValues.push(a.d);
      sbColors.push("#FF5252");
    }
  });

  // Hourly distribution with night/peak coloring.
  const hourCounts = new Array(24).fill(0);
  for (const t of filtered) hourCounts[new Date(t.timestamp).getHours()]++;
  const hourLabels = Array.from({length: 24},
    (_v, h) => `${String(h).padStart(2, "0")}:00`);
  const avgHour = filtered.length / 24;
  const hourColors = hourCounts.map((c) =>
    c > avgHour * 1.5 ? "#FF6D00" : c > avgHour ? "#FFAB00" : "#00E5FF");

  const columns = [
    {
      header: "Огноо",
      render: (t: BankTransaction) => formatDateTime(t.timestamp),
    },
    {
      header: "Төрөл",
      render: (t: BankTransaction) => (
        <span style={{
          color: t.type === "credit"
            ? "var(--accent-green)"
            : "var(--accent-red)",
        }}>
          {t.type}
        </span>
      ),
    },
    {
      header: "Дүн",
      align: "right" as const,
      render: (t: BankTransaction) => formatMoney(t.amount),
    },
    {
      header: "Категори",
      render: (t: BankTransaction) => t.category ?? "—",
    },
    {
      header: "Харьцагч",
      render: (t: BankTransaction) =>
        t.counterpartyName ?? t.counterpartyAccount ?? "—",
    },
    {
      header: "Баланс",
      align: "right" as const,
      render: (t: BankTransaction) => formatMoney(t.runningBalance),
    },
    {
      header: "Суваг",
      render: (t: BankTransaction) => t.channel,
    },
    {
      header: "Төлөв",
      render: (t: BankTransaction) => (
        <Badge text={t.flagStatus} kind={sevClass(t.flagStatus)} />
      ),
    },
  ];

  return (
    <div className="page-container">
      <PageHeader icon="💳" title="Гүйлгээний Анализ"
        subtitle="САНХҮҮГИЙН УРСГАЛЫН АНАЛИЗ" />

      <div className="metrics-grid">
        <StatCard label="Нийт гүйлгээ" value={totalCount} />
        <StatCard label="Орлогын гүйлгээ" value={formatMoney(totalCredits)}
          color="green" />
        <StatCard label="Зарлагын гүйлгээ" value={formatMoney(totalDebits)}
          color="red" />
      </div>

      <Card title="Шүүлтүүр" style={{marginBottom: 16}}
        actions={hasFilter ? (
          <button className="btn btn-sm" onClick={clearFilters}>ЦЭВЭРЛЭХ</button>
        ) : undefined}>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap",
          alignItems: "flex-end"}}>
          <div>
            <label className="form-label">Данс</label>
            <select className="form-input" value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              style={{minWidth: 180}}>
              <option value="All">Бүх данс</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>{a.maskedNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Төрөл</label>
            <select className="form-input" value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{minWidth: 160}}>
              <option value="">Бүх төрөл</option>
              <option value="credit">Орлогын гүйлгээ</option>
              <option value="debit">Зарлагын гүйлгээ</option>
            </select>
          </div>
          <div>
            <label className="form-label">Туг</label>
            <select className="form-input" value={filterFlag}
              onChange={(e) => setFilterFlag(e.target.value)}
              style={{minWidth: 160}}>
              <option value="">Бүх туг</option>
              <option value="FLAGGED">Тугтай</option>
              <option value="SUSPICIOUS">Сэжигтэй</option>
            </select>
          </div>
          <div>
            <label className="form-label">Эхлэх огноо</label>
            <input type="date" className="form-input" value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              style={{minWidth: 160}} />
          </div>
          <div>
            <label className="form-label">Дуусах огноо</label>
            <input type="date" className="form-input" value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              style={{minWidth: 160}} />
          </div>
          <div style={{flex: 1, minWidth: 220}}>
            <label className="form-label">Гүйлгээний утга</label>
            <input type="text" className="form-input" value={filterDesc}
              onChange={(e) => setFilterDesc(e.target.value)}
              placeholder="Утгаар хайх..."
              style={{width: "100%"}} />
          </div>
        </div>
      </Card>

      <div style={ROW}>
        <Card
          title={`Давхардсан гүйлгээний утга (${dupDescs.length})`}
          actions={
            <select className="form-input" value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              title="Топ N" style={{width: 110}}>
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>Топ {n}</option>
              ))}
            </select>
          }
          noPadding
        >
          <DataTable<{desc: string; count: number; total: number}>
            columns={[
              {header: "Гүйлгээний утга", render: (r) => r.desc},
              {header: "Давтамж", align: "right" as const,
                render: (r) => <strong>{r.count}</strong>},
              {header: "Нийт дүн", align: "right" as const,
                render: (r) => formatMoney(r.total)},
            ]}
            rows={dupDescs}
            rowKey={(r) => r.desc}
            empty="Давхардсан утга алга"
            onRowClick={(r) => setFilterDesc(r.desc)}
          />
        </Card>
        <Card title={`Данс хоорондын давхардсан гүйлгээ (${dupPairs.length})`}
          noPadding>
          <DataTable<(typeof dupPairs)[number]>
            columns={[
              {header: "Данс", render: (r) => r.account},
              {header: "Харьцсан данс", render: (r) => r.counterparty},
              {header: "Нийт гүйлгээ", align: "right" as const,
                render: (r) => r.txns},
              {header: "Давхардсан", align: "right" as const,
                render: (r) => (
                  <strong style={{color: "var(--accent-amber)"}}>
                    {r.dupes}
                  </strong>
                )},
              {header: "Нийт дүн", align: "right" as const,
                render: (r) => formatMoney(r.total)},
            ]}
            rows={dupPairs}
            rowKey={(r) => `${r.account}→${r.counterparty}`}
            empty="Давхардсан гүйлгээ алга"
          />
        </Card>
      </div>

      <Card
        title={`Дуудлагын дараах гүйлгээ (${corrRows.length}) — дуудлагаас хойш мөнгөн гүйлгээ`}
        actions={
          <select className="form-input" value={corrMin}
            onChange={(e) => setCorrMin(Number(e.target.value))}
            title="Дуудлагаас хойших хугацааны цонх" style={{width: 130}}>
            {[5, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>{m} мин дотор</option>
            ))}
          </select>
        }
        style={{marginBottom: 16}}
        noPadding
      >
        <DataTable<(typeof corrRows)[number]>
          columns={[
            {header: "Дуудлага", render: (r) => formatDateTime(r.call.startTime)},
            {header: "Дугаар",
              render: (r) => `${r.call.callerNumber} → ${r.call.calledNumber}`},
            {header: "Сэжигтэн", render: (r) => r.suspectName},
            {header: "Зөрүү", align: "center" as const,
              render: (r) => (
                <span className={`correlation-badge ${corrClass(r.deltaMin)}`}>
                  +{r.deltaMin.toFixed(0)} мин
                </span>
              )},
            {header: "Гүйлгээ", render: (r) => formatDateTime(r.txn.timestamp)},
            {header: "Дүн", align: "right" as const,
              render: (r) => (
                <span style={{color: r.txn.type === "credit"
                  ? "var(--accent-green)" : "var(--accent-red)"}}>
                  {formatMoney(r.txn.amount)}
                </span>
              )},
            {header: "Гүйлгээний утга",
              render: (r) => r.txn.description ?? "—"},
          ]}
          rows={corrRows}
          rowKey={(r) => `${r.call.id}-${r.txn.id}`}
          empty={`${corrMin} минутын дотор дуудлагын дараах гүйлгээ алга`}
          onRowClick={(r) => openDrill(r.txn)}
        />
      </Card>

      <div style={ROW}>
        <Card title="Гүйлгээний дэлгэц (дүн vs хугацаа)">
          <Plot
            height={260}
            data={[
              {type: "scatter", mode: "markers", name: "Орлого",
                x: credits.map((t) => t.timestamp.slice(0, 10)),
                y: credits.map((t) => t.amount),
                marker: {color: "#00E676", size: 6, opacity: 0.6}},
              {type: "scatter", mode: "markers", name: "Зарлага",
                x: debits.map((t) => t.timestamp.slice(0, 10)),
                y: debits.map((t) => t.amount),
                marker: {color: "#FF5252", size: 6, opacity: 0.6}},
            ]}
          />
        </Card>
        <Card title="Дүнгийн тархалт (Violin)">
          <Plot
            height={260}
            data={[
              {type: "violin", name: "Орлого", y: credits.map((t) => t.amount),
                line: {color: "#00E676"}, box: {visible: true},
                meanline: {visible: true}},
              {type: "violin", name: "Зарлага", y: debits.map((t) => t.amount),
                line: {color: "#FF5252"}, box: {visible: true},
                meanline: {visible: true}},
            ]}
          />
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Өдөр тутмын хэмжээ & гүйцэтгэлийн баланс">
          <Plot
            height={280}
            data={[
              {type: "bar", name: "Орлого", x: dayKeys, y: dCred,
                marker: {color: "#00E676"}},
              {type: "bar", name: "Зарлага", x: dayKeys, y: dDeb,
                marker: {color: "#FF5252"}},
              {type: "scatter", mode: "lines", name: "Баланс", x: dayKeys,
                y: runningBal, yaxis: "y2", line: {color: "#00E5FF", width: 2}},
            ]}
            layout={{barmode: "group",
              yaxis2: {overlaying: "y", side: "right", gridcolor: "#1A1A3E"}}}
          />
        </Card>
        <Card title="Санхүүгийн урсгал (дээд ангилал)">
          <Plot
            height={280}
            data={[{
              type: "waterfall", orientation: "v",
              x: wfLabels, y: wfValues, measure: wfMeasure,
              connector: {line: {color: "#3a4a6a"}},
            }]}
            layout={{margin: {l: 50, r: 16, t: 16, b: 120},
              xaxis: {tickangle: -30}}}
          />
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Ангилал & төрлийн дэлгэрэнгүй (Sunburst)">
          <Plot
            height={320}
            data={[{
              type: "sunburst", labels: sbLabels, parents: sbParents,
              values: sbValues, marker: {colors: sbColors},
              branchvalues: "total",
            }]}
          />
        </Card>
        <Card title="Цаг тутмын гүйлгээний тархалт">
          <Plot
            height={320}
            data={[{
              type: "bar", x: hourLabels, y: hourCounts,
              marker: {color: hourColors},
            }]}
          />
        </Card>
      </div>

      <Card title={`Гүйлгээний жагсаалт (${tableRows.length}) — мөр дээр дарж нягтлах`}
        noPadding>
        <DataTable<BankTransaction>
          columns={columns}
          rows={tableRows}
          rowKey={(t) => t.id}
          empty="Гүйлгээ алга"
          onRowClick={openDrill}
        />
      </Card>

      {drillOpen && (
        <div
          onClick={() => setDrillOpen(false)}
          style={{position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 1000, display: "flex", justifyContent: "flex-end"}}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{width: 460, maxWidth: "92vw", height: "100%",
              background: "var(--bg-tertiary)", overflowY: "auto",
              borderLeft: "1px solid var(--border-primary)", padding: 18}}
          >
            <div style={{display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12}}>
              <span className="card-title">Гүйлгээний нягтлал</span>
              <button className="btn btn-sm" onClick={() => setDrillOpen(false)}>
                ХААХ
              </button>
            </div>
            {drillQ.loading || !drillQ.data ? (
              <Loading />
            ) : (() => {
              const dd = drillQ.data.transactionDrillDown;
              if (!dd.target) return <div>Олдсонгүй</div>;
              const target = dd.target;
              const tagged = exhibitByTxn.get(target.id);
              return (
                <>
                  <div style={{fontSize: 12, marginBottom: 12}}>
                    <div>{formatDateTime(target.timestamp)}</div>
                    <div style={{fontSize: 20, fontWeight: 700,
                      color: target.type === "credit"
                        ? "var(--accent-green)" : "var(--risk-high)"}}>
                      {formatMoney(target.amount)} ({target.type})
                    </div>
                    <div style={{color: "var(--text-secondary)"}}>
                      {target.description ?? ""}
                    </div>
                    <div style={{color: "var(--text-muted)"}}>
                      Харьцагч: {target.counterpartyName
                        ?? target.counterpartyAccount ?? "—"}
                    </div>
                  </div>
                  <div style={{marginBottom: 12}}>
                    Дансны дүгнэлт:{" "}
                    <Badge text={dd.ruleResult.finalAction}
                      kind={sevClass(dd.ruleResult.finalRisk === "NORMAL"
                        ? "INFO" : dd.ruleResult.finalRisk)} />{" "}
                    оноо {(dd.ruleResult.finalScore * 100).toFixed(0)}%
                  </div>
                  <div style={{fontSize: 11, fontWeight: 700, margin: "8px 0",
                    color: "var(--text-muted)"}}>
                    ЗӨРЧЛҮҮД ({dd.ruleResult.violations.length})
                  </div>
                  {dd.ruleResult.violations.map((v, i) => (
                    <div key={i} style={{fontSize: 11, marginBottom: 6}}>
                      <Badge text={v.severity} kind={sevClass(v.severity)} />{" "}
                      {v.ruleName}: {v.description}
                    </div>
                  ))}
                  <div style={{fontSize: 11, fontWeight: 700, margin: "12px 0 6px",
                    color: "var(--text-muted)"}}>
                    ±10 МИНУТЫН ХӨРШ ({dd.relatedWindow.length})
                  </div>
                  {dd.relatedWindow.map((r) => (
                    <div key={r.id} style={{fontSize: 11,
                      color: "var(--text-secondary)"}}>
                      {formatDateTime(r.timestamp)} · {r.type} ·{" "}
                      {formatMoney(r.amount)}
                    </div>
                  ))}
                  <div style={{marginTop: 16}}>
                    {!activeCase ? (
                      <div style={{fontSize: 11, color: "var(--text-muted)"}}>
                        Идэвхтэй кейс сонгох шаардлагатай.
                      </div>
                    ) : tagged != null ? (
                      <button className="btn" disabled style={{width: "100%"}}>
                        Үүсгэсэн (Exhibit #{tagged})
                      </button>
                    ) : (
                      <button className="btn btn-primary" style={{width: "100%"}}
                        onClick={() => onTag(target)}>
                        НОТЛОХ ТУГ ТАВИХ
                      </button>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
