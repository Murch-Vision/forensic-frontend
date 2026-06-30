/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : OsintPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useLazyQuery, useMutation, useQuery} from "@apollo/client";
import {
  OSINT_QUERY,
  REFRESH_SANCTIONS,
  SCREEN_SUSPECT,
} from "../graphql/queries";
import {Badge, Card, DataTable, Loading, PageHeader} from "../components/kit";
import {formatDateTime, riskClass} from "../lib/format";
import type {AccessLogEntry} from "../types";

interface OsSuspect {
  id: number;
  suspectId: string;
  fullName: string;
  riskLevel: string;
  nationalId: string | null;
  country: string | null;
}

interface RefreshLog {
  id: number;
  fetchedAtUtc: string;
  sourceUrl: string;
  entryCount: number;
  byteCount: number;
  success: boolean;
  note: string | null;
  sha256Hex: string;
}

interface OsData {
  suspects: OsSuspect[];
  accessLogEntries: AccessLogEntry[];
  sanctionsStatus: {loaded: boolean; entryCount: number; loadedFrom: string | null};
  sanctionsRefreshLogs: RefreshLog[];
}

interface Hit {
  score: number;
  reason: string;
  entry: {id: string; caption: string; country: string | null;
    programs: string[]; schema: string};
}

export default function OsintPage() {
  const {data, loading, refetch} = useQuery<OsData>(OSINT_QUERY);
  const [screen, screenQ] = useLazyQuery<{screenSuspect: Hit[]}>(
    SCREEN_SUSPECT, {fetchPolicy: "no-cache"});
  const [refresh, refreshM] = useMutation(REFRESH_SANCTIONS);
  const [screened, setScreened] = useState<OsSuspect | null>(null);

  async function onScreen(s: OsSuspect) {
    setScreened(s);
    await screen({variables: {id: s.id}});
  }

  async function onRefresh() {
    await refresh();
    await refetch();
  }

  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="🌍" title="OSINT" subtitle="НЭЭЛТТЭЙ ЭХ СУРВАЛЖ" />
        <Loading />
      </div>
    );
  }

  const hits = screenQ.data?.screenSuspect ?? [];
  const st = data.sanctionsStatus;

  return (
    <div className="page-container">
      <PageHeader icon="🌍" title="OSINT"
        subtitle="САНКЦЫН ШАЛГАЛТ · ХАНДАЛТЫН ЛОГ"
        actions={
          <button className="btn btn-primary" onClick={onRefresh}
            disabled={refreshM.loading}>
            {refreshM.loading ? "ТАТАЖ БАЙНА..." : "САНКЦЫН ЖАГСААЛТ ШИНЭЧЛЭХ"}
          </button>
        } />

      <Card title="Санкцын мэдээллийн сан" style={{marginBottom: 16}}>
        <div style={{fontSize: 12}}>
          Төлөв: <Badge text={st.loaded ? "Ачаалсан" : "Ачаалаагүй"}
            kind={st.loaded ? "low" : "unknown"} />{" · "}
          <strong>{st.entryCount}</strong> бичлэг{" · "}
          <span style={{color: "var(--text-muted)"}}>{st.loadedFrom ?? "—"}</span>
        </div>
        {(() => {
          const latest = data.sanctionsRefreshLogs[0];
          if (!latest) return null;
          return (
            <div style={{fontSize: 11, color: "var(--text-muted)",
              marginTop: 8, lineHeight: 1.7}}>
              <div>Байт хэмжээ: {latest.byteCount.toLocaleString("en-US")} B</div>
              <div style={{fontFamily: "var(--font-mono)", wordBreak: "break-all"}}>
                SHA-256: {latest.sha256Hex || "—"}
              </div>
            </div>
          );
        })()}
      </Card>

      <div style={{display: "flex", gap: 16, alignItems: "flex-start",
        marginBottom: 16}}>
        <div style={{flex: 1}}>
          <Card title={`Хяналтын жагсаалт (${data.suspects.length})`} noPadding>
            <DataTable
              rows={data.suspects}
              rowKey={(s) => s.id}
              columns={[
                {header: "Нэр", render: (s) => s.fullName},
                {header: "Улс", render: (s) => s.country ?? "—"},
                {header: "Эрсдэл", render: (s) => (
                  <Badge text={s.riskLevel} kind={riskClass(s.riskLevel)} />
                )},
                {header: "", render: (s) => (
                  <button className="btn btn-sm" onClick={() => onScreen(s)}>
                    САНКЦ ШАЛГАХ
                  </button>
                )},
              ]}
            />
          </Card>
        </div>
        <div style={{flex: 1}}>
          <Card title={screened
            ? `Санкцын илрэл: ${screened.fullName}`
            : "Санкцын илрэл"} noPadding>
            {!screened ? (
              <div className="empty-state">
                <div className="message">Шалгах хүнээ сонгоно уу</div>
              </div>
            ) : screenQ.loading ? (
              <Loading />
            ) : (
              <DataTable
                rows={hits}
                rowKey={(h, i) => `${h.entry.id}-${i}`}
                empty="Илрэл олдсонгүй"
                columns={[
                  {header: "Бүртгэл", render: (h) => h.entry.caption},
                  {header: "Оноо", align: "right",
                    render: (h) => h.score.toFixed(2)},
                  {header: "Хөтөлбөр",
                    render: (h) => h.entry.programs.join(", ")},
                  {header: "Шалтгаан", render: (h) => h.reason},
                ]}
              />
            )}
          </Card>
        </div>
      </div>

      <Card title={`Санкцын шинэчлэлийн түүх (${data.sanctionsRefreshLogs.length})`}
        noPadding style={{marginBottom: 16}}>
        <DataTable
          rows={data.sanctionsRefreshLogs}
          rowKey={(r) => r.id}
          empty="Шинэчлэл хийгдээгүй"
          columns={[
            {header: "Огноо", render: (r) => formatDateTime(r.fetchedAtUtc)},
            {header: "Эх сурвалж", render: (r) => r.sourceUrl},
            {header: "Бичлэг", align: "right", render: (r) => r.entryCount},
            {header: "Төлөв", render: (r) => (
              <Badge text={r.success ? "Амжилттай" : "Бүтэлгүй"}
                kind={r.success ? "low" : "high"} />
            )},
            {header: "Тэмдэглэл", render: (r) => r.note ?? "—"},
          ]}
        />
      </Card>

      <Card title={`Хандалтын бүртгэл (${data.accessLogEntries.length})`} noPadding>
        <DataTable
          rows={data.accessLogEntries}
          rowKey={(e) => e.id}
          empty="Хандалтын бүртгэл алга"
          columns={[
            {header: "Огноо", render: (e) => formatDateTime(e.timestamp)},
            {header: "Хэрэглэгч", render: (e) => e.accountOrUserId},
            {header: "Нэр", render: (e) => e.fullName ?? "—"},
            {header: "IP", render: (e) => e.ipAddress ?? "—"},
            {header: "Төхөөрөмж", render: (e) => e.deviceModel ?? "—"},
            {header: "OS", render: (e) => e.os ?? "—"},
            {header: "Эх сурвалж", render: (e) => e.source},
          ]}
        />
      </Card>
    </div>
  );
}
