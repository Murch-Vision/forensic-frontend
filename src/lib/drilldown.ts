/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : drilldown.ts
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect} from "react";
import {makeVar} from "@apollo/client";

// Third breadcrumb level for the AppHeader: Кейс › Хуудас › <entity>.
// A detail view publishes the entity it is drilled into (selected person,
// suspect filter, network node) and the header renders it; cleared on
// deselect and on unmount so stale crumbs never leak across pages.
export const drilldownVar = makeVar<string | null>(null);

export function useDrilldown(label: string | null) {
  useEffect(() => {
    drilldownVar(label);
    return () => {
      drilldownVar(null);
    };
  }, [label]);
}
