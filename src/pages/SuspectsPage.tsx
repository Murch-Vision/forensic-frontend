/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : SuspectsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-23
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  CREATE_SUSPECT,
  DELETE_SUSPECT,
  SUSPECTS_QUERY,
  SUSPECT_DETAIL_QUERY,
  UPDATE_SUSPECT,
} from "../graphql/suspects";
import {
  ACTIVE_CASE_QUERY,
  CREATE_BANK_ACCOUNT,
  CREATE_PHONE_NUMBER,
  DWELL_ZONES,
  EVIDENCE_FOR_CASE,
  SUSPECT_ACCESS_LOGS,
  TAG_EVIDENCE,
} from "../graphql/queries";
import {formatDateTime} from "../lib/format";
import type {RiskLevel, Suspect, SuspectDetail, SuspectInput} from "../types";

// Ported from BlazorComponents/SuspectsPage.razor. The case-session evidence
// tagging, dwell-zone and access-log cards depend on services outside this
// vertical slice and are intentionally omitted; the suspect CRUD surface is
// faithful to the original.

const RISK_LEVELS: RiskLevel[] = [
  "UNKNOWN",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

interface FormState extends SuspectInput {
  id?: number;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  gender: "Male",
  riskLevel: "UNKNOWN",
};

function riskClass(level: RiskLevel): string {
  return level.toLowerCase();
}

// Downscale the chosen image to a 256x256 JPEG data-URI — keeps the DB small
// and matches RequestImageFileAsync("image/jpeg", 256, 256) in the original.
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0, 256, 256);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function SuspectsPage() {
  const [searchText, setSearchText] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  const {data, loading, refetch} = useQuery<{suspects: Suspect[]}>(
    SUSPECTS_QUERY
  );
  const detail = useQuery<{suspect: SuspectDetail | null}>(
    SUSPECT_DETAIL_QUERY,
    {variables: {id: selectedId ?? 0}, skip: selectedId === null}
  );

  const [createSuspect] = useMutation(CREATE_SUSPECT);
  const [updateSuspect] = useMutation(UPDATE_SUSPECT);
  const [deleteSuspect] = useMutation(DELETE_SUSPECT);
  const [createBankAccount] = useMutation(CREATE_BANK_ACCOUNT);
  const [createPhoneNumber] = useMutation(CREATE_PHONE_NUMBER);

  async function onAddAccount(input: Record<string, unknown>) {
    if (!selected) return;
    await createBankAccount({variables: {input: {...input, suspectId: selected.id}}});
    await detail.refetch();
  }

  async function onAddPhone(input: Record<string, unknown>) {
    if (!selected) return;
    await createPhoneNumber({variables: {input: {...input, suspectId: selected.id}}});
    await detail.refetch();
  }

  // Evidence tagging follows the case picked in the global AppHeader
  // (shared ACTIVE_CASE_QUERY cache entry).
  interface CaseRef {id: number; caseId: string; caseName: string}
  const caseQ = useQuery<{activeCase: CaseRef | null; caseFiles: CaseRef[]}>(
    ACTIVE_CASE_QUERY
  );
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  const activeCase = caseQ.data?.activeCase ?? null;
  const evidenceQ = useQuery<{
    evidenceForCase: {sourceType: string; sourceId: number; exhibitNumber: number}[];
  }>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId: activeCase?.id ?? 0},
    skip: !activeCase,
  });
  const exhibitBySuspect = new Map<number, number>();
  for (const e of evidenceQ.data?.evidenceForCase ?? []) {
    if (e.sourceType === "SUSPECT") exhibitBySuspect.set(e.sourceId, e.exhibitNumber);
  }

  async function onTagSuspect(s: Suspect) {
    if (!activeCase) return;
    await tagEvidence({
      variables: {
        caseFileId: activeCase.id, sourceType: "SUSPECT", sourceId: s.id,
        description: `${s.suspectId} — ${s.fullName} (${s.riskLevel})`,
        severity: s.riskLevel === "CRITICAL" ? "CRITICAL"
          : s.riskLevel === "HIGH" ? "HIGH"
          : s.riskLevel === "MEDIUM" ? "MEDIUM" : "INFO",
      },
    });
    await evidenceQ.refetch();
  }

  const suspects = data?.suspects ?? [];

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return suspects;
    return suspects.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.suspectId.toLowerCase().includes(q) ||
        (s.aliases?.toLowerCase().includes(q) ?? false)
    );
  }, [suspects, searchText]);

  const selected = detail.data?.suspect ?? null;

  function selectSuspect(s: Suspect) {
    setShowForm(false);
    setSelectedId(s.id);
  }

  function startAddSubject() {
    setForm({...EMPTY_FORM});
    setFormError("");
    setIsEditing(false);
    setShowForm(true);
  }

  function startEditSubject() {
    if (!selected) return;
    setForm({
      id           : selected.id,
      fullName     : selected.fullName,
      aliases      : selected.aliases,
      nationalId   : selected.nationalId,
      passportNumber : selected.passportNumber,
      dateOfBirth  : selected.dateOfBirth,
      gender       : selected.gender ?? "Male",
      address      : selected.address,
      city         : selected.city,
      country      : selected.country,
      primaryPhone : selected.primaryPhone,
      email        : selected.email,
      occupation   : selected.occupation,
      organization : selected.organization,
      riskLevel    : selected.riskLevel,
      notes        : selected.notes,
      photoData    : selected.photoData,
      status       : selected.status,
    });
    setFormError("");
    setIsEditing(true);
    setShowForm(true);
  }

  async function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const uri = await resizeToDataUri(file);
      setForm((f) => ({...f, photoData: uri}));
      setFormError("");
    } catch (err) {
      setFormError("Зураг ачаалахад алдаа гарлаа: " + String(err));
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({...f, [key]: value}));
  }

  async function saveSubject() {
    setFormError("");
    if (!form.fullName.trim()) {
      setFormError("Бүтэн нэр заавал бөглөх");
      return;
    }
    const {id, ...input} = form;
    if (isEditing && id !== undefined) {
      await updateSuspect({variables: {id, input}});
      await detail.refetch();
    } else {
      const res = await createSuspect({variables: {input}});
      const newId = res.data?.createSuspect?.id;
      if (newId) setSelectedId(newId);
    }
    await refetch();
    cancelForm();
  }

  async function deleteSubject() {
    if (!selected) return;
    const ok = window.confirm(
      `Сэжигтэн '${selected.fullName}'-г устгах уу?`
    );
    if (!ok) return;
    await deleteSuspect({variables: {id: selected.id}});
    setSelectedId(null);
    await refetch();
  }

  function cancelForm() {
    setShowForm(false);
    setIsEditing(false);
    setForm({...EMPTY_FORM});
    setFormError("");
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <div className="page-title">
            <span className="icon">&#128113;</span> Хувийн Мэдээлэл
          </div>
          <div className="page-subtitle">ХУВИЙН МЭДЭЭЛЭЛ & АЛБАН ТУШААЛ</div>
        </div>
        <div className="toolbar">
          <button className="btn btn-success" onClick={startAddSubject}>
            + ХҮН НЭМЭХ
          </button>
          <button className="btn btn-primary" onClick={() => refetch()}>
            ШИНЭЧЛЭХ
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" style={{margin: "0 auto"}} />
        </div>
      ) : (
        <div style={{display: "flex", gap: 16,
          height: "calc(100vh - var(--app-header-h) - 120px)"}}>
          {/* Сэжигтэн жагсаалт */}
          <div
            className="card"
            style={{width: 360, display: "flex", flexDirection: "column"}}
          >
            <div className="card-header">
              <span className="card-title">Сэжигтэн ({suspects.length})</span>
            </div>
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border-primary)",
              }}
            >
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Хайх..."
                style={{
                  width: "100%",
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-primary)",
                  borderRadius: 4,
                  padding: "6px 10px",
                  fontSize: 11,
                  outline: "none",
                }}
              />
            </div>
            <div style={{flex: 1, overflowY: "auto"}}>
              {filtered.map((s) => {
                const isSelected = selectedId === s.id;
                return (
                  <div
                    key={s.id}
                    className="suspect-row"
                    style={
                      isSelected
                        ? {
                            background: "rgba(0,229,255,0.06)",
                            borderLeft: "3px solid var(--accent-cyan)",
                          }
                        : undefined
                    }
                    onClick={() => selectSuspect(s)}
                  >
                    {s.photoData ? (
                      <img
                        className={`avatar ${riskClass(s.riskLevel)}`}
                        src={s.photoData}
                        style={{objectFit: "cover"}}
                      />
                    ) : (
                      <div className={`avatar ${riskClass(s.riskLevel)}`}>
                        {s.initials}
                      </div>
                    )}
                    <div className="info">
                      <div className="name">{s.fullName}</div>
                      <div className="detail">
                        {s.suspectId} | {s.city ?? ""}, {s.country ?? ""}
                      </div>
                    </div>
                    <span className={`badge ${riskClass(s.riskLevel)}`}>
                      {s.riskLevel}
                    </span>
                    {activeCase && (
                      exhibitBySuspect.has(s.id) ? (
                        <span
                          title="Идэвхтэй кейст бэхэлсэн"
                          style={{marginLeft: 6, fontSize: 9, fontWeight: 700,
                            color: "var(--accent-cyan)",
                            background: "rgba(0,229,255,0.12)",
                            padding: "2px 6px", borderRadius: 3}}
                        >
                          #{exhibitBySuspect.get(s.id)}
                        </span>
                      ) : (
                        <button
                          className="btn btn-sm"
                          style={{marginLeft: 6}}
                          title="Идэвхтэй кейст нотлох баримт болгож тэмдэглэх"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTagSuspect(s);
                          }}
                        >
                          + ТЭМДЭГЛЭХ
                        </button>
                      )
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="empty-state">
                  <div className="message">Сэжигтэн олдсонгүй</div>
                </div>
              )}
            </div>
          </div>

          {/* Дэлгэрэнгүй */}
          <div style={{flex: 1, overflowY: "auto"}}>
            {showForm ? (
              <SuspectForm
                isEditing={isEditing}
                form={form}
                formError={formError}
                onField={setField}
                onPhoto={onPhotoSelected}
                onSave={saveSubject}
                onCancel={cancelForm}
              />
            ) : selected ? (
              <SuspectDetailPanel
                suspect={selected}
                loading={detail.loading}
                onEdit={startEditSubject}
                onDelete={deleteSubject}
                onAddAccount={onAddAccount}
                onAddPhone={onAddPhone}
              />
            ) : (
              <div className="empty-state">
                <div className="message">
                  Сэжигтэн сонгох эсвэл шинээр нэмнэ үү
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface FormProps {
  isEditing: boolean;
  form: FormState;
  formError: string;
  onField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SuspectForm(props: FormProps) {
  const {isEditing, form, formError, onField, onPhoto, onSave, onCancel} =
    props;
  return (
    <div className="card" style={{marginBottom: 16}}>
      <div className="card-header">
        <span className="card-title" style={{color: "var(--accent-cyan)"}}>
          {isEditing ? "МЭДЭЭЛЭЛ ЗАСАХ" : "ШИНЭ ХҮН НЭМЭХ"}
        </span>
        <div className="toolbar">
          <button className="btn" onClick={onCancel}>
            ЦУЦЛАХ
          </button>
          <button className="btn btn-success" onClick={onSave}>
            {isEditing ? "ШИНЭЧЛЭХ" : "ҮҮСГЭХ"}
          </button>
        </div>
      </div>
      <div className="card-body">
        {formError && (
          <div
            style={{
              background: "rgba(255,23,68,0.1)",
              border: "1px solid rgba(255,23,68,0.3)",
              borderRadius: 6,
              padding: 10,
              marginBottom: 16,
              color: "#FF5252",
              fontSize: 11,
            }}
          >
            {formError}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
          }}
        >
          {form.photoData ? (
            <img
              src={form.photoData}
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                objectFit: "cover",
                border: "1px solid var(--border-primary)",
              }}
            />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 8,
                background: "var(--bg-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 10,
                border: "1px dashed var(--border-secondary)",
              }}
            >
              Зураг алга
            </div>
          )}
          <div>
            <label className="form-label">
              Зураг (холбоосын зураглалд ашиглана)
            </label>
            <input
              type="file"
              accept="image/*"
              className="form-input"
              onChange={onPhoto}
            />
            {form.photoData && (
              <button
                type="button"
                className="btn"
                style={{marginTop: 6}}
                onClick={() => onField("photoData", null)}
              >
                Зураг устгах
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          <Field label="Бүтэн нэр *">
            <input
              className="form-input"
              value={form.fullName}
              onChange={(e) => onField("fullName", e.target.value)}
            />
          </Field>
          <Field label="Хуурмаг нэр">
            <input
              className="form-input"
              value={form.aliases ?? ""}
              onChange={(e) => onField("aliases", e.target.value)}
            />
          </Field>
          <Field label="Хүйс">
            <select
              className="form-input"
              value={form.gender ?? "Male"}
              onChange={(e) => onField("gender", e.target.value)}
            >
              <option value="Male">Эрэгтэй</option>
              <option value="Female">Эмэгтэй</option>
            </select>
          </Field>
          <Field label="Төрсөн огноо">
            <input
              type="date"
              className="form-input"
              value={(form.dateOfBirth ?? "").slice(0, 10)}
              onChange={(e) =>
                onField("dateOfBirth", e.target.value || null)
              }
            />
          </Field>
          <Field label="Регистрийн дугаар">
            <input
              className="form-input"
              value={form.nationalId ?? ""}
              onChange={(e) => onField("nationalId", e.target.value)}
            />
          </Field>
          <Field label="Утас">
            <input
              className="form-input"
              value={form.primaryPhone ?? ""}
              onChange={(e) => onField("primaryPhone", e.target.value)}
            />
          </Field>
          <Field label="И-мэйл">
            <input
              className="form-input"
              value={form.email ?? ""}
              onChange={(e) => onField("email", e.target.value)}
            />
          </Field>
          <Field label="Хаяг">
            <input
              className="form-input"
              value={form.address ?? ""}
              onChange={(e) => onField("address", e.target.value)}
            />
          </Field>
          <Field label="Хот">
            <input
              className="form-input"
              value={form.city ?? ""}
              onChange={(e) => onField("city", e.target.value)}
            />
          </Field>
          <Field label="Улс">
            <input
              className="form-input"
              value={form.country ?? ""}
              onChange={(e) => onField("country", e.target.value)}
            />
          </Field>
          <Field label="Мэргэжил">
            <input
              className="form-input"
              value={form.occupation ?? ""}
              onChange={(e) => onField("occupation", e.target.value)}
            />
          </Field>
          <Field label="Байгууллага">
            <input
              className="form-input"
              value={form.organization ?? ""}
              onChange={(e) => onField("organization", e.target.value)}
            />
          </Field>
          <Field label="Эрсдлийн түвшин">
            <select
              className="form-input"
              value={form.riskLevel ?? "UNKNOWN"}
              onChange={(e) =>
                onField("riskLevel", e.target.value as RiskLevel)
              }
            >
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{marginTop: 12}}>
          <Field label="Тэмдэглэл">
            <textarea
              className="form-input"
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => onField("notes", e.target.value)}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({label, children}: {label: string; children: React.ReactNode}) {
  return (
    <div>
      <label className="form-label">{label}</label>
      {children}
    </div>
  );
}

interface DetailProps {
  suspect: SuspectDetail;
  loading: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddAccount: (input: Record<string, unknown>) => void;
  onAddPhone: (input: Record<string, unknown>) => void;
}

interface DwellZone {
  displayName: string;
  hits: number;
  hoursDistribution: number[];
}
interface AccessLog {
  id: number;
  timestamp: string;
  accountOrUserId: string;
  ipAddress: string | null;
  deviceModel: string | null;
  os: string | null;
  source: string;
}

function topHoursLabel(hours: number[]): string {
  const top = hours
    .map((c, h) => ({h, c}))
    .filter((x) => x.c > 0)
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .map((x) => `${String(x.h).padStart(2, "0")}:00`);
  return top.length === 0 ? "—" : top.join(", ");
}

function SuspectDetailPanel(props: DetailProps) {
  const {suspect, loading, onEdit, onDelete, onAddAccount, onAddPhone} = props;
  const dwellQ = useQuery<{dwellZones: DwellZone[]}>(DWELL_ZONES,
    {variables: {suspectId: suspect.id}});
  const accessQ = useQuery<{accessLogEntries: AccessLog[]}>(
    SUSPECT_ACCESS_LOGS, {variables: {suspectId: suspect.id}});
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [acct, setAcct] = useState({accountNumber: "", bankName: "",
    accountType: "Current", currency: "MNT", currentBalance: ""});
  const [phone, setPhone] = useState({number: "", provider: "",
    phoneType: "Mobile"});

  function submitAccount() {
    if (!acct.accountNumber.trim()) return;
    onAddAccount({
      accountNumber: acct.accountNumber, bankName: acct.bankName || null,
      accountType: acct.accountType, currency: acct.currency,
      currentBalance: acct.currentBalance ? Number(acct.currentBalance) : 0,
    });
    setAcct({accountNumber: "", bankName: "", accountType: "Current",
      currency: "MNT", currentBalance: ""});
    setShowAccountForm(false);
  }

  function submitPhone() {
    if (!phone.number.trim()) return;
    onAddPhone({
      number: phone.number, provider: phone.provider || null,
      phoneType: phone.phoneType,
    });
    setPhone({number: "", provider: "", phoneType: "Mobile"});
    setShowPhoneForm(false);
  }

  return (
    <>
      <div className="card" style={{marginBottom: 16}}>
        <div className="card-header">
          <span className="card-title">{suspect.fullName}</span>
          <div className="toolbar">
            <button className="btn" onClick={onEdit}>
              ЗАСАХ
            </button>
            <button className="btn btn-danger" onClick={onDelete}>
              УСТГАХ
            </button>
          </div>
        </div>
        <div className="card-body">
          <div style={{display: "flex", gap: 16, marginBottom: 16}}>
            {suspect.photoData ? (
              <img
                src={suspect.photoData}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 8,
                  objectFit: "cover",
                  border: "1px solid var(--border-primary)",
                }}
              />
            ) : (
              <div className={`avatar ${riskClass(suspect.riskLevel)}`}
                style={{width: 96, height: 96, fontSize: 32}}>
                {suspect.initials}
              </div>
            )}
            <div style={{flex: 1}}>
              <InfoRow label="ID" value={suspect.suspectId} />
              <InfoRow
                label="Эрсдэл"
                value={
                  <span className={`badge ${riskClass(suspect.riskLevel)}`}>
                    {suspect.riskLevel}
                  </span>
                }
              />
              <InfoRow label="Нас" value={suspect.age ? String(suspect.age) : "—"} />
              <InfoRow label="Хүйс" value={suspect.gender ?? "—"} />
              <InfoRow label="Утас" value={suspect.primaryPhone ?? "—"} />
              <InfoRow label="И-мэйл" value={suspect.email ?? "—"} />
              <InfoRow
                label="Байршил"
                value={[suspect.city, suspect.country]
                  .filter(Boolean)
                  .join(", ") || "—"}
              />
              <InfoRow label="Мэргэжил" value={suspect.occupation ?? "—"} />
            </div>
          </div>
          {suspect.notes && (
            <div style={{fontSize: 12, color: "var(--text-secondary)"}}>
              {suspect.notes}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{marginBottom: 16}}>
        <div className="card-header">
          <span className="card-title">
            Банкны данс ({suspect.bankAccounts.length}) · Гүйлгээ:{" "}
            {suspect.recordCounts.transactionCount} · Дуудлага:{" "}
            {suspect.recordCounts.callRecordCount}
          </span>
          <div className="toolbar">
            <button className="btn"
              onClick={() => setShowAccountForm((v) => !v)}>
              + ДАНС
            </button>
          </div>
        </div>
        {showAccountForm && (
          <div className="card-body" style={{display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
            borderBottom: "1px solid var(--border-primary)"}}>
            <input className="form-input" placeholder="Дансны дугаар"
              value={acct.accountNumber}
              onChange={(e) => setAcct({...acct, accountNumber: e.target.value})} />
            <input className="form-input" placeholder="Банк"
              value={acct.bankName}
              onChange={(e) => setAcct({...acct, bankName: e.target.value})} />
            <input className="form-input" placeholder="Үлдэгдэл" type="number"
              value={acct.currentBalance}
              onChange={(e) => setAcct({...acct, currentBalance: e.target.value})} />
            <button className="btn btn-success" onClick={submitAccount}>
              ҮҮСГЭХ
            </button>
          </div>
        )}
        <div className="card-body no-padding">
          {loading ? (
            <div className="empty-state">
              <div className="loading-spinner" style={{margin: "0 auto"}} />
            </div>
          ) : suspect.bankAccounts.length === 0 ? (
            <div className="empty-state">
              <div className="message">Данс бүртгэгдээгүй</div>
            </div>
          ) : (
            <table className="data-grid" style={{width: "100%"}}>
              <thead>
                <tr>
                  <th>Данс</th>
                  <th>Банк</th>
                  <th>Төрөл</th>
                  <th>Үлдэгдэл</th>
                  <th>Төлөв</th>
                </tr>
              </thead>
              <tbody>
                {suspect.bankAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.maskedNumber}</td>
                    <td>{a.bankName ?? "—"}</td>
                    <td>{a.accountType}</td>
                    <td>
                      {a.currentBalance.toLocaleString()} {a.currency}
                    </td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Утасны дугаар ({suspect.phoneNumbers.length})
          </span>
          <div className="toolbar">
            <button className="btn"
              onClick={() => setShowPhoneForm((v) => !v)}>
              + УТАС
            </button>
          </div>
        </div>
        {showPhoneForm && (
          <div className="card-body" style={{display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr", gap: 10,
            borderBottom: "1px solid var(--border-primary)"}}>
            <input className="form-input" placeholder="Дугаар"
              value={phone.number}
              onChange={(e) => setPhone({...phone, number: e.target.value})} />
            <input className="form-input" placeholder="Оператор"
              value={phone.provider}
              onChange={(e) => setPhone({...phone, provider: e.target.value})} />
            <button className="btn btn-success" onClick={submitPhone}>
              ҮҮСГЭХ
            </button>
          </div>
        )}
        <div className="card-body no-padding">
          {suspect.phoneNumbers.length === 0 ? (
            <div className="empty-state">
              <div className="message">Утас бүртгэгдээгүй</div>
            </div>
          ) : (
            <table className="data-grid" style={{width: "100%"}}>
              <thead>
                <tr>
                  <th>Дугаар</th>
                  <th>Оператор</th>
                  <th>Төрөл</th>
                  <th>Төлөв</th>
                </tr>
              </thead>
              <tbody>
                {suspect.phoneNumbers.map((p) => (
                  <tr key={p.id}>
                    <td>{p.number}</td>
                    <td>{p.provider ?? "—"}</td>
                    <td>{p.phoneType}</td>
                    <td>{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{marginTop: 16}}>
        <div className="card-header">
          <span className="card-title">
            Байршлын бөөгнөрөл ({dwellQ.data?.dwellZones.length ?? 0})
          </span>
        </div>
        <div className="card-body no-padding">
          {(dwellQ.data?.dwellZones.length ?? 0) === 0 ? (
            <div className="empty-state">
              <div className="message">Байршлын мэдээлэл алга</div>
            </div>
          ) : (
            <table className="data-grid" style={{width: "100%"}}>
              <thead>
                <tr><th>Газар</th><th>Тоо</th><th>Идэвхтэй цаг</th></tr>
              </thead>
              <tbody>
                {dwellQ.data!.dwellZones.map((z, i) => (
                  <tr key={i}>
                    <td>{z.displayName}</td>
                    <td>{z.hits}</td>
                    <td>{topHoursLabel(z.hoursDistribution)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{marginTop: 16}}>
        <div className="card-header">
          <span className="card-title">
            Хандалтын лог ({accessQ.data?.accessLogEntries.length ?? 0})
          </span>
        </div>
        <div className="card-body no-padding">
          {(accessQ.data?.accessLogEntries.length ?? 0) === 0 ? (
            <div className="empty-state">
              <div className="message">Хандалтын бүртгэл алга</div>
            </div>
          ) : (
            <table className="data-grid" style={{width: "100%"}}>
              <thead>
                <tr><th>Огноо</th><th>IP</th><th>Төхөөрөмж</th>
                  <th>OS</th><th>Эх сурвалж</th></tr>
              </thead>
              <tbody>
                {accessQ.data!.accessLogEntries.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDateTime(a.timestamp)}</td>
                    <td>{a.ipAddress ?? "—"}</td>
                    <td>{a.deviceModel ?? "—"}</td>
                    <td>{a.os ?? "—"}</td>
                    <td>{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <div style={{display: "flex", gap: 8, fontSize: 12, marginBottom: 4}}>
      <span style={{color: "var(--text-muted)", width: 80}}>{label}</span>
      <span style={{color: "var(--text-primary)"}}>{value}</span>
    </div>
  );
}
