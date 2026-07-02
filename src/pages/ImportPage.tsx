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
  PREVIEW_IMPORT,
} from "../graphql/queries";
import {Badge, Card, Empty, PageHeader} from "../components/kit";
import {Select} from "../components/inputs";

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
  {key: "amount", label: "Дүн (нэг багана)"},
  {key: "credit", label: "Орлого"},
  {key: "debit", label: "Зарлага"},
  {key: "description", label: "Тайлбар"},
  {key: "reference", label: "Гүйлгээний дугаар"},
  {key: "counterpartyName", label: "Харилцагчийн нэр"},
  {key: "counterpartyAccount", label: "Харилцагчийн данс"},
  {key: "balance", label: "Үлдэгдэл"},
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
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [runImport, importQ] = useMutation<{importData: Summary}>(IMPORT_DATA);

  const summary = importQ.data?.importData;
  const isExcel = !!filename && isExcelName(filename);

  async function handleFile(file: File) {
    setPreview(null);
    setSheets([]);
    setSheetName(null);
    setFileSize(file.size);
    if (isExcelName(file.name)) {
      const buf = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      setContent(b64);
      setFilename(file.name);
      const res = await client.query<{excelSheets: string[]}>({
        query: EXCEL_SHEETS,
        variables: {content: b64, filename: file.name},
        fetchPolicy: "no-cache",
      });
      const sh = res.data.excelSheets;
      setSheets(sh);
      setSheetName(sh[0] ?? null);
      await doPreview(b64, file.name, sh[0] ?? null);
    } else {
      const text = await file.text();
      setContent(text);
      setFilename(file.name);
      await doPreview(text, file.name, null);
    }
  }

  function clearFile() {
    setContent("");
    setFilename(null);
    setFileSize(0);
    setSheets([]);
    setSheetName(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function vars() {
    return {content, filename, sheetName};
  }

  // Preview runs AUTOMATICALLY when a file (or Excel sheet) is picked.
  async function doPreview(
    contentArg: string,
    filenameArg: string | null,
    sheetArg: string | null
  ) {
    if (!contentArg) return;
    setBusy(true);
    try {
      const res = await client.query<{previewImport: Preview}>({
        query: PREVIEW_IMPORT,
        variables: {content: contentArg, filename: filenameArg,
          sheetName: sheetArg},
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
    const mappingArg = Object.entries(mapping)
      .filter(([, col]) => col && col.trim())
      .map(([field, column]) => ({field, column}));
    await runImport({
      variables: {
        ...vars(),
        kind,
        subjectSuspectId: null,
        bankAccountId: null,
        mapping: mappingArg.length > 0 ? mappingArg : null,
      },
    });
  }

  function setMap(field: string, column: string) {
    setMapping((prev) => ({...prev, [field]: column}));
  }

  const isBank = kind === "BANK";

  return (
    <div className="page-container">
      <PageHeader icon="📥" title="Өгөгдөл импорт"
        subtitle="CSV / TSV / EXCEL ХУУЛГА · CDR · ХАНДАЛТЫН ЛОГ" />

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
                  void doPreview(content, filename, v);
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
              : busy ? "ШИНЖИЛЖ БАЙНА..." : "ИМПОРТЛОХ"}
          </button>
        </div>
        <div style={{fontSize: 11, color: "var(--text-muted)", marginTop: 8}}>
          Мөр бүр өөрөө эзэндээ холбогдоно — дуудлага бүртгэлтэй дугаараар,
          хуулга дансны багана эсвэл дансаараа.
        </div>
      </Card>

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

      {isBank && preview && (
        <Card title="Баганы тааруулалт (нягтлах)" style={{marginBottom: 16}}>
          <div style={{fontSize: 11, color: "var(--text-muted)",
            marginBottom: 12}}>
            Автоматаар тааруулсан баганууд. Шаардлагатай бол гараар засна уу.
          </div>
          <div style={{display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12}}>
            {BANK_FIELDS.map((f) => (
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
    </div>
  );
}
