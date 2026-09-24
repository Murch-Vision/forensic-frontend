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
import {useSearchParams} from "react-router-dom";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CREATE_BANK_ACCOUNT,
  CREATE_PHONE_NUMBER,
  GLOBAL_PEOPLE_QUERY,
  MARK_AS_SUSPECT,
  TAG_EVIDENCE,
  VERIFY_BANK_ACCOUNT,
} from "../graphql/queries";
import {DELETE_SUSPECT} from "../graphql/suspects";
import {
  Badge,
  Card,
  DataTable,
  Empty,
  Loading,
  OffenderTag,
  PageHeader,
} from "../components/kit";
import PersonFormModal, {type PersonForm} from "../components/PersonFormModal";
import {Select} from "../components/inputs";
import {useDrilldown} from "../lib/drilldown";
import {describeAccount, isNumberLikeName, type StoredBankAccount}
  from "../lib/iban";
import {BankAccountInfo} from "../components/BankAccountInfo";
import type {RiskLevel, SuspectStatus} from "../types";

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
  // Хэрэгтний бүртгэлд регистрээр нь таарсан эсэх.
  offender         : boolean;
  matchedBy        : string[];
  suspects         : PersonSuspect[];
  cases            : PersonCaseRef[];
  phoneNumbers     : string[];
  accountNumbers   : string[];
  bankAccounts     : StoredBankAccount[];
  transactionCount : number;
  callRecordCount  : number;
}

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

const RISK_LABELS: Record<RiskLevel, string> = {
  UNKNOWN: "Тодорхойгүй",
  LOW: "Бага",
  MEDIUM: "Дунд",
  HIGH: "Өндөр",
  CRITICAL: "Маш өндөр",
};

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({name, photoData, riskLevel, lg, xl}: {
  name: string;
  photoData: string | null;
  riskLevel: string;
  lg?: boolean;
  xl?: boolean;
}) {
  return (
    <div className={xl ? "person-avatar xl"
      : lg ? "person-avatar lg" : "person-avatar"}
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
      <div style={{fontSize: 13, color: value ? "var(--text-primary)"
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
  const [caseFilter, setCaseFilter] = useState(0);
  const [params, setParams] = useSearchParams();
  const requestedGroup = params.get("group") ?? "all";
  const groupFilter = ["offender", "other", "high-risk"].includes(requestedGroup)
    ? requestedGroup : "all";
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  // Prefilled form when editing an existing record; null = adding a new person.
  const [formInitial, setFormInitial] = useState<PersonForm | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);
  const [acct, setAcct] = useState({accountNumber: "", bankName: "",
    currentBalance: ""});
  const [phone, setPhone] = useState({number: "", provider: ""});

  const [deleteSuspect] = useMutation(DELETE_SUSPECT);
  const [createBankAccount] = useMutation(CREATE_BANK_ACCOUNT);
  const [createPhoneNumber] = useMutation(CREATE_PHONE_NUMBER);
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  const [markAsSuspect, markQ] = useMutation(MARK_AS_SUSPECT);
  const [verifyBankAccount] = useMutation<{verifyBankAccount: {found: boolean}}>(
    VERIFY_BANK_ACCOUNT);
  // Bulk IBAN check: progress while running, the outcome afterwards.
  const [bulk, setBulk] = useState<{done: number; total: number} | null>(null);
  const [bulkMessage, setBulkMessage] = useState("");

  // Evidence tagging follows the case picked in the global AppHeader.
  interface CaseRef {id: number; caseId: string; caseName: string}
  const caseQ = useQuery<{activeCase: CaseRef | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;

  const people = useMemo(() => data?.globalPeople ?? [], [data]);
  const bankOptions = useMemo(() => {
    const banks = new Map<string, string>();
    for (const person of people) {
      for (const account of person.bankAccounts) {
        const bank = describeAccount(account);
        if (bank.bankName) banks.set(bank.bankCode ?? bank.bankName, bank.bankName);
      }
    }
    return [...banks].map(([value, label]) => ({value, label}))
      .sort((a, b) => a.label.localeCompare(b.label, "mn"));
  }, [people]);
  const requestedBank = params.get("bank") ?? "all";
  const bankFilter = requestedBank === "unknown"
    || bankOptions.some((bank) => bank.value === requestedBank)
    ? requestedBank : "all";

  // Distinct cases present across everyone, with a per-case headcount, for the
  // case filter dropdown.
  const caseOptions = useMemo(() => {
    const m = new Map<number, {name: string; count: number}>();
    for (const p of people) {
      const seen = new Set<number>();
      for (const c of p.cases) {
        if (seen.has(c.caseFile.id)) continue;
        seen.add(c.caseFile.id);
        const e = m.get(c.caseFile.id);
        if (e) e.count++;
        else m.set(c.caseFile.id,
          {name: c.caseFile.caseName || c.caseFile.caseId, count: 1});
      }
    }
    return [...m.entries()].map(([id, v]) => ({id, ...v}))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (bankFilter !== "all" && !p.bankAccounts.some((account) => {
        const bank = describeAccount(account);
        return bankFilter === "unknown" ? !bank.bankName
          : (bank.bankCode ?? bank.bankName) === bankFilter;
      })) return false;
      if (groupFilter === "offender" && !p.offender) return false;
      if (groupFilter === "other" && p.offender) return false;
      if (groupFilter === "high-risk"
        && p.riskLevel !== "HIGH" && p.riskLevel !== "CRITICAL") return false;
      if (caseFilter
        && !p.cases.some((c) => c.caseFile.id === caseFilter)) return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q)) ||
        p.phoneNumbers.some((n) => n.toLowerCase().includes(q)) ||
        p.accountNumbers.some((n) => n.toLowerCase().includes(q)) ||
        p.bankAccounts.some((a) => (a.iban ?? "").toLowerCase().includes(q)) ||
        (p.nationalId ?? "").toLowerCase().includes(q));
    });
  }, [people, search, caseFilter, groupFilter, bankFilter]);

  const selected =
    filtered.find((p) => p.key === selectedKey) ?? filtered[0] ?? null;
  // Management actions operate on the person's primary (first) record.
  const primary = selected?.suspects[0] ?? null;
  // The person on display = a drilldown; surface it in the breadcrumb.
  useDrilldown(selected?.fullName ?? null);
  const activeCaseRef = selected && activeCase
    ? selected.cases.find((c) => c.caseFile.id === activeCase.id) ?? null
    : null;

  function startAdd() {
    setFormInitial(null);
    setShowForm(true);
  }

  function startEdit(s: PersonSuspect) {
    setFormInitial({
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
    setShowForm(true);
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

  // Flag/unflag this person as a suspect under investigation.
  async function toggleMark() {
    if (!primary) return;
    const marked = primary.status === "UNDER_INVESTIGATION";
    await markAsSuspect({variables: {id: primary.id, marked: !marked}});
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
    <PageHeader icon={"\u{1F465}"} title="Субьектийн жагсаалт"
      subtitle="ХЭРЭГ ДАМНАСАН ХҮМҮҮСИЙН НЭГДСЭН БҮРТГЭЛ"
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

  // Accounts whose bank or owner is still unknown — the bulk check's work list.
  const unverified = [...new Set(people.flatMap((p) => p.bankAccounts
    .filter((a) => !describeAccount(a).bankName || isNumberLikeName(p.fullName))
    .map((a) => a.accountNumber)))];

  // One at a time: every lookup may walk all banks on the public service.
  async function verifyAll() {
    const total = unverified.length;
    let found = 0;
    setBulkMessage("");
    for (let i = 0; i < total; i++) {
      setBulk({done: i, total});
      try {
        const {data} = await verifyBankAccount(
          {variables: {accountNumber: unverified[i]}});
        if (data?.verifyBankAccount.found) found++;
      } catch { /* one failure must not stop the rest */ }
    }
    setBulk(null);
    setBulkMessage(`${total} данснаас ${found} нь олдож шинэчлэгдлээ.`);
    await refetch();
  }

  return (
    <div className="page-container">
      {header}

      {people.length === 0 ? (
        <Empty message="Бүртгэлтэй хүн алга — «+ ХҮН НЭМЭХ» дарж эхэлнэ үү" />
      ) : (
        <div className="master-detail">
          <div className="people-panel">
            <Card noPadding>
              <div style={{padding: 16,
                borderBottom: "1px solid var(--border-primary)"}}>
                <Select value={caseFilter} searchable
                  onChange={(v) => setCaseFilter(Number(v))}
                  style={{width: "100%", marginBottom: 8}}
                  options={[
                    {value: 0, label: `Бүх хэрэг (${people.length})`},
                    ...caseOptions.map((c) => ({value: c.id,
                      label: `${c.name} (${c.count})`})),
                  ]} />
                <Select value={groupFilter}
                  onChange={(value) => setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    if (value === "all") next.delete("group");
                    else next.set("group", value);
                    return next;
                  })}
                  style={{width: "100%", marginBottom: 8}}
                  options={[
                    {value: "all", label: "Бүх бүртгэл"},
                    {value: "offender", label: "Хэрэгтний бүртгэлд таарсан"},
                    {value: "other", label: "Хэрэгтний бүртгэлд таараагүй"},
                    {value: "high-risk", label: "Өндөр эрсдэлтэй"},
                  ]} />
                <Select value={bankFilter} searchable
                  onChange={(value) => setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    if (value === "all") next.delete("bank");
                    else next.set("bank", value);
                    return next;
                  })}
                  style={{width: "100%", marginBottom: 8}}
                  options={[
                    {value: "all", label: "Бүх банк"},
                    ...bankOptions,
                    {value: "unknown", label: "Банк тодорхойгүй"},
                  ]} />
                <input className="form-input" style={{width: "100%"}}
                  placeholder="Нэр, утас, данс, РД-гаар хайх..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)} />
                <div className="people-panel-stats">
                  <span><b>{filtered.length}</b> хүн</span>
                  <span><b>{crossCase}</b> олон хэрэгт</span>
                  <span><b>{grouped}</b> давхардсан</span>
                  <span className="risk"><b>{highRisk}</b> эрсдэлтэй</span>
                </div>
                {(unverified.length > 0 || bulk) && (
                  <button className="btn" style={{width: "100%", marginTop: 8}}
                    disabled={Boolean(bulk)} onClick={verifyAll}
                    title="Банк эсвэл эзэмшигч нь тодорхойгүй дансуудыг IBAN лавлагаагаар шалгах">
                    {bulk ? `Шалгаж байна… ${bulk.done}/${bulk.total}`
                      : `Тодорхойгүй ${unverified.length} дансыг шалгах`}
                  </button>
                )}
                {bulkMessage && <div role="status" style={{fontSize: 11,
                  color: "var(--text-secondary)", marginTop: 4}}>
                  {bulkMessage}</div>}
              </div>
              <div className="person-list">
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
                      <div style={{fontSize: 13, fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        // Улаан = хэрэгтний бүртгэлд регистрээр нь таарсан.
                        color: p.offender ? "var(--accent-red)" : undefined}}>
                        {p.offender && <OffenderTag />}{p.fullName}
                      </div>
                      {p.bankAccounts.length > 0 && (
                        <div style={{fontSize: 12, fontWeight: 600,
                          color: "var(--accent-cyan)", marginTop: 4,
                          overflowWrap: "anywhere"}}>
                          Банк: {[...new Set(p.bankAccounts.map((a) =>
                            describeAccount(a).bankName ?? "Банк тодорхойгүй"))]
                            .join(" · ")}
                        </div>
                      )}
                      {(p.phoneNumbers[0] || p.occupation || !p.accountNumbers.length) && (
                      <div style={{fontSize: 11,
                        color: "var(--text-muted)", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap"}}>
                        {[p.phoneNumbers[0], p.occupation]
                          .filter(Boolean).join(" · ") || "Мэдээлэл алга"}
                      </div>
                      )}
                    </div>
                    <div style={{display: "flex", gap: 4, flexShrink: 0}}>
                      {p.suspects.length > 1 && (
                        <span className="badge info"
                          title="Хэд хэдэн бүртгэл нэг хүнд нэгтгэгдсэн">
                          {p.suspects.length} бүртгэл
                        </span>
                      )}
                      {p.cases.length > 0 && (
                        <span className={`badge ${
                          p.cases.length > 1 ? "warning" : "unknown"}`}>
                          {p.cases.length} хэрэг
                        </span>
                      )}
                      {(p.riskLevel === "HIGH"
                        || p.riskLevel === "CRITICAL") && (
                        <span className={`badge ${
                          RISK_BADGE[p.riskLevel]}`}>
                          {RISK_LABELS[p.riskLevel as RiskLevel]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {selected && primary ? (
            <div style={{minWidth: 0}}>
              <Card style={{marginBottom: 16}}>
                <div style={{display: "flex", gap: 24,
                  alignItems: "flex-start", flexWrap: "wrap"}}>
                  <Avatar name={selected.fullName}
                    photoData={selected.photoData}
                    riskLevel={selected.riskLevel} xl />
                  <div style={{flex: 1, minWidth: 260}}>
                    <div style={{display: "flex", alignItems: "center",
                      gap: 10, flexWrap: "wrap"}}>
                      <span style={{fontSize: 20, fontWeight: 700}}>
                        {selected.fullName}
                      </span>
                      <span className="id-chip">{primary.suspectId}</span>
                      <Badge text={RISK_LABELS[
                        selected.riskLevel as RiskLevel]
                        ?? selected.riskLevel}
                        kind={RISK_BADGE[selected.riskLevel] ?? "unknown"} />
                      {selected.matchedBy.map((m) => (
                        <span key={m} className="badge info">
                          {MATCH_LABEL[m] ?? m}
                        </span>
                      ))}
                      {primary.status === "UNDER_INVESTIGATION" && (
                        <span className="badge high"
                          title="Сэжигтэн болгон тэмдэглэсэн">
                          СЭЖИГТЭН
                        </span>
                      )}
                    </div>
                    {selected.aliases.length > 0 && (
                      <div style={{fontSize: 11,
                        color: "var(--text-muted)", marginTop: 4}}>
                        Өөр нэр: {selected.aliases.join(", ")}
                      </div>
                    )}
                    <div style={{display: "grid", gap: "14px 24px",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(170px, 1fr))",
                      marginTop: 16}}>
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
                      <div style={{fontSize: 12, marginTop: 14,
                        padding: "8px 12px",
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
                          title={`Идэвхтэй хэрэгт №${
                            activeCaseRef.exhibitNumber} нотлох баримт`}>
                          НОТЛОХ БАРИМТ №{activeCaseRef.exhibitNumber}
                        </span>
                      ) : (
                        <button className="btn btn-accent"
                          title={`«${activeCase.caseName}» хэрэгт нотлох баримт болгох`}
                          onClick={tagIntoActiveCase}>
                          ХЭРЭГТ ТЭМДЭГЛЭХ
                        </button>
                      )
                    )}
                    <button
                      className={primary.status === "UNDER_INVESTIGATION"
                        ? "btn btn-accent" : "btn"}
                      onClick={toggleMark} disabled={markQ.loading}
                      title="Энэ хүнийг сэжигтэн болгон тэмдэглэх">
                      {primary.status === "UNDER_INVESTIGATION"
                        ? "✓ СЭЖИГТЭН" : "СЭЖИГТЭН БОЛГОХ"}
                    </button>
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
                <div className="stat-strip">
                  <div className="stat-strip-item">
                    <div className="stat-strip-value">
                      {selected.cases.length}
                    </div>
                    <div className="stat-strip-label">Хэрэг</div>
                  </div>
                  <div className="stat-strip-item">
                    <div className="stat-strip-value">
                      {selected.suspects.length}
                    </div>
                    <div className="stat-strip-label">Бүртгэл</div>
                  </div>
                  <div className="stat-strip-item">
                    <div className="stat-strip-value">
                      {selected.transactionCount}
                    </div>
                    <div className="stat-strip-label">Гүйлгээ</div>
                  </div>
                  <div className="stat-strip-item">
                    <div className="stat-strip-value">
                      {selected.callRecordCount}
                    </div>
                    <div className="stat-strip-label">Дуудлага</div>
                  </div>
                  <div className="stat-strip-item">
                    <div className="stat-strip-value">
                      {selected.phoneNumbers.length +
                        selected.accountNumbers.length}
                    </div>
                    <div className="stat-strip-label">Таниулбар</div>
                  </div>
                </div>
              </Card>

              <Card title="Холбогдсон хэргүүд" noPadding
                style={{marginTop: 16}}>
                <DataTable<PersonCaseRef>
                  rows={selected.cases}
                  rowKey={(r) => r.caseFile.id}
                  empty="Нотлох баримтаар хэрэгт холбогдоогүй байна"
                  columns={[
                    {header: "Хэрэг", render: (r) => (
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
                      <div style={{display: "grid", gap: 16}}>
                        {selected.bankAccounts.map((a) => (
                          <BankAccountInfo key={a.accountNumber} account={a}
                            personName={selected.fullName}
                            onVerified={refetch} />
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

      <PersonFormModal
        open={showForm}
        initial={formInitial}
        onClose={() => setShowForm(false)}
        onSaved={async () => {
          await refetch();
          setShowForm(false);
        }}
      />
    </div>
  );
}
