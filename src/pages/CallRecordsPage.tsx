/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : CallRecordsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useMemo, useState} from "react";
import {useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CALL_RECORDS_QUERY,
  EVIDENCE_FOR_CASE,
  TAG_EVIDENCE,
} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  DonutChart,
  Heatmap,
  LineChart,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import {Select} from "../components/inputs";
import Plot from "../components/Plot";
import {formatDateTime, formatDuration, riskClass} from "../lib/format";
import type {CallRecord} from "../types";

interface CallSuspect {
  id: number;
  fullName: string;
  riskLevel: string;
  phoneNumbers: {id: number; number: string}[];
}

interface CallData {
  callRecords: CallRecord[];
  suspects: CallSuspect[];
}

interface ContactFrequency {
  caller        : string;
  called        : string;
  count         : number;
  totalDuration : number;
}

const DAY_LABELS = ["Ня", "Да", "Мя", "Лха", "Пү", "Ба", "Бя"];

function last4(n: string): string {
  return n.length > 4 ? n.slice(-4) : n;
}

function isNightCall(c: CallRecord): boolean {
  const h = new Date(c.startTime).getHours();
  return h < 6 || h >= 23;
}

function isShortCall(c: CallRecord): boolean {
  return c.durationSeconds > 0 && c.durationSeconds < 10;
}

export default function CallRecordsPage() {
  const {data, loading} = useQuery<CallData>(CALL_RECORDS_QUERY);
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);
  const activeCase = caseQ.data?.activeCase ?? null;
  const evidenceQ = useQuery<{evidenceForCase: {sourceType: string;
    sourceId: number; exhibitNumber: number}[]}>(EVIDENCE_FOR_CASE, {
    variables: {caseFileId: activeCase?.id ?? 0}, skip: !activeCase});
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  const [selectedSuspectId, setSelectedSuspectId] = useState(0);

  const allCalls = data?.callRecords ?? [];
  const suspects = data?.suspects ?? [];

  // suspectId → phone numbers, for mapping calls to a person.
  const suspectPhones = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const s of suspects) m.set(s.id, s.phoneNumbers.map((p) => p.number));
    return m;
  }, [suspects]);

  const calls = useMemo(() => {
    if (selectedSuspectId === 0) return allCalls;
    const phones = suspectPhones.get(selectedSuspectId) ?? [];
    return allCalls.filter((c) => c.suspectId === selectedSuspectId
      || phones.includes(c.callerNumber) || phones.includes(c.calledNumber));
  }, [allCalls, suspectPhones, selectedSuspectId]);

  const exhibitByCall = new Map<number, number>();
  for (const e of evidenceQ.data?.evidenceForCase ?? []) {
    if (e.sourceType === "CALL_RECORD") {
      exhibitByCall.set(e.sourceId, e.exhibitNumber);
    }
  }

  async function onTag(c: CallRecord) {
    if (!activeCase) return;
    await tagEvidence({variables: {
      caseFileId: activeCase.id, sourceType: "CALL_RECORD", sourceId: c.id,
      description: `${c.callerNumber} → ${c.calledNumber} · `
        + `${formatDateTime(c.startTime)} (${formatDuration(c.durationSeconds)})`,
      severity: isNightCall(c) || isShortCall(c) ? "MEDIUM" : "INFO",
    }});
    await evidenceQ.refetch();
  }

  function callCount(s: CallSuspect): number {
    const phones = s.phoneNumbers.map((p) => p.number);
    return allCalls.filter((c) => c.suspectId === s.id
      || phones.includes(c.callerNumber) || phones.includes(c.calledNumber))
      .length;
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="📞" title="Дуудлагын дэлгэрэнгүй бүртгэл"
          subtitle="CDR АНАЛИЗ БА ХОЛБООНЫ ЗАГВАР" />
        <Loading />
      </div>
    );
  }

  const totalVoice = calls.filter((c) => c.callType === "Voice").length;
  const totalSms = calls.filter((c) => c.callType === "SMS").length;
  const totalDuration = calls.reduce((sum, c) => sum + c.durationSeconds, 0);
  const uniqueNumbers = new Set(
    calls.flatMap((c) => [c.callerNumber, c.calledNumber])
  ).size;
  const nightCount = calls.filter(isNightCall).length;
  const shortCount = calls.filter(isShortCall).length;

  // Top contacts: group by caller→called, count + sum duration.
  const contactMap = new Map<string, ContactFrequency>();
  for (const c of calls) {
    const key = `${c.callerNumber}→${c.calledNumber}`;
    const cf = contactMap.get(key);
    if (cf) {
      cf.count += 1;
      cf.totalDuration += c.durationSeconds;
    } else {
      contactMap.set(key, {
        caller        : c.callerNumber,
        called        : c.calledNumber,
        count         : 1,
        totalDuration : c.durationSeconds,
      });
    }
  }
  const topContacts = [...contactMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const topBar = topContacts.slice(0, 10);

  // Activity heatmap: number[7][24] from each call's startTime (local).
  const heatmap: number[][] = Array.from({length: 7}, () =>
    new Array<number>(24).fill(0)
  );
  for (const c of calls) {
    const d = new Date(c.startTime);
    heatmap[d.getDay()][d.getHours()] += 1;
  }

  // Daily call volume.
  const dailyMap = new Map<string, number>();
  for (const c of calls) {
    const day = c.startTime.slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  }
  const dailyVolume = [...dailyMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({label, value}));

  // Call-type breakdown.
  const typeMap = new Map<string, number>();
  for (const c of calls) typeMap.set(c.callType, (typeMap.get(c.callType) ?? 0) + 1);
  const typeLabels = [...typeMap.keys()];
  const typeColors = typeLabels.map((t) =>
    t === "Voice" ? "#B388FF" : t === "SMS" ? "#00E5FF" : "#FFAB00");

  // Hourly frequency with night coloring (22:00–05:00).
  const hourCounts = new Array(24).fill(0);
  for (const c of calls) hourCounts[new Date(c.startTime).getHours()]++;
  const hourLabels = Array.from({length: 24},
    (_v, h) => `${String(h).padStart(2, "0")}:00`);
  const hourColors = hourCounts.map((_v, h) =>
    h >= 22 || h <= 5 ? "#FF6D00" : "#B388FF");

  // Voice-call durations for the box plot.
  const voiceDur = calls
    .filter((c) => c.callType === "Voice" && c.durationSeconds > 0)
    .map((c) => c.durationSeconds);

  const selected = suspects.find((s) => s.id === selectedSuspectId);

  return (
    <div className="page-container">
      <PageHeader icon="📞" title="Дуудлагын дэлгэрэнгүй бүртгэл"
        subtitle="CDR АНАЛИЗ БА ХОЛБООНЫ ЗАГВАР" />

      <Card title="Сэжигтнээр шүүх" style={{marginBottom: 16}}>
        <div style={{display: "flex", gap: 12, alignItems: "center",
          flexWrap: "wrap"}}>
          <Select value={selectedSuspectId}
            onChange={(v) => setSelectedSuspectId(Number(v))}
            style={{minWidth: 240}}
            options={[
              {value: 0, label: `Бүх дуудлага (${allCalls.length} бичлэг)`},
              ...suspects.map((s) => ({value: s.id,
                label: `${s.fullName} (${callCount(s)} дуудлага)`})),
            ]} />
          {selected && (
            <>
              <Badge text={selected.riskLevel}
                kind={riskClass(selected.riskLevel)} />
              <span style={{fontSize: 11, color: "var(--text-muted)"}}>
                {selected.phoneNumbers.length} утас
              </span>
              {selected.phoneNumbers.slice(0, 3).map((p) => (
                <span key={p.id} style={{fontSize: 11,
                  fontFamily: "var(--font-mono)", color: "var(--accent-cyan)"}}>
                  {p.number}
                </span>
              ))}
              {selected.phoneNumbers.length > 3 && (
                <span style={{fontSize: 11, color: "var(--text-muted)"}}>
                  +{selected.phoneNumbers.length - 3} илүү
                </span>
              )}
            </>
          )}
        </div>
        {selected && (
          <div style={{marginTop: 10, fontSize: 11, fontWeight: 600,
            color: "#E040FB"}}>
            ШҮҮЛТҮҮР ИДЭВХТЭЙ — {selected.fullName}
          </div>
        )}
      </Card>

      <div className="metrics-grid">
        <StatCard label="Дуудлагын дуудлага" value={totalVoice}
          color="purple" />
        <StatCard label="SMS заагууд" value={totalSms} color="cyan" />
        <StatCard label="Нийт үргэлжлэл" value={formatDuration(totalDuration)}
          color="green" />
        <StatCard label="Ялгаатай дугаар" value={uniqueNumbers} color="amber" />
        <StatCard label="Шөнийн дуудлага" value={nightCount} color="red" />
        <StatCard label="Богино дуудлага" value={shortCount} color="blue" />
      </div>

      <div style={{display: "flex", gap: 16, alignItems: "flex-start",
        marginBottom: 16}}>
        <div style={{flex: 1}}>
          <Card title="Дуудлагын идэвх (Өдөр x Цаг)">
            <Heatmap data={heatmap} rowLabels={DAY_LABELS} />
          </Card>
        </div>
        <div style={{flex: 1}}>
          <Card title="Өдөр тутмын дуудлагын хэмжээ">
            <LineChart values={dailyVolume} color="#B388FF" />
          </Card>
        </div>
      </div>

      <div style={{display: "flex", gap: 16, alignItems: "flex-start",
        marginBottom: 16}}>
        <div style={{flex: 1}}>
          <Card title="Дээд холбоо (давтамж)">
            <Plot
              height={300}
              data={[{
                type: "bar", orientation: "h",
                y: topBar.map((c) => `${last4(c.caller)}→${last4(c.called)}`)
                  .reverse(),
                x: topBar.map((c) => c.count).reverse(),
                marker: {color: "#B388FF"},
              }]}
              layout={{margin: {l: 120, r: 16, t: 16, b: 40}}}
            />
          </Card>
        </div>
        <div style={{flex: 1}}>
          <Card title="Дуудлагын төрөл">
            <DonutChart labels={typeLabels}
              values={typeLabels.map((t) => typeMap.get(t) ?? 0)}
              colors={typeColors} />
          </Card>
        </div>
      </div>

      <div style={{display: "flex", gap: 16, alignItems: "flex-start",
        marginBottom: 16}}>
        <div style={{flex: 1}}>
          <Card title="Цаг тутмын давтамж">
            <Plot
              height={260}
              data={[{
                type: "bar", x: hourLabels, y: hourCounts,
                marker: {color: hourColors},
              }]}
            />
          </Card>
        </div>
        <div style={{flex: 1}}>
          <Card title="Үргэлжлэлийн тархалт (Voice)">
            {voiceDur.length > 0 ? (
              <Plot
                height={260}
                data={[{
                  type: "box", y: voiceDur, name: "Voice (сек)",
                  marker: {color: "#B388FF"}, boxmean: true,
                }]}
              />
            ) : (
              <div style={{padding: 24, color: "var(--text-muted)",
                fontSize: 12}}>Дуудлагын үргэлжлэл алга</div>
            )}
          </Card>
        </div>
      </div>

      <Card title="Дээд холбооны хосууд" style={{marginBottom: 16}} noPadding>
        <DataTable<ContactFrequency>
          columns={[
            {
              header: "Дуудлага (каллер→каллед)",
              render: (r) => `${r.caller}→${r.called}`,
            },
            {header: "Тоо", align: "right", render: (r) => r.count},
            {
              header: "Үргэлжлэл",
              align: "right",
              render: (r) => formatDuration(r.totalDuration),
            },
          ]}
          rows={topContacts}
          rowKey={(r) => `${r.caller}→${r.called}`}
          empty="Холбоо алга"
        />
      </Card>

      <Card title={`Дуудлагын бичлэгийн жагсаалт (${calls.length})`} noPadding>
        <DataTable<CallRecord>
          columns={[
            {header: "Эхэлсэн", render: (r) => formatDateTime(r.startTime)},
            {header: "Каллер", render: (r) => r.callerNumber},
            {header: "Каллед", render: (r) => r.calledNumber},
            {
              header: "Төрөл",
              render: (r) => (
                <Badge text={r.callType}
                  kind={r.callType === "Voice" ? "info" : "low"} />
              ),
            },
            {header: "Чиглэл", render: (r) => r.direction},
            {
              header: "Үргэлжлэл",
              align: "right",
              render: (r) => formatDuration(r.durationSeconds),
            },
            {header: "Байршил", render: (r) => r.location ?? "—"},
            {header: "Туг", render: (r) => (
              <div style={{display: "flex", gap: 4, flexWrap: "wrap"}}>
                {isNightCall(r) && <Badge text="ШӨНИЙН" kind="medium" />}
                {isShortCall(r) && <Badge text="БОГИНО" kind="high" />}
                {r.durationSeconds > 1800 && <Badge text="УРТ" kind="info" />}
              </div>
            )},
            {header: "Нотлох", render: (r) =>
              !activeCase ? <span style={{color: "var(--text-muted)"}}>—</span>
                : exhibitByCall.has(r.id)
                  ? (
                    <span className="badge info">
                      #{exhibitByCall.get(r.id)}
                    </span>
                  )
                  : (
                    <button className="btn btn-sm" onClick={() => onTag(r)}>
                      +
                    </button>
                  )},
          ]}
          rows={calls}
          rowKey={(r) => r.id}
          empty="Дуудлага алга"
        />
      </Card>
    </div>
  );
}
