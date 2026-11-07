import {useMemo, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {useQuery} from "@apollo/client";
import {useAuth} from "../lib/auth";
import {Card, DataTable, Empty, Loading, MetricsGrid, PageHeader, StatCard} from "../components/kit";
import {MultiSelect, Select} from "../components/inputs";
import NetworkGraph from "../components/NetworkGraph";
import {buildEvidenceNetwork} from "../lib/networkGraph";
import type {NetworkNode} from "../lib/networkGraph";
import {formatDateTime, formatMoney, formatNum} from "../lib/format";
import {ADMIN_ANALYSIS_CASES, ADMIN_CASE_ANALYSIS} from "../graphql/adminCaseAnalysis";
import type {AnalysisCase, AnalysisRelation, CaseAnalysis} from "../graphql/adminCaseAnalysis";

const TABS = [
  {key: "graph", label: "Нэгдсэн зураглал"},
  {key: "shared", label: "Дундын харьцаа"},
  {key: "relations", label: "Бүх харьцаа"},
  {key: "transactions", label: "Гүйлгээ"},
  {key: "accounts", label: "Данс"},
] as const;

export default function MultiCaseAnalysisPage() {
  const {isAdmin} = useAuth();
  return isAdmin ? <AnalysisView /> : <Empty message="Зөвхөн админд нээлттэй." />;
}

function AnalysisView() {
  const [params, setParams] = useSearchParams();
  const ids = [...new Set((params.get("cases") ?? "").split(",")
    .filter(s => /^[1-9]\d*$/.test(s)).map(Number)
    .filter(n => Number.isSafeInteger(n) && n <= 2147483647))].sort((a, b) => a - b);
  const selectionKey = ids.join(",");
  const tab = TABS.find(t => t.key === params.get("tab"))?.key ?? "graph";
  const sort = (tab === "transactions" ? ["amount"] : ["amount", "name"])
    .includes(params.get("sort") ?? "") ? params.get("sort")! : "default";
  const pageValue = Number(params.get("page"));
  const requestedPage = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1;
  const [detail, setDetail] = useState<{selection: string; node: NetworkNode} | null>(null);
  // Personal counterparty identity stays out of the URL; the selection key
  // prevents a temporary drilldown carrying over to a different set of cases.
  const [drilldown, setDrilldown] = useState<{selection: string; key: string} | null>(null);
  const relationFilter = drilldown?.selection === selectionKey ? drilldown.key : null;
  const casesQ = useQuery<{caseFiles: AnalysisCase[]}>(ADMIN_ANALYSIS_CASES);
  // Keep the union out of the ordinary single-case Apollo entity cache.
  const analysisQ = useQuery<{adminCaseAnalysis: CaseAnalysis}>(ADMIN_CASE_ANALYSIS, {
    variables: {caseFileIds: ids}, skip: !ids.length, fetchPolicy: "no-cache",
  });
  const result = analysisQ.data?.adminCaseAnalysis;
  const cases = casesQ.data?.caseFiles ?? [];
  const caseById = new Map((result?.cases ?? cases).map(c => [c.id, c]));
  const caseNames = (caseIds: number[]) => caseIds.map(id => {
    const c = caseById.get(id); return c ? `${c.caseId} · ${c.caseName}` : String(id);
  }).join(", ");
  const accountById = new Map(result?.accounts.map(r => [r.account.id, r.account]));
  const shared = result?.relations.filter(r => r.caseFileIds.length > 1) ?? [];
  function patch(values: Record<string, string | null>) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    });
  }
  function changeTab(value: string) {patch({tab: value === "graph" ? null : value, page: null, sort: null});}
  function selectCases(values: string[]) {
    patch({cases: [...new Set(values.map(Number))].sort((a, b) => a - b).join(",") || null, page: null});
  }
  const network = useMemo(() => {
    if (!result) return null;
    const net = buildEvidenceNetwork(result.people.map(r => r.person), result.links,
      result.accounts.map(r => ({...r.account, bankName: r.account.bankName ?? ""})),
      result.transactions.map(r => ({...r.transaction, amount: r.transaction.type === "debit"
        ? -Math.abs(r.transaction.amount) : Math.abs(r.transaction.amount)})), [], []);
    // As on the case chart, inferred/name-only links never pull an isolated
    // person into view; they only bridge people with actual statement flow.
    const live = new Set(net.links.filter(l => !l.soft)
      .flatMap(l => [l.source, l.target]));
    const names = new Map(result.cases.map(c => [c.id, `${c.caseId} · ${c.caseName}`]));
    const peopleCases = new Map(result.people.map(r => [r.person.id, r.caseFileIds]));
    const accountCases = new Map(result.accounts.map(r => [r.account.id, r.caseFileIds]));
    for (const n of net.nodes) {
      const caseIds = n.id.startsWith("s:")
        ? peopleCases.get(Number(n.id.slice(2)))
        : accountCases.get(Number(n.id.slice(2)));
      n.stats.push(["Хэрэг", (caseIds ?? []).map(id => names.get(id)).filter(Boolean).join(", ")]);
    }
    return {nodes: net.nodes.filter(n => live.has(n.id)),
      links: net.links.filter(l => live.has(l.source) && live.has(l.target))};
  }, [result]);
  const relationRows = [...(tab === "shared" ? shared : result?.relations ?? [])].sort((a, b) =>
    sort === "name" ? a.relation.name.localeCompare(b.relation.name)
      : sort === "amount" ? (b.relation.creditTotal + b.relation.debitTotal)
        - (a.relation.creditTotal + a.relation.debitTotal)
        : b.relation.txnCount - a.relation.txnCount);
  const txnRows = [...(result?.transactions ?? [])].sort((a, b) => sort === "amount"
    ? Math.abs(b.transaction.amount) - Math.abs(a.transaction.amount)
    : b.transaction.timestamp.localeCompare(a.transaction.timestamp) || b.transaction.id - a.transaction.id);
  const accountRows = [...(result?.accounts ?? [])].sort((a, b) =>
    a.account.accountNumber.localeCompare(b.account.accountNumber));
  const filteredTxns = relationFilter ? txnRows.filter(r => r.relationKey === relationFilter) : txnRows;
  const count = tab === "transactions" ? filteredTxns.length : tab === "accounts" ? accountRows.length : relationRows.length;
  const pages = Math.max(1, Math.ceil(count / 25));
  const page = Math.min(Math.floor(requestedPage), pages);
  const slice = <T,>(rows: T[]) => rows.slice((page - 1) * 25, page * 25);
  const relationColumns = [
    {header: "Харьцагч", render: (r: AnalysisRelation) => <><div>{r.relation.name}</div>
      <div className="multi-case-muted">{r.relation.account}</div></>},
    {header: "Регистр", render: (r: AnalysisRelation) => r.relation.nationalId || "—"},
    {header: "Хэрэг", render: (r: AnalysisRelation) => caseNames(r.caseFileIds)},
    {header: "Гүйлгээ", align: "right" as const, render: (r: AnalysisRelation) => <button className="btn btn-sm"
      onClick={() => {setDrilldown({selection: selectionKey, key: r.relation.key}); changeTab("transactions");}}>{formatNum(r.relation.txnCount)} · Харах</button>},
    {header: "Орлого", align: "right" as const, render: (r: AnalysisRelation) => formatMoney(r.relation.creditTotal)},
    {header: "Зарлага", align: "right" as const, render: (r: AnalysisRelation) => formatMoney(r.relation.debitTotal)},
  ];
  const node = detail?.selection === selectionKey
    && network?.nodes.some(n => n.id === detail.node.id) ? detail.node : null;
  return <div className="page-container multi-case-page">
    <PageHeader icon="🗂" title="Хэрэг дамнасан шинжилгээ" subtitle="ЗӨВХӨН АДМИН" />
    <Card title="Хамтад нь харах хэргүүд">
      {casesQ.error ? <div role="alert">Хэргийн жагсаалтыг ачаалж чадсангүй.
        <button className="btn" onClick={() => void casesQ.refetch()}>Дахин оролдох</button></div>
        : <div className="multi-case-picker">
          <MultiSelect values={ids.map(String)} onChange={selectCases} searchable
            allLabel="Хэрэг сонгоогүй" manyLabel={n => `${n} хэрэг сонгосон`}
            disabled={casesQ.loading} style={{flex: 1, minWidth: 0}}
            options={cases.map(c => ({value: c.id, label: `${c.caseId} · ${c.caseName}`}))} />
          <button className="btn" disabled={!cases.length} onClick={() => selectCases(cases.map(c => String(c.id)))}>Бүгдийг сонгох</button>
        </div>}
    </Card>
    {!ids.length ? <Empty message="Хамтад нь харах хэргүүдээ сонгоно уу." />
      : analysisQ.loading ? <Loading />
      : analysisQ.error ? <Card><p role="alert">{analysisQ.error.message}</p>
        <button className="btn" onClick={() => void analysisQ.refetch()}>Дахин оролдох</button></Card>
      : result && <>
        <p className="multi-case-muted">{caseNames(result.cases.map(c => c.id))}</p>
        <MetricsGrid>
          <StatCard label="Дундын харьцаа" value={formatNum(shared.length)} color="amber" onClick={() => changeTab("shared")} />
          <StatCard label="Бүх харьцаа" value={formatNum(result.relations.length)} onClick={() => changeTab("relations")} />
          <StatCard label="Гүйлгээ" value={formatNum(result.transactions.length)} color="green" onClick={() => {setDrilldown(null); changeTab("transactions");}} />
          <StatCard label="Данс" value={formatNum(result.accounts.length)} onClick={() => changeTab("accounts")} />
        </MetricsGrid>
        <div className="multi-case-tabs" role="tablist" aria-label="Нэгдсэн шинжилгээ">
          {TABS.map(t => <button key={t.key} className="btn" role="tab" aria-selected={tab === t.key}
            onClick={() => {setDrilldown(null); changeTab(t.key);}}>{t.label}</button>)}
        </div>
        {tab === "graph" ? <Card title="Нэгдсэн зураглал">
          {network?.nodes.length ? <NetworkGraph key={selectionKey} nodes={network.nodes} links={network.links}
            onNodeClick={n => setDetail(n ? {selection: selectionKey, node: n} : null)} selectedId={node?.id} />
            : <Empty message="Сонгосон хэргүүдэд зураглах гүйлгээний холбоос алга." />}
          {node && <div className="multi-case-detail"><strong>{node.label}</strong>
            <button className="btn btn-sm" onClick={() => setDetail(null)}>Хаах</button>
            {node.stats.map(([label, value], i) => <div className="graph-detail-row" key={`${label}:${i}`}>
              <span>{label}</span><span>{value}</span></div>)}</div>}
        </Card> : <Card title={TABS.find(t => t.key === tab)?.label} noPadding>
          {tab !== "accounts" && <div className="multi-case-table-tools">
            <span>Эрэмбэ</span><Select value={sort}
              onChange={v => patch({sort: v === "default" ? null : v, page: null})}
              options={[{value: "default", label: tab === "transactions" ? "Сүүлийн гүйлгээ" : "Их давтамж"},
                {value: "amount", label: "Их дүн"}, ...(tab === "transactions" ? [] : [{value: "name", label: "Нэр"}])]} />
            {tab === "transactions" && relationFilter && <button className="btn" onClick={() => {setDrilldown(null); patch({page: null});}}>Бүх гүйлгээг харах</button>}
          </div>}
          {tab === "transactions" ? <DataTable rows={slice(filteredTxns)} rowKey={r => r.transaction.id} scroll={{overflowX: "auto"}}
            columns={[
              {header: "Огноо", render: r => formatDateTime(r.transaction.timestamp)},
              {header: "Данс", render: r => accountById.get(r.transaction.bankAccountId)?.accountNumber ?? "—"},
              {header: "Харьцагч", render: r => <>{r.transaction.counterpartyName || "—"}<div className="multi-case-muted">{r.transaction.counterpartyAccount}</div></>},
              {header: "Регистр", render: r => r.transaction.counterpartyNationalId || "—"},
              {header: "Дүн", align: "right", render: r => `${r.transaction.type === "credit" ? "+" : "−"}${formatMoney(Math.abs(r.transaction.amount))}`},
              {header: "Утга", render: r => r.transaction.description || "—"},
              {header: "Хэрэг", render: r => caseNames(r.caseFileIds)},
            ]} />
            : tab === "accounts" ? <DataTable rows={slice(accountRows)} rowKey={r => r.account.id} scroll={{overflowX: "auto"}}
              columns={[
                {header: "Данс", render: r => r.account.accountNumber},
                {header: "Эзэмшигч", render: r => r.account.accountHolderName || "—"},
                {header: "Банк", render: r => r.account.bankName || "—"},
                {header: "Хуулгатай хэрэг", render: r => caseNames(r.statementCaseFileIds) || "—"},
                {header: "Хамаарах хэрэг", render: r => caseNames(r.caseFileIds)},
              ]} />
              : <DataTable rows={slice(relationRows)} rowKey={r => r.relation.key} columns={relationColumns}
                scroll={{overflowX: "auto"}} empty={tab === "shared" ? "Хоёр ба түүнээс олон хэрэгт давхцах харьцаа алга." : "Харьцаа алга."} />}
          {pages > 1 && <div className="multi-case-pager">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => patch({page: page <= 2 ? null : String(page - 1)})}>Өмнөх</button>
            <span>{page} / {pages}</span>
            <button className="btn btn-sm" disabled={page >= pages} onClick={() => patch({page: String(page + 1)})}>Дараах</button>
          </div>}
        </Card>}
      </>}
  </div>;
}
