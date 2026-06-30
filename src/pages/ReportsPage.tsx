/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ReportsPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useLazyQuery, useQuery} from "@apollo/client";
import {
  REPORTS_QUERY,
  REPORT_BUNDLE,
  REPORT_EXCEL,
  REPORT_PDF,
  REPORT_WORD,
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
import type {CaseFile, PatternAlert} from "../types";

interface ReportFile {
  filename: string;
  mimeType: string;
  base64: string;
}

// Decode a base64 payload into a Blob and trigger a browser download.
function downloadBase64(file: ReportFile) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], {type: file.mimeType}));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [getWord, wordQ] = useLazyQuery<{reportWord: ReportFile}>(
    REPORT_WORD,
    {fetchPolicy: "no-cache"}
  );

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

  async function onWord() {
    const r = await getWord();
    if (r.data?.reportWord) downloadBase64(r.data.reportWord);
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
      <button className="btn btn-primary" onClick={onPdf}
        disabled={pdfQ.loading} style={{marginRight: 6}}>
        {pdfQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "PDF ЭКСПОРТ"}
      </button>
      <button className="btn btn-sm" onClick={onExcel}
        disabled={excelQ.loading} style={{marginRight: 6}}>
        {excelQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "EXCEL ЭКСПОРТ"}
      </button>
      <button className="btn btn-sm" onClick={onBundle}
        disabled={bundleQ.loading} style={{marginRight: 6}}>
        {bundleQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "БҮРДЭЛ (ZIP)"}
      </button>
      <button className="btn btn-sm" onClick={onWord}
        disabled={wordQ.loading}>
        {wordQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "WORD БОЛОВСРУУЛАХ"}
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
    </div>
  );
}
