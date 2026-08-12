/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AccountAnalysis.tsx
 * Created at  : 2026-08-13
 * Author      : jeefo
 * Purpose     : Дансны дүн шинжилгээ — one imported statement account at a time:
 *               its figures, when it is active, who it deals with, and money
 *               moving straight to another account in the case.
 * Description : Every number comes from the server's accountAnalyses query, the
 *               same rows the transaction list shows. The activity groupings are
 *               chart + list side by side because a bar tells you the shape and
 *               only the list tells you the amount.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACCOUNT_ANALYSES_QUERY, CASE_CONCLUSIONS_QUERY, DIRECT_TRANSFERS_QUERY,
  SAVE_CASE_CONCLUSION,
} from "../graphql/queries";
import {BarChart, Card, DataTable, Empty, Loading, StatCard} from "./kit";
import type {Column} from "./kit";
import {Select} from "./inputs";
import {formatMoney, formatNum} from "../lib/format";

interface Bucket {
  key: string; label: string; count: number;
  creditCount: number; debitCount: number;
  creditTotal: number; debitTotal: number;
}

interface Rated {
  key: string; name: string; account: string | null;
  txnCount: number; creditTotal: number; debitTotal: number; netTotal: number;
  mutual: boolean; subjectMatch: boolean; rating: string | null;
}

interface Analysis {
  accountId: number; label: string; accountNumber: string;
  ownerName: string | null;
  txnCount: number; counterpartyCount: number;
  creditCount: number; debitCount: number;
  creditTotal: number; debitTotal: number; netTotal: number;
  hasTimeOfDay: boolean; nightCount: number; nightTotal: number;
  firstTxn: string | null; lastTxn: string | null;
  byHour: Bucket[]; byWeekday: Bucket[]; byMonth: Bucket[];
  peakHour: string | null; peakWeekday: string | null; peakMonth: string | null;
  topCounterparties: Rated[];
}

interface Transfer {
  fromAccountId: number; toAccountId: number;
  fromLabel: string; toLabel: string;
  txnCount: number; total: number; byMonth: Bucket[];
}

const RATING_COLOR: Record<string, string> = {
  "Их давтамж, их дүн": "var(--accent-red)",
  "Их давтамж": "var(--accent-amber)",
  "Их дүн": "var(--accent-amber)",
};

// Chart on the left, the same buckets as numbers on the right. The deck asked
// for "хажуудаа дэлгэрэнгүй жагсаалттай" — a bar shape alone can't be quoted in
// a report.
function ActivityBlock({title, buckets}: {title: string; buckets: Bucket[]}) {
  const shown = buckets.filter((b) => b.count > 0);
  if (shown.length === 0) return null;
  const cols: Column<Bucket>[] = [
    {header: "", render: (b) => b.label, sortValue: (b) => b.key},
    {header: "Гүйлгээ", align: "right", sortValue: (b) => b.count,
      render: (b) => formatNum(b.count)},
    {header: "Орлого", align: "right", sortValue: (b) => b.creditTotal,
      render: (b) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(b.creditTotal)}
        </span>
      )},
    {header: "Зарлага", align: "right", sortValue: (b) => b.debitTotal,
      render: (b) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(b.debitTotal)}
        </span>
      )},
  ];
  return (
    <Card title={title} style={{marginBottom: 16}}>
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
        alignItems: "start"}}>
        <BarChart color="#B388FF"
          data={buckets.map((b) => ({label: b.label, value: b.count}))} />
        <div style={{maxHeight: 260, overflowY: "auto"}}>
          <DataTable columns={cols} rows={shown} rowKey={(b) => b.key}
            empty="—" />
        </div>
      </div>
    </Card>
  );
}

interface Conclusion {
  id: number; bankAccountId: number | null; text: string; updatedAt: string;
}

// Дүгнэлт — typed by the examiner, never generated. The report places whatever
// is stored here; an empty box means the report says so plainly.
function ConclusionBox({title, accountId, stored, onSaved}: {
  title: string;
  accountId: number | null;
  stored: string;
  onSaved: () => void;
}) {
  const [saveMut] = useMutation(SAVE_CASE_CONCLUSION);
  const [text, setText] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  // Selecting another account means this box now edits THAT account's
  // conclusion, so the draft is replaced rather than carried across.
  const [editing, setEditing] = useState(accountId);
  if (editing !== accountId) {
    setEditing(accountId);
    setText(stored);
    setDone(false);
    setErr("");
  }

  async function save() {
    setBusy(true); setErr(""); setDone(false);
    try {
      await saveMut({variables: {bankAccountId: accountId, text}});
      setDone(true);
      onSaved();
    } catch (e) {
      setErr(String(e).replace(/^(Error|ApolloError):\s*/, ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={title} style={{marginBottom: 16}}>
      <textarea className="form-input" rows={5}
        style={{width: "100%", resize: "vertical"}}
        value={text} onChange={(e) => {setText(e.target.value); setDone(false);}}
        placeholder="Дүн шинжилгээгээр илэрсэн нөхцөл байдлыг бичнэ үү" />
      <div style={{display: "flex", gap: 10, alignItems: "center",
        marginTop: 10}}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Хадгалж байна…" : "Хадгалах"}
        </button>
        {done && (
          <span style={{color: "var(--accent-green)", fontSize: 12}}>
            Хадгалагдлаа
          </span>
        )}
        {err && (
          <span style={{color: "var(--accent-red)", fontSize: 12}}>{err}</span>
        )}
      </div>
    </Card>
  );
}

export default function AccountAnalysis() {
  const {data, loading} = useQuery<{accountAnalyses: Analysis[]}>(
    ACCOUNT_ANALYSES_QUERY);
  const transfersQ = useQuery<{directTransfers: Transfer[]}>(
    DIRECT_TRANSFERS_QUERY);
  const [acctId, setAcctId] = useState<number | null>(null);
  const conclusionsQ = useQuery<{caseConclusions: Conclusion[]}>(
    CASE_CONCLUSIONS_QUERY);
  const conclusionFor = (id: number | null): string =>
    (conclusionsQ.data?.caseConclusions ?? [])
      .find((c) => c.bankAccountId === id)?.text ?? "";

  if (loading) return <Loading />;
  const list = data?.accountAnalyses ?? [];
  if (list.length === 0) {
    return <Empty message="Хуулга оруулсан данс алга." />;
  }

  // Busiest account by default — the one the analyst almost always wants.
  const a = list.find((x) => x.accountId === acctId) ?? list[0];
  const transfers = (transfersQ.data?.directTransfers ?? []).filter((t) =>
    t.fromAccountId === a.accountId || t.toAccountId === a.accountId);

  const cpCols: Column<Rated>[] = [
    {header: "Харилцагч", sortValue: (r) => r.name, render: (r) => (
      <span style={{color: r.subjectMatch ? "var(--accent-red)"
        : r.mutual ? "var(--accent-amber)" : "var(--text-primary)"}}>
        {r.name}
      </span>
    )},
    {header: "Харьцсан данс", render: (r) => (
      <span style={{fontFamily: "var(--font-mono)", fontSize: 11}}>
        {r.account ?? "—"}
      </span>
    )},
    {header: "Гүйлгээ", align: "right", sortValue: (r) => r.txnCount,
      render: (r) => formatNum(r.txnCount)},
    {header: "Орлого", align: "right", sortValue: (r) => r.creditTotal,
      render: (r) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(r.creditTotal)}
        </span>
      )},
    {header: "Зарлага", align: "right", sortValue: (r) => r.debitTotal,
      render: (r) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(r.debitTotal)}
        </span>
      )},
    {header: "Нийт хөдөлгөөн", align: "right",
      sortValue: (r) => r.creditTotal + r.debitTotal,
      render: (r) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(r.creditTotal + r.debitTotal)}
        </span>
      )},
    {header: "Үнэлгээ", render: (r) => (
      <span style={{color: RATING_COLOR[r.rating ?? ""]
        ?? "var(--text-secondary)"}}>{r.rating ?? "—"}</span>
    )},
  ];

  const transferCols: Column<Transfer>[] = [
    {header: "Хаанаас", render: (t) => t.fromLabel},
    {header: "Хаана", render: (t) => t.toLabel},
    {header: "Гүйлгээ", align: "right", sortValue: (t) => t.txnCount,
      render: (t) => formatNum(t.txnCount)},
    {header: "Дүн", align: "right", sortValue: (t) => t.total,
      render: (t) => (
        <span style={{fontFamily: "var(--font-mono)"}}>
          {formatMoney(t.total)}
        </span>
      )},
    {header: "Сар", align: "right", render: (t) => formatNum(t.byMonth.length)},
  ];

  return (
    <>
      <Card title="Дансны дүн шинжилгээ" style={{marginBottom: 16}}
        actions={
          <Select value={a.accountId} onChange={(v) => setAcctId(Number(v))}
            style={{width: 380}} searchable
            options={list.map((x) => ({value: x.accountId,
              label: `${x.label} — ${formatNum(x.txnCount)} гүйлгээ`}))} />
        }>
        <div className="metrics-grid">
          <StatCard label="Нийт гүйлгээ" value={formatNum(a.txnCount)} />
          <StatCard label="Харилцагч" value={formatNum(a.counterpartyCount)} />
          <StatCard label="Орлого" value={formatMoney(a.creditTotal)}
            color="green" />
          <StatCard label="Зарлага" value={formatMoney(a.debitTotal)}
            color="red" />
          <StatCard label="Зөрүү" value={formatMoney(a.netTotal)}
            color={a.netTotal < 0 ? "red" : "green"} />
          {/* Шөнийн гүйлгээ only exists if the statement carried a clock. */}
          {a.hasTimeOfDay && (
            <StatCard label="Шөнийн гүйлгээ" value={formatNum(a.nightCount)}
              color="amber" />
          )}
        </div>
        {!a.hasTimeOfDay && (
          <div style={{marginTop: 12, fontSize: 12,
            color: "var(--accent-amber)"}}>
            Хуулганд гүйлгээний цаг байхгүй — цагийн шинжилгээ, шөнийн
            гүйлгээг гаргах боломжгүй. Хуулгыг «Цаг» баганатай дахин
            оруулбал гарна.
          </div>
        )}
      </Card>

      {a.hasTimeOfDay && (
        <ActivityBlock title="Цагийн идэвхжил" buckets={a.byHour} />
      )}
      <ActivityBlock title="Өдрийн идэвхжил" buckets={a.byWeekday} />
      <ActivityBlock title="Сарын идэвхжил" buckets={a.byMonth} />

      <Card style={{marginBottom: 16}} noPadding
        title={`Их давтамжтай харилцагчид (${a.topCounterparties.length})`}
        actions={
          <span style={{display: "inline-flex", gap: 12, fontSize: 11}}>
            <span style={{color: "var(--accent-red)"}}>Регистр таарсан</span>
            <span style={{color: "var(--accent-amber)"}}>Дундын</span>
          </span>
        }>
        <DataTable columns={cpCols} rows={a.topCounterparties}
          rowKey={(r) => r.key} empty="Харилцагч алга"
          defaultSort={{col: 2, dir: "desc"}} />
      </Card>

      <ConclusionBox title={`Дүгнэлт — данс ${a.accountNumber}`}
        accountId={a.accountId} stored={conclusionFor(a.accountId)}
        onSaved={() => void conclusionsQ.refetch()} />

      {transfers.length > 0 && (
        <Card noPadding style={{marginBottom: 16}}
          title={`Хоорондоо харилцсан шууд гүйлгээ (${transfers.length})`}>
          <DataTable columns={transferCols} rows={transfers}
            rowKey={(t) => `${t.fromAccountId}-${t.toAccountId}`}
            empty="Шууд гүйлгээ алга" />
        </Card>
      )}
      <ConclusionBox title="Холбоосын дүгнэлт" accountId={null}
        stored={conclusionFor(null)}
        onSaved={() => void conclusionsQ.refetch()} />
    </>
  );
}
