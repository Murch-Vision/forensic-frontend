/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : TimelinePage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useQuery} from "@apollo/client";
import {TIMELINE_QUERY, TRAVEL_QUERY} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import type {Column} from "../components/kit";
import {Select} from "../components/inputs";
import CaseScopeBar from "../components/CaseScopeBar";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  sevClass,
} from "../lib/format";
import type {CorrelationHit} from "../types";

interface Transaction {
  id: number;
  bankAccountId: number;
  timestamp: string;
  amount: number;
  type: string;
  description: string | null;
}

interface CallRecord {
  id: number;
  callerNumber: string;
  calledNumber: string;
  startTime: string;
  durationSeconds: number;
  callType: string;
  direction: string;
  location: string | null;
}

interface TimelineData {
  suspects: {id: number; fullName: string}[];
  transactions: Transaction[];
  callRecords: CallRecord[];
  correlations: CorrelationHit[];
}

interface TimelineItem {
  timestamp: string;
  type: string;
  title: string;
  description: string;
  severity: string;
}

interface TravelHit {
  suspectName: string;
  eventTime: string;
  transactionAmount: number;
  transactionLocation: string;
  callLocation: string;
  callNumber: string;
  timeDifferenceMinutes: number;
}

export default function TimelinePage() {
  const [selectedSuspectId, setSelectedSuspectId] = useState("");
  const [showTransactions, setShowTransactions] = useState(true);
  const [showCalls, setShowCalls] = useState(true);
  const [showCorrelations, setShowCorrelations] = useState(true);
  const [showTravel, setShowTravel] = useState(true);

  const suspectId = selectedSuspectId === ""
    ? null : parseInt(selectedSuspectId, 10);
  const {data, loading} = useQuery<TimelineData>(TIMELINE_QUERY, {
    variables: {suspectId},
  });
  const travelQ = useQuery<{travelCorrelations: TravelHit[]}>(TRAVEL_QUERY, {
    variables: {suspectId, hourWindow: 4},
  });

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="🕒" title="Цагийн хугацааны анализ"
          subtitle="ЦАГИЙН ХОЛБОО БА ҮЙЛ ЯВДЛЫН ДАРААЛАЛ" />
        <Loading />
      </div>
    );
  }

  const items: TimelineItem[] = [];

  if (showTransactions) {
    for (const t of data.transactions) {
      items.push({
        timestamp   : t.timestamp,
        type        : "TRANSACTION",
        title       : `${t.type.toUpperCase()} ${formatMoney(t.amount)}`,
        description : t.description ?? "",
        severity    : t.amount > 10000000 ? "ALERT" : "INFO",
      });
    }
  }

  if (showCalls) {
    for (const c of data.callRecords) {
      items.push({
        timestamp   : c.startTime,
        type        : "CALL",
        title       : `${c.callType} ${c.direction}: ` +
          formatDuration(c.durationSeconds),
        description : `${c.callerNumber} → ${c.calledNumber}`,
        severity    : "INFO",
      });
    }
  }

  items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const visible = items.slice(0, 500);

  const correlations = showCorrelations ? data.correlations : [];

  const columns: Column<CorrelationHit>[] = [
    {
      header : "Сэжигтэн",
      render : (h) => h.suspectName,
    },
    {
      header : "Гүйлгээ",
      render : (h) =>
        `${formatDateTime(h.transactionTime)} · ` +
        formatMoney(h.transactionAmount),
    },
    {
      header : "Дуудлага",
      render : (h) => formatDateTime(h.callTime),
    },
    {
      header : "Зөрүү",
      align  : "right",
      render : (h) => `${h.timeDifferenceMinutes.toFixed(0)} мин`,
    },
    {
      header : "Severity",
      render : (h) => <Badge text={h.severity} kind={sevClass(h.severity)} />,
    },
  ];

  return (
    <div className="page-container">
      <PageHeader icon="🕒" title="Цагийн хугацааны анализ"
        subtitle="ЦАГИЙН ХОЛБОО БА ҮЙЛ ЯВДЛЫН ДАРААЛАЛ" />
      <CaseScopeBar summary={`${visible.length} үйл явдал`} />

      <div className="metrics-grid">
        <StatCard label="Үйл явдал" value={visible.length} />
        <StatCard label="Хамаарал" value={correlations.length} />
      </div>

      <div className="toolbar" style={{marginBottom: 16, display: "flex",
        gap: 16, alignItems: "center", flexWrap: "wrap"}}>
        <Select value={selectedSuspectId}
          onChange={(v) => setSelectedSuspectId(v)}
          style={{minWidth: 200}}
          options={[
            {value: "", label: "Бүх сэжигтэн"},
            ...data.suspects.map((s) => ({value: s.id, label: s.fullName})),
          ]} />
        <label style={{fontSize: 12, display: "flex", alignItems: "center",
          gap: 4, cursor: "pointer"}}>
          <input
            type="checkbox"
            checked={showTransactions}
            onChange={(e) => setShowTransactions(e.target.checked)}
          />
          Гүйлгээ
        </label>
        <label style={{fontSize: 12, display: "flex", alignItems: "center",
          gap: 4, cursor: "pointer"}}>
          <input
            type="checkbox"
            checked={showCalls}
            onChange={(e) => setShowCalls(e.target.checked)}
          />
          Дуудлага
        </label>
        <label style={{fontSize: 12, display: "flex", alignItems: "center",
          gap: 4, cursor: "pointer"}}>
          <input
            type="checkbox"
            checked={showCorrelations}
            onChange={(e) => setShowCorrelations(e.target.checked)}
          />
          Холбоо
        </label>
        <label style={{fontSize: 12, display: "flex", alignItems: "center",
          gap: 4, cursor: "pointer"}}>
          <input
            type="checkbox"
            checked={showTravel}
            onChange={(e) => setShowTravel(e.target.checked)}
          />
          Зорчилт
        </label>
      </div>

      <Card title={`Үйл явдлын цагийн хугацаа (${visible.length})`} noPadding
        style={{marginBottom: 16}}>
        <div style={{maxHeight: 480, overflowY: "auto"}}>
          {visible.length === 0 ? (
            <Empty message="Цагийн хугацааны үйл явдал алга" />
          ) : (
            visible.map((item, i) => (
              <div key={i} style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "10px 14px",
                borderBottom: "1px solid var(--border-primary)",
              }}>
                <div style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-muted)",
                  minWidth: 110,
                }}>
                  {formatDateTime(item.timestamp)}
                </div>
                <Badge text={item.type} kind={sevClass(item.severity)} />
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontSize: 12, fontWeight: 600}}>
                    {item.title}
                  </div>
                  <div style={{fontSize: 11, color: "var(--text-secondary)"}}>
                    {item.description}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Хамаарал (Correlation)" noPadding style={{marginBottom: 16}}>
        <DataTable
          columns={columns}
          rows={correlations}
          rowKey={(_h, i) => i}
          empty="Холбоо олдсонгүй"
        />
      </Card>

      <Card title="Аяллын зөрчил (нэг хүн хоёр газар)" noPadding>
        <DataTable
          rows={showTravel ? (travelQ.data?.travelCorrelations ?? []) : []}
          rowKey={(_h, i) => i}
          empty="Аяллын зөрчил олдсонгүй"
          columns={[
            {header: "Сэжигтэн", render: (h) => h.suspectName},
            {header: "Огноо", render: (h) => formatDateTime(h.eventTime)},
            {header: "Гүйлгээ", align: "right",
              render: (h) => formatMoney(h.transactionAmount)},
            {header: "Гүйлгээний газар", render: (h) => h.transactionLocation},
            {header: "Дуудлагын газар", render: (h) => h.callLocation},
            {header: "Зөрүү (мин)", align: "right",
              render: (h) => h.timeDifferenceMinutes.toFixed(0)},
          ]}
        />
      </Card>
    </div>
  );
}
