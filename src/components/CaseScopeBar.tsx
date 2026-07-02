/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : CaseScopeBar.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useQuery} from "@apollo/client";
import {ACTIVE_CASE_QUERY} from "../graphql/queries";

// Scope strip for DATA pages (transactions / calls / timeline / link chart).
// The lists on these pages are case-scoped SERVER-side by the active case in
// the app header; this bar spells that out so the analyst always knows which
// case's evidence they are looking at. With no active case the pages render
// a CaseGate instead of data, so this bar renders nothing.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
}

export default function CaseScopeBar({summary}: {summary?: string}) {
  const {data} = useQuery<{activeCase: CaseRef | null}>(ACTIVE_CASE_QUERY);
  const active = data?.activeCase ?? null;

  if (!active) return null;

  return (
    <div className="scope-bar" role="status">
      <span className="scope-bar-label">Хамрах хүрээ</span>
      <span className="scope-bar-case">{active.caseId}</span>
      <span className="scope-bar-name">{active.caseName}</span>
      {summary && <span className="scope-bar-summary">{summary}</span>}
      <span className="scope-bar-hint">
        Зөвхөн энэ кейсийн өгөгдөл харагдаж байна — кейсийг дээд самбараас
        солино
      </span>
    </div>
  );
}
