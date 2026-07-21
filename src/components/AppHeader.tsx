/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : AppHeader.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useState} from "react";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {ACTIVE_CASE_QUERY, SET_ACTIVE_CASE} from "../graphql/queries";
import {STATUS_LABELS} from "../nav";
import {Select} from "./inputs";
import {useNoiseFilterSync} from "../lib/ignoredPairs";
import {useAuth} from "../lib/auth";

// Global case SCOPE bar shown on every page: the analyst picks the case once
// here and every page (evidence tagging, exhibits, …) follows it via the
// shared ACTIVE_CASE_QUERY Apollo cache entry. Case management itself (create,
// merge, status changes) lives on the /cases page — never here.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
  status: string;
}

export default function AppHeader() {
  const client = useApolloClient();
  const {user, isAdmin, logout} = useAuth();
  const caseQ = useQuery<{activeCase: CaseRef | null; caseFiles: CaseRef[]}>(
    ACTIVE_CASE_QUERY
  );
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE);

  const activeCase = caseQ.data?.activeCase ?? null;
  const caseFiles = caseQ.data?.caseFiles ?? [];

  // Load THIS case's permanent noise-filter (marked-unimportant data) from the
  // DB and keep it in sync — so the connection graph always excludes exactly
  // what the analyst removed, on any machine, across reloads.
  useNoiseFilterSync(activeCase?.id ?? null);

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
      </div>

      {/* Current account + sign-out, pinned to the right. */}
      <div style={{marginLeft: "auto", display: "flex", alignItems: "center",
        gap: 12}}>
        <div style={{textAlign: "right", lineHeight: 1.2}}>
          <div style={{fontSize: 13, color: "var(--text-primary)"}}>
            {user?.fullName || user?.username}
          </div>
          <div style={{fontSize: 11, color: isAdmin
            ? "var(--accent-amber)" : "var(--text-secondary)"}}>
            {isAdmin ? "Хэлтсийн дарга" : "Мөрдөгч"}
          </div>
        </div>
        <button className="btn" onClick={() => logout()}
          title="Гарах">⏻ Гарах</button>
      </div>
    </header>
  );
}
