import {forwardRef, useImperativeHandle, useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";
import {useSearchParams} from "react-router-dom";
import NetworkGraph, {LINK_STYLE} from "./NetworkGraph";
import type {NetworkGraphHandle} from "./NetworkGraph";
import {Card, DataTable, Empty, OffenderTag, SankeyChart} from "./kit";
import type {Column} from "./kit";
import {analyseGraph} from "../lib/graphAnalysis";
import {formatMoney, formatNum} from "../lib/format";
import type {NetworkLink, NetworkNode} from "../lib/networkGraph";
import {buildReportGraphAnalysis, type ReportGraphAnalysis} from "../lib/reportGraphAnalysis";

export interface GraphAnalysisPanelsHandle {exportReport: () => Promise<ReportGraphAnalysis>}

const PAGE_SIZE = 20;
function currentPage(params: URLSearchParams, key: string, length: number) {
  const raw = Number(params.get(key) ?? 1);
  const pages = Math.max(1, Math.ceil(length / PAGE_SIZE));
  return Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, pages) : 1;
}

function AnalysisTable<T>({rows, columns, rowKey, pageKey}: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; pageKey: string;
}) {
  const [params, setParams] = useSearchParams();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = currentPage(params, pageKey, rows.length);
  const go = (next: number) => setParams(prev => {
    const p = new URLSearchParams(prev);
    next === 1 ? p.delete(pageKey) : p.set(pageKey, String(next));
    return p;
  }, {preventScrollReset: true});
  return <div className="graph-analysis-list">
    <DataTable rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
      columns={columns} rowKey={rowKey} scroll={{overflow: "auto", maxHeight: 460, scrollbarGutter: "stable"}} />
    {pages > 1 && <div className="graph-analysis-pager">
      <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} / {rows.length}</span>
      <button className="btn btn-sm" disabled={page === 1} onClick={() => go(page - 1)}>Өмнөх</button>
      <span>{page} / {pages}</span>
      <button className="btn btn-sm" disabled={page === pages} onClick={() => go(page + 1)}>Дараах</button>
    </div>}
  </div>;
}

function Identity({node, person = node}: {node: NetworkNode; person?: NetworkNode}) {
  return <span className="graph-analysis-identity">
    <span>{person.offender && <OffenderTag />}{person.label}</span>
    {node.id !== person.id && <small>{node.label}</small>}
    {node.type === "ACCOUNT" && node.sub && <small>{node.sub}</small>}
  </span>;
}

function Section({id, title, note, empty, hasRows, list, diagram}: {
  id: string; title: string; note: string; empty: string; hasRows: boolean;
  list: ReactNode; diagram: ReactNode;
}) {
  return <section id={id} className="graph-analysis-section" aria-label={title}>
    <Card title={title}>
      <p className="graph-analysis-note">{note}</p>
      {hasRows ? <div className="graph-analysis-grid">
        {list}<div className="graph-analysis-diagram">{diagram}</div>
      </div> : <Empty message={empty} />}
    </Card>
  </section>;
}

export default forwardRef<GraphAnalysisPanelsHandle, {
  nodes: NetworkNode[]; links: NetworkLink[];
}>(function GraphAnalysisPanels({nodes, links}, ref) {
  const analysis = useMemo(() => analyseGraph(nodes, links), [nodes, links]);
  const [params] = useSearchParams();
  const flowPage = currentPage(params, "flowPage", analysis.flow.length);
  const flowRows = useMemo(() => analysis.flow.slice((flowPage - 1) * PAGE_SIZE,
    flowPage * PAGE_SIZE), [analysis, flowPage]);
  const sharedRef = useRef<NetworkGraphHandle>(null);
  const redRef = useRef<NetworkGraphHandle>(null);
  const [sharedFocus, setSharedFocus] = useState<string | null>(null);
  const [redFocus, setRedFocus] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({async exportReport() {
    const snapshot = buildReportGraphAnalysis(nodes, links);
    if (snapshot.shared.rows.length) {
      if (!sharedRef.current) throw Error("Дундын харилцааны зураглал бэлэн болоогүй байна.");
      snapshot.shared.image = await sharedRef.current.exportPng();
    }
    if (snapshot.red.rows.length) {
      if (!redRef.current) throw Error("Улаан этгээдийн зураглал бэлэн болоогүй байна.");
      snapshot.red.image = await redRef.current.exportPng();
    }
    return snapshot;
  }}));
  const directed = useMemo(() => {
    const flow = flowRows.filter(r => r.directed);
    // Separate sender and receiver roles: bidirectional transfers and cycles
    // remain visible without feeding cyclic links to the Sankey layout.
    const senders = [...new Map(flow.map(r => [r.source.id, r.source])).values()];
    const receivers = [...new Map(flow.map(r => [r.target.id, r.target])).values()];
    const from = new Map(senders.map((n, i) => [n.id, i]));
    const to = new Map(receivers.map((n, i) => [n.id, senders.length + i]));
    return {labels: [...senders.map(n => `Илгээсэн · ${n.label}`),
      ...receivers.map(n => `Хүлээн авсан · ${n.label}`)],
      source: flow.map(r => from.get(r.source.id)!), target: flow.map(r => to.get(r.target.id)!),
      value: flow.map(r => r.amount), colors: [...senders, ...receivers]
        .map(n => n.offender ? "#FF1744" : n.type === "ACCOUNT" ? "#00B0FF" : "#00C853"),
      linkColors: flow.map(r => r.source.offender || r.target.offender
        ? "rgba(255,23,68,0.25)" : "rgba(0,200,83,0.25)"),
      height: Math.max(460, Math.max(senders.length, receivers.length) * 24 + 64)};
  }, [flowRows]);
  const unknown = flowRows.filter(r => !r.directed);
  const unknownScene = useMemo(() => {
    const pairs = new Set(flowRows.filter(r => !r.directed)
      .map(r => JSON.stringify([r.source.id, r.target.id])));
    const links = analysis.undirectedScene.links.filter(l => pairs.has(JSON.stringify([l.source, l.target])));
    const ids = new Set(links.flatMap(l => [l.source, l.target]));
    return {nodes: analysis.undirectedScene.nodes.filter(n => ids.has(n.id)), links};
  }, [analysis, flowRows]);
  const focusShared = (id: string) => {setSharedFocus(id); sharedRef.current?.focusNode(id);};
  const focusRed = (id: string) => {setRedFocus(id); redRef.current?.focusNode(id);};

  return <div className="graph-analysis-panels">
    <p className="graph-analysis-note">Доорх жагсаалт, зураглалд үндсэн зураглалын шүүлтүүр үйлчилнэ.</p>
    <Section id="graph-money-flow" title={`Мөнгөн урсгал (${analysis.flow.length})`}
      note="Илгээсэн болон хүлээн авсан дүн. Зураглалд жагсаалтын энэ хуудасны урсгалыг харуулав."
      hasRows={analysis.flow.length > 0} empty="Харагдаж буй мөнгөн урсгал алга"
      list={<AnalysisTable rows={analysis.flow} rowKey={r => r.id} pageKey="flowPage" columns={[
        {header: "Этгээд / данс", render: r => <Identity node={r.source} />},
        {header: "Чиглэл", render: r => <span>{r.directed ? "→" : "↔"}
          {!r.directed && <small className="graph-analysis-muted">Тодорхойгүй</small>}</span>},
        {header: "Харилцагч", render: r => <Identity node={r.target} />},
        {header: "Дүн", align: "right", render: r => <span className="graph-analysis-money">
          {formatMoney(r.amount)}{r.soft && <small>Нэрээр холбосон</small>}</span>},
      ]} />}
      diagram={<>
        {directed.value.length > 0 && <div className="graph-analysis-flow" aria-label="Мөнгөн урсгалын зураглал">
          <SankeyChart labels={directed.labels} source={directed.source} target={directed.target}
            value={directed.value} nodeColors={directed.colors} linkColors={directed.linkColors}
            height={directed.height} />
        </div>}
        {unknown.length > 0 && <div aria-label="Чиглэл тодорхойгүй холбоосын зураглал">
          <p className="graph-analysis-note">Чиглэл тодорхойгүй холбоосууд · {unknown.length}</p>
          <NetworkGraph {...unknownScene} height={360} minLabelPixels={11} showNames showEdgeLabels />
        </div>}
      </>} />

    <Section id="graph-shared-relations" title={`Дундын харилцаа (${analysis.shared.length})`}
      note="Хоёр ба түүнээс олон шалгаж буй хүнийг нэг эсвэл хоёр дамжлагаар холбосон этгээд, данс, утас."
      hasRows={analysis.shared.length > 0} empty="Харагдаж буй дундын харилцаа алга"
      list={<AnalysisTable rows={analysis.shared} rowKey={r => r.node.id} pageKey="sharedPage" columns={[
        {header: "Дундын харилцагч", render: r => <Identity node={r.node} />},
        {header: "Холбогдох хүмүүс", render: r => <span className="graph-analysis-identity">
          <span>{r.roots.map(n => n.label).join(" ↔ ")}</span>
          <small>{r.distance} дамжлага</small></span>},
        {header: "Баримт", align: "right", render: r => <span className="graph-analysis-identity">
          {r.money > 0 && <span className="graph-analysis-money">{formatMoney(r.money)}</span>}
          <small>{[r.txns > 0 && `${formatNum(r.txns)} гүйлгээ`,
            r.calls > 0 && `${formatNum(r.calls)} дуудлага`].filter(Boolean).join(" · ") || "Холбоос"}</small>
        </span>},
        {header: "Зураглал", render: r => <button className="btn btn-sm"
          onClick={() => focusShared(r.node.id)}>Зурагт харах</button>},
      ]} />}
      diagram={<div aria-label="Дундын харилцааны зураглал">
        <NetworkGraph ref={sharedRef} {...analysis.sharedScene} height={460} minLabelPixels={11} showNames
          selectedId={sharedFocus} onNodeClick={n => setSharedFocus(n?.id ?? null)} />
      </div>} />

    <Section id="graph-red-relations" title={`Улаанаар тэмдэглэсэн этгээдийн харилцаа (${analysis.red.length})`}
      note="Хэрэгтний бүртгэлд таарсан улаан тэмдэглэгээтэй этгээдийн гүйлгээ, утасны дуудлага, гар холбоос."
      hasRows={analysis.red.length > 0} empty="Улаанаар тэмдэглэсэн этгээдийн харагдаж буй харилцаа алга"
      list={<AnalysisTable rows={analysis.red} rowKey={r => r.id} pageKey="redPage" columns={[
        {header: "Этгээд", render: r => <Identity node={r.source} person={r.sourcePerson} />},
        {header: "Харилцагч", render: r => <Identity node={r.target} person={r.targetPerson} />},
        {header: "Харилцаа", render: r => <span className="graph-analysis-identity">
          <span>{LINK_STYLE[r.link.kind].label}</span><small>{r.link.label ?? "—"}</small>
        </span>},
        {header: "Зураглал", render: r => <button className="btn btn-sm" onClick={() =>
          focusRed(r.sourcePerson.offender ? r.source.id : r.target.id)}>Зурагт харах</button>},
      ]} />}
      diagram={<div aria-label="Улаан этгээдийн харилцааны зураглал">
        <NetworkGraph ref={redRef} {...analysis.redScene} height={460} minLabelPixels={11} showNames
          selectedId={redFocus} onNodeClick={n => setRedFocus(n?.id ?? null)} />
      </div>} />
  </div>;
});
