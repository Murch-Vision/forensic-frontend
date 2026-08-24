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
import {useEffect, useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACCOUNT_ANALYSES_QUERY, CASE_CONCLUSIONS_QUERY, SAVE_CASE_CONCLUSION,
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

const RATING_COLOR: Record<string, string> = {
  "Их давтамж, их дүн": "var(--accent-red)",
  "Их давтамж": "var(--accent-amber)",
  "Их дүн": "var(--accent-amber)",
};

const COUNTERPARTY_LIMITS = [10, 30, 50, 100].map((value) => ({
  value,
  label: `Top ${value}`,
}));

const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан",
  "Бямба"];

function busiest(buckets: Bucket[]): Bucket | null {
  return buckets.reduce<Bucket | null>((best, bucket) =>
    bucket.count > (best?.count ?? 0) ? bucket : best, null);
}

function share(count: number, total: number): string {
  return total > 0 ? `${Math.round(count / total * 100)}%` : "0%";
}

function predictedMoment(a: Analysis, hour: Bucket | null,
  weekday: Bucket | null): string | null {
  if (!a.lastTxn || !hour || !weekday) return null;
  const base = new Date(`${a.lastTxn.slice(0, 10)}T${a.lastTxn.slice(11, 19)}Z`);
  const weekdayIndex = WEEKDAYS.indexOf(weekday.label);
  const hourNumber = Number(hour.key);
  if (Number.isNaN(base.getTime()) || weekdayIndex < 0
    || !Number.isFinite(hourNumber)) return null;
  const candidate = new Date(base);
  candidate.setUTCDate(candidate.getUTCDate()
    + (weekdayIndex - candidate.getUTCDay() + 7) % 7);
  candidate.setUTCHours(hourNumber, 0, 0, 0);
  if (candidate <= base) candidate.setUTCDate(candidate.getUTCDate() + 7);
  return `${candidate.getUTCFullYear()} оны ${candidate.getUTCMonth() + 1} сарын `
    + `${candidate.getUTCDate()}-ны ${WEEKDAYS[candidate.getUTCDay()]} гараг, `
    + `${String(hourNumber).padStart(2, "0")}:00–`
    + `${String(hourNumber).padStart(2, "0")}:59`;
}

function generateConclusion(a: Analysis): string {
  const hour = a.hasTimeOfDay ? busiest(a.byHour) : null;
  const weekday = busiest(a.byWeekday);
  const month = busiest(a.byMonth);
  const lines: string[] = [];

  if (hour) {
    lines.push(`ЦАГИЙН ИДЭВХЖИЛ\n• ${hour.label} цагт хамгийн олон буюу `
      + `${formatNum(hour.count)} гүйлгээ хийгдсэн. Энэ нь нийт гүйлгээний `
      + `${share(hour.count, a.txnCount)} байна.`);
  } else {
    lines.push("ЦАГИЙН ИДЭВХЖИЛ\n• Хуулганд цагийн мэдээлэл байхгүй тул цагийн "
      + "давтамж болон дараагийн идэвхтэй цагийг тооцоолох боломжгүй.");
  }
  if (weekday) {
    lines.push(`ӨДРИЙН ИДЭВХЖИЛ\n• ${weekday.label} гарагт хамгийн идэвхтэй, `
      + `${formatNum(weekday.count)} гүйлгээтэй буюу нийт гүйлгээний `
      + `${share(weekday.count, a.txnCount)} байна.`);
  }
  if (month) {
    const months = a.byMonth.filter((b) => b.count > 0);
    const recent = months.slice(-3);
    const previous = months.slice(-6, -3);
    const recentAvg = recent.reduce((sum, b) => sum + b.count, 0)
      / Math.max(recent.length, 1);
    const previousAvg = previous.reduce((sum, b) => sum + b.count, 0)
      / Math.max(previous.length, 1);
    const direction = previous.length === 0 ? "тогтвортой эсэхийг дүгнэхэд "
      + "өмнөх сарын мэдээлэл хүрэлцэхгүй"
      : recentAvg > previousAvg * 1.1 ? "сүүлийн саруудад өсөх хандлагатай"
      : recentAvg < previousAvg * 0.9 ? "сүүлийн саруудад буурах хандлагатай"
      : "сүүлийн саруудад ерөнхийдөө тогтвортой";
    lines.push(`САРЫН ИДЭВХЖИЛ\n• ${month.label} сард хамгийн олон буюу `
      + `${formatNum(month.count)} гүйлгээ бүртгэгдсэн.\n• Идэвхжил `
      + `${direction}.\n• Сүүлийн ${recent.length} сарын дунджаар дараагийн `
      + `сард ойролцоогоор `
      + `${formatNum(Math.round(recentAvg))} гүйлгээ гарах төлөвтэй.`);
  }
  const next = predictedMoment(a, hour, weekday);
  if (next) {
    lines.push(`ДАРААГИЙН ИДЭВХТЭЙ ХУГАЦААНЫ ТААМАГ\n• Өмнөх давтамж ижил `
      + `хэвээр үргэлжилбэл ${next}-д гүйлгээ идэвхжих магадлал хамгийн өндөр.`);
  }
  lines.push("АНХААРАХ НЬ\n• Энэ нь өнгөрсөн гүйлгээний давтамжид үндэслэсэн "
    + "статистик таамаг бөгөөд бодит гүйлгээ заавал гарахыг батлахгүй.");
  return lines.join("\n\n");
}

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
        <BarChart color="#087EA4"
          data={buckets.map((b) => ({label: b.label, value: b.count}))} />
        <div className="analysis-activity-table"
          style={{maxHeight: 260, overflowY: "auto"}}>
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
// The owner leads, the number follows: the analyst knows these accounts by
// whose they are, and a line that opens with seventeen digits says nothing
// until it is read to the end. "-" is the bank's empty value, not a name.
function acctOption(x: Analysis): string {
  const owner = (x.ownerName ?? "").trim();
  const who = owner && !/^-+$/.test(owner) ? owner : null;
  return `${who ? `${who} · ` : ""}${x.accountNumber}`
    + ` — ${formatNum(x.txnCount)} гүйлгээ`;
}

function ConclusionBox({title, accountId, stored, generated = "", onSaved}: {
  title: string;
  accountId: number | null;
  stored: string;
  generated?: string;
  onSaved: () => void;
}) {
  const [saveMut] = useMutation(SAVE_CASE_CONCLUSION);
  const [text, setText] = useState(stored || generated);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  // Selecting another account or receiving its saved text replaces the draft.
  // Ordinary typing does not retrigger this effect.
  useEffect(() => {
    setText(stored || generated);
    setDone(false);
    setErr("");
  }, [accountId, stored, generated]);

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
      <div className="analysis-conclusion-editor">
        <textarea className="form-input analysis-conclusion-text" rows={18}
          value={text}
          onChange={(e) => {setText(e.target.value); setDone(false);}}
          placeholder="Дүн шинжилгээгээр илэрсэн нөхцөл байдлыг бичнэ үү" />
      </div>
      <div className="analysis-conclusion-actions">
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Хадгалж байна…" : "Хадгалах"}
        </button>
        {generated && (
          <button className="btn btn-sm" type="button"
            onClick={() => {setText(generated); setDone(false);}}>
            Автоматаар шинэчлэх
          </button>
        )}
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
  const [topLimit, setTopLimit] = useState(30);
  const {data, loading} = useQuery<{accountAnalyses: Analysis[]}>(
    ACCOUNT_ANALYSES_QUERY, {variables: {topLimit}});
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
  // Нэр дээрээ, данс доороо — one cell, the way the dashboard reads. Two
  // columns for one party made the eye jump back and forth to pair them.
  const cpCols: Column<Rated>[] = [
    {header: "Харилцагч", sortValue: (r) => r.name, render: (r) => (
      <div style={{lineHeight: 1.3, minWidth: 0}}>
        <div style={{color: r.mutual
          ? "var(--accent-amber)" : "var(--text-primary)"}}>{r.name}</div>
        {r.account && (
          <div style={{fontSize: 11, color: "var(--text-muted)",
            fontFamily: "var(--font-mono)"}}>{r.account}</div>
        )}
      </div>
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

  return (
    <>
      <Card title="Дансны дүн шинжилгээ" style={{marginBottom: 16}}
        actions={
          <Select value={a.accountId} onChange={(v) => setAcctId(Number(v))}
            style={{width: 420, maxWidth: "100%"}} searchable
            options={list.map((x) => ({value: x.accountId,
              label: acctOption(x)}))} />
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
          <Select value={topLimit} onChange={(v) => setTopLimit(Number(v))}
            options={COUNTERPARTY_LIMITS} style={{width: 110}} />
        }>
        <div className="top-counterparties-table">
          <DataTable columns={cpCols} rows={a.topCounterparties}
            rowKey={(r) => r.key} empty="Харилцагч алга"
            defaultSort={{col: 2, dir: "desc"}} />
        </div>
      </Card>

      <ConclusionBox title={`Дүгнэлт — данс ${a.accountNumber}`}
        accountId={a.accountId} stored={conclusionFor(a.accountId)}
        generated={generateConclusion(a)}
        onSaved={() => void conclusionsQ.refetch()} />
    </>
  );
}
