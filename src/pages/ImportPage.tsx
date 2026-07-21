/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ImportPage.tsx
 * Created at  : 2026-06-24
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useRef, useState} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {
  EXCEL_SHEETS,
  IMPORT_DATA,
  IMPORT_SUSPECTS,
  PREVIEW_IMPORT,
  UPLOAD_APPEND,
  UPLOAD_START,
} from "../graphql/queries";
import {Badge, Card, Empty, PageHeader} from "../components/kit";
import {Select} from "../components/inputs";
import CaseGate from "../components/CaseGate";

type ImportKind = "BANK" | "CDR";

interface Preview {
  headers: string[];
  sampleRows: (string | null)[][];
  totalRows: number;
  detectedProfile: string | null;
  domain: string | null;
  confidence: string;
  mapping: {field: string; column: string}[];
}

// Editable bank column mapping — mirrors the C# ImportView mapping card.
const BANK_FIELDS: {key: string; label: string}[] = [
  {key: "date", label: "Огноо *"},
  {key: "account", label: "Өөрийн данс"},
  {key: "ownerName", label: "Данс эзэмшигчийн нэр"},
  {key: "nationalId", label: "Регистрийн дугаар"},
  {key: "amount", label: "Дүн (нэг багана)"},
  {key: "credit", label: "Орлого"},
  {key: "debit", label: "Зарлага"},
  {key: "currency", label: "Валют (хоосон бол MNT)"},
  {key: "description", label: "Тайлбар"},
  {key: "reference", label: "Гүйлгээний дугаар"},
  {key: "counterpartyName", label: "Харьцсан харилцагчийн нэр"},
  {key: "counterpartyAccount", label: "Харьцсан данс"},
  {key: "counterpartyNationalId", label: "Харьцсан регистрийн дугаар"},
  {key: "balance", label: "Гүйлгээний дараах үлдэгдэл"},
  {key: "balanceBefore", label: "Гүйлгээний өмнөх үлдэгдэл"},
];

// Editable CDR (call record) column mapping. The subject (selected separately)
// is the caller, so the only required column is the contact number; everything
// else is optional and filled in from the subject / import date when absent.
const CDR_FIELDS: {key: string; label: string}[] = [
  {key: "called", label: "Дугаар (харьцсан) *"},
  {key: "name", label: "Нэр (хүнтэй тааруулах)"},
  {key: "frequency", label: "Давтамж"},
  {key: "caller", label: "Дуудсан дугаар (хоосон бол сэжигтэн)"},
  {key: "datetime", label: "Огноо / цаг"},
  {key: "duration", label: "Үргэлжлэх хугацаа"},
];

interface Summary {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
  messages: string[];
  detectedProfile: string | null;
  domain: string | null;
}

const KINDS: {value: ImportKind; label: string}[] = [
  {value: "BANK", label: "Банкны хуулга"},
  {value: "CDR", label: "Дуудлагын бүртгэл (CDR)"},
];

// The preview proxy rejects a request body over ~1 MB, so anything larger than
// the threshold is streamed to the server in sub-MB chunks and referenced by
// uploadId instead of riding inline in the query. Chunk stays well under the
// cap to leave room for JSON/query escaping overhead.
const UPLOAD_THRESHOLD = 700 * 1024;
const UPLOAD_CHUNK = 400 * 1024;

function isExcelName(name: string): boolean {
  const n = name.toLowerCase();
  return n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".xlsm");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ImportPage() {
  const client = useApolloClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [kind, setKind] = useState<ImportKind>("BANK");
  const [subjectId, setSubjectId] = useState(0);
  const [subjectNumber, setSubjectNumber] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const suspectsQ = useQuery<{suspects: {id: number; fullName: string;
    phoneNumbers: {number: string}[]}[]}>(IMPORT_SUSPECTS);
  const suspects = suspectsQ.data?.suspects ?? [];
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [runImport, importQ] = useMutation<{importData: Summary}>(IMPORT_DATA);

  const summary = importQ.data?.importData;
  const isExcel = !!filename && isExcelName(filename);

  // Stream large content to the server in chunks and return its uploadId;
  // small content stays inline (returns null). Keeps every request under the
  // proxy's ~1 MB body cap.
  async function ensureUploaded(text: string): Promise<string | null> {
    if (text.length <= UPLOAD_THRESHOLD) return null;
    const started = await client.mutate<{uploadStart: string}>({
      mutation: UPLOAD_START,
    });
    const id = started.data?.uploadStart;
    if (!id) throw new Error("Серверт файл байршуулж эхэлсэнгүй.");
    const total = Math.ceil(text.length / UPLOAD_CHUNK);
    setUploadPct(0);
    for (let i = 0, n = 0; i < text.length; i += UPLOAD_CHUNK, n++) {
      await client.mutate({
        mutation: UPLOAD_APPEND,
        variables: {uploadId: id, chunk: text.slice(i, i + UPLOAD_CHUNK)},
      });
      setUploadPct(Math.round(((n + 1) / total) * 100));
    }
    setUploadPct(null);
    return id;
  }

  async function handleFile(file: File) {
    setPreview(null);
    setSheets([]);
    setSheetName(null);
    setUploadId(null);
    setError(null);
    setFileSize(file.size);
    // CDR files are commonly named after the subject's own number
    // (e.g. 90154554.xlsx) — prefill it so the analyst rarely retypes.
    const digitsFromName = file.name.replace(/\.[^.]+$/, "").replace(/\D/g, "");
    if (digitsFromName.length >= 6) setSubjectNumber(digitsFromName);
    setBusy(true);
    try {
      if (isExcelName(file.name)) {
        const buf = await file.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        setContent(b64);
        setFilename(file.name);
        const upId = await ensureUploaded(b64);
        setUploadId(upId);
        const res = await client.query<{excelSheets: string[]}>({
          query: EXCEL_SHEETS,
          variables: {content: upId ? "" : b64, filename: file.name,
            uploadId: upId},
          fetchPolicy: "no-cache",
        });
        const sh = res.data.excelSheets;
        setSheets(sh);
        setSheetName(sh[0] ?? null);
        await doPreview(b64, file.name, sh[0] ?? null, upId);
      } else {
        const text = await file.text();
        setContent(text);
        setFilename(file.name);
        const upId = await ensureUploaded(text);
        setUploadId(upId);
        await doPreview(text, file.name, null, upId);
      }
    } catch (e) {
      setUploadPct(null);
      setError(e instanceof Error ? e.message
        : "Файл боловсруулахад алдаа гарлаа.");
    } finally {
      setBusy(false);
    }
  }

  function clearFile() {
    setContent("");
    setFilename(null);
    setFileSize(0);
    setSheets([]);
    setSheetName(null);
    setPreview(null);
    setUploadId(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  // Preview runs AUTOMATICALLY when a file (or Excel sheet) is picked.
  async function doPreview(
    contentArg: string,
    filenameArg: string | null,
    sheetArg: string | null,
    uploadArg: string | null
  ) {
    if (!contentArg && !uploadArg) return;
    setBusy(true);
    try {
      const res = await client.query<{previewImport: Preview}>({
        query: PREVIEW_IMPORT,
        variables: {content: uploadArg ? "" : contentArg,
          filename: filenameArg, sheetName: sheetArg, uploadId: uploadArg},
        fetchPolicy: "no-cache",
      });
      const pv = res.data.previewImport;
      setPreview(pv);
      // Follow the detected domain so the analyst rarely touches the select.
      if (pv.domain === "BANK" || pv.domain === "CDR") {
        setKind(pv.domain);
      }
      // Seed the editable mapping from what the detector proposed.
      const seed: Record<string, string> = {};
      for (const m of pv.mapping) seed[m.field] = m.column;
      setMapping(seed);
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!content) return;
    setError(null);
    const mappingArg = Object.entries(mapping)
      .filter(([, col]) => col && col.trim())
      .map(([field, column]) => ({field, column}));
    const large = content.length > UPLOAD_THRESHOLD;
    const runWith = (upId: string | null) => runImport({
      variables: {
        // Large content NEVER travels inline — the proxy caps bodies at ~1 MB.
        content: upId ? "" : content,
        filename, sheetName, uploadId: upId,
        kind,
        subjectSuspectId: kind === "CDR" && subjectId ? subjectId : null,
        subjectNumber: kind === "CDR" && subjectNumber.trim()
          ? subjectNumber.trim() : null,
        bankAccountId: null,
        mapping: mappingArg.length > 0 ? mappingArg : null,
      },
    });
    try {
      // Ensure large content is staged server-side before importing.
      let upId = uploadId;
      if (large && !upId) {
        upId = await ensureUploaded(content);
        setUploadId(upId);
      }
      try {
        await runWith(upId);
      } catch (e) {
        // The staged upload can vanish (server restart, TTL). If so, re-stage
        // and retry once rather than surfacing a scary "Failed to fetch".
        const msg = e instanceof Error ? e.message : "";
        if (large && (/uploadId/i.test(msg) || /failed to fetch/i.test(msg))) {
          const fresh = await ensureUploaded(content);
          setUploadId(fresh);
          await runWith(fresh);
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message
        : "Импорт амжилтгүй боллоо.");
    }
  }

  function setMap(field: string, column: string) {
    setMapping((prev) => ({...prev, [field]: column}));
  }

  const mapFields = kind === "CDR" ? CDR_FIELDS : BANK_FIELDS;

  return (
    <div className="page-container">
      <PageHeader icon="📥" title="Өгөгдөл импорт"
        subtitle="CSV / TSV / EXCEL ХУУЛГА · CDR · ХАНДАЛТЫН ЛОГ" />

      <CaseGate>
      <Card title="1 — Файл оруулах" style={{marginBottom: 16}}>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
          style={{display: "none"}}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div
          className={dragOver ? "dropzone dragover" : "dropzone"}
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <svg className="dropzone-icon" width="36" height="36"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {filename ? (
            <div className="file-chip" onClick={(e) => e.stopPropagation()}>
              <span>{filename}</span>
              {isExcel && <Badge text="EXCEL" kind="low" />}
              <span className="file-chip-size">{formatSize(fileSize)}</span>
              <button className="file-chip-remove" onClick={clearFile}
                title="Файл арилгах" aria-label="Файл арилгах">✕</button>
            </div>
          ) : (
            <>
              <div className="dropzone-title">
                Файлаа энд чирж оруулах эсвэл дарж сонгоно уу
              </div>
              <div className="dropzone-hint">CSV · TSV · EXCEL (.XLSX / .XLS)</div>
            </>
          )}
          {isExcel && sheets.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}
              style={{display: "inline-block"}}>
              <Select value={sheetName ?? ""}
                onChange={(v) => {
                  setSheetName(v);
                  void doPreview(content, filename, v, uploadId);
                }}
                options={sheets.map((s) => ({value: s, label: s}))}
                style={{maxWidth: 240}}
                title="Excel хуудас сонгох" />
            </div>
          )}
        </div>
        <div style={{display: "flex", gap: 12, marginTop: 16,
          alignItems: "flex-end", flexWrap: "wrap"}}>
          <div>
            <label className="form-label">Төрөл</label>
            <Select value={kind}
              onChange={(v) => setKind(v as ImportKind)}
              options={KINDS}
              style={{minWidth: 220}} />
          </div>
          <button className="btn btn-primary" onClick={onImport}
            disabled={importQ.loading || busy || !content}>
            {importQ.loading ? "ИМПОРТЛОЖ БАЙНА..."
              : uploadPct !== null ? `БАЙРШУУЛЖ БАЙНА... ${uploadPct}%`
              : busy ? "ШИНЖИЛЖ БАЙНА..." : "ИМПОРТЛОХ"}
          </button>
        </div>
        <div style={{fontSize: 11, color: "var(--text-muted)", marginTop: 8}}>
          Мөр бүр өөрөө эзэндээ холбогдоно — дуудлага бүртгэлтэй дугаараар,
          хуулга дансны багана эсвэл дансаараа.
        </div>
        {error && (
          <div style={{marginTop: 12, padding: "8px 12px", fontSize: 12,
            color: "var(--risk-high)",
            border: "1px solid var(--risk-high)", borderRadius: 6}}>
            {error}
          </div>
        )}
      </Card>

      {kind === "CDR" && (
        <Card title="Сэжигтэн сонгох — дуудлагын эзэн"
          style={{marginBottom: 16}}>
          <div style={{fontSize: 11, color: "var(--text-muted)",
            marginBottom: 8}}>
            Импортлож буй дугаарууд сонгосон сэжигтэнд холбогдоно — сэжигтэн нь
            дуудсан тал болно. Файлд “Нэр” багана байвал тухайн хүнтэй
            таарсан дугаар хүний бүртгэлд нэмэгдэнэ.
          </div>
          <div style={{display: "flex", gap: 12, alignItems: "flex-end",
            flexWrap: "wrap"}}>
            <div>
              <label className="form-label">Сэжигтэн</label>
              <Select value={subjectId} searchable
                onChange={(v) => setSubjectId(Number(v))}
                style={{minWidth: 280}}
                options={[
                  {value: 0, label: "— сэжигтэн сонгоно уу —"},
                  ...suspects.map((s) => ({value: s.id,
                    label: `${s.fullName}${s.phoneNumbers[0]
                      ? " · " + s.phoneNumbers[0].number : ""}`})),
                ]} />
            </div>
            <div>
              <label className="form-label">Сэжигтний дугаар (дуудагч)</label>
              <input className="form-input" style={{width: 200}}
                value={subjectNumber}
                onChange={(e) => setSubjectNumber(e.target.value)}
                placeholder="ж: 90154554" />
            </div>
          </div>
        </Card>
      )}

      {preview && (
        <Card title="2 — Урьдчилсан харагдац" style={{marginBottom: 16}} noPadding>
          <div style={{padding: "12px 16px", fontSize: 12,
            borderBottom: "1px solid var(--border-primary)"}}>
            Танигдсан загвар:{" "}
            <strong style={{color: "var(--accent-cyan)"}}>
              {preview.detectedProfile ?? "тодорхойгүй"}
            </strong>{" · "}
            {preview.domain ?? "—"}{" "}
            <Badge text={preview.confidence}
              kind={preview.confidence === "HIGH" ? "low" : "medium"} />
            {" · "}{preview.totalRows} мөр
          </div>
          {preview.headers.length === 0 ? (
            <Empty message="Багана танигдсангүй" />
          ) : (
            <div style={{overflowX: "auto"}}>
              <table className="data-grid" style={{width: "100%"}}>
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => <th key={i}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, i) => (
                    <tr key={i}>
                      {preview.headers.map((_h, j) => (
                        <td key={j}>{row[j] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {preview && (
        <Card title="Баганы тааруулалт (нягтлах)" style={{marginBottom: 16}}>
          <div style={{fontSize: 11, color: "var(--text-muted)",
            marginBottom: 12}}>
            Автоматаар тааруулсан баганууд. Шаардлагатай бол гараар засна уу.
          </div>
          <div style={{display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12}}>
            {mapFields.map((f) => (
              <div key={f.key}>
                <label className="form-label">{f.label}</label>
                <Select value={mapping[f.key] ?? ""}
                  onChange={(v) => setMap(f.key, v)}
                  options={[{value: "", label: "—"},
                    ...preview.headers.map((h) => ({value: h, label: h}))]}
                  style={{width: "100%"}} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {summary && (
        <Card title="3 — Үр дүн">
          <div style={{display: "flex", gap: 24, marginBottom: 12}}>
            <span>Нийт: <strong>{summary.totalRows}</strong></span>
            <span style={{color: "var(--accent-green)"}}>
              Импортлосон: <strong>{summary.importedRows}</strong>
            </span>
            <span style={{color: "var(--text-muted)"}}>
              Алгассан: <strong>{summary.skippedRows}</strong>
            </span>
          </div>
          {summary.errors.map((e, i) => (
            <div key={i} style={{fontSize: 11, color: "var(--risk-high)"}}>
              {e}
            </div>
          ))}
        </Card>
      )}
      </CaseGate>
    </div>
  );
}
