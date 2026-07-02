/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : CasesPage.tsx
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
  CASE_FILES_QUERY,
  CREATE_CASE_FILE,
  MERGE_CASES,
  SET_ACTIVE_CASE,
  SET_CASE_STATUS,
} from "../graphql/queries";
import {STATUS_BADGE, STATUS_LABELS} from "../nav";
import {Card, Loading, MetricsGrid, PageHeader, StatCard} from "../components/kit";
import {Select} from "../components/inputs";
import {formatDate} from "../lib/format";

// Case management root: every other page works INSIDE the case picked in
// the header — this page is where cases themselves are created, merged and
// moved through their lifecycle (the header only switches, never mutates).

interface CaseRow {
  id: number;
  caseId: string;
  caseName: string;
  description: string | null;
  status: string;
  priority: string;
  leadInvestigator: string | null;
  createdAt: string;
  closedAt: string | null;
}

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Бага",
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
  CRITICAL: "Ноцтой",
};

const PRIORITY_BADGE: Record<string, string> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

export default function CasesPage() {
  const casesQ = useQuery<{caseFiles: CaseRow[]}>(CASE_FILES_QUERY);
  const activeQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);

  const refetchAll = [{query: CASE_FILES_QUERY}, {query: ACTIVE_CASE_QUERY}];
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE,
    {refetchQueries: refetchAll});
  const [setCaseStatus] = useMutation(SET_CASE_STATUS,
    {refetchQueries: refetchAll});
  const [createCaseFile] = useMutation(CREATE_CASE_FILE,
    {refetchQueries: refetchAll});
  const [mergeCases] = useMutation(MERGE_CASES, {refetchQueries: refetchAll});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({caseId: "", caseName: ""});
  const [formError, setFormError] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<number | null>(null);
  const [mergeSources, setMergeSources] = useState<Set<number>>(new Set());
  const [mergeError, setMergeError] = useState("");
  const [merging, setMerging] = useState(false);

  const cases = casesQ.data?.caseFiles ?? [];
  const activeId = activeQ.data?.activeCase?.id ?? null;

  const count = (s: string) => cases.filter((c) => c.status === s).length;

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
    setShowForm(false);
    const id = res.data?.createCaseFile?.id;
    if (id) await setActiveCase({variables: {caseFileId: id}});
  }

  function openMerge() {
    setMergeTarget(activeId ?? cases[0]?.id ?? null);
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
      setShowMerge(false);
    } catch (err) {
      setMergeError("Нэгтгэхэд алдаа гарлаа: " + String(err));
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        icon={"\u{1F4C1}"}
        title="Кейсүүд"
        subtitle="Кейсийн удирдлага — үүсгэх, төлөв солих, нэгтгэх. Бусад бүх хуудас толгой хэсэгт сонгосон кейсийн хүрээнд ажиллана."
        actions={
          <>
            {cases.length >= 2 && (
              <button className="btn" onClick={openMerge}>КЕЙС НЭГТГЭХ</button>
            )}
            <button className="btn btn-accent" onClick={openForm}>
              + ШИНЭ КЕЙС
            </button>
          </>
        }
      />

      <MetricsGrid>
        <StatCard label="Нийт кейс" value={cases.length} />
        <StatCard label="Нээлттэй" value={count("OPEN")} color="info" />
        <StatCard label="Идэвхтэй" value={count("ACTIVE")} color="low" />
        <StatCard label="Хаагдсан" value={count("CLOSED")} />
        <StatCard label="Архивлагдсан" value={count("ARCHIVED")} color="warning" />
      </MetricsGrid>

      <Card title="БҮХ КЕЙС" noPadding>
        {casesQ.loading ? (
          <Loading />
        ) : cases.length === 0 ? (
          <div className="empty-state">
            <div className="message" style={{marginBottom: 16}}>
              Кейс бүртгэгдээгүй байна. Эхний кейсээ үүсгэнэ үү.
            </div>
            <button className="btn btn-accent" onClick={openForm}>
              + ШИНЭ КЕЙС
            </button>
          </div>
        ) : (
          <table className="data-grid" style={{width: "100%"}}>
            <thead>
              <tr>
                <th>Дугаар</th>
                <th>Нэр</th>
                <th>Төлөв</th>
                <th>Зэрэглэл</th>
                <th>Үүсгэсэн</th>
                <th>Хаагдсан</th>
                <th style={{width: 140}}></th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}
                  className={c.id === activeId ? "case-row-active" : ""}>
                  <td style={{fontFamily: "var(--font-mono)",
                    whiteSpace: "nowrap"}}>{c.caseId}</td>
                  <td>
                    <div>{c.caseName}</div>
                    {c.description && (
                      <div style={{fontSize: 11, color: "var(--text-muted)",
                        marginTop: 2}}>{c.description}</div>
                    )}
                  </td>
                  <td>
                    <Select
                      value={c.status}
                      onChange={(v) => setCaseStatus({
                        variables: {caseFileId: c.id, status: v}})}
                      title="Кейсийн төлөв солих"
                      style={{width: 150}}
                      options={["OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map(
                        (s) => ({value: s, label: STATUS_LABELS[s]}))} />
                  </td>
                  <td>
                    <span className={`badge ${
                      PRIORITY_BADGE[c.priority] ?? "unknown"}`}>
                      {PRIORITY_LABELS[c.priority] ?? c.priority}
                    </span>
                  </td>
                  <td style={{whiteSpace: "nowrap"}}>
                    {formatDate(c.createdAt)}
                  </td>
                  <td style={{whiteSpace: "nowrap"}}>
                    {formatDate(c.closedAt)}
                  </td>
                  <td style={{textAlign: "right"}}>
                    {c.id === activeId ? (
                      <span className={`badge ${
                        STATUS_BADGE[c.status] ?? "unknown"}`}>
                        ИДЭВХТЭЙ КЕЙС
                      </span>
                    ) : (
                      <button className="btn btn-sm"
                        onClick={() => setActiveCase({
                          variables: {caseFileId: c.id}})}>
                        ИДЭВХЖҮҮЛЭХ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {casesQ.error && (
          <div className="form-error-box" style={{margin: 16}}>
            Кейсүүдийг ачаалж чадсангүй: {casesQ.error.message}
          </div>
        )}
      </Card>

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
                options={cases.map((c) => ({value: c.id,
                  label: `${c.caseId} · ${c.caseName}`}))} />
              <label className="form-label">Нэгтгэх кейсүүд</label>
              <div style={{maxHeight: 240, overflowY: "auto",
                border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-sm)", marginBottom: 8}}>
                {cases.filter((c) => c.id !== mergeTarget).map((c) => (
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
    </div>
  );
}
