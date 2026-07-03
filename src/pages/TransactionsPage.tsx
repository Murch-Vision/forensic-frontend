/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : TransactionsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CALL_RECORDS_QUERY,
  EVIDENCE_FOR_CASE,
  TAG_EVIDENCE,
  TRANSACTIONS_QUERY,
} from "../graphql/queries";
import {
  Card,
  DataTable,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import {DateInput, Select} from "../components/inputs";
import CaseGate from "../components/CaseGate";
import Plot from "../components/Plot";
import {formatDateTime, formatMoney} from "../lib/format";
import {
  addDescRule,
  clearDescRules,
  ignorePairs,
  ignoreTxns,
  isBelowMin,
  matchesDescRules,
  pairKey,
  removeDescRule,
  restorePairs,
  restoreTxns,
  setMinAmount,
  toggleIgnoredPair,
  toggleIgnoredTxn,
  txnPairKey,
  useIgnoredDesc,
  useIgnoredPairs,
  useIgnoredTxns,
  useMinAmount,
} from "../lib/ignoredPairs";
import type {DescMode, DescRule} from "../lib/ignoredPairs";
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
  const [filterCounterparty, setFilterCounterparty] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterDesc, setFilterDesc] = useState("");
  const [topN, setTopN] = useState(10);
  const [pairTopN, setPairTopN] = useState(20);
  const [corrMin, setCorrMin] = useState(30);
  const [selectedTxn, setSelectedTxn] = useState<BankTransaction | null>(null);
  const ignoredPairs = useIgnoredPairs();
  const ignoredTxns = useIgnoredTxns();
  const descRules = useIgnoredDesc();
  const minAmount = useMinAmount();
  // Cleanup modal + its inputs (nothing applies while typing — a button commits).
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupTab, setCleanupTab] = useState<"remove" | "restore">("remove");
  const [minAmountText, setMinAmountText] = useState("");
  const [thresholdText, setThresholdText] = useState("");
  const [thresholdMode, setThresholdMode] = useState<"total" | "single">(
    "total");
  const [descText, setDescText] = useState("");
  const [descMode, setDescMode] = useState<DescMode>("starts");

  const exhibitByTxn = new Map<number, number>();
  for (const e of evidenceQ.data?.evidenceForCase ?? []) {
    if (e.sourceType === "TRANSACTION") {
      exhibitByTxn.set(e.sourceId, e.exhibitNumber);
    }
  }

  function openDrill(t: BankTransaction) {
    setSelectedTxn(t);
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
        <CaseGate>
          <Loading />
        </CaseGate>
      </div>
    );
  }

  const accounts = data.bankAccounts;
  const allTxns  = data.transactions;
  // Charts, stats and duplicate analysis track the account/date/description
  // filters; the table narrows further by type/flag.
  const descNeedle = filterDesc.trim().toLowerCase();
  // baseFiltered = account/date/search VIEW filters only.
  const baseFiltered = allTxns.filter((t) =>
    (filterAccount === "All" || t.bankAccountId === Number(filterAccount))
    && (!filterFrom || t.timestamp.slice(0, 10) >= filterFrom)
    && (!filterTo || t.timestamp.slice(0, 10) <= filterTo)
    && (!descNeedle
      || (t.description ?? "").toLowerCase().includes(descNeedle)));
  // Noise MARKS (persistent): a transaction is unimportant if it was removed
  // individually, OR falls below the amount floor (small money the analyst
  // doesn't care about), OR its description matches a rule, OR its account-pair
  // was removed. All of them drop it from every count here AND from the graph.
  const isNoise = (t: BankTransaction) =>
    ignoredTxns.has(t.id) || isBelowMin(t.amount, minAmount)
    || matchesDescRules(t.description, descRules);
  const isPairUnimportant = (key: string | null) =>
    key != null && ignoredPairs.has(key);
  // cleanTxns = view minus amount/description noise; feeds the pair table.
  const cleanTxns = baseFiltered.filter((t) => !isNoise(t));
  // Drilling into one pair (click a row in "Данс хоорондын гүйлгээ") narrows the
  // table/stats to just that account↔counterparty — WITHOUT shrinking the pair
  // list, so the analyst can keep clicking other pairs.
  const cpFiltered = filterCounterparty
    ? cleanTxns.filter((t) =>
      (t.counterpartyAccount ?? "").trim() === filterCounterparty)
    : cleanTxns;
  // filtered = the ACTIVE set (also minus removed pairs) for stats/charts/table.
  const filtered = cpFiltered.filter((t) => !isPairUnimportant(txnPairKey(t)));
  const tableRows = filtered.filter((t) =>
    (!filterType || t.type === filterType));

  // One-shot: keep only the single biggest transaction currently shown and
  // remove all the rest (the "leave the 80k, drop the other 4" workflow).
  function keepOnlyLargestShown() {
    if (tableRows.length <= 1) return;
    const largest = tableRows.reduce(
      (m, t) => (t.amount > m.amount ? t : m), tableRows[0]);
    ignoreTxns(tableRows.filter((t) => t.id !== largest.id).map((t) => t.id));
  }

  // One-shot: mark every active pair below the typed amount unimportant. No
  // per-keystroke filtering — the analyst types, then clicks the button once.
  function bulkRemoveBelow() {
    const t = Number(thresholdText.replace(/[^\d.]/g, ""));
    if (!t) return;
    const keys = activePairs
      .filter((p) => (thresholdMode === "single" ? p.maxSingle : p.total) < t)
      .map((p) => p.key);
    if (keys.length) ignorePairs(keys);
    setThresholdText("");
  }
  // Commit the amount floor — every transaction below it becomes noise
  // everywhere (empty / 0 clears it). One button press, no per-keystroke work.
  function commitMinAmount() {
    setMinAmount(Number(minAmountText.replace(/[^\d.]/g, "")) || 0);
  }
  // Commit a description rule — marks matching transactions unimportant.
  function markDesc() {
    addDescRule(descMode, descText);
    setDescText("");
  }
  // Apply a filter from the detail panel or a pair row, then close it — the list
  // sits right under the filter bar so the result is immediately visible.
  // Selecting a pair sets its counterparty so the table shows JUST that pair;
  // any other account/day/desc change drops a stale counterparty drill.
  function filterBy(patch: {
    account?: string; desc?: string; day?: string; counterparty?: string;
  }) {
    if (patch.account !== undefined) setFilterAccount(patch.account);
    if (patch.desc !== undefined) setFilterDesc(patch.desc);
    setFilterCounterparty(patch.counterparty ?? "");
    if (patch.day !== undefined) {setFilterFrom(patch.day); setFilterTo(patch.day);}
    setSelectedTxn(null);
  }
  const hasFilter = filterAccount !== "All" || filterCounterparty !== ""
    || filterType !== "" || filterFrom !== "" || filterTo !== ""
    || filterDesc !== "";

  function clearFilters() {
    setFilterAccount("All");
    setFilterCounterparty("");
    setFilterType("");
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
    key: string; bankAccountId: number; cpAccount: string;
    account: string; counterparty: string;
    txns: number; total: number; maxSingle: number;
  }
  // EVERY account↔counterparty pair (not just repeated-amount ones) so the
  // analyst can remove any of them — including single-transaction pairs — and
  // clear them from the connection graph. Built from cleanTxns so description
  // noise doesn't inflate pair totals; removed pairs stay listed for un-marking.
  const pairAgg = new Map<string, PairAgg>();
  for (const t of cleanTxns) {
    const cp = t.counterpartyAccount?.trim();
    if (!cp) continue;
    const key = pairKey(t.bankAccountId, cp);
    const a = pairAgg.get(key) ?? {
      key, bankAccountId: t.bankAccountId, cpAccount: cp,
      account: acctById.get(t.bankAccountId) ?? String(t.bankAccountId),
      counterparty: cp, txns: 0, total: 0, maxSingle: 0,
    };
    a.txns++;
    a.total += t.amount;
    a.maxSingle = Math.max(a.maxSingle, t.amount);
    pairAgg.set(key, a);
  }
  const allPairs = [...pairAgg.values()]
    .map((a) => ({...a, removed: isPairUnimportant(a.key)}));
  const activePairs = allPairs.filter((a) => !a.removed);
  const removedPairs = allPairs.filter((a) => a.removed);
  // Table is sortable; slice the biggest-total first as the sensible default.
  const pairRows = [...activePairs]
    .sort((a, b) => b.total - a.total).slice(0, pairTopN);
  // How many items the analyst has removed (pairs + single transactions),
  // shown on the cleanup button.
  const totalRemoved = ignoredPairs.size + ignoredTxns.size;
  // Individually-removed transactions, resolved for the cleanup modal's undo.
  const removedTxnList = allTxns.filter((t) => ignoredTxns.has(t.id));
  // Everything the analyst can restore, for the "Сэргээх" tab's badge.
  const restoreCount = removedTxnList.length + removedPairs.length
    + descRules.length + (minAmount > 0 ? 1 : 0);

  // Дуудлагын дараах гүйлгээ: for each filtered transaction, the same
  // suspect's nearest preceding call within the chosen window.
  const suspectByAcct = new Map(accounts.map((a) => [a.id, a.suspectId]));
  const nameBySuspect = new Map(
    (callsQ.data?.suspects ?? []).map((s) => [s.id, s.fullName]));
  // Account dropdown options — masked number labelled with its owner so the
  // analyst can tell whose account it is (numbers alone are unreadable).
  const accountOptions = [
    {value: "All", label: "Бүх данс"},
    ...accounts.map((a) => {
      const owner = a.suspectId != null ? nameBySuspect.get(a.suspectId) : null;
      return {value: String(a.id),
        label: owner ? `${a.maskedNumber} · ${owner}` : a.maskedNumber};
    }),
  ];
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

  // "Who with whom" — follow the money. The case account and the counterparty,
  // each shown as a name + its account number. For income (credit) the
  // counterparty is the SENDER and our account the receiver; for an outgoing
  // payment (debit) it is the other way round.
  interface Party {name: string; account: string | null}
  const ourParty = (t: BankTransaction): Party => {
    const sid = suspectByAcct.get(t.bankAccountId);
    const owner = sid != null ? nameBySuspect.get(sid) : null;
    return {name: owner ?? "Данс эзэмшигч",
      account: acctById.get(t.bankAccountId) ?? String(t.bankAccountId)};
  };
  const cpParty = (t: BankTransaction): Party => ({
    name: t.counterpartyName ?? (t.counterpartyAccount ? "Тодорхойгүй" : "—"),
    account: t.counterpartyAccount ?? null,
  });
  const senderOf = (t: BankTransaction) =>
    t.type === "credit" ? cpParty(t) : ourParty(t);
  const receiverOf = (t: BankTransaction) =>
    t.type === "credit" ? ourParty(t) : cpParty(t);
  const partyCell = (p: Party) => (
    <div style={{lineHeight: 1.3}}>
      <div>{p.name}</div>
      {p.account && (
        <div style={{fontSize: 11, color: "var(--text-muted)",
          fontFamily: "var(--font-mono)"}}>{p.account}</div>
      )}
    </div>
  );

  const columns = [
    {
      header: "Огноо",
      sortValue: (t: BankTransaction) => t.timestamp,
      render: (t: BankTransaction) => formatDateTime(t.timestamp),
    },
    {
      header: "Хэнээс (илгээгч)",
      sortValue: (t: BankTransaction) => senderOf(t).name,
      render: (t: BankTransaction) => partyCell(senderOf(t)),
    },
    {
      header: "",
      align: "center" as const,
      render: (t: BankTransaction) => (
        <span style={{color: t.type === "credit"
          ? "var(--accent-green)" : "var(--accent-red)", fontSize: 16}}>→</span>
      ),
    },
    {
      header: "Хэнд (хүлээн авагч)",
      sortValue: (t: BankTransaction) => receiverOf(t).name,
      render: (t: BankTransaction) => partyCell(receiverOf(t)),
    },
    {
      header: "Дүн",
      align: "right" as const,
      sortValue: (t: BankTransaction) =>
        t.type === "credit" ? t.amount : -t.amount,
      render: (t: BankTransaction) => (
        <span style={{fontWeight: 600, color: t.type === "credit"
          ? "var(--accent-green)" : "var(--accent-red)"}}>
          {t.type === "credit" ? "+" : "−"}{formatMoney(t.amount)}
        </span>
      ),
    },
    {
      header: "Гүйлгээний утга",
      sortValue: (t: BankTransaction) => t.description ?? "",
      render: (t: BankTransaction) => (
        <span title={t.description ?? ""} style={{display: "inline-block",
          maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", verticalAlign: "middle"}}>
          {t.description ?? "—"}
        </span>
      ),
    },
    {
      header: "Үлдэгдэл",
      align: "right" as const,
      sortValue: (t: BankTransaction) => t.runningBalance,
      render: (t: BankTransaction) => formatMoney(t.runningBalance),
    },
    {
      header: "",
      align: "right" as const,
      render: (t: BankTransaction) => (
        <button className="btn btn-sm btn-danger"
          title="Энэ гүйлгээг хэрэггүй гэж хасах (тооцоо, зураглалаас)"
          onClick={(e) => {e.stopPropagation(); toggleIgnoredTxn(t.id);}}>
          ✕ Хас
        </button>
      ),
    },
  ];

  return (
    <div className="page-container">
      <PageHeader icon="💳" title="Гүйлгээний Анализ"
        subtitle="САНХҮҮГИЙН УРСГАЛЫН АНАЛИЗ" />
      <CaseGate>

      <div className="metrics-grid">
        <StatCard label="Нийт гүйлгээ (харагдаж буй / бүгд)"
          value={<>{totalCount}<span style={{color: "var(--text-muted)",
            fontWeight: 400}}> / {allTxns.length}</span></>} />
        <StatCard label="Орлогын гүйлгээ" value={formatMoney(totalCredits)}
          color="green" />
        <StatCard label="Зарлагын гүйлгээ" value={formatMoney(totalDebits)}
          color="red" />
      </div>

      <Card
        title="Гүйлгээ — мөр дээр дарж нягтлах"
        style={{marginBottom: 16}}
        actions={
          <div style={{display: "flex", gap: 8, alignItems: "center"}}>
            {tableRows.length > 1 && (
              <button className="btn btn-danger" onClick={keepOnlyLargestShown}
                title={"Одоо харагдаж буй гүйлгээнээс хамгийн томыг нь үлдээж, "
                  + "бусдыг хэрэггүй гэж хасах"}>
                Хамгийн томыг үлдээх
              </button>
            )}
            <button className="btn btn-danger"
              onClick={() => {
                setMinAmountText(minAmount > 0 ? String(minAmount) : "");
                setCleanupTab("remove");
                setCleanupOpen(true);
              }}
              title="Жижиг дүн, босго, байгууллагын утгаар бөөнөөр цэвэрлэх">
              🧹 Цэвэрлэх{totalRemoved > 0 ? ` (${totalRemoved})` : ""}
            </button>
            {hasFilter && (
              <button className="btn" onClick={clearFilters}>ШҮҮЛТ ЦЭВЭРЛЭХ</button>
            )}
          </div>
        }>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap",
          alignItems: "flex-end", marginBottom: 16}}>
          <div>
            <label className="form-label">Данс</label>
            <Select value={filterAccount}
              onChange={(v) => {setFilterAccount(v); setFilterCounterparty("");}}
              style={{minWidth: 220}}
              options={accountOptions} />
          </div>
          <div>
            <label className="form-label">Төрөл</label>
            <Select value={filterType}
              onChange={(v) => setFilterType(v)}
              style={{minWidth: 160}}
              options={[
                {value: "", label: "Бүх төрөл"},
                {value: "credit", label: "Орлогын гүйлгээ"},
                {value: "debit", label: "Зарлагын гүйлгээ"},
              ]} />
          </div>
          <div>
            <label className="form-label">Эхлэх огноо</label>
            <DateInput value={filterFrom}
              onChange={(v) => setFilterFrom(v)}
              style={{minWidth: 160}} />
          </div>
          <div>
            <label className="form-label">Дуусах огноо</label>
            <DateInput value={filterTo}
              onChange={(v) => setFilterTo(v)}
              style={{minWidth: 160}} />
          </div>
          <div style={{flex: 1, minWidth: 220}}>
            <label className="form-label">Гүйлгээний утга (хайх)</label>
            <input type="text" className="form-input" value={filterDesc}
              onChange={(e) => setFilterDesc(e.target.value)}
              placeholder="Утгаар хайх..."
              style={{width: "100%"}} />
          </div>
        </div>
        {(filterCounterparty || minAmount > 0) && (
          <div style={{display: "flex", flexWrap: "wrap", gap: 8,
            marginBottom: 16}}>
            {filterCounterparty && (
              <span className="badge info" style={{display: "inline-flex",
                alignItems: "center", gap: 6}}>
                Харьцсан данс: {filterCounterparty}
                <button className="modal-close" style={{fontSize: 14}}
                  title="Хос шүүлтийг арилгах"
                  onClick={() => setFilterCounterparty("")}>×</button>
              </span>
            )}
            {minAmount > 0 && (
              <span className="badge" style={{display: "inline-flex",
                alignItems: "center", gap: 6}}>
                Шумын босго: {formatMoney(minAmount)}-с доош нуугдсан
                <button className="modal-close" style={{fontSize: 14}}
                  title="Босго арилгах" onClick={() => setMinAmount(0)}>×</button>
              </span>
            )}
          </div>
        )}
        <div className="scroll-container" style={{maxHeight: 440,
          margin: "0 -18px -18px", borderTop: "1px solid var(--border-primary)"}}>
          <DataTable<BankTransaction>
            columns={columns}
            rows={tableRows}
            rowKey={(t) => t.id}
            empty="Гүйлгээ алга"
            onRowClick={openDrill}
            isRowActive={(t) => t.id === selectedTxn?.id}
          />
        </div>
      </Card>

      <div style={ROW}>
        <Card
          title={`Гүйлгээний утга — давтамжаар (${dupDescs.length})`}
          actions={
            <Select value={topN}
              onChange={(v) => setTopN(Number(v))}
              title="Топ N" style={{width: 110}}
              options={[10, 20, 50, 100].map((n) =>
                ({value: n, label: `Топ ${n}`}))} />
          }
          noPadding
        >
          <div className="scroll-container" style={{maxHeight: 420}}>
            <DataTable<{desc: string; count: number; total: number}>
              defaultSort={{col: 1, dir: "desc"}}
              columns={[
                {header: "Гүйлгээний утга", sortValue: (r) => r.desc,
                  render: (r) => r.desc},
                {header: "Давтамж", align: "right" as const,
                  title: "Энэ утгатай гүйлгээ хэдэн удаа давтагдсан",
                  sortValue: (r) => r.count,
                  render: (r) => <strong>{r.count}</strong>},
                {header: "Нийт дүн", align: "right" as const,
                  sortValue: (r) => r.total,
                  render: (r) => formatMoney(r.total)},
                {header: "", align: "right" as const,
                  render: (r) => (
                    <button className="btn btn-sm btn-danger"
                      title="Энэ утгатай бүх гүйлгээг хэрэггүй гэж хасах"
                      onClick={(e) => {
                        e.stopPropagation();
                        addDescRule("contains", r.desc);
                      }}>✕ Хас</button>
                  )},
              ]}
              rows={dupDescs}
              rowKey={(r) => r.desc}
              empty="Давтагдсан утга алга"
              onRowClick={(r) => setFilterDesc(r.desc)}
            />
          </div>
        </Card>
        <Card
          title={`Данс хоорондын гүйлгээ (${activePairs.length})`}
          actions={
            <div style={{display: "flex", gap: 8, alignItems: "center"}}>
              <button className="btn btn-danger"
                onClick={() => {
                  setMinAmountText(minAmount > 0 ? String(minAmount) : "");
                  setCleanupTab("remove");
                setCleanupOpen(true);
                }}
                title="Жижиг дүн, босго, байгууллагын утга зэргээр цэвэрлэх">
                🧹 Цэвэрлэх{totalRemoved > 0 ? ` (${totalRemoved})` : ""}
              </button>
              <Select value={pairTopN}
                onChange={(v) => setPairTopN(Number(v))}
                title="Хэдэн мөр харуулах" style={{width: 100}}
                options={[10, 20, 50, 100].map((n) =>
                  ({value: n, label: `Топ ${n}`}))} />
            </div>
          }
          noPadding>
          <div className="scroll-container" style={{maxHeight: 420}}>
            <DataTable<(typeof pairRows)[number]>
              defaultSort={{col: 4, dir: "desc"}}
              columns={[
                {header: "Данс", sortValue: (r) => r.account,
                  render: (r) => r.account},
                {header: "Харьцсан данс", sortValue: (r) => r.counterparty,
                  render: (r) => r.counterparty},
                {header: "Гүйлгээ", align: "right" as const,
                  title: "Энэ хос хооронд хийгдсэн гүйлгээний тоо",
                  sortValue: (r) => r.txns, render: (r) => r.txns},
                {header: "Хамгийн их", align: "right" as const,
                  title: "Хос хоорондын хамгийн том ганц гүйлгээ",
                  sortValue: (r) => r.maxSingle,
                  render: (r) => formatMoney(r.maxSingle)},
                {header: "Нийт дүн", align: "right" as const,
                  sortValue: (r) => r.total,
                  render: (r) => <strong>{formatMoney(r.total)}</strong>},
                {header: "", align: "right" as const,
                  render: (r) => (
                    <button className="btn btn-sm btn-danger"
                      onClick={(e) => {e.stopPropagation(); toggleIgnoredPair(r.key);}}
                      title="Энэ хосыг хасах">✕ Хас</button>
                  )},
              ]}
              rows={pairRows}
              rowKey={(r) => r.key}
              onRowClick={(r) => filterBy({
                account: String(r.bankAccountId), counterparty: r.cpAccount})}
              empty="Хос алга"
            />
          </div>
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Гүйлгээний дэлгэц (дүн vs хугацаа) — цэг дээр дарж нягтлах">
          <Plot
            height={280}
            data={[
              {type: "scatter", mode: "markers", name: "Орлого",
                x: credits.map((t) => t.timestamp.slice(0, 10)),
                y: credits.map((t) => t.amount),
                marker: {color: "#00E676", size: 7, opacity: 0.6}},
              {type: "scatter", mode: "markers", name: "Зарлага",
                x: debits.map((t) => t.timestamp.slice(0, 10)),
                y: debits.map((t) => t.amount),
                marker: {color: "#FF5252", size: 7, opacity: 0.6}},
            ]}
            onClick={(e) => {
              const p = e.points?.[0];
              if (!p) return;
              const idx = p.pointIndex ?? p.pointNumber;
              const t = p.curveNumber === 0 ? credits[idx] : debits[idx];
              if (t) openDrill(t);
            }}
          />
        </Card>
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
      </div>

      <Card
        title={`Дуудлагын дараах гүйлгээ (${corrRows.length}) — дуудлагаас хойш мөнгөн гүйлгээ`}
        actions={
          <Select value={corrMin}
            onChange={(v) => setCorrMin(Number(v))}
            title="Дуудлагаас хойших хугацааны цонх" style={{width: 150}}
            options={[5, 15, 30, 60, 120].map((m) =>
              ({value: m, label: `${m} мин дотор`}))} />
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

      {selectedTxn && (() => {
        const t = selectedTxn;
        const tagged = exhibitByTxn.get(t.id);
        const isCredit = t.type === "credit";
        const detailRows: Array<[string, string]> = [
          ["Данс", acctById.get(t.bankAccountId) ?? String(t.bankAccountId)],
          ["Харьцагч", t.counterpartyName ?? "—"],
          ["Харьцсан данс", t.counterpartyAccount ?? "—"],
          ["Гүйлгээний утга", t.description ?? "—"],
          ["Ангилал", t.category ?? "—"],
          ["Суваг", t.channel ?? "—"],
          ["Байршил", t.location ?? "—"],
          ["Лавлах дугаар", t.referenceNumber ?? "—"],
          ["Валют", t.currency || "MNT"],
          ["Үлдэгдэл", formatMoney(t.runningBalance)],
        ];
        return (
          <div
            onClick={() => setSelectedTxn(null)}
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
                alignItems: "center", marginBottom: 16}}>
                <span className="card-title">Гүйлгээний дэлгэрэнгүй</span>
                <button className="btn" onClick={() => setSelectedTxn(null)}>
                  ХААХ
                </button>
              </div>

              <div style={{marginBottom: 16}}>
                <div style={{color: "var(--text-secondary)", fontSize: 12}}>
                  {formatDateTime(t.timestamp)}
                </div>
                <div style={{fontSize: 26, fontWeight: 700, marginTop: 2,
                  color: isCredit ? "var(--accent-green)" : "var(--accent-red)"}}>
                  {isCredit ? "+" : "−"}{formatMoney(t.amount)}
                </div>
                <div style={{fontSize: 12, color: "var(--text-muted)"}}>
                  {isCredit ? "Орлогын гүйлгээ" : "Зарлагын гүйлгээ"}
                </div>
              </div>

              <div className="graph-detail-stats">
                {detailRows.map(([label, value]) => (
                  <div key={label} className="graph-detail-row">
                    <span>{label}</span>
                    <span style={{textAlign: "right"}}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{marginTop: 16}}>
                <div style={{fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  color: "var(--text-muted)", marginBottom: 8}}>
                  ЭНЭ ГҮЙЛГЭЭГЭЭР ШҮҮХ
                </div>
                <div style={{display: "flex", flexWrap: "wrap", gap: 8}}>
                  <button className="btn btn-sm"
                    onClick={() => filterBy({account: String(t.bankAccountId)})}>
                    Энэ данс
                  </button>
                  <button className="btn btn-sm"
                    onClick={() => filterBy({day: t.timestamp.slice(0, 10)})}>
                    Энэ өдөр
                  </button>
                  {t.description && (
                    <button className="btn btn-sm"
                      onClick={() => filterBy({desc: t.description ?? ""})}>
                      Энэ утга
                    </button>
                  )}
                  {t.counterpartyAccount && (
                    <button className="btn btn-sm"
                      title="Энэ хосын бүх гүйлгээг тооцохгүй болгох"
                      onClick={() => {
                        toggleIgnoredPair(
                          pairKey(t.bankAccountId, t.counterpartyAccount!));
                        setSelectedTxn(null);
                      }}>
                      ✕ Хос хасах
                    </button>
                  )}
                </div>
                <button className="btn btn-danger btn-sm"
                  style={{width: "100%", marginTop: 10}}
                  title="Зөвхөн энэ нэг гүйлгээг тооцоо, зураглалаас хасах"
                  onClick={() => {toggleIgnoredTxn(t.id); setSelectedTxn(null);}}>
                  ✕ Зөвхөн энэ гүйлгээг хасах
                </button>
              </div>

              <div style={{marginTop: 18}}>
                {!activeCase ? (
                  <div style={{fontSize: 11, color: "var(--text-muted)"}}>
                    Нотлох баримт болгохын тулд идэвхтэй кейс сонгоно уу.
                  </div>
                ) : tagged != null ? (
                  <button className="btn" disabled style={{width: "100%"}}>
                    Үүсгэсэн (Exhibit #{tagged})
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{width: "100%"}}
                    onClick={() => onTag(t)}>
                    НОТЛОХ ТУГ ТАВИХ
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {cleanupOpen && (
        <div className="modal-overlay" onClick={() => setCleanupOpen(false)}>
          <div className="modal-content" style={{width: "min(600px, 94vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🧹 ХЭРЭГГҮЙ ГҮЙЛГЭЭ ЦЭВЭРЛЭХ</span>
              <button className="modal-close" title="Хаах"
                onClick={() => setCleanupOpen(false)}>×</button>
            </div>
            {/* Two clearly separated jobs: ADD removals (destructive, red) vs
                RESTORE what was removed (a safe, dedicated undo area). They must
                never sit next to each other as look-alike buttons. */}
            <div style={{display: "flex", gap: 4, padding: "0 18px",
              borderBottom: "1px solid var(--border-primary)"}}>
              <button className="btn" onClick={() => setCleanupTab("remove")}
                style={{borderRadius: 0, border: "none", borderBottom:
                  cleanupTab === "remove" ? "2px solid var(--accent-red)"
                    : "2px solid transparent", background: "transparent",
                  color: cleanupTab === "remove" ? "var(--text-primary)"
                    : "var(--text-muted)"}}>
                ✕ Хасах
              </button>
              <button className="btn" onClick={() => setCleanupTab("restore")}
                style={{borderRadius: 0, border: "none", borderBottom:
                  cleanupTab === "restore" ? "2px solid var(--accent-cyan)"
                    : "2px solid transparent", background: "transparent",
                  color: cleanupTab === "restore" ? "var(--text-primary)"
                    : "var(--text-muted)"}}>
                ↩ Сэргээх{restoreCount > 0 ? ` (${restoreCount})` : ""}
              </button>
            </div>

            {cleanupTab === "remove" ? (
            <div className="modal-body">
              {/* Amount floor — the headline noise filter. Drops every small
                  transaction everywhere + on the connection graph. */}
              <div className="form-label" style={{color: "var(--accent-cyan)"}}>
                💰 Зөвхөн том мөнгө — жижиг гүйлгээг бүхэлд нь нуух
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "center",
                marginBottom: 6}}>
                <input type="text" inputMode="numeric" className="form-input"
                  value={minAmountText}
                  onChange={(e) => setMinAmountText(e.target.value)}
                  onKeyDown={(e) => {if (e.key === "Enter") commitMinAmount();}}
                  placeholder="Хамгийн бага дүн ₮" style={{width: 170}} />
                <button className="btn btn-danger" onClick={commitMinAmount}>
                  Хэрэглэх
                </button>
                {minAmount > 0 && (
                  <button className="btn"
                    onClick={() => {setMinAmount(0); setMinAmountText("");}}>
                    Болих
                  </button>
                )}
              </div>
              <div style={{fontSize: 11, color: "var(--text-muted)",
                marginBottom: 18}}>
                {minAmount > 0
                  ? `Идэвхтэй: ${formatMoney(minAmount)}-с доош бүх гүйлгээг `
                    + "тооцоо, график, зураглалаас нууж байна."
                  : "Энэ дүнгээс доош бүх ганц гүйлгээ шум болж, тооцоо, "
                    + "график, холбоосын зураглалаас бүрмөсөн хасагдана."}
              </div>

              {/* Threshold removal */}
              <div className="form-label">Босго дүнгээс доош хосыг хасах</div>
              <div style={{display: "flex", gap: 8, alignItems: "center",
                marginBottom: 6}}>
                <input type="text" inputMode="numeric" className="form-input"
                  value={thresholdText}
                  onChange={(e) => setThresholdText(e.target.value)}
                  onKeyDown={(e) => {if (e.key === "Enter") bulkRemoveBelow();}}
                  placeholder="Босго дүн ₮" style={{width: 130}} />
                <Select value={thresholdMode}
                  onChange={(v) => setThresholdMode(v as typeof thresholdMode)}
                  style={{width: 170}}
                  options={[
                    {value: "total", label: "Нийт дүнгээр"},
                    {value: "single", label: "Ганц гүйлгээгээр"},
                  ]} />
                <button className="btn btn-danger" onClick={bulkRemoveBelow}
                  disabled={!Number(thresholdText.replace(/[^\d.]/g, ""))}>
                  Хасах
                </button>
              </div>
              <div style={{fontSize: 11, color: "var(--text-muted)",
                marginBottom: 18}}>
                {thresholdMode === "single"
                  ? "Хамгийн том ганц гүйлгээ нь босгоос доош бүх хосыг хасна."
                  : "Нийт дүн нь босгоос доош бүх хосыг хасна."}
              </div>

              {/* Description-pattern noise rules */}
              <div className="form-label">
                Гүйлгээний утгаар хасах (байгууллага гэх мэт)
              </div>
              <div style={{display: "flex", gap: 8, alignItems: "center",
                marginBottom: 6}}>
                <Select value={descMode}
                  onChange={(v) => setDescMode(v as DescMode)}
                  style={{width: 150}}
                  options={[
                    {value: "starts", label: "Эхэлсэн"},
                    {value: "ends", label: "Төгссөн"},
                    {value: "contains", label: "Агуулсан"},
                  ]} />
                <input type="text" className="form-input" value={descText}
                  onChange={(e) => setDescText(e.target.value)}
                  onKeyDown={(e) => {if (e.key === "Enter") markDesc();}}
                  placeholder="ж: SMART BANK, SOCIALPAY..."
                  style={{flex: 1}} />
                <button className="btn btn-danger" onClick={markDesc}
                  disabled={!descText.trim()}>Хасах</button>
              </div>
              <div style={{fontSize: 11, color: "var(--text-muted)"}}>
                Энэ утгатай бүх гүйлгээ хасагдана. Хасагдсан дүрмүүдийг
                “↩ Сэргээх” табаас буцаана.
              </div>
            </div>
            ) : (
            <div className="modal-body">
              <div style={{fontSize: 12, color: "var(--text-secondary)",
                marginBottom: 16}}>
                Доорх бүх зүйл нь одоо <b>нуугдсан</b>. Мөр бүрийн ↩ товчоор
                нэг нэгээр нь, эсвэл доод талын товчоор бүгдийг сэргээнэ.
              </div>

              {/* Amount floor */}
              <div className="form-label">Жижиг дүнгийн босго</div>
              {minAmount > 0 ? (
                <div style={{display: "flex", justifyContent: "space-between",
                  alignItems: "center", padding: "8px 12px", marginBottom: 18,
                  border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)"}}>
                  <span>{formatMoney(minAmount)}-с доош гүйлгээ нуугдсан</span>
                  <button className="btn btn-sm"
                    onClick={() => {setMinAmount(0); setMinAmountText("");}}
                    title="Босго арилгах">↩ Сэргээх</button>
                </div>
              ) : (
                <div style={{fontSize: 11, color: "var(--text-muted)",
                  marginBottom: 18}}>Идэвхтэй босго алга.</div>
              )}

              {/* Description rules — a clear table, not a badge pile */}
              <div className="form-label">
                Гүйлгээний утгаар хасагдсан ({descRules.length})
              </div>
              {descRules.length > 0 ? (
                <div className="scroll-container" style={{maxHeight: 160,
                  marginBottom: 18, border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)"}}>
                  <DataTable<DescRule & {i: number}>
                    columns={[
                      {header: "Нөхцөл", render: (r) => r.mode === "starts"
                        ? "Эхэлсэн" : r.mode === "ends" ? "Төгссөн" : "Агуулсан"},
                      {header: "Утга", render: (r) => r.text},
                      {header: "", align: "right" as const,
                        render: (r) => (
                          <button className="btn btn-sm"
                            onClick={() => removeDescRule(r.i)}
                            title="Буцаах">↩</button>
                        )},
                    ]}
                    rows={descRules.map((r, i) => ({...r, i}))}
                    rowKey={(r) => `${r.mode}-${r.text}`}
                    empty="Алга"
                  />
                </div>
              ) : (
                <div style={{fontSize: 11, color: "var(--text-muted)",
                  marginBottom: 18}}>Хасагдсан утга алга.</div>
              )}

              {/* Removed pairs */}
              <div className="form-label">
                Хасагдсан хосууд ({removedPairs.length})
              </div>
              {removedPairs.length > 0 ? (
                <div className="scroll-container" style={{maxHeight: 160,
                  marginBottom: 18, border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)"}}>
                  <DataTable<(typeof removedPairs)[number]>
                    columns={[
                      {header: "Данс", render: (r) => r.account},
                      {header: "Харьцсан данс", render: (r) => r.counterparty},
                      {header: "Нийт дүн", align: "right" as const,
                        render: (r) => formatMoney(r.total)},
                      {header: "", align: "right" as const,
                        render: (r) => (
                          <button className="btn btn-sm"
                            onClick={() => toggleIgnoredPair(r.key)}
                            title="Буцаах">↩</button>
                        )},
                    ]}
                    rows={removedPairs}
                    rowKey={(r) => r.key}
                    empty="Алга"
                  />
                </div>
              ) : (
                <div style={{fontSize: 11, color: "var(--text-muted)",
                  marginBottom: 18}}>Хасагдсан хос алга.</div>
              )}

              {/* Individually removed transactions */}
              <div className="form-label">
                Хасагдсан гүйлгээ ({removedTxnList.length})
              </div>
              {removedTxnList.length > 0 ? (
                <div className="scroll-container" style={{maxHeight: 160,
                  marginBottom: 18, border: "1px solid var(--border-primary)",
                  borderRadius: "var(--radius-sm)"}}>
                  <DataTable<BankTransaction>
                    columns={[
                      {header: "Огноо",
                        render: (t) => formatDateTime(t.timestamp)},
                      {header: "Дүн", align: "right" as const,
                        render: (t) => formatMoney(t.amount)},
                      {header: "Харьцагч",
                        render: (t) => t.counterpartyName
                          ?? t.counterpartyAccount ?? "—"},
                      {header: "", align: "right" as const,
                        render: (t) => (
                          <button className="btn btn-sm"
                            onClick={() => toggleIgnoredTxn(t.id)}
                            title="Буцаах">↩</button>
                        )},
                    ]}
                    rows={removedTxnList}
                    rowKey={(t) => t.id}
                    empty="Алга"
                  />
                </div>
              ) : (
                <div style={{fontSize: 11, color: "var(--text-muted)",
                  marginBottom: 18}}>Хасагдсан гүйлгээ алга.</div>
              )}

              {restoreCount > 0 && (
                <button className="btn btn-danger" style={{width: "100%"}}
                  onClick={() => {
                    if (!window.confirm("Бүх хасалтыг цуцалж, нуусан бүх "
                      + "гүйлгээг буцааж харуулах уу?")) return;
                    restorePairs(); clearDescRules(); restoreTxns();
                    setMinAmount(0); setMinAmountText("");
                  }}
                  title="Бүх нуусан өгөгдлийг буцаах (баталгаажуулна)">
                  ↩ Бүгдийг сэргээх ({restoreCount})
                </button>
              )}
            </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-primary"
                onClick={() => setCleanupOpen(false)}>ХААХ</button>
            </div>
          </div>
        </div>
      )}
      </CaseGate>
    </div>
  );
}
