/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AppHeader.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {Link, useLocation} from "react-router-dom";
import {
  useApolloClient,
  useMutation,
  useQuery,
  useReactiveVar,
} from "@apollo/client";
import {ACTIVE_CASE_QUERY, SET_ACTIVE_CASE} from "../graphql/queries";
import {NAV_META, STATUS_BADGE, STATUS_LABELS} from "../nav";
import {drilldownVar} from "../lib/drilldown";
import {Select} from "./inputs";

// Global case SCOPE bar shown on every page: the analyst picks the case once
// here and every page (evidence tagging, exhibits, …) follows it via the
// shared ACTIVE_CASE_QUERY Apollo cache entry. The breadcrumb makes the
// hierarchy explicit: case › current page. Case management itself (create,
// merge, status changes) lives on the /cases page — never here.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
  status: string;
}

export default function AppHeader() {
  const location = useLocation();
  const client = useApolloClient();
  const caseQ = useQuery<{activeCase: CaseRef | null; caseFiles: CaseRef[]}>(
    ACTIVE_CASE_QUERY
  );
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE);

  const activeCase = caseQ.data?.activeCase ?? null;
  const caseFiles = caseQ.data?.caseFiles ?? [];
  const page = NAV_META.find((n) => location.pathname.startsWith(n.path));
  const drill = useReactiveVar(drilldownVar);

  // Status filter for the case dropdown (user wish: e.g. only open cases).
  // Sticky across sessions.
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem("caseStatusFilter") ?? ""
  );
  const visibleCases = statusFilter
    ? caseFiles.filter((c) => c.status === statusFilter)
    : caseFiles;

  function onFilterChange(v: string) {
    setStatusFilter(v);
    localStorage.setItem("caseStatusFilter", v);
    // The filter defines the working scope: an active case that falls
    // outside it must not silently stay selected — deselect it.
    if (v && activeCase && activeCase.status !== v) {
      void onSelectCase(null);
    }
  }

  async function onSelectCase(id: number | null) {
    await setActiveCase({variables: {caseFileId: id}});
    // Every evidence query is case-scoped server-side — refetch them all so
    // whatever page is open follows the new scope immediately.
    await client.resetStore();
  }

  const status = activeCase?.status ?? "";

  return (
    <header className="app-header">
      <div className="app-header-group">
        <span className="app-header-label">Кейс</span>
        <Select
          className="app-header-status"
          value={statusFilter}
          onChange={onFilterChange}
          title="Кейсийн жагсаалтыг төлвөөр шүүх"
          options={[
            {value: "", label: "Бүх төлөв"},
            ...["OPEN", "ACTIVE", "CLOSED", "ARCHIVED"].map((s) => ({
              value: s, label: STATUS_LABELS[s] ?? s})),
          ]} />
        <Select
          className="app-header-select"
          value={activeCase?.id ?? ""}
          onChange={(v) => onSelectCase(v ? Number(v) : null)}
          title="Идэвхтэй кейс — бүх хуудсанд үйлчилнэ"
          triggerLabel={activeCase
            ? `${activeCase.caseId} · ${activeCase.caseName} (${
              STATUS_LABELS[activeCase.status] ?? activeCase.status})`
            : "Кейс сонгоогүй"}
          options={[
            {value: "", label: "Кейс сонгоогүй"},
            ...visibleCases.map((c) => ({value: c.id,
              label: `${c.caseId} · ${c.caseName} (${
                STATUS_LABELS[c.status] ?? c.status})`})),
          ]} />
        {activeCase && (
          <span className={`badge ${STATUS_BADGE[status] ?? "unknown"}`}
            title="Төлөв солих бол Кейсүүд хуудсыг ашиглана">
            {STATUS_LABELS[status] ?? status}
          </span>
        )}
        {page && page.path !== "/cases" && (
          <>
            <span className="app-header-crumb">›</span>
            <span className="app-header-page">{page.label}</span>
            {drill && (
              <>
                <span className="app-header-crumb">›</span>
                <span className="app-header-page app-header-drill"
                  title={drill}>
                  {drill}
                </span>
              </>
            )}
          </>
        )}
      </div>
      <div className="app-header-group">
        <Link to="/cases" className="app-header-manage">
          КЕЙС УДИРДАХ →
        </Link>
      </div>
    </header>
  );
}
