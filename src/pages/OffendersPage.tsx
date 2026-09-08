/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : OffendersPage.tsx
 * Created at  : 2026-09-08
 * Author      : jeefo
 * Purpose     : Хэрэгтний бүртгэл — урьдчилан мэдэгдэж буй хүмүүсийн регистр.
 * Description : Excel-ээс шууд уншина. ⛔ Багана сонгох алхам БАЙХГҮЙ: багана
 *               бүр нь жагсаалт, нүд бүр нь регистр гэж үзнэ.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useRef, useState} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {
  CLEAR_KNOWN_OFFENDERS,
  DELETE_KNOWN_OFFENDER,
  IMPORT_KNOWN_OFFENDERS,
  KNOWN_OFFENDERS_QUERY,
  UPLOAD_APPEND,
  UPLOAD_START,
} from "../graphql/queries";
import {Card, DataTable, Loading, PageHeader, StatCard} from "../components/kit";
import {formatDate, formatNum} from "../lib/format";
import {useAuth} from "../lib/auth";

const UPLOAD_THRESHOLD = 700 * 1024;
const UPLOAD_CHUNK = 400 * 1024;
const PAGE = 100;

interface Offender {
  id: number;
  nationalId: string;
  labels: string[];
  sourceFile: string | null;
  updatedAt: string;
}

interface Summary {
  readCells: number; validCells: number; invalidCells: number;
  uniquePeople: number; added: number; updated: number; total: number;
  labels: {label: string; count: number}[];
  invalidSample: string[];
}

interface PageData {
  knownOffenders: {total: number; rows: Offender[]};
  knownOffenderLabels: {label: string; count: number}[];
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export default function OffendersPage() {
  const {isAdmin} = useAuth();
  const client = useApolloClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [label, setLabel] = useState("");
  const [skip, setSkip] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);

  const {data, loading, refetch} = useQuery<PageData>(KNOWN_OFFENDERS_QUERY, {
    variables: {search: search || null, label: label || null,
      take: PAGE, skip},
    fetchPolicy: "cache-and-network",
  });
  const [runImport] = useMutation<{importKnownOffenders: Summary}>(
    IMPORT_KNOWN_OFFENDERS);
  const [removeOne] = useMutation(DELETE_KNOWN_OFFENDER);
  const [clearAll] = useMutation(CLEAR_KNOWN_OFFENDERS);

  async function handleFile(file: File) {
    setBusy(true); setError(""); setSummary(null);
    try {
      const b64 = arrayBufferToBase64(await file.arrayBuffer());
      // Прокси нэг хүсэлтэд ~1MB л оруулдаг тул томыг нь хэсэгчлэн илгээнэ.
      let uploadId: string | null = null;
      if (b64.length > UPLOAD_THRESHOLD) {
        const started = await client.mutate<{uploadStart: string}>({
          mutation: UPLOAD_START,
        });
        uploadId = started.data?.uploadStart ?? null;
        if (!uploadId) throw new Error("Файл байршуулж эхэлсэнгүй.");
        for (let i = 0; i < b64.length; i += UPLOAD_CHUNK) {
          await client.mutate({
            mutation: UPLOAD_APPEND,
            variables: {uploadId, chunk: b64.slice(i, i + UPLOAD_CHUNK)},
          });
        }
      }
      const res = await runImport({variables: {
        content: uploadId ? "" : b64, filename: file.name, uploadId,
      }});
      if (res.data) setSummary(res.data.importKnownOffenders);
      setSkip(0);
      await refetch();
      // Улаан тэмдэглэгээ бүх хуудсанд шинэчлэгдэх ёстой.
      await client.refetchQueries({include: "active"});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onDelete(row: Offender) {
    if (!window.confirm(`${row.nationalId} бүртгэлээс хасах уу?`)) return;
    await removeOne({variables: {id: row.id}});
    await refetch();
    await client.refetchQueries({include: "active"});
  }

  async function onClear() {
    if (!window.confirm(
      "Хэрэгтний бүртгэлийг БҮХЭЛД нь устгах уу? Дахин оруулж болно.")) return;
    setBusy(true);
    try {
      await clearAll();
      setSummary(null);
      setSkip(0);
      await refetch();
      await client.refetchQueries({include: "active"});
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.knownOffenders.rows ?? [];
  const total = data?.knownOffenders.total ?? 0;
  const labels = data?.knownOffenderLabels ?? [];
  const registered = labels.reduce((max, l) => Math.max(max, l.count), 0);

  const actions = isAdmin ? (
    <>
      <input ref={fileInput} type="file" accept=".xlsx,.xls,.xlsm"
        style={{display: "none"}}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }} />
      <button className="btn btn-accent" disabled={busy}
        onClick={() => fileInput.current?.click()}>
        {busy ? "УНШИЖ БАЙНА..." : "EXCEL ОРУУЛАХ"}
      </button>
      {total > 0 && (
        <button className="btn" disabled={busy} onClick={() => void onClear()}>
          БҮГДИЙГ УСТГАХ
        </button>
      )}
    </>
  ) : null;

  return (
    <div className="page-container">
      <PageHeader icon="&#x1F6A8;" title="Хэрэгтний бүртгэл"
        subtitle="РЕГИСТРЭЭР ТАНИХ ЖАГСААЛТ" actions={actions} />

      {error && (
        <Card style={{marginBottom: 16}}>
          <div style={{color: "var(--accent-red)"}}>{error}</div>
        </Card>
      )}

      {summary && (
        <Card title="Импортын үр дүн" style={{marginBottom: 16}}>
          <div className="metrics-grid">
            <StatCard label="Файлын регистр"
              value={formatNum(summary.uniquePeople)} />
            <StatCard label="Шинээр нэмэгдсэн"
              value={formatNum(summary.added)} color="green" />
            <StatCard label="Жагсаалт нэмэгдсэн"
              value={formatNum(summary.updated)} />
            <StatCard label="Таниагүй нүд"
              value={formatNum(summary.invalidCells)}
              color={summary.invalidCells ? "amber" : undefined} />
          </div>
          {summary.invalidSample.length > 0 && (
            <div style={{marginTop: 12, fontSize: 12,
              color: "var(--text-secondary)"}}>
              Регистрийн хэлбэрт нийцээгүй жишээ:{" "}
              <span style={{fontFamily: "var(--font-mono)"}}>
                {summary.invalidSample.join(" · ")}
              </span>
            </div>
          )}
        </Card>
      )}

      <div className="metrics-grid" style={{marginBottom: 16}}>
        <StatCard label="Бүртгэлд байгаа хүн" value={formatNum(total)}
          color="red" />
        <StatCard label="Жагсаалт" value={formatNum(labels.length)} />
        <StatCard label="Хамгийн том жагсаалт" value={formatNum(registered)} />
      </div>

      <Card title="Жагсаалтууд" style={{marginBottom: 16}}>
        <div style={{display: "flex", flexWrap: "wrap", gap: 8}}>
          <button className={`btn btn-sm${label ? "" : " btn-primary"}`}
            onClick={() => {setLabel(""); setSkip(0);}}>
            Бүгд
          </button>
          {labels.map((l) => (
            <button key={l.label}
              className={`btn btn-sm${label === l.label ? " btn-primary" : ""}`}
              onClick={() => {setLabel(l.label); setSkip(0);}}>
              {l.label} · {formatNum(l.count)}
            </button>
          ))}
        </div>
      </Card>

      <Card title={`Регистр (${formatNum(total)})`} noPadding
        actions={
          <input className="form-input" value={search} style={{width: 220}}
            placeholder="Регистрээр хайх"
            onChange={(e) => {setSearch(e.target.value); setSkip(0);}} />
        }>
        {loading && !data ? <Loading /> : (
          <>
            <DataTable rows={rows} rowKey={(r) => r.id}
              empty="Бүртгэл хоосон — Excel оруулна уу"
              columns={[
                {header: "Регистр", render: (r: Offender) => (
                  <span style={{fontFamily: "var(--font-mono)",
                    color: "var(--accent-red)"}}>{r.nationalId}</span>
                )},
                {header: "Жагсаалт", render: (r: Offender) => (
                  <div style={{display: "flex", flexWrap: "wrap", gap: 6}}>
                    {r.labels.map((l) => (
                      <span key={l} className="badge unknown">{l}</span>
                    ))}
                  </div>
                )},
                {header: "Файл", render: (r: Offender) => r.sourceFile ?? "—"},
                {header: "Огноо",
                  render: (r: Offender) => formatDate(r.updatedAt)},
                ...(isAdmin ? [{
                  header: "", align: "right" as const,
                  render: (r: Offender) => (
                    <button className="btn btn-sm"
                      onClick={() => void onDelete(r)}>ХАСАХ</button>
                  ),
                }] : []),
              ]} />
            {total > PAGE && (
              <div style={{display: "flex", justifyContent: "flex-end",
                alignItems: "center", gap: 12, padding: "10px 16px",
                fontSize: 12, color: "var(--text-secondary)"}}>
                <span>
                  {formatNum(skip + 1)}–{formatNum(Math.min(skip + PAGE, total))}
                  {" / "}{formatNum(total)}
                </span>
                <button className="btn btn-sm" disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - PAGE))}>
                  Өмнөх
                </button>
                <button className="btn btn-sm" disabled={skip + PAGE >= total}
                  onClick={() => setSkip(skip + PAGE)}>
                  Дараах
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
