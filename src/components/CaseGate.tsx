/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : CaseGate.tsx
 * Created at  : 2026-07-03
 * Updated at  : 2026-07-03
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import type {ReactNode} from "react";
import {Link} from "react-router-dom";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {ACTIVE_CASE_QUERY, SET_ACTIVE_CASE} from "../graphql/queries";
import {Loading} from "./kit";
import {Select} from "./inputs";

// HIERARCHY GATE for data pages (transactions / calls / timeline / link
// chart): evidence only exists INSIDE a case, so until the analyst picks a
// case these pages show a picker — never an all-cases aggregate (user wish:
// "clear hierarchy", no cross-case noise).

interface CaseRef {
  id: number;
  caseId: string;
  caseName: string;
}

export default function CaseGate({children}: {children: ReactNode}) {
  const client = useApolloClient();
  const {data, loading} = useQuery<{
    activeCase: CaseRef | null;
    caseFiles: CaseRef[];
  }>(ACTIVE_CASE_QUERY);
  const [setActiveCase] = useMutation(SET_ACTIVE_CASE);

  if (loading && !data) return <Loading />;
  if (data?.activeCase) return <>{children}</>;

  const caseFiles = data?.caseFiles ?? [];

  async function onSelect(id: number) {
    await setActiveCase({variables: {caseFileId: id}});
    await client.resetStore();
  }

  return (
    <div className="case-gate">
      <div className="case-gate-icon">{"\u{1F4C1}"}</div>
      <div className="case-gate-label">Кейс сонгоогүй</div>
      <div className="case-gate-title">Эхлээд кейс сонгоно уу</div>
      <p className="case-gate-text">
        Гүйлгээ, дуудлага болон холбоосын өгөгдөл зөвхөн кейсийн хүрээнд
        харагдана: <b>Кейс → Өгөгдөл</b>. Доороос кейсээ сонгох эсвэл шинэ
        кейс үүсгэнэ үү.
      </p>
      {caseFiles.length > 0 && (
        <Select
          className="case-gate-select"
          value=""
          onChange={(v) => {
            if (v) void onSelect(Number(v));
          }}
          options={[
            {value: "", label: "Кейс сонгох..."},
            ...caseFiles.map((c) => ({
              value: c.id,
              label: `${c.caseId}${c.caseName ? " · " + c.caseName : ""}`,
            })),
          ]} />
      )}
      <Link to="/cases" className="btn">
        КЕЙС УДИРДАХ →
      </Link>
    </div>
  );
}
