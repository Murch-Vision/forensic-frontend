/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AppHeader.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CREATE_CASE_FILE,
  MERGE_CASES,
  SET_ACTIVE_CASE,
  SET_CASE_STATUS,
} from "../graphql/queries";
import {Select} from "./inputs";

// Global case session bar shown on every page: the analyst picks the case
// once here and every page (evidence tagging, exhibits, …) follows it via
// the shared ACTIVE_CASE_QUERY Apollo cache entry.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
  status: string;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Нээлттэй",
  ACTIVE: "Идэвхтэй",
  CLOSED: "Хаагдсан",
  ARCHIVED: "Архивлагдсан",
  UNKNOWN: "Тодорхойгүй",
};

// Maps CaseStatus onto the badge accents defined in app.css.
const STATUS_BADGE: Record<string, string> = {
  OPEN: "info",
  ACTIVE: "low",
  CLOSED: "unknown",
  ARCHIVED: "warning",
  UNKNOWN: "unknown",
};

export default function AppHeader() {
  const caseQ = useQuery<{activeCase: CaseRef | null; caseFiles: CaseRef[]}>(
    ACTIVE_CASE_QUERY
  );
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE);
  const [setCaseStatus] = useMutation(SET_CASE_STATUS);
  const [createCaseFile] = useMutation(CREATE_CASE_FILE);
  const [mergeCases] = useMutation(MERGE_CASES);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({caseId: "", caseName: ""});
  const [formError, setFormError] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [mergeSources, setMergeSources] = useState<Set<number>>(new Set());
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

  const activeCase = caseQ.data?.activeCase ?? null;
  const caseFiles = caseQ.data?.caseFiles ?? [];

  async function onSelectCase(id: number | null) {
    await setActiveCase({variables: {caseFileId: id}});
    await caseQ.refetch();
  }

  async function onChangeStatus(status: string) {
    if (!activeCase) return;
    await setCaseStatus({variables: {caseFileId: activeCase.id, status}});
    await caseQ.refetch();
  }

  function openForm() {
    setForm({caseId: "", caseName: ""});
    setFormError("");
    setShowForm(true);
  }

  function openMerge() {
    setMergeTarget(activeCase?.id ?? caseFiles[0]?.id ?? null);
    setMergeSources(new Set());
    setMergeError("");
    setShowMerge(true);
  }

  function toggleMergeSource(id: number) {
    setMergeSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitMerge() {
    if (mergeTarget == null || mergeSources.size === 0) return;
    setMerging(true);
    setMergeError("");
    try {
      await mergeCases({variables: {
        sourceCaseFileIds: [...mergeSources],
        targetCaseFileId: mergeTarget,
      }});
      await caseQ.refetch();
      setShowMerge(false);
    } catch (err) {
      setMergeError("Нэгтгэхэд алдаа гарлаа: " + String(err));
    } finally {
      setMerging(false);
    }
  }

  async function submitCase() {
    const caseId = form.caseId.trim();
    if (!caseId) {
      setFormError("Кейсийн дугаар оруулна уу.");
      return;
    }
    const caseName = form.caseName.trim() || caseId;
    const res = await createCaseFile({
      variables: {input: {caseId, caseName, status: "OPEN", priority: "MEDIUM"}},
    });
    await caseQ.refetch();
    setShowForm(false);
    const id = res.data?.createCaseFile?.id;
    if (id) await onSelectCase(id);
  }

  const status = activeCase?.status ?? "";

  return (
    <header className="app-header">
      <div className="app-header-group">
        <span className="app-header-label">Идэвхтэй кейс</span>
        <Select
          className="app-header-select"
          value={activeCase?.id ?? ""}
          onChange={(v) => onSelectCase(v ? Number(v) : null)}
          title="Идэвхтэй кейс — бүх хуудсанд үйлчилнэ"
          options={[
            {value: "", label: "Кейс сонгоогүй"},
            ...caseFiles.map((c) => ({value: c.id,
              label: `${c.caseId} · ${c.caseName} (${
                STATUS_LABELS[c.status] ?? c.status})`})),
          ]} />
        {activeCase && (
          <>
            <span className={`badge ${STATUS_BADGE[status] ?? "unknown"}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <Select
              className="app-header-status"
              value={status}
              onChange={(v) => onChangeStatus(v)}
              title="Кейсийн төлөв солих"
              options={["OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) =>
                ({value: s, label: STATUS_LABELS[s]}))} />
          </>
        )}
      </div>
      <div className="app-header-group">
        {caseFiles.length >= 2 && (
          <button className="btn" onClick={openMerge}>КЕЙС НЭГТГЭХ</button>
        )}
        <button className="btn btn-accent" onClick={openForm}>
          + ШИНЭ КЕЙС
        </button>
      </div>

      {showMerge && (
        <div className="modal-overlay" onClick={() => setShowMerge(false)}>
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{width: 480, maxWidth: "90vw", marginBottom: 0}}
          >
            <div className="card-header">
              <span className="card-title" style={{color: "var(--accent-purple)"}}>
                КЕЙС НЭГТГЭХ
              </span>
            </div>
            <div className="card-body">
              {mergeError && (
                <div className="form-error-box">{mergeError}</div>
              )}
              <label className="form-label">Хүлээн авах кейс (үндсэн)</label>
              <Select
                value={mergeTarget ?? ""}
                onChange={(v) => {
                  const id = Number(v);
                  setMergeTarget(id);
                  setMergeSources((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                  });
                }}
                style={{marginBottom: 14, width: "100%"}}
                options={caseFiles.map((c) => ({value: c.id,
                  label: `${c.caseId} · ${c.caseName}`}))} />
              <label className="form-label">Нэгтгэх кейсүүд</label>
              <div style={{maxHeight: 240, overflowY: "auto",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-sm)", marginBottom: 8}}>
                {caseFiles.filter((c) => c.id !== mergeTarget).map((c) => (
                  <label key={c.id} style={{display: "flex",
                    alignItems: "center", gap: 10, padding: "8px 12px",
                    fontSize: 12, cursor: "pointer",
                    borderBottom: "1px solid var(--border-primary)"}}>
                    <input
                      type="checkbox"
                      checked={mergeSources.has(c.id)}
                      onChange={() => toggleMergeSource(c.id)}
                    />
                    <span style={{flex: 1}}>{c.caseId} · {c.caseName}</span>
                    <span className={`badge ${STATUS_BADGE[c.status] ?? "unknown"}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{fontSize: 11, color: "var(--text-muted)",
                marginBottom: 16}}>
                Нотлох баримт, тэмдэглэл үндсэн кейс рүү шилжиж, нэгтгэсэн
                кейсүүд архивлагдана.
              </div>
              <div className="modal-actions">
                <button className="btn"
                  onClick={() => setShowMerge(false)}>ЦУЦЛАХ</button>
                <button className="btn btn-accent"
                  disabled={merging || mergeSources.size === 0}
                  onClick={submitMerge}>
                  {merging ? "НЭГТГЭЖ БАЙНА..." : `НЭГТГЭХ (${mergeSources.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{width: 420, maxWidth: "90vw", marginBottom: 0}}
          >
            <div className="card-header">
              <span className="card-title" style={{color: "var(--accent-purple)"}}>
                ШИНЭ КЕЙС ҮҮСГЭХ
              </span>
            </div>
            <div className="card-body">
              {formError && (
                <div className="form-error-box">{formError}</div>
              )}
              <label className="form-label">Кейсийн дугаар</label>
              <input
                className="form-input"
                autoFocus
                value={form.caseId}
                onChange={(e) =>
                  setForm((f) => ({...f, caseId: e.target.value}))}
                onKeyDown={(e) => { if (e.key === "Enter") submitCase(); }}
                placeholder="жишээ: CASE-0002"
                style={{marginBottom: 14}}
              />
              <label className="form-label">Кейсийн нэр</label>
              <input
                className="form-input"
                value={form.caseName}
                onChange={(e) =>
                  setForm((f) => ({...f, caseName: e.target.value}))}
                onKeyDown={(e) => { if (e.key === "Enter") submitCase(); }}
                placeholder="Кейсийн нэр (заавал биш)"
                style={{marginBottom: 18}}
              />
              <div className="modal-actions">
                <button className="btn"
                  onClick={() => setShowForm(false)}>ЦУЦЛАХ</button>
                <button className="btn btn-accent" onClick={submitCase}>
                  ҮҮСГЭХ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
