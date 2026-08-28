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
  REPORT_MARKED_PDF,
  REPORT_VERDICT_DOCX,
} from "../graphql/queries";
import {
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  StatCard,
} from "../components/kit";
import {formatDate, formatMoney, formatNum} from "../lib/format";
import {downloadBase64, type ReportFile} from "../lib/download";

interface ReportAccount {
  accountId: number;
  accountNumber: string;
  ownerName: string | null;
  txnCount: number;
  counterpartyCount: number;
  creditTotal: number;
  debitTotal: number;
  netTotal: number;
  hasTimeOfDay: boolean;
  nightCount: number;
  nightTotal: number;
  firstTxn: string | null;
  lastTxn: string | null;
}

interface ReportRelation {
  key: string;
  name: string;
  account: string | null;
  txnCount: number;
  creditTotal: number;
  debitTotal: number;
  netTotal: number;
  mutual: boolean;
}

interface ReportTransfer {
  fromAccountId: number;
  toAccountId: number;
  fromLabel: string;
  toLabel: string;
  txnCount: number;
  total: number;
}

interface RpData {
  activeCase: {
    id: number;
    caseId: string;
    caseName: string;
  } | null;
  accountAnalyses: ReportAccount[];
  caseRelations: {
    mutualRelations: number;
    txnCount: number;
    creditTotal: number;
    debitTotal: number;
    netTotal: number;
    relations: ReportRelation[];
  };
  directTransfers: ReportTransfer[];
}

export default function ReportsPage() {
  const {data, loading} = useQuery<RpData>(REPORTS_QUERY);
  const [getMarkedPdf, markedQ] =
    useLazyQuery<{reportMarkedSuspectsPdf: ReportFile}>(REPORT_MARKED_PDF,
      {fetchPolicy: "no-cache"});
  const [getVerdictDocx, verdictQ] =
    useLazyQuery<{reportVerdictDocx: ReportFile}>(REPORT_VERDICT_DOCX,
      {fetchPolicy: "no-cache"});
  const [reportError, setReportError] = useState("");
  const [showThreshold, setShowThreshold] = useState(false);
  const [threshold, setThreshold] = useState("");

  async function onMarkedPdf(minAmount: number) {
    setShowThreshold(false);
    setReportError("");
    try {
      const r = await getMarkedPdf({variables: {minAmount}});
      if (r.data?.reportMarkedSuspectsPdf) {
        downloadBase64(r.data.reportMarkedSuspectsPdf);
      } else {
        setReportError(r.error?.message ?? "Тайлан үүсгэж чадсангүй.");
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onReport() {
    setReportError("");
    try {
      const r = await getVerdictDocx();
      if (r.data?.reportVerdictDocx) {
        downloadBase64(r.data.reportVerdictDocx);
      } else {
        setReportError(r.error?.message ?? "Тайлан үүсгэж чадсангүй.");
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : String(e));
    }
  }


  if (loading || !data) {
    return (
      <div className="page-container">
        <PageHeader icon="📄" title="Тайлан" subtitle="ТАЙЛАН ҮҮСГЭХ" />
        <Loading />
      </div>
    );
  }

  const accounts = data.accountAnalyses;
  const mutual = data.caseRelations.relations.filter((r) => r.mutual);
  const totals = accounts.reduce((sum, account) => ({
    txns: sum.txns + account.txnCount,
    credit: sum.credit + account.creditTotal,
    debit: sum.debit + account.debitTotal,
  }), {txns: 0, credit: 0, debit: 0});
  const ownerCount = new Set(accounts.map((a) => a.ownerName?.trim())
    .filter(Boolean)).size;
  const periodFrom = accounts.reduce<string | null>((min, a) =>
    !min || (a.firstTxn && a.firstTxn < min) ? a.firstTxn : min, null);
  const periodTo = accounts.reduce<string | null>((max, a) =>
    !max || (a.lastTxn && a.lastTxn > max) ? a.lastTxn : max, null);
  const directTotal = data.directTransfers.reduce((sum, t) => sum + t.total, 0);
  const directCount = data.directTransfers.reduce((sum, t) =>
    sum + t.txnCount, 0);
  const topDirect = [...data.directTransfers]
    .sort((a, b) => b.total - a.total)[0] ?? null;
  const busiest = [...accounts].sort((a, b) => b.txnCount - a.txnCount)[0];
  const actions = (
    <>
      <button className="btn btn-accent"
        onClick={() => { setThreshold(""); setShowThreshold(true); }}
        disabled={markedQ.loading}>
        {markedQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "ГҮЙЛГЭЭНИЙ ТАЙЛАН (PDF)"}
      </button>
      <button className="btn btn-primary" onClick={() => void onReport()}
        disabled={verdictQ.loading}>
        {verdictQ.loading ? "ҮҮСГЭЖ БАЙНА..." : "ТАЙЛАН"}
      </button>
    </>
  );

  return (
    <div className="page-container">
      <PageHeader icon="📄" title="Тайлан"
        subtitle="ИДЭВХТЭЙ ХЭРГИЙН ДАНСНЫ ДҮН ШИНЖИЛГЭЭ" actions={actions} />

      {!data.activeCase || accounts.length === 0 ? (
        <Empty message="Идэвхтэй хэрэгт шинжлэх дансны хуулга алга." />
      ) : (
        <>
          <Card title="Тайлангийн хамрах хүрээ" style={{marginBottom: 16}}>
            <div className="report-scope-grid">
              <div><span>Хэрэг</span><strong>{data.activeCase.caseId} · {data.activeCase.caseName}</strong></div>
              <div><span>Хугацаа</span><strong>{formatDate(periodFrom)} — {formatDate(periodTo)}</strong></div>
            </div>
          </Card>

          <div className="metrics-grid">
            <StatCard label="Шинжилсэн данс" value={formatNum(accounts.length)} />
            <StatCard label="Данс эзэмшигч" value={formatNum(ownerCount)} />
            <StatCard label="Нийт гүйлгээ" value={formatNum(totals.txns)} />
            <StatCard label="Нийт орлого" value={formatMoney(totals.credit)} color="green" />
            <StatCard label="Нийт зарлага" value={formatMoney(totals.debit)} color="red" />
            <StatCard label="Данс хооронд шилжсэн" value={formatMoney(directTotal)} color="cyan" />
          </div>

          <Card title="Шинжилсэн данс ба эзэмшигч" noPadding style={{marginBottom: 16}}>
            <DataTable rows={accounts} rowKey={(a) => a.accountId}
              columns={[
                {header: "Эзэмшигч / данс", render: (a) => (
                  <div className="report-party-cell"><strong>{a.ownerName || "Эзэмшигч тодорхойгүй"}</strong><span>{a.accountNumber}</span></div>
                )},
                {header: "Хугацаа", render: (a) => `${formatDate(a.firstTxn)} — ${formatDate(a.lastTxn)}`},
                {header: "Гүйлгээ", align: "right", render: (a) => formatNum(a.txnCount)},
                {header: "Харилцсан тал", align: "right", render: (a) => formatNum(a.counterpartyCount)},
                {header: "Орлого", align: "right", render: (a) => formatMoney(a.creditTotal)},
                {header: "Зарлага", align: "right", render: (a) => formatMoney(a.debitTotal)},
                {header: "Зөрүү", align: "right", render: (a) => formatMoney(a.netTotal)},
              ]} />
          </Card>

          <section className="report-section">
            <h2>ХОЛБООСЫН ШИНЖИЛГЭЭ</h2>
            <Card title={`Дундын харилцсан тал (${formatNum(mutual.length)})`}
              noPadding>
              <DataTable rows={mutual.slice(0, 60)} rowKey={(r) => r.key}
                empty="Дундын харилцсан тал алга"
                scroll={{maxHeight: 360, overflowY: "auto"}}
                columns={[
                  {header: "Харилцсан тал / данс", render: (r) => (
                    <div className="report-party-cell"><strong>{r.name}</strong><span>{r.account ?? "Дансны дугааргүй"}</span></div>
                  )},
                  {header: "Гүйлгээ", align: "right", render: (r) => formatNum(r.txnCount)},
                  {header: "Орлого", align: "right", render: (r) => formatMoney(r.creditTotal)},
                  {header: "Зарлага", align: "right", render: (r) => formatMoney(r.debitTotal)},
                ]} />
            </Card>
            <Card title="Шинжилсэн данснуудын хоорондын гүйлгээ"
              style={{marginTop: 16}}>
              <div className="report-summary-text">
                {directCount > 0 ? (
                  <>
                    <p>Шинжилсэн данснууд хоорондоо нийт <strong>{formatNum(directCount)} удаа</strong>, <strong>{formatMoney(directTotal)}</strong>-ийн гүйлгээ хийсэн.</p>
                    {topDirect && <p>Хамгийн өндөр дүнтэй чиглэл: <strong>{topDirect.fromLabel}</strong>-аас <strong>{topDirect.toLabel}</strong> руу {formatMoney(topDirect.total)}.</p>}
                  </>
                ) : <p>Шинжилсэн данснуудын хооронд шууд гүйлгээ илрээгүй.</p>}
              </div>
            </Card>
          </section>

          <section className="report-section">
            <h2>ЕРӨНХИЙ ДҮГНЭЛТ</h2>
            <Card>
              <ol className="report-conclusion-list">
                <li>Энэ тайланд {formatNum(accounts.length)} дансны {formatNum(totals.txns)} гүйлгээг нэгтгэн үзлээ. Эдгээр дансанд нийт {formatMoney(totals.credit)} орж, {formatMoney(totals.debit)} гарсан байна.</li>
                {busiest && <li>Хамгийн олон хөдөлгөөнтэй нь {busiest.ownerName || "эзэмшигч тодорхойгүй"} хүний {busiest.accountNumber} дугаартай данс бөгөөд {formatNum(busiest.txnCount)} гүйлгээтэй.</li>}
                <li>Эдгээр нь банкны хуулгад тулгуурласан тоон нэгтгэл бөгөөд анхаарал татсан харилцаа, гүйлгээг дараагийн шалгалтаар баримттай нь нягтлах шаардлагатай.</li>
              </ol>
            </Card>
          </section>
        </>
      )}

      {showThreshold && (
        <div className="modal-overlay" onClick={() => setShowThreshold(false)}>
          <div className="modal-content" style={{width: "min(440px, 92vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Гүйлгээний доод босго</span>
              <button className="modal-close"
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
                    void onMarkedPdf(Math.max(0,
                      Math.floor(Number(threshold) || 0)));
                  }
                }} />
              <div style={{fontSize: 12, color: "var(--text-muted)",
                marginTop: 8}}>
                Энэ дүнгээс их (буюу тэнцүү) гүйлгээ хийсэн БҮХ этгээд —
                тайланд орно. Хоосон эсвэл 0 бол импортолсон бүх сэжигтний
                гүйлгээг хамруулна.
              </div>
              <div style={{display: "flex", gap: 8, justifyContent: "flex-end",
                marginTop: 20}}>
                <button className="btn" onClick={() => setShowThreshold(false)}>
                  Болих
                </button>
                <button className="btn btn-accent"
                  onClick={() => void onMarkedPdf(Math.max(0,
                    Math.floor(Number(threshold) || 0)))}>
                  PDF ТАТАХ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {reportError && (
        <div className="modal-overlay" onClick={() => setReportError("")}>
          <div className="modal-content" style={{width: "min(440px, 92vw)"}}
            onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Тайлан үүссэнгүй</span>
              <button className="modal-close"
                onClick={() => setReportError("")}>×</button>
            </div>
            <div className="modal-body">
              <div>{reportError}</div>
              <div style={{display: "flex", gap: 8, justifyContent: "flex-end",
                marginTop: 20}}>
                <button className="btn btn-accent"
                  onClick={() => setReportError("")}>
                  ХААХ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
