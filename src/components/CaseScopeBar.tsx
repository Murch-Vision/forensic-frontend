/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : CaseScopeBar.tsx
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {Link} from "react-router-dom";
import {useQuery} from "@apollo/client";
import {ACTIVE_CASE_QUERY} from "../graphql/queries";

// Scope strip for DATA pages (transactions / calls / timeline / link chart).
// The lists on these pages are case-scoped SERVER-side by the active case in
// the app header; this bar spells that out so the analyst always knows which
// case's evidence they are looking at — and that "no case" means ALL cases.

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
}

export default function CaseScopeBar({summary}: {summary?: string}) {
  const {data} = useQuery<{activeCase: CaseRef | null}>(ACTIVE_CASE_QUERY);
  const active = data?.activeCase ?? null;

  if (active) {
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

  return (
    <div className="scope-bar scope-bar-all" role="status">
      <span className="scope-bar-label">Хамрах хүрээ</span>
      <span className="scope-bar-name">Бүх кейс</span>
      {summary && <span className="scope-bar-summary">{summary}</span>}
      <span className="scope-bar-hint">
        Кейс сонгоогүй тул бүх кейсийн өгөгдөл харагдаж байна — дээд самбараас
        эсвэл <Link to="/cases" className="scope-bar-link">Кейсүүд</Link>{" "}
        хуудаснаас кейс сонгоно уу
      </span>
    </div>
  );
}
