/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : PeoplePage.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : autopilot
 * Purpose     : Global people database — every human across every case in
 *               one master-detail view; duplicated records are grouped so
 *               a person appearing in multiple cases shows a full profile.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {useQuery} from "@apollo/client";
import {GLOBAL_PEOPLE_QUERY} from "../graphql/queries";
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

interface PersonSuspect {
  id           : number;
  suspectId    : string;
  fullName     : string;
  primaryPhone : string | null;
  riskLevel    : string;
  occupation   : string | null;
  organization : string | null;
  createdAt    : string;
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

const RISK_BADGE: Record<string, string> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
  UNKNOWN: "unknown",
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

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function Avatar({person, lg}: {person: GlobalPerson; lg?: boolean}) {
  return (
    <div className={lg ? "person-avatar lg" : "person-avatar"}>
      {person.photoData
        ? <img src={person.photoData} alt={person.fullName} />
        : initials(person.fullName)}
    </div>
  );
}

export default function PeoplePage() {
  const {data, loading, error} = useQuery<{globalPeople: GlobalPerson[]}>(
    GLOBAL_PEOPLE_QUERY);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="page-container">
        <PageHeader icon={"\u{1F465}"} title="Хүмүүсийн сан"
          subtitle="КЕЙС ДАМНАСАН ХҮМҮҮСИЙН НЭГДСЭН БҮРТГЭЛ" />
        <Loading />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-container">
        <PageHeader icon={"\u{1F465}"} title="Хүмүүсийн сан"
          subtitle="КЕЙС ДАМНАСАН ХҮМҮҮСИЙН НЭГДСЭН БҮРТГЭЛ" />
        <Empty message={`Алдаа гарлаа: ${error.message}`} />
      </div>
    );
  }

  const crossCase = people.filter((p) => p.cases.length > 1).length;
  const grouped = people.filter((p) => p.suspects.length > 1).length;

  return (
    <div className="page-container">
      <PageHeader icon={"\u{1F465}"} title="Хүмүүсийн сан"
        subtitle="КЕЙС ДАМНАСАН ХҮМҮҮСИЙН НЭГДСЭН БҮРТГЭЛ" />

      <MetricsGrid>
        <StatCard label="Нийт хүн" value={people.length} color="cyan" />
        <StatCard label="Олон кейст оролцсон" value={crossCase}
          color="amber" />
        <StatCard label="Давхардсан бүртгэлтэй" value={grouped}
          color="purple" />
      </MetricsGrid>

      {people.length === 0 ? (
        <Empty message="Бүртгэлтэй хүн алга — эхлээд хүн нэмнэ үү" />
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
            <div style={{maxHeight: "60vh", overflowY: "auto"}}>
              {filtered.length === 0 ? (
                <Empty message="Хайлтад тохирох хүн олдсонгүй" />
              ) : filtered.map((p) => (
                <div key={p.key}
                  className={`person-row${
                    selected?.key === p.key ? " selected" : ""}`}
                  onClick={() => setSelectedKey(p.key)}>
                  <Avatar person={p} />
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

          {selected ? (
            <div style={{minWidth: 0}}>
              <Card style={{marginBottom: 16}}>
                <div style={{display: "flex", gap: 16,
                  alignItems: "center", flexWrap: "wrap"}}>
                  <Avatar person={selected} lg />
                  <div style={{flex: 1, minWidth: 200}}>
                    <div style={{fontSize: 18, fontWeight: 700}}>
                      {selected.fullName}
                    </div>
                    <div style={{fontSize: 11, color: "var(--text-muted)",
                      marginTop: 4}}>
                      {[
                        selected.aliases.length > 0
                          ? `Өөр нэр: ${selected.aliases.join(", ")}` : null,
                        selected.occupation,
                        selected.nationalId
                          ? `РД: ${selected.nationalId}` : null,
                      ].filter(Boolean).join(" · ") || "Нэмэлт мэдээлэл алга"}
                    </div>
                    {selected.matchedBy.length > 0 && (
                      <div style={{display: "flex", gap: 4, marginTop: 8,
                        flexWrap: "wrap"}}>
                        {selected.matchedBy.map((m) => (
                          <span key={m} className="badge info">
                            {MATCH_LABEL[m] ?? m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Badge text={selected.riskLevel}
                    kind={RISK_BADGE[selected.riskLevel] ?? "unknown"} />
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
                <Card title={`Утасны дугаар (${
                  selected.phoneNumbers.length})`}>
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
                <Card title={`Банкны данс (${
                  selected.accountNumbers.length})`}>
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
    </div>
  );
}
