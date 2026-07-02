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
  SET_ACTIVE_CASE,
  SET_CASE_STATUS,
} from "../graphql/queries";

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

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({caseId: "", caseName: ""});
  const [formError, setFormError] = useState("");

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
        <select
          className="form-input app-header-select"
          value={activeCase?.id ?? ""}
          onChange={(e) =>
            onSelectCase(e.target.value ? Number(e.target.value) : null)}
          title="Идэвхтэй кейс — бүх хуудсанд үйлчилнэ"
        >
          <option value="">Кейс сонгоогүй</option>
          {caseFiles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseId} · {c.caseName} ({STATUS_LABELS[c.status] ?? c.status})
            </option>
          ))}
        </select>
        {activeCase && (
          <>
            <span className={`badge ${STATUS_BADGE[status] ?? "unknown"}`}>
              {STATUS_LABELS[status] ?? status}
            </span>
            <select
              className="form-input app-header-status"
              value={status}
              onChange={(e) => onChangeStatus(e.target.value)}
              title="Кейсийн төлөв солих"
            >
              {["OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="app-header-group">
        <button className="btn btn-accent" onClick={openForm}>
          + ШИНЭ КЕЙС
        </button>
      </div>

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
              <div style={{display: "flex", justifyContent: "flex-end", gap: 8}}>
                <button className="btn btn-sm"
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
