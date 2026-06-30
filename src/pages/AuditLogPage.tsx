/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AuditLogPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-24
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useQuery} from "@apollo/client";
import {AUDIT_QUERY, AUDIT_SEARCH} from "../graphql/queries";
import {Badge, Card, DataTable, Loading, PageHeader} from "../components/kit";
import {formatDateTime, sevClass} from "../lib/format";
import type {AuditEvent} from "../types";

interface AuditData {
  auditEvents: AuditEvent[];
  auditVerify: {valid: boolean; brokenAt: number | null};
}

function toCsv(rows: AuditEvent[]): string {
  const esc = (s: string) =>
    /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = ["Id,TimestampUtc,Actor,Action,Target,Detail,Severity"];
  for (const r of rows) {
    lines.push([r.id, r.timestampUtc, esc(r.actor), esc(r.action),
      esc(r.target ?? ""), esc(r.detail ?? ""), r.severity].join(","));
  }
  return lines.join("\n");
}

export default function AuditLogPage() {
  const {data, loading} = useQuery<AuditData>(AUDIT_QUERY);
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [fromUtc, setFromUtc] = useState("");
  const [toUtc, setToUtc] = useState("");
  const searchQ = useQuery<{auditSearch: AuditEvent[]}>(AUDIT_SEARCH, {
    variables: {actor: null, action: null, fromUtc: null, toUtc: null},
  });

  function onSearch() {
    searchQ.refetch({
      actor: actor || null, action: action || null,
      fromUtc: fromUtc ? new Date(fromUtc).toISOString() : null,
      toUtc: toUtc ? new Date(toUtc).toISOString() : null,
    });
  }

  function onExport() {
    const rows = searchQ.data?.auditSearch ?? [];
    const url = URL.createObjectURL(new Blob([toCsv(rows)], {type: "text/csv"}));
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="📜" title="Аудит" subtitle="МӨРИЙН БҮРТГЭЛ" />
        <Loading />
      </div>
    );
  }

  const v = data.auditVerify;
  const rows = searchQ.data?.auditSearch ?? data.auditEvents;

  return (
    <div className="page-container">
      <PageHeader icon="📜" title="Аудит"
        subtitle="ХЯНАЛТЫН МӨР · CHAIN OF CUSTODY"
        actions={
          <>
            <button className="btn btn-primary" onClick={onSearch}
              style={{marginRight: 6}}>ХАЙХ</button>
            <button className="btn btn-success" onClick={onExport}
              disabled={rows.length === 0}>CSV ЭКСПОРТ</button>
          </>
        } />

      <Card title="Хэш гинжин бүрэн бүтэн байдал" style={{marginBottom: 16}}>
        {v.valid ? (
          <span style={{color: "var(--accent-green)", fontWeight: 600}}>
            ✓ БАТАЛГААЖСАН — SHA-256 гинж бүрэн ({data.auditEvents.length} бичлэг)
          </span>
        ) : (
          <span style={{color: "var(--risk-high)", fontWeight: 600}}>
            ✗ ЭВДЭРСЭН — {v.brokenAt} дугаартай мөрнөөс гинж тасарсан
          </span>
        )}
      </Card>

      <Card title="Шүүлтүүр" style={{marginBottom: 16}}>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 12}}>
          <div>
            <label className="form-label">Эхлэх (UTC)</label>
            <input type="datetime-local" className="form-input" value={fromUtc}
              onChange={(e) => setFromUtc(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Дуусах (UTC)</label>
            <input type="datetime-local" className="form-input" value={toUtc}
              onChange={(e) => setToUtc(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Оператор</label>
            <input className="form-input" value={actor} placeholder="нэр"
              onChange={(e) => setActor(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Үйлдэл</label>
            <input className="form-input" value={action}
              placeholder="Suspect.Update"
              onChange={(e) => setAction(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card title={`Үйлдлүүд (${rows.length})`} noPadding>
        <DataTable
          rows={rows}
          rowKey={(e) => e.id}
          empty="Бүртгэл алга"
          columns={[
            {header: "Огноо", render: (e) => formatDateTime(e.timestampUtc)},
            {header: "Хэрэглэгч", render: (e) => e.actor},
            {header: "Үйлдэл", render: (e) => e.action},
            {header: "Объект", render: (e) => e.target ?? "—"},
            {header: "Дэлгэрэнгүй", render: (e) => e.detail ?? "—"},
            {header: "Зэрэг", render: (e) => (
              <Badge text={e.severity} kind={sevClass(e.severity)} />
            )},
          ]}
        />
      </Card>
    </div>
  );
}
