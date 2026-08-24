/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LinkVerdictReport.tsx
 * Created at  : 2026-08-07
 * Author      : jeefo
 * Purpose     : Дарга нарт өгөх хэвлэмэл дүгнэлт — a plain paper-style report
 *               of the connection analysis. No software concepts on it: only
 *               conclusions in sentences, the case, the date. Printed with the
 *               browser's own dialog (PDF or paper).
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect} from "react";
import {linkVerdict} from "../lib/linkVerdict";
import type {GraphVerdictItem} from "../lib/linkVerdict";
import type {NetworkLink, NetworkNode} from "../lib/networkGraph";

export default function LinkVerdictReport(props: {
  open     : boolean;
  onClose  : () => void;
  caseName : string;
  caseCode : string;
  nodes    : NetworkNode[];
  links    : NetworkLink[];
  verdict  : GraphVerdictItem[];
}) {
  const {open, onClose} = props;

  // The print stylesheet keys off this class: while the report is open,
  // Ctrl+P / the button prints ONLY the sheet, not the app behind it.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("report-open");
    return () => document.body.classList.remove("report-open");
  }, [open]);

  if (!open) return null;

  const byId = new Map(props.nodes.map((n) => [n.id, n]));
  const label = (id: string) => byId.get(id)?.label ?? id;

  // Money pairs first (largest total on top), then the busiest call pairs —
  // the order a reader ranks importance in, capped so the report stays short.
  const txns = props.links
    .filter((l) => l.kind === "txn" && (l.facts?.txnTotal ?? 0) > 0)
    .sort((a, b) => (b.facts?.txnTotal ?? 0) - (a.facts?.txnTotal ?? 0));
  const calls = props.links
    .filter((l) => l.kind === "call" && (l.facts?.callCount ?? 0) > 0)
    .sort((a, b) => (b.facts?.callCount ?? 0) - (a.facts?.callCount ?? 0));
  const manual = props.links.filter((l) => l.kind === "manual");
  const top = [...txns, ...calls].slice(0, 12);

  const t = new Date();
  const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`
    + `-${String(t.getDate()).padStart(2, "0")}`;

  return (
    <div className="link-report-overlay" onClick={onClose}>
      <div className="link-report-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="no-print" style={{display: "flex", gap: 8,
          justifyContent: "flex-end", marginBottom: 16}}>
          <button className="btn btn-primary btn-sm"
            onClick={() => window.print()}>ХЭВЛЭХ</button>
          <button className="btn btn-sm" onClick={onClose}>ХААХ</button>
        </div>

        <h1>ХОЛБООНЫ ШИНЖИЛГЭЭНИЙ ДҮГНЭЛТ</h1>
        <div className="link-report-meta">
          <div>
            Хэрэг: {props.caseName}
            {props.caseCode ? ` (${props.caseCode})` : ""}
          </div>
          <div>Огноо: {date}</div>
        </div>

        <h2>Ерөнхий дүгнэлт</h2>
        {props.verdict.length ? (
          <ol>
            {props.verdict.map((v, i) => (
              <li key={i}>
                {v.text}
                {v.rows && (
                  <ul>
                    {v.rows.map((row, rowIndex) => (
                      <li key={rowIndex}>
                        <b>{row.kind}: {row.identity}</b> — {row.connects}; {row.evidence}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <div>Дүгнэлт гаргах нотлох баримт бүртгэгдээгүй байна.</div>
        )}

        {top.length > 0 && (
          <>
            <h2>Гол холбоосууд</h2>
            <ol>
              {top.map((l, i) => (
                <li key={i}>
                  <b>{label(l.source)} — {label(l.target)}.</b>{" "}
                  {linkVerdict(l, label(l.source), label(l.target)).join(" ")}
                </li>
              ))}
            </ol>
          </>
        )}

        {manual.length > 0 && (
          <>
            <h2>Мөрдөгчийн тэмдэглэсэн холбоос</h2>
            <ol>
              {manual.slice(0, 10).map((l, i) => (
                <li key={i}>
                  <b>{label(l.source)} — {label(l.target)}</b>
                  {" — "}{l.label ?? "Холбоос"}
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="link-report-foot">
          Энэхүү дүгнэлтийг системд бүртгэгдсэн банкны гүйлгээ болон
          дуудлагын бүртгэлд үндэслэн нэгтгэв. Хэвлэсэн: {date}
        </div>
      </div>
    </div>
  );
}
