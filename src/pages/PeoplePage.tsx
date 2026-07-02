/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : PeoplePage.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : autopilot
 * Purpose     : Global people database — THE person surface of the app.
 *               Every human across every case in one master-detail view:
 *               duplicated records grouped by identity, full profile,
 *               person management (create/edit/delete, phones, accounts)
 *               and evidence tagging into the active case.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CREATE_BANK_ACCOUNT,
  CREATE_PHONE_NUMBER,
  GLOBAL_PEOPLE_QUERY,
  TAG_EVIDENCE,
} from "../graphql/queries";
import {
  CREATE_SUSPECT,
  DELETE_SUSPECT,
  UPDATE_SUSPECT,
} from "../graphql/suspects";
import {
  Badge,
  Card,
  DataTable,
  Empty,
  Loading,
  MetricsGrid,
  PageHeader,
  StatCard,
} from "../components/kit";
import {Select} from "../components/inputs";
import type {RiskLevel, SuspectInput, SuspectStatus} from "../types";

interface PersonSuspect {
  id             : number;
  suspectId      : string;
  fullName       : string;
  aliases        : string | null;
  nationalId     : string | null;
  passportNumber : string | null;
  dateOfBirth    : string | null;
  gender         : string | null;
  address        : string | null;
  city           : string | null;
  country        : string | null;
  primaryPhone   : string | null;
  email          : string | null;
  occupation     : string | null;
  organization   : string | null;
  riskLevel      : RiskLevel;
  notes          : string | null;
  photoData      : string | null;
  status         : SuspectStatus;
  createdAt      : string;
  age            : number;
}

interface PersonCaseRef {
  suspectId     : number;
  exhibitNumber : number;
  severity      : string;
  taggedAtUtc   : string;
  caseFile: {
    id       : number;
    caseId   : string;
    caseName : string;
    status   : string;
    priority : string;
  };
}

interface GlobalPerson {
  key              : string;
  fullName         : string;
  aliases          : string[];
  riskLevel        : string;
  photoData        : string | null;
  occupation       : string | null;
  nationalId       : string | null;
  matchedBy        : string[];
  suspects         : PersonSuspect[];
  cases            : PersonCaseRef[];
  phoneNumbers     : string[];
  accountNumbers   : string[];
  transactionCount : number;
  callRecordCount  : number;
}

const RISK_LEVELS: RiskLevel[] = [
  "UNKNOWN", "LOW", "MEDIUM", "HIGH", "CRITICAL",
];

const RISK_BADGE: Record<string, string> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
  UNKNOWN: "unknown",
};

const RISK_COLOR: Record<string, string> = {
  LOW: "var(--accent-green)",
  MEDIUM: "var(--accent-amber, #FFB300)",
  HIGH: "var(--accent-red)",
  CRITICAL: "var(--accent-red)",
  UNKNOWN: "var(--border-secondary)",
};

const STATUS_BADGE: Record<string, string> = {
  OPEN: "info",
  ACTIVE: "low",
  CLOSED: "unknown",
  ARCHIVED: "warning",
  UNKNOWN: "unknown",
};

const MATCH_LABEL: Record<string, string> = {
  NAME: "Нэр давхцсан",
  PHONE: "Утас давхцсан",
  NATIONAL_ID: "РД давхцсан",
};

interface FormState extends SuspectInput {
  id?: number;
}

const EMPTY_FORM: FormState = {
  fullName: "",
  gender: "Male",
  riskLevel: "UNKNOWN",
};

// Downscale the chosen image to a 256x256 JPEG data-URI (keeps the DB small).
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

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({name, photoData, riskLevel, lg}: {
  name: string;
  photoData: string | null;
  riskLevel: string;
  lg?: boolean;
}) {
  return (
    <div className={lg ? "person-avatar lg" : "person-avatar"}
      style={{borderColor: RISK_COLOR[riskLevel] ?? "var(--border-secondary)"}}>
      {photoData ? <img src={photoData} alt={name} /> : initials(name)}
    </div>
  );
}

function InfoField({label, value}: {label: string; value: string | null}) {
  return (
    <div>
      <div style={{fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase",
        color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        marginBottom: 3}}>
        {label}
      </div>
      <div style={{fontSize: 12, color: value ? "var(--text-primary)"
        : "var(--text-muted)"}}>
        {value || "—"}
      </div>
    </div>
  );
}

export default function PeoplePage() {
  const {data, loading, error, refetch} =
    useQuery<{globalPeople: GlobalPerson[]}>(GLOBAL_PEOPLE_QUERY);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [acct, setAcct] = useState({accountNumber: "", bankName: "",
    currentBalance: ""});
  const [phone, setPhone] = useState({number: "", provider: ""});

  const [createSuspect] = useMutation(CREATE_SUSPECT);
  const [updateSuspect] = useMutation(UPDATE_SUSPECT);
  const [deleteSuspect] = useMutation(DELETE_SUSPECT);
  const [createBankAccount] = useMutation(CREATE_BANK_ACCOUNT);
  const [createPhoneNumber] = useMutation(CREATE_PHONE_NUMBER);
  const [tagEvidence] = useMutation(TAG_EVIDENCE);

  // Evidence tagging follows the case picked in the global AppHeader.
  interface CaseRef {id: number; caseId: string; caseName: string}
  const caseQ = useQuery<{activeCase: CaseRef | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;

  const people = useMemo(() => data?.globalPeople ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.aliases.some((a) => a.toLowerCase().includes(q)) ||
      p.phoneNumbers.some((n) => n.toLowerCase().includes(q)) ||
      p.accountNumbers.some((n) => n.toLowerCase().includes(q)) ||
      (p.nationalId ?? "").toLowerCase().includes(q));
  }, [people, search]);

  const selected =
    filtered.find((p) => p.key === selectedKey) ?? filtered[0] ?? null;
  // Management actions operate on the person's primary (first) record.
  const primary = selected?.suspects[0] ?? null;
  const activeCaseRef = selected && activeCase
    ? selected.cases.find((c) => c.caseFile.id === activeCase.id) ?? null
    : null;

  function startAdd() {
    setForm({...EMPTY_FORM});
    setFormError("");
    setIsEditing(false);
    setShowForm(true);
  }

  function startEdit(s: PersonSuspect) {
    setForm({
      id             : s.id,
      fullName       : s.fullName,
      aliases        : s.aliases,
      nationalId     : s.nationalId,
      passportNumber : s.passportNumber,
      dateOfBirth    : s.dateOfBirth,
      gender         : s.gender ?? "Male",
      address        : s.address,
      city           : s.city,
      country        : s.country,
      primaryPhone   : s.primaryPhone,
      email          : s.email,
      occupation     : s.occupation,
      organization   : s.organization,
      riskLevel      : s.riskLevel,
      notes          : s.notes,
      photoData      : s.photoData,
      status         : s.status,
    });
    setFormError("");
    setIsEditing(true);
    setShowForm(true);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({...f, [key]: value}));
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

  async function savePerson() {
    setFormError("");
    if (!form.fullName.trim()) {
      setFormError("Бүтэн нэр заавал бөглөх");
      return;
    }
    const {id, ...input} = form;
    try {
      if (isEditing && id !== undefined) {
        await updateSuspect({variables: {id, input}});
      } else {
        await createSuspect({variables: {input}});
      }
      await refetch();
      setShowForm(false);
    } catch (err) {
      setFormError(String(err));
    }
  }

  async function deleteRecord(s: PersonSuspect) {
    const ok = window.confirm(`'${s.fullName}' бүртгэлийг устгах уу?`);
    if (!ok) return;
    await deleteSuspect({variables: {id: s.id}});
    await refetch();
  }

  async function tagIntoActiveCase() {
    if (!activeCase || !primary || !selected) return;
    await tagEvidence({
      variables: {
        caseFileId: activeCase.id,
        sourceType: "SUSPECT",
        sourceId: primary.id,
        description:
          `${primary.suspectId} — ${primary.fullName} (${selected.riskLevel})`,
        severity: selected.riskLevel === "CRITICAL" ? "CRITICAL"
          : selected.riskLevel === "HIGH" ? "HIGH"
          : selected.riskLevel === "MEDIUM" ? "MEDIUM" : "INFO",
      },
    });
    await refetch();
  }

  async function submitAccount() {
    if (!primary || !acct.accountNumber.trim()) return;
    await createBankAccount({variables: {input: {
      accountNumber: acct.accountNumber,
      bankName: acct.bankName || null,
      currentBalance: acct.currentBalance
        ? Number(acct.currentBalance) : undefined,
      suspectId: primary.id,
    }}});
    setAcct({accountNumber: "", bankName: "", currentBalance: ""});
    setShowAccountForm(false);
    await refetch();
  }

  async function submitPhone() {
    if (!primary || !phone.number.trim()) return;
    await createPhoneNumber({variables: {input: {
      number: phone.number,
      provider: phone.provider || null,
      suspectId: primary.id,
    }}});
    setPhone({number: "", provider: ""});
    setShowPhoneForm(false);
    await refetch();
  }

  const header = (
    <PageHeader icon={"\u{1F465}"} title="Хүмүүсийн сан"
      subtitle="КЕЙС ДАМНАСАН ХҮМҮҮСИЙН НЭГДСЭН БҮРТГЭЛ"
      actions={
        <button className="btn btn-accent" onClick={startAdd}>
          + ХҮН НЭМЭХ
        </button>
      } />
  );

  if (loading) {
    return <div className="page-container">{header}<Loading /></div>;
  }
  if (error) {
    return (
      <div className="page-container">
        {header}
        <Empty message={`Алдаа гарлаа: ${error.message}`} />
      </div>
    );
  }

  const crossCase = people.filter((p) => p.cases.length > 1).length;
  const grouped = people.filter((p) => p.suspects.length > 1).length;
  const highRisk = people.filter((p) =>
    p.riskLevel === "HIGH" || p.riskLevel === "CRITICAL").length;

  return (
    <div className="page-container">
      {header}

      <MetricsGrid>
        <StatCard label="Нийт хүн" value={people.length} color="cyan" />
        <StatCard label="Олон кейст оролцсон" value={crossCase}
          color="amber" />
        <StatCard label="Давхардсан бүртгэлтэй" value={grouped}
          color="purple" />
        <StatCard label="Өндөр эрсдэлтэй" value={highRisk} color="red" />
      </MetricsGrid>

      {people.length === 0 ? (
        <div style={{marginTop: 16}}>
          <Empty message="Бүртгэлтэй хүн алга — «+ ХҮН НЭМЭХ» дарж эхэлнэ үү" />
        </div>
      ) : (
        <div className="master-detail" style={{marginTop: 16}}>
          <Card noPadding>
            <div style={{padding: 12,
              borderBottom: "1px solid var(--border-primary)"}}>
              <input className="form-input" style={{width: "100%"}}
                placeholder="Нэр, утас, данс, РД-гаар хайх..."
                value={search}
                onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div style={{maxHeight: "62vh", overflowY: "auto"}}>
              {filtered.length === 0 ? (
                <Empty message="Хайлтад тохирох хүн олдсонгүй" />
              ) : filtered.map((p) => (
                <div key={p.key}
                  className={`person-row${
                    selected?.key === p.key ? " selected" : ""}`}
                  onClick={() => setSelectedKey(p.key)}>
                  <Avatar name={p.fullName} photoData={p.photoData}
                    riskLevel={p.riskLevel} />
                  <div style={{flex: 1, minWidth: 0}}>
                    <div style={{fontSize: 12, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap"}}>
                      {p.fullName}
                    </div>
                    <div style={{fontSize: 10,
                      color: "var(--text-muted)", marginTop: 2}}>
                      {p.phoneNumbers[0] ?? p.occupation ?? "—"}
                    </div>
                  </div>
                  <div style={{display: "flex", gap: 4, flexShrink: 0}}>
                    {p.suspects.length > 1 && (
                      <span className="badge info"
                        title="Хэд хэдэн бүртгэл нэг хүнд нэгтгэгдсэн">
                        {p.suspects.length} бүртгэл
                      </span>
                    )}
                    <span className={`badge ${
                      p.cases.length > 1 ? "warning" : "unknown"}`}>
                      {p.cases.length} кейс
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {selected && primary ? (
            <div style={{minWidth: 0}}>
              <Card style={{marginBottom: 16}}>
                <div style={{display: "flex", gap: 20,
                  alignItems: "flex-start", flexWrap: "wrap"}}>
                  <Avatar name={selected.fullName}
                    photoData={selected.photoData}
                    riskLevel={selected.riskLevel} lg />
                  <div style={{flex: 1, minWidth: 260}}>
                    <div style={{display: "flex", alignItems: "center",
                      gap: 10, flexWrap: "wrap"}}>
                      <span style={{fontSize: 18, fontWeight: 700}}>
                        {selected.fullName}
                      </span>
                      <Badge text={selected.riskLevel}
                        kind={RISK_BADGE[selected.riskLevel] ?? "unknown"} />
                      {selected.matchedBy.map((m) => (
                        <span key={m} className="badge info">
                          {MATCH_LABEL[m] ?? m}
                        </span>
                      ))}
                    </div>
                    {selected.aliases.length > 0 && (
                      <div style={{fontSize: 11,
                        color: "var(--text-muted)", marginTop: 4}}>
                        Өөр нэр: {selected.aliases.join(", ")}
                      </div>
                    )}
                    <div style={{display: "grid", gap: "12px 20px",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(160px, 1fr))",
                      marginTop: 14}}>
                      <InfoField label="Регистр" value={primary.nationalId} />
                      <InfoField label="Утас" value={primary.primaryPhone} />
                      <InfoField label="И-мэйл" value={primary.email} />
                      <InfoField label="Ажил мэргэжил"
                        value={primary.occupation} />
                      <InfoField label="Байгууллага"
                        value={primary.organization} />
                      <InfoField label="Хаяг" value={
                        [primary.address, primary.city]
                          .filter(Boolean).join(", ") || null} />
                    </div>
                    {primary.notes && (
                      <div style={{fontSize: 11, marginTop: 12,
                        padding: "8px 10px",
                        borderLeft: "2px solid var(--accent-cyan)",
                        background: "rgba(0,229,255,0.04)",
                        color: "var(--text-secondary)"}}>
                        {primary.notes}
                      </div>
                    )}
                  </div>
                  <div className="toolbar">
                    {activeCase && (
                      activeCaseRef ? (
                        <span className="badge low"
                          title={`Идэвхтэй кейст №${
                            activeCaseRef.exhibitNumber} нотлох баримт`}>
                          НОТЛОХ БАРИМТ №{activeCaseRef.exhibitNumber}
                        </span>
                      ) : (
                        <button className="btn btn-accent"
                          title={`«${activeCase.caseName}» кейст нотлох баримт болгох`}
                          onClick={tagIntoActiveCase}>
                          КЕЙСТ ТЭМДЭГЛЭХ
                        </button>
                      )
                    )}
                    <button className="btn" onClick={() => startEdit(primary)}>
                      ЗАСАХ
                    </button>
                    {selected.suspects.length === 1 && (
                      <button className="btn btn-danger"
                        onClick={() => deleteRecord(primary)}>
                        УСТГАХ
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              <MetricsGrid>
                <StatCard label="Кейс" value={selected.cases.length}
                  color="cyan" />
                <StatCard label="Бүртгэл" value={selected.suspects.length}
                  color="purple" />
                <StatCard label="Гүйлгээ" value={selected.transactionCount}
                  color="green" />
                <StatCard label="Дуудлага" value={selected.callRecordCount}
                  color="amber" />
              </MetricsGrid>

              <Card title="Холбогдсон кейсүүд" noPadding
                style={{marginTop: 16}}>
                <DataTable<PersonCaseRef>
                  rows={selected.cases}
                  rowKey={(r) => r.caseFile.id}
                  empty="Нотлох баримтаар кейст холбогдоогүй байна"
                  columns={[
                    {header: "Кейс", render: (r) => (
                      <span style={{fontWeight: 600}}>
                        {r.caseFile.caseName}
                      </span>
                    )},
                    {header: "Дугаар", render: (r) => (
                      <span style={{fontFamily: "var(--font-mono)",
                        fontSize: 11}}>{r.caseFile.caseId}</span>
                    )},
                    {header: "Статус", render: (r) => (
                      <span className={`badge ${
                        STATUS_BADGE[r.caseFile.status] ?? "unknown"}`}>
                        {r.caseFile.status}
                      </span>
                    )},
                    {header: "Нотлох баримт", align: "right", render: (r) => (
                      <span style={{fontFamily: "var(--font-mono)",
                        fontSize: 11}}>№{r.exhibitNumber}</span>
                    )},
                  ]} />
              </Card>

              <div className="grid-2" style={{marginTop: 16}}>
                <Card title={`Утасны дугаар (${selected.phoneNumbers.length})`}
                  actions={
                    <button className="btn"
                      onClick={() => setShowPhoneForm((v) => !v)}>
                      + УТАС
                    </button>
                  }>
                  {showPhoneForm && (
                    <div style={{display: "grid", gap: 8, marginBottom: 12,
                      gridTemplateColumns: "1fr 1fr auto"}}>
                      <input className="form-input" placeholder="Дугаар"
                        value={phone.number}
                        onChange={(e) =>
                          setPhone({...phone, number: e.target.value})} />
                      <input className="form-input" placeholder="Оператор"
                        value={phone.provider}
                        onChange={(e) =>
                          setPhone({...phone, provider: e.target.value})} />
                      <button className="btn btn-accent" onClick={submitPhone}>
                        ҮҮСГЭХ
                      </button>
                    </div>
                  )}
                  {selected.phoneNumbers.length === 0
                    ? <Empty message="Утасны дугаар алга" />
                    : (
                      <div style={{display: "flex", gap: 6,
                        flexWrap: "wrap"}}>
                        {selected.phoneNumbers.map((n) => (
                          <span key={n} className="id-chip">{n}</span>
                        ))}
                      </div>
                    )}
                </Card>
                <Card title={`Банкны данс (${selected.accountNumbers.length})`}
                  actions={
                    <button className="btn"
                      onClick={() => setShowAccountForm((v) => !v)}>
                      + ДАНС
                    </button>
                  }>
                  {showAccountForm && (
                    <div style={{display: "grid", gap: 8, marginBottom: 12,
                      gridTemplateColumns: "1fr 1fr auto"}}>
                      <input className="form-input"
                        placeholder="Дансны дугаар"
                        value={acct.accountNumber}
                        onChange={(e) => setAcct({...acct,
                          accountNumber: e.target.value})} />
                      <input className="form-input" placeholder="Банк"
                        value={acct.bankName}
                        onChange={(e) => setAcct({...acct,
                          bankName: e.target.value})} />
                      <button className="btn btn-accent"
                        onClick={submitAccount}>
                        ҮҮСГЭХ
                      </button>
                    </div>
                  )}
                  {selected.accountNumbers.length === 0
                    ? <Empty message="Банкны данс алга" />
                    : (
                      <div style={{display: "flex", gap: 6,
                        flexWrap: "wrap"}}>
                        {selected.accountNumbers.map((n) => (
                          <span key={n} className="id-chip">{n}</span>
                        ))}
                      </div>
                    )}
                </Card>
              </div>

              {selected.suspects.length > 1 && (
                <Card title="Нэгтгэгдсэн бүртгэлүүд" noPadding
                  style={{marginTop: 16}}>
                  <DataTable<PersonSuspect>
                    rows={selected.suspects}
                    rowKey={(r) => r.id}
                    columns={[
                      {header: "Код", render: (r) => (
                        <span style={{fontFamily: "var(--font-mono)",
                          fontSize: 11}}>{r.suspectId}</span>
                      )},
                      {header: "Нэр", render: (r) => r.fullName},
                      {header: "Утас", render: (r) =>
                        r.primaryPhone ?? "—"},
                      {header: "Байгууллага", render: (r) =>
                        r.organization ?? r.occupation ?? "—"},
                      {header: "Эрсдэл", render: (r) => (
                        <span className={`badge ${
                          RISK_BADGE[r.riskLevel] ?? "unknown"}`}>
                          {r.riskLevel}
                        </span>
                      )},
                      {header: "", align: "right", render: (r) => (
                        <span style={{display: "inline-flex", gap: 6}}>
                          <button className="btn btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEdit(r);
                            }}>
                            ЗАСАХ
                          </button>
                          <button className="btn btn-sm btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRecord(r);
                            }}>
                            УСТГАХ
                          </button>
                        </span>
                      )},
                    ]} />
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <Empty message="Зүүн жагсаалтаас хүн сонгоно уу" />
            </Card>
          )}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" style={{maxWidth: 640}}
            onClick={(e) => e.stopPropagation()}>
            <div style={{fontSize: 14, fontWeight: 700, marginBottom: 16}}>
              {isEditing ? "МЭДЭЭЛЭЛ ЗАСАХ" : "ШИНЭ ХҮН НЭМЭХ"}
            </div>
            <div style={{display: "grid", gap: 12,
              gridTemplateColumns: "1fr 1fr"}}>
              <div style={{gridColumn: "1 / -1"}}>
                <label className="form-label">Бүтэн нэр *</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.fullName}
                  onChange={(e) => setField("fullName", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Өөр нэр</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.aliases ?? ""}
                  onChange={(e) => setField("aliases", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Регистрийн дугаар</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.nationalId ?? ""}
                  onChange={(e) => setField("nationalId", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Утас</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.primaryPhone ?? ""}
                  onChange={(e) => setField("primaryPhone", e.target.value)} />
              </div>
              <div>
                <label className="form-label">И-мэйл</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.email ?? ""}
                  onChange={(e) => setField("email", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Ажил мэргэжил</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.occupation ?? ""}
                  onChange={(e) => setField("occupation", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Байгууллага</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.organization ?? ""}
                  onChange={(e) => setField("organization", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Хаяг</label>
                <input className="form-input" style={{width: "100%"}}
                  value={form.address ?? ""}
                  onChange={(e) => setField("address", e.target.value)} />
              </div>
              <div>
                <label className="form-label">Эрсдэлийн түвшин</label>
                <Select style={{width: "100%"}}
                  value={form.riskLevel ?? "UNKNOWN"}
                  onChange={(v) => setField("riskLevel", v as RiskLevel)}
                  options={RISK_LEVELS.map((r) => ({value: r, label: r}))} />
              </div>
              <div style={{gridColumn: "1 / -1"}}>
                <label className="form-label">Тэмдэглэл</label>
                <textarea className="form-input"
                  style={{width: "100%", minHeight: 60, resize: "vertical"}}
                  value={form.notes ?? ""}
                  onChange={(e) => setField("notes", e.target.value)} />
              </div>
              <div style={{gridColumn: "1 / -1"}}>
                <label className="form-label">
                  Зураг (холбоосын зураглалд ашиглана)
                </label>
                <div style={{display: "flex", gap: 12,
                  alignItems: "center"}}>
                  {form.photoData && (
                    <div className="person-avatar lg">
                      <img src={form.photoData} alt="preview" />
                    </div>
                  )}
                  <input type="file" accept="image/*" className="form-input"
                    style={{flex: 1}} onChange={onPhotoSelected} />
                  {form.photoData && (
                    <button type="button" className="btn"
                      onClick={() => setField("photoData", null)}>
                      Зураг устгах
                    </button>
                  )}
                </div>
              </div>
            </div>
            {formError && (
              <div style={{color: "var(--accent-red)", fontSize: 11,
                marginTop: 12}}>
                {formError}
              </div>
            )}
            <div className="modal-actions" style={{marginTop: 20}}>
              <button className="btn" onClick={() => setShowForm(false)}>
                ЦУЦЛАХ
              </button>
              <button className="btn btn-accent" onClick={savePerson}>
                {isEditing ? "ШИНЭЧЛЭХ" : "ҮҮСГЭХ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
