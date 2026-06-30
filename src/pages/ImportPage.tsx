/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ImportPage.tsx
 * Created at  : 2026-06-24
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {
  EXCEL_SHEETS,
  IMPORT_ACCOUNTS_QUERY,
  IMPORT_DATA,
  PREVIEW_IMPORT,
} from "../graphql/queries";
import {Badge, Card, Empty, PageHeader} from "../components/kit";

type ImportKind = "AUTO" | "BANK" | "CDR" | "ACCESS_LOG";

interface ImSuspect {
  id: number;
  suspectId: string;
  fullName: string;
}

interface ImAccount {
  id: number;
  maskedNumber: string;
  bankName: string | null;
  accountHolderName: string | null;
  suspectId: number | null;
}

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
  {value: "AUTO", label: "Автомат таних"},
  {value: "BANK", label: "Банкны хуулга"},
  {value: "CDR", label: "Дуудлагын бүртгэл (CDR)"},
  {value: "ACCESS_LOG", label: "Хандалтын лог"},
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

export default function ImportPage() {
  const client = useApolloClient();
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [kind, setKind] = useState<ImportKind>("AUTO");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const accountsQ = useQuery<{suspects: ImSuspect[]; bankAccounts: ImAccount[]}>(
    IMPORT_ACCOUNTS_QUERY);
  const [runImport, importQ] = useMutation<{importData: Summary}>(IMPORT_DATA);

  const summary = importQ.data?.importData;
  const suspects = accountsQ.data?.suspects ?? [];
  const accounts = accountsQ.data?.bankAccounts ?? [];
  const subjectAccounts = subjectId == null
    ? accounts : accounts.filter((a) => a.suspectId === subjectId);
  const isExcel = !!filename && isExcelName(filename);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setSheets([]);
    setSheetName(null);
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
    } else {
      const text = await file.text();
      setContent(text);
      setFilename(file.name);
    }
  }

  function vars() {
    return {content, filename, sheetName};
  }

  async function onPreview() {
    if (!content) return;
    setBusy(true);
    try {
      const res = await client.query<{previewImport: Preview}>({
        query: PREVIEW_IMPORT,
        variables: vars(),
        fetchPolicy: "no-cache",
      });
      const pv = res.data.previewImport;
      setPreview(pv);
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
        subjectSuspectId: subjectId,
        bankAccountId: needsAccount ? accountId : null,
        mapping: mappingArg.length > 0 ? mappingArg : null,
      },
    });
  }

  function onSubject(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value ? Number(e.target.value) : null;
    setSubjectId(id);
    // Drop a stale account that no longer belongs to the chosen subject.
    setAccountId(null);
  }

  function setMap(field: string, column: string) {
    setMapping((prev) => ({...prev, [field]: column}));
  }

  const needsAccount = kind === "BANK"
    || (kind === "AUTO" && preview?.domain === "BANK");
  const isBank = needsAccount;

  return (
    <div className="page-container">
      <PageHeader icon="📥" title="Өгөгдөл импорт"
        subtitle="CSV / TSV / EXCEL ХУУЛГА · CDR · ХАНДАЛТЫН ЛОГ" />

      <Card title="1 — Файл сонгох эсвэл доор буулгах" style={{marginBottom: 16}}>
        <div style={{display: "flex", gap: 12, alignItems: "center",
          marginBottom: 12, flexWrap: "wrap"}}>
          <input type="file" className="form-input"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm" onChange={onFile} />
          {filename && (
            <span style={{fontSize: 11, color: "var(--accent-cyan)"}}>
              {filename}{isExcel ? " (Excel)" : ""}
            </span>
          )}
          {isExcel && sheets.length > 0 && (
            <select className="form-input" value={sheetName ?? ""}
              onChange={(e) => setSheetName(e.target.value)}
              style={{maxWidth: 200}}>
              {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>
        {!isExcel && (
          <textarea
            className="form-input"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setFilename(null);
            }}
            placeholder="...эсвэл CSV/TSV-г энд буулгана уу"
            spellCheck={false}
            style={{width: "100%", height: 140, fontFamily: "var(--font-mono)",
              fontSize: 11, resize: "vertical"}}
          />
        )}
        <div style={{display: "flex", gap: 12, marginTop: 12,
          alignItems: "flex-end", flexWrap: "wrap"}}>
          <div>
            <label className="form-label">Эзэн (сэжигтэн) *</label>
            <select className="form-input" value={subjectId ?? ""}
              onChange={onSubject} style={{minWidth: 200}}>
              <option value="">— Сэжигтэн сонгох —</option>
              {suspects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} · {s.suspectId}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Төрөл</label>
            <select className="form-input" value={kind}
              onChange={(e) => setKind(e.target.value as ImportKind)}
              style={{minWidth: 180}}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </div>
          {needsAccount && (
            <div>
              <label className="form-label">Данс (банкны хуулгад)</label>
              <select className="form-input"
                value={accountId ?? ""}
                onChange={(e) =>
                  setAccountId(e.target.value ? Number(e.target.value) : null)}
                style={{minWidth: 220}}>
                <option value="">— Данс сонгох —</option>
                {subjectAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.maskedNumber} · {a.accountHolderName ?? a.bankName ?? ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn" onClick={onPreview} disabled={busy || !content}>
            УРЬДЧИЛАН ХАРАХ
          </button>
          <button className="btn btn-primary" onClick={onImport}
            disabled={importQ.loading || !content || subjectId === null
              || (needsAccount && accountId === null)}>
            {importQ.loading ? "ИМПОРТЛОЖ БАЙНА..." : "ИМПОРТЛОХ"}
          </button>
        </div>
        {subjectId === null && (
          <div style={{fontSize: 11, color: "var(--text-muted)", marginTop: 8}}>
            Импортлох өгөгдөл бүр энэ этгээдэд хамаарна — заавал сонгоно уу.
          </div>
        )}
        {needsAccount && subjectId !== null && subjectAccounts.length === 0 && (
          <div style={{fontSize: 11, color: "var(--risk-high)", marginTop: 8}}>
            Энэ сэжигтэнд данс алга — Хувийн мэдээлэл хэсэгт данс үүсгэнэ үү.
          </div>
        )}
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
                <select className="form-input" value={mapping[f.key] ?? ""}
                  onChange={(e) => setMap(f.key, e.target.value)}
                  style={{width: "100%"}}>
                  <option value="">—</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
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
          {summary.messages.map((m, i) => (
            <div key={i} style={{fontSize: 11, color: "var(--accent-cyan)"}}>
              {m}
            </div>
          ))}
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
