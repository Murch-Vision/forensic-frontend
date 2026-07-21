/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ReportsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useLazyQuery, useQuery} from "@apollo/client";
import {
  REPORTS_QUERY,
  REPORT_BUNDLE,
  REPORT_EXCEL,
  REPORT_MARKED_PDF,
  REPORT_PDF,
} from "../graphql/queries";
import {
  Badge,
  Card,
  DataTable,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import {formatMoney, sevClass} from "../lib/format";
import {downloadBase64, type ReportFile} from "../lib/download";
import type {CaseFile, PatternAlert} from "../types";

interface RpData {
  dashboardStats: {
    totalSuspects: number;
    totalBankAccounts: number;
    totalTransactions: number;
    totalCallRecords: number;
    totalLinks: number;
    highRiskSuspects: number;
    flaggedTransactions: number;
    totalTransactionVolume: number;
  };
  patterns: PatternAlert[];
  caseFiles: CaseFile[];
}

export default function ReportsPage() {
  const {data, loading} = useQuery<RpData>(REPORTS_QUERY);
  const [getPdf, pdfQ] = useLazyQuery<{reportPdf: ReportFile}>(REPORT_PDF, {
    fetchPolicy: "no-cache",
  });
  const [getExcel, excelQ] = useLazyQuery<{reportExcel: ReportFile}>(
    REPORT_EXCEL,
    {fetchPolicy: "no-cache"}
  );
  const [getBundle, bundleQ] = useLazyQuery<{reportBundle: ReportFile}>(
    REPORT_BUNDLE,
    {fetchPolicy: "no-cache"}
  );
  const [getMarkedPdf, markedQ] =
    useLazyQuery<{reportMarkedSuspectsPdf: ReportFile}>(REPORT_MARKED_PDF,
      {fetchPolicy: "no-cache"});

  // Threshold modal: ask for a minimum single-transaction amount before export.
  const [showThreshold, setShowThreshold] = useState(false);
  const [threshold, setThreshold] = useState("");

  async function onMarkedPdf(minAmount: number) {
    setShowThreshold(false);
    try {
      const r = await getMarkedPdf({variables: {minAmount}});
      if (r.data?.reportMarkedSuspectsPdf) {
        downloadBase64(r.data.reportMarkedSuspectsPdf);
      } else if (r.error) {
        alert(r.error.message);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function onPdf() {
    const r = await getPdf();
    if (r.data?.reportPdf) downloadBase64(r.data.reportPdf);
  }

  async function onExcel() {
    const r = await getExcel();
    if (r.data?.reportExcel) downloadBase64(r.data.reportExcel);
  }

  async function onBundle() {
    const r = await getBundle();
    if (r.data?.reportBundle) downloadBase64(r.data.reportBundle);
  }


  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="📄" title="Тайлан" subtitle="ТАЙЛАН ҮҮСГЭХ" />
        <Loading />
      </div>
    );
  }

  const s = data.dashboardStats;
  const actions = (
    <>
      <button className="btn btn-accent"
        onClick={() => { setThreshold(""); setShowThreshold(true); }}
        disabled={markedQ.loading}
        title="Банкны гүйлгээний тайланг PDF-ээр татах — босго тавибал түүнээс дээш гүйлгээтэй бүх этгээд орно">
        {markedQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "ГҮЙЛГЭЭНИЙ ТАЙЛАН (PDF)"}
      </button>
      <button className="btn btn-primary" onClick={onPdf}
        disabled={pdfQ.loading}>
        {pdfQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "PDF ЭКСПОРТ"}
      </button>
      <button className="btn" onClick={onExcel}
        disabled={excelQ.loading}>
        {excelQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "EXCEL ЭКСПОРТ"}
      </button>
      <button className="btn" onClick={onBundle}
        disabled={bundleQ.loading}>
        {bundleQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "БҮРДЭЛ (ZIP)"}
      </button>
    </>
  );

  return (
    <div className="page-container">
      <PageHeader icon="📄" title="Тайлан"
        subtitle="ТАГНУУЛЫН ТАЙЛАНГИЙН УРЬДЧИЛСАН ХАРАГДАЦ" actions={actions} />

      <div className="metrics-grid">
        <StatCard label="Сэжигтэн" value={s.totalSuspects} />
        <StatCard label="Данс" value={s.totalBankAccounts} />
        <StatCard label="Гүйлгээ" value={s.totalTransactions} />
        <StatCard label="Дуудлага" value={s.totalCallRecords} />
        <StatCard label="Холбоос" value={s.totalLinks} />
        <StatCard label="Өндөр эрсдэл" value={s.highRiskSuspects}
          color="red" />
        <StatCard label="Нийт дүн" value={formatMoney(s.totalTransactionVolume)}
          color="green" />
      </div>

      <Card title="Кейсүүд" noPadding style={{marginBottom: 16}}>
        <DataTable
          rows={data.caseFiles}
          rowKey={(c) => c.id}
          columns={[
            {header: "Дугаар", render: (c) => c.caseId},
            {header: "Нэр", render: (c) => c.caseName},
            {header: "Төлөв", render: (c) => c.status},
            {header: "Чухал", render: (c) => (
              <Badge text={c.priority} kind={sevClass(c.priority)} />
            )},
            {header: "Мөрдөгч", render: (c) => c.leadInvestigator ?? "—"},
          ]}
        />
      </Card>

      <Card title={`Сэрэмжлүүлэг (${data.patterns.length})`} noPadding>
        <DataTable
          rows={data.patterns}
          rowKey={(p, i) => i}
          empty="Сэрэмжлүүлэг алга"
          columns={[
            {header: "Төрөл", render: (p) => p.alertType},
            {header: "Зэрэг", render: (p) => (
              <Badge text={p.severity} kind={sevClass(p.severity)} />
            )},
            {header: "Тайлбар", render: (p) => p.description},
          ]}
        />
      </Card>

      {showThreshold && (
        <div className="modal-overlay" onClick={() => setShowThreshold(false)}>
          <div className="modal-content" style={{width: "min(440px, 92vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Гүйлгээний доод босго</span>
              <button className="modal-close" title="Хаах"
                onClick={() => setShowThreshold(false)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-label">
                Нэг гүйлгээний доод дүн (₮)
              </label>
              <input className="form-input" type="number" min={0} autoFocus
                placeholder="ж: 100000"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onMarkedPdf(Math.max(0, Math.floor(Number(threshold) || 0)));
                  }
                }} />
              <div style={{fontSize: 12, color: "var(--text-muted)",
                marginTop: 8}}>
                Энэ дүнгээс их (буюу тэнцүү) гүйлгээ хийсэн БҮХ этгээд —
                сэжигтэн эсэхээс үл хамааран — тайланд орно.
                Хоосон эсвэл 0 бол зөвхөн тэмдэглэсэн сэжигтнүүд орно.
              </div>
              <div style={{display: "flex", gap: 8, justifyContent: "flex-end",
                marginTop: 20}}>
                <button className="btn" onClick={() => setShowThreshold(false)}>
                  Болих
                </button>
                <button className="btn btn-accent"
                  onClick={() =>
                    onMarkedPdf(Math.max(0, Math.floor(Number(threshold) || 0)))}>
                  PDF ТАТАХ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
