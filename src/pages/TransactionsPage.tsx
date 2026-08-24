/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : TransactionsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useSearchParams} from "react-router-dom";
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
import AccountAnalysis from "../components/AccountAnalysis";
import CaseGate from "../components/CaseGate";
import Plot from "../components/Plot";
import {formatDateTime, formatMoney} from "../lib/format";
import {
  addDescRule,
  clearDescRules,
  ignorePairs,
  ignoreTxns,
  matchesDescRules,
  pairKey,
  removeDescRule,
  restorePairs,
  restoreTxns,
  toggleIgnoredPair,
  toggleIgnoredTxn,
  txnPairKey,
  useIgnoredDesc,
  useIgnoredPairs,
  useIgnoredTxns,
} from "../lib/ignoredPairs";
import type {DescMode, DescRule} from "../lib/ignoredPairs";
import type {BankTransaction} from "../types";

interface TxnAccount {
  id            : number;
  accountNumber : string;
  bankName      : string | null;
  suspectId     : number | null;
}

// A usable display name: non-empty and not a "-" placeholder. When false we
// fall back to the account number.
const realName = (s: string | null | undefined): boolean => {
  const t = (s ?? "").trim();
  return t !== "" && !/^-+$/.test(t);
};

// Plot a timestamp as minutes since midnight. Keeping the value numeric lets
// Plotly draw a continuous 24-hour axis while the tick labels remain HH:MM.
const minuteOfDay = (timestamp: string): number => {
  const match = timestamp.match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

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

// Threshold input kept in its OWN component with local state, so each keystroke
// re-renders only this tiny widget — not the whole Transactions page (which
// would redraw the heavy Plotly charts and lag). It commits on button/Enter.
function ThresholdCleanup({onRemove}: {onRemove: (amt: number) => void}) {
  const [text, setText] = useState("");
  const amt = Number(text.replace(/[^\d.]/g, "")) || 0;
  const submit = () => { if (amt) { onRemove(amt); setText(""); } };
  return (
    <div style={{display: "flex", gap: 8, alignItems: "center",
      marginBottom: 6}}>
      <input type="text" inputMode="numeric" className="form-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Босго дүн ₮" style={{width: 150}} />
      <button className="btn btn-danger" onClick={submit} disabled={!amt}>
        Хасах
      </button>
    </div>
  );
}

// Description-rule input, isolated in its own component with LOCAL state so
// typing never re-renders the (heavy) transactions page.
function DescCleanup() {
  const [mode, setMode] = useState<DescMode>("starts");
  const [text, setText] = useState("");
  const submit = () => { if (text.trim()) { addDescRule(mode, text); setText(""); } };
  return (
    <div style={{display: "flex", gap: 8, alignItems: "center",
      marginBottom: 6}}>
      <Select value={mode} onChange={(v) => setMode(v as DescMode)}
        style={{width: 150}}
        options={[
          {value: "starts", label: "Эхэлсэн"},
          {value: "ends", label: "Төгссөн"},
          {value: "contains", label: "Агуулсан"},
        ]} />
      <input type="text" className="form-input" value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="ж: SMART BANK, SOCIALPAY..." style={{flex: 1}} />
      <button className="btn btn-danger" onClick={submit}
        disabled={!text.trim()}>Хасах</button>
    </div>
  );
}

export default function TransactionsPage() {
  const {data, loading} = useQuery<TxnData>(TRANSACTIONS_QUERY);
  const callsQ = useQuery<CorrData>(CALL_RECORDS_QUERY);
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;
  const evidenceQ = useQuery<{evidenceForCase: {sourceType: string;
    sourceId: number; exhibitNumber: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId: activeCase?.id ?? 0}, skip: !activeCase});
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  // View filters + the page view live in the URL querystring, so a filtered
  // view is deep-linkable, survives reload and can be shared/screenshotted
  // (e.g. /transactions?acct=3&cp=1234&view=removed).
  const [params, setParams] = useSearchParams();
  function patchParams(patch: Record<string, string | null>) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, {replace: true});
  }
  const filterAccount = params.get("acct") ?? "All";
  const filterCounterparty = params.get("cp") ?? "";
  // A counterparty by NAME rather than by account number. The dashboard now
  // treats a counterparty as a person and merges his accounts, so a drill-down
  // from there cannot be expressed as one account number.
  const filterCpName = params.get("cpname") ?? "";
  const filterType = params.get("type") ?? "";
  const filterFrom = params.get("from") ?? "";
  const filterTo = params.get("to") ?? "";
  const filterDesc = params.get("q") ?? "";
  // Page view: the analysis itself, or the dedicated restore ("removed") tab.
  const view: "txns" | "analysis" | "removed" =
    params.get("view") === "removed" ? "removed"
      : params.get("view") === "analysis" ? "analysis" : "txns";
  const setFilterAccount = (v: string) =>
    patchParams({acct: v === "All" ? null : v});
  // Picking from the dropdown replaces a name drill — one counterparty filter.
  const setFilterCounterparty = (v: string) =>
    patchParams({cp: v, cpname: null});
  const setFilterType = (v: string) => patchParams({type: v});
  const setFilterFrom = (v: string) => patchParams({from: v});
  const setFilterTo = (v: string) => patchParams({to: v});
  const setFilterDesc = (v: string) => patchParams({q: v});
  const [topN, setTopN] = useState(10);
  const [pairTopN, setPairTopN] = useState(20);
  const [corrMin, setCorrMin] = useState(30);
  const [selectedTxn, setSelectedTxn] = useState<BankTransaction | null>(null);
  const ignoredPairs = useIgnoredPairs();
  const ignoredTxns = useIgnoredTxns();
  const descRules = useIgnoredDesc();
  // Cleanup modal (its inputs keep their own local state so typing never
  // re-renders this heavy page).
  const [cleanupOpen, setCleanupOpen] = useState(false);

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
  // individually (including the bulk "remove below ₮X" action, which marks each
  // small transaction), OR its description matches a rule, OR its account-pair
  // was removed. All of them drop it from every count here AND from the graph.
  const isNoise = (t: BankTransaction) =>
    ignoredTxns.has(t.id) || matchesDescRules(t.description, descRules);
  const isPairUnimportant = (key: string | null) =>
    key != null && ignoredPairs.has(key);
  // cleanTxns = view minus amount/description noise; feeds the pair table.
  const cleanTxns = baseFiltered.filter((t) => !isNoise(t));
  // Drilling into one pair (click a row in "Данс хоорондын гүйлгээ") narrows the
  // table/stats to just that account↔counterparty — WITHOUT shrinking the pair
  // list, so the analyst can keep clicking other pairs.
  const cpNameNeedle = filterCpName.trim().toLowerCase();
  const cpFiltered = filterCounterparty
    ? cleanTxns.filter((t) =>
      (t.counterpartyAccount ?? "").trim() === filterCounterparty)
    : cpNameNeedle
      // By name: every account that name transacted from, which is the whole
      // point of arriving here from the dashboard.
      ? cleanTxns.filter((t) =>
        (t.counterpartyName ?? "").trim().toLowerCase() === cpNameNeedle)
      : cleanTxns;
  // filtered = the ACTIVE set (also minus removed pairs) for stats/charts/table.
  const filtered = cpFiltered.filter((t) => !isPairUnimportant(txnPairKey(t)));
  const tableRows = filtered.filter((t) =>
    (!filterType || t.type === filterType));

  // Remove noise below a threshold — ONE action ("Хасах"), two ways. Both are
  // a real one-shot removal: they MARK the matching data unimportant (it lands
  // in the "Хасагдсаныг сэргээх" tab), NOT a lingering live filter.
  //  • "single": mark every INDIVIDUAL transaction under the amount.
  //  • "total" : mark every account↔account pair whose TOTAL money is under it.
  // A button commits — nothing applies while typing.
  function removeNoise(amt: number) {
    if (!amt) return;
    // Mark every transaction below the amount removed (amounts are stored as
    // magnitude, so `< amt` is the small ones regardless of debit/credit).
    const ids = allTxns
      .filter((t) => t.amount < amt && !ignoredTxns.has(t.id))
      .map((t) => t.id);
    if (ids.length) ignoreTxns(ids);
  }
  // Apply a filter from the detail panel or a pair row, then close it — the list
  // sits right under the filter bar so the result is immediately visible.
  // Selecting a pair sets its counterparty so the table shows JUST that pair;
  // any other account/day/desc change drops a stale counterparty drill.
  function filterBy(patch: {
    account?: string; desc?: string; day?: string; counterparty?: string;
  }) {
    const p: Record<string, string | null> = {
      cp: patch.counterparty ?? null, cpname: null};
    if (patch.account !== undefined) {
      p.acct = patch.account === "All" ? null : patch.account;
    }
    if (patch.desc !== undefined) p.q = patch.desc;
    if (patch.day !== undefined) {p.from = patch.day; p.to = patch.day;}
    patchParams(p);
    setSelectedTxn(null);
  }
  const hasFilter = filterAccount !== "All" || filterCounterparty !== ""
    || filterCpName !== "" || filterType !== "" || filterFrom !== ""
    || filterTo !== "" || filterDesc !== "";

  function clearFilters() {
    patchParams({acct: null, cp: null, cpname: null, type: null, from: null,
      to: null, q: null});
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
  const acctById = new Map(accounts.map((a) => [a.id, a.accountNumber]));
  interface PairAgg {
    key: string; bankAccountId: number; cpAccount: string;
    account: string; counterparty: string; cpName: string;
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
      counterparty: cp, cpName: "", txns: 0, total: 0, maxSingle: 0,
    };
    // Remember who the counterparty is (first real name seen for this account).
    if (!a.cpName && realName(t.counterpartyName)) {
      a.cpName = t.counterpartyName!.trim();
    }
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
  // Individually-removed transactions, resolved for the cleanup modal's undo.
  const removedTxnList = allTxns.filter((t) => ignoredTxns.has(t.id));
  // Everything the analyst can restore, for the "Сэргээх" tab's badge.
  const restoreCount = removedTxnList.length + removedPairs.length
    + descRules.length;

  // Дуудлагын дараах гүйлгээ: for each filtered transaction, the same
  // suspect's nearest preceding call within the chosen window.
  const suspectByAcct = new Map(accounts.map((a) => [a.id, a.suspectId]));
  const nameBySuspect = new Map(
    (callsQ.data?.suspects ?? []).map((s) => [s.id, s.fullName]));
  // The owning person's name for one of our case accounts, or null (fall back
  // to the account number). Lets the pair table say WHO, not just a number.
  const acctOwnerName = (bankAccountId: number): string | null => {
    const sid = suspectByAcct.get(bankAccountId);
    const nm = sid != null ? nameBySuspect.get(sid) : null;
    return realName(nm) ? nm! : null;
  };
  // Account dropdown — ONLY the accounts a statement was actually imported for.
  // The importer also creates an account row for every counterparty number it
  // meets, so the raw list ran to hundreds of numbers nobody is investigating
  // and the one account the analyst wanted was lost in them. Holding rows of
  // its own is what makes an account a subject of the case; it is the same rule
  // the Дансны дүн шинжилгээ tab already applies (analyseAccounts).
  const txnCountByAcct = new Map<number, number>();
  for (const t of allTxns) {
    txnCountByAcct.set(t.bankAccountId,
      (txnCountByAcct.get(t.bankAccountId) ?? 0) + 1);
  }
  // Name FIRST, number after: the analyst knows these people by name, and a
  // list that opens with digits cannot be read at a glance.
  const accountOptions = [
    {value: "All", label: "Бүх данс"},
    ...accounts
      // A deep link (?acct=…) must keep working even when that account is not
      // one of ours, or the page would silently drop a filter it is applying.
      .filter((a) => (txnCountByAcct.get(a.id) ?? 0) > 0
        || String(a.id) === filterAccount)
      .sort((x, y) =>
        (txnCountByAcct.get(y.id) ?? 0) - (txnCountByAcct.get(x.id) ?? 0))
      .map((a) => {
        const owner = acctOwnerName(a.id);
        return {value: String(a.id),
          label: owner ? `${owner} · ${a.accountNumber}` : a.accountNumber};
      }),
  ];
  // Харьцаа dropdown — everyone the accounts in view actually traded with,
  // commonest first, keyed by the counterparty ACCOUNT (what ?cp= filters on).
  // ⚠️ Placeholder counterparties are left out on purpose: the bank writes "-"
  // for "no value" into both the name and the account, so a single "-" entry
  // would fold thousands of unrelated rows into one fake counterparty and top
  // the list. Those rows are simply not a counterparty anyone can pick.
  const cpAgg = new Map<string, {name: string; count: number}>();
  for (const t of cleanTxns) {
    const acct = (t.counterpartyAccount ?? "").trim();
    if (!realName(acct)) continue;
    const a = cpAgg.get(acct) ?? {name: "", count: 0};
    if (!a.name && realName(t.counterpartyName)) {
      a.name = t.counterpartyName!.trim();
    }
    a.count++;
    cpAgg.set(acct, a);
  }
  const counterpartyOptions = [
    {value: "", label: "Бүх харьцаа"},
    // A deep link (?cp=…) or a pair-table drill must keep working even when
    // that counterparty is filtered out of the list above.
    ...(filterCounterparty && !cpAgg.has(filterCounterparty)
      ? [{value: filterCounterparty, label: filterCounterparty}] : []),
    ...[...cpAgg.entries()]
      .sort((x, y) => y[1].count - x[1].count)
      .map(([acct, a]) => ({value: acct,
        label: a.name ? `${a.name} · ${acct}` : acct})),
  ];

  const calls = callsQ.data?.callRecords ?? [];
  interface CorrRow {
    call: CorrCall; txn: BankTransaction;
    suspectName: string; deltaMin: number;
  }
  // Post-call correlation, done cheaply: group each suspect's calls ONCE with
  // pre-parsed timestamps, sorted, then for each transaction binary-search the
  // nearest preceding call. Avoids the old txns×calls scan (millions of ops
  // with per-iteration date parsing) that froze the page. Plain computation —
  // NOT a hook — because this runs after the component's early returns.
  const corrRows: CorrRow[] = (() => {
    const bySid = new Map<number, {call: CorrCall; ms: number}[]>();
    for (const c of calls) {
      if (c.suspectId == null) continue;
      const arr = bySid.get(c.suspectId);
      const entry = {call: c, ms: Date.parse(c.startTime)};
      if (arr) arr.push(entry); else bySid.set(c.suspectId, [entry]);
    }
    for (const arr of bySid.values()) arr.sort((a, b) => a.ms - b.ms);
    const rows: CorrRow[] = [];
    for (const t of filtered) {
      const sid = suspectByAcct.get(t.bankAccountId);
      if (sid == null) continue;
      const arr = bySid.get(sid);
      if (!arr) continue;
      const tt = Date.parse(t.timestamp);
      // largest call ms <= tt (the nearest preceding call)
      let lo = 0, hi = arr.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].ms <= tt) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (idx < 0) continue;
      const delta = (tt - arr[idx].ms) / 60000;
      if (delta >= 0 && delta <= corrMin) {
        rows.push({call: arr[idx].call, txn: t,
          suspectName: nameBySuspect.get(sid) ?? `#${sid}`, deltaMin: delta});
      }
    }
    rows.sort((a, b) => a.deltaMin - b.deltaMin);
    return rows;
  })();
  const corrClass = (m: number) =>
    m <= 5 ? "tight" : m <= 15 ? "close" : "near";

  const totalCount   = filtered.length;
  const credits = filtered.filter((t) => t.type === "credit");
  const debits = filtered.filter((t) => t.type === "debit");
  const chartCredits = [...credits].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp));
  const chartDebits = [...debits].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp));
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
  // each shown as a name + its account number.
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
  // The ДАНС ЭЗЭМШИГЧ is ALWAYS the left column and the ХАРЬЦАА always the
  // right one, so the eye reads a single subject straight down the page. The
  // sides used to swap with the direction of the money, which made the same
  // person appear in either column. Direction is now carried by the ARROW
  // alone: income (credit) means the counterparty sent money to the owner, so
  // it points back at him.
  const flowArrow = (t: BankTransaction, muted?: boolean) => (
    <span style={{fontSize: 16, color: muted ? "var(--text-muted)"
      : t.type === "credit" ? "var(--accent-green)" : "var(--accent-red)"}}>
      {t.type === "credit" ? "←" : "→"}
    </span>
  );
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
      header: "Данс эзэмшигч",
      sortValue: (t: BankTransaction) => ourParty(t).name,
      render: (t: BankTransaction) => partyCell(ourParty(t)),
    },
    {
      header: "",
      align: "center" as const,
      render: (t: BankTransaction) => flowArrow(t),
    },
    {
      header: "Харьцаа",
      sortValue: (t: BankTransaction) => cpParty(t).name,
      render: (t: BankTransaction) => partyCell(cpParty(t)),
    },
    {
      header: "Дүн",
      align: "right" as const,
      // By SIZE, biggest first — the signed value sorted every credit above
      // every debit, so "ихээс бага" showed the smallest debits as the
      // "largest". The +/− and the colour already carry the direction.
      sortValue: (t: BankTransaction) => t.amount,
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

      {/* Page views: the analysis, and a DEDICATED full-width restore area
          (user wish: restoring must never live in a cramped modal). The view
          rides the querystring so it is linkable: ?view=removed */}
      <div style={{display: "flex", gap: 2, marginBottom: 16,
        borderBottom: "1px solid var(--border-primary)"}}>
        {([
          {key: "txns", label: "Гүйлгээний шинжилгээ"},
          {key: "analysis", label: "Дансны дүн шинжилгээ"},
          {key: "removed", label: `Хасагдсаныг сэргээх${
            restoreCount > 0 ? ` (${restoreCount})` : ""}`},
        ] as const).map((tab) => (
          <button key={tab.key} className="btn"
            onClick={() => patchParams(
              {view: tab.key === "txns" ? null : tab.key})}
            style={{borderRadius: 0, border: "none",
              padding: "10px 18px", background: "transparent",
              borderBottom: view === tab.key
                ? "2px solid var(--accent-cyan)" : "2px solid transparent",
              color: view === tab.key
                ? "var(--text-primary)" : "var(--text-muted)"}}>
            {tab.label}
          </button>
        ))}
      </div>

      {view === "txns" && <>
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
            <button className="btn btn-danger"
              onClick={() => setCleanupOpen(true)}
              title="Жижиг дүн, босго, байгууллагын утгаар бөөнөөр цэвэрлэх">
              🧹 Цэвэрлэх
            </button>
            {hasFilter && (
              <button className="btn" onClick={clearFilters}>ШҮҮЛТ ЦЭВЭРЛЭХ</button>
            )}
          </div>
        }>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap",
          alignItems: "flex-end", marginBottom: 16}}>
          <div>
            <label className="form-label">Данс эзэмшигч сонгох</label>
            <Select value={filterAccount} searchable
              onChange={(v) => patchParams(
                {acct: v === "All" ? null : v, cp: null, cpname: null})}
              style={{minWidth: 220}}
              options={accountOptions} />
          </div>
          <div>
            <label className="form-label">Харьцаа сонгох</label>
            {/* searchable: the counterparty list runs to hundreds of names —
                scrolling it to find one person is not a way to work. */}
            <Select value={filterCounterparty} searchable
              onChange={(v) => setFilterCounterparty(v)}
              // Arrived by NAME from the dashboard: show whose rows these are,
              // instead of an empty box under a filtered list.
              triggerLabel={filterCpName || undefined}
              style={{minWidth: 220}}
              options={counterpartyOptions} />
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
        {/* No badge chip for the counterparty drill: the Харьцаа сонгох
            dropdown IS where that selection lives, and showing the same
            filter twice reads as two controls fighting over one job. */}
        <div style={{margin: "0 -18px -18px",
          borderTop: "1px solid var(--border-primary)"}}>
          <DataTable<BankTransaction>
            columns={columns}
            rows={tableRows}
            rowKey={(t) => t.id}
            pageSize={25}
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
                  render: (r) => (
                    <span className="cell-truncate" title={r.desc}>{r.desc}</span>
                  )},
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
            <Select value={pairTopN}
              onChange={(v) => setPairTopN(Number(v))}
              title="Хэдэн мөр харуулах" style={{width: 100}}
              options={[10, 20, 50, 100].map((n) =>
                ({value: n, label: `Топ ${n}`}))} />
          }
          noPadding>
          <div className="scroll-container" style={{maxHeight: 420}}>
            <DataTable<(typeof pairRows)[number]>
              defaultSort={{col: 4, dir: "desc"}}
              columns={[
                {header: "Эзэмшигч",
                  sortValue: (r) => acctOwnerName(r.bankAccountId) ?? r.account,
                  render: (r) => acctOwnerName(r.bankAccountId) ?? r.account},
                {header: "Харьцагч",
                  sortValue: (r) => realName(r.cpName) ? r.cpName : r.counterparty,
                  render: (r) => realName(r.cpName) ? r.cpName : r.counterparty},
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
              pageSize={25}
              onRowClick={(r) => filterBy({
                account: String(r.bankAccountId), counterparty: r.cpAccount})}
              empty="Хос алга"
            />
          </div>
        </Card>
      </div>

      <div style={ROW}>
        <Card title="Гүйлгээний дэлгэц (огноо vs цаг) — цэг дээр дарж нягтлах">
          <Plot
            height={280}
            data={[
              {type: "scatter", mode: "lines+markers", name: "Орлого",
                x: chartCredits.map((t) => t.timestamp.slice(0, 10)),
                y: chartCredits.map((t) => minuteOfDay(t.timestamp)),
                customdata: chartCredits.map((t) => [
                  formatDateTime(t.timestamp), formatMoney(t.amount),
                ]),
                line: {color: "#42A5F5", width: 3},
                marker: {color: "#42A5F5", size: 7},
                hovertemplate: "%{customdata[0]}<br>Орлого: %{customdata[1]}<extra></extra>"},
              {type: "scatter", mode: "lines+markers", name: "Зарлага",
                x: chartDebits.map((t) => t.timestamp.slice(0, 10)),
                y: chartDebits.map((t) => minuteOfDay(t.timestamp)),
                customdata: chartDebits.map((t) => [
                  formatDateTime(t.timestamp), formatMoney(t.amount),
                ]),
                line: {color: "#FF8A3D", width: 3},
                marker: {color: "#FF8A3D", size: 7},
                hovertemplate: "%{customdata[0]}<br>Зарлага: %{customdata[1]}<extra></extra>"},
            ]}
            layout={{
              xaxis: {type: "date", title: "Огноо", tickformat: "%Y-%m-%d"},
              yaxis: {
                title: "Цаг",
                range: [0, 1440],
                tickmode: "array",
                tickvals: [0, 180, 360, 540, 720, 900, 1080, 1260, 1440],
                ticktext: ["00:00", "03:00", "06:00", "09:00", "12:00",
                  "15:00", "18:00", "21:00", "24:00"],
              },
              hovermode: "closest",
            }}
            onClick={(e) => {
              const p = e.points?.[0];
              if (!p) return;
              const idx = p.pointIndex ?? p.pointNumber;
              const t = p.curveNumber === 0
                ? chartCredits[idx] : chartDebits[idx];
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
            {header: "Каллер", render: (r) => r.call.callerNumber},
            {header: "Каллед", render: (r) => r.call.calledNumber},
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
          pageSize={25}
          empty={`${corrMin} минутын дотор дуудлагын дараах гүйлгээ алга`}
          onRowClick={(r) => openDrill(r.txn)}
        />
      </Card>
      </>}

      {view === "analysis" && <AccountAnalysis />}

      {view === "removed" && <>
      <div className="metrics-grid">
        <StatCard label="Хасагдсан гүйлгээ" value={removedTxnList.length} />
        <StatCard label="Хасагдсан хос" value={removedPairs.length} />
        <StatCard label="Утгын дүрэм" value={descRules.length} />
      </div>

      <Card title="Юу нуугдсан бэ?" style={{marginBottom: 16}}
        actions={restoreCount > 0 ? (
          <button className="btn btn-danger"
            onClick={() => {
              if (!window.confirm("Бүх хасалтыг цуцалж, нуусан бүх гүйлгээг "
                + "буцааж харуулах уу?")) return;
              restorePairs(); clearDescRules(); restoreTxns();
            }}
            title="Бүх нуусан өгөгдлийг буцаах (баталгаажуулна)">
            ↩ Бүгдийг сэргээх ({restoreCount})
          </button>
        ) : undefined}>
        <div style={{fontSize: 12, color: "var(--text-secondary)"}}>
          Хассан бүх зүйл энд байна — юу ч бүрмөсөн устдаггүй. Мөр бүрийн
          ↩ товчоор нэг нэгээр нь буцаана. Хасагдсан өгөгдөл тооцоо, график,
          холбоосын зураглалд огт орохгүй.
        </div>
      </Card>

      <div style={ROW}>
        <Card title={`Гүйлгээний утгаар хасагдсан (${descRules.length})`}
          noPadding>
          <div className="scroll-container" style={{maxHeight: 300}}>
            <DataTable<DescRule & {i: number}>
              columns={[
                {header: "Нөхцөл", render: (r) => r.mode === "starts"
                  ? "Эхэлсэн" : r.mode === "ends" ? "Төгссөн" : "Агуулсан"},
                {header: "Утга", render: (r) => r.text},
                {header: "", align: "right" as const,
                  render: (r) => (
                    <button className="btn btn-sm"
                      onClick={() => removeDescRule(r.i)}
                      title="Энэ дүрмийг буцаах">↩ Сэргээх</button>
                  )},
              ]}
              rows={descRules.map((r, i) => ({...r, i}))}
              rowKey={(r) => `${r.mode}-${r.text}`}
              empty="Утгын дүрэм алга"
            />
          </div>
        </Card>
        <Card title={`Хасагдсан хосууд (${removedPairs.length})`} noPadding>
          <div className="scroll-container" style={{maxHeight: 300}}>
            <DataTable<(typeof removedPairs)[number]>
              columns={[
                {header: "Данс", render: (r) => r.account},
                {header: "Харьцсан данс", render: (r) => r.counterparty},
                {header: "Гүйлгээ", align: "right" as const,
                  render: (r) => r.txns},
                {header: "Нийт дүн", align: "right" as const,
                  render: (r) => formatMoney(r.total)},
                {header: "", align: "right" as const,
                  render: (r) => (
                    <button className="btn btn-sm"
                      onClick={() => toggleIgnoredPair(r.key)}
                      title="Энэ хосыг буцаах">↩ Сэргээх</button>
                  )},
              ]}
              rows={removedPairs}
              rowKey={(r) => r.key}
              empty="Хасагдсан хос алга"
            />
          </div>
        </Card>
      </div>

      <Card title={`Хасагдсан гүйлгээ (${removedTxnList.length})`}
        style={{marginBottom: 16}} noPadding>
        <div>
          <DataTable<BankTransaction>
            columns={[
              {header: "Огноо",
                sortValue: (t) => t.timestamp,
                render: (t) => formatDateTime(t.timestamp)},
              {header: "Данс эзэмшигч",
                render: (t) => partyCell(ourParty(t))},
              {header: "", align: "center" as const,
                render: (t) => flowArrow(t, true)},
              {header: "Харьцаа",
                render: (t) => partyCell(cpParty(t))},
              {header: "Дүн", align: "right" as const,
                sortValue: (t) => t.amount,
                render: (t) => formatMoney(t.amount)},
              {header: "Гүйлгээний утга",
                render: (t) => t.description ?? "—"},
              {header: "", align: "right" as const,
                render: (t) => (
                  <button className="btn btn-sm"
                    onClick={() => toggleIgnoredTxn(t.id)}
                    title="Энэ гүйлгээг буцаах">↩ Сэргээх</button>
                )},
            ]}
            rows={removedTxnList}
            rowKey={(t) => t.id}
            pageSize={25}
            empty="Хасагдсан гүйлгээ алга — бүх өгөгдөл харагдаж байна"
          />
        </div>
      </Card>
      </>}

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
                    Нотлох баримт болгохын тулд идэвхтэй хэрэг сонгоно уу.
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
            <div className="modal-body">
              {/* Noise removal below a threshold — ONE action ("Хасах"), two
                  ways: by single transaction (the amount floor) or by pair
                  total. Both strip noise from every count, chart AND the graph. */}
              <div className="form-label" style={{color: "var(--accent-cyan)"}}>
                🧹 Босго дүнгээс доош шум хасах
              </div>
              <ThresholdCleanup onRemove={removeNoise} />
              <div style={{fontSize: 11, color: "var(--text-muted)",
                marginBottom: 18}}>
                Дүн нь энэ босгоос доош ГАНЦ гүйлгээ бүрийг хасаж,
                &nbsp;&apos;Хасагдсаныг сэргээх&apos; хуудсанд тэмдэглэнэ.
              </div>

              {/* Description-pattern noise rules */}
              <div className="form-label">
                Гүйлгээний утгаар хасах (байгууллага гэх мэт)
              </div>
              <DescCleanup />
              <div style={{fontSize: 11, color: "var(--text-muted)"}}>
                Энэ утгатай бүх гүйлгээ хасагдана. Хассан бүхнээ
                “↩ Хасагдсаныг сэргээх” хуудаснаас буцаана.
              </div>
            </div>
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
