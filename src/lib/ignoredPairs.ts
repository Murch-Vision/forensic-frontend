/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ignoredPairs.ts
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-03
 * Author      : jeefo
 * Purpose     :
 * Description : The analyst's "unimportant data" decisions — marked pairs,
 *               individually-removed transactions, description-noise rules and
 *               the minimum-amount noise floor. Their whole point is to strip
 *               clutter out of every calculation AND out of the connection
 *               graph. They are PERMANENT and stored in the DATABASE per case
 *               (see NoiseFilter on the API), so a decision made once is never
 *               lost on reload, on another machine, or across sessions. An
 *               Apollo reactive var mirrors the DB copy so both the
 *               Transactions and Link-chart pages react instantly, and every
 *               change is written straight back to the server.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {gql, makeVar, useReactiveVar} from "@apollo/client";
import type {ApolloClient} from "@apollo/client";
import {useApolloClient} from "@apollo/client";
import {useEffect} from "react";

// --- reactive vars (mirror the DB copy for the active case) ----------------
export const ignoredPairsVar = makeVar<Set<string>>(new Set());
export const ignoredTxnsVar = makeVar<Set<number>>(new Set());
export const minAmountVar = makeVar<number>(0);

export type DescMode = "starts" | "ends" | "contains";
export interface DescRule {mode: DescMode; text: string}
export const ignoredDescVar = makeVar<DescRule[]>([]);

// --- server sync ------------------------------------------------------------
const NOISE_FILTER_QUERY = gql`
  query CaseNoiseFilter {
    caseNoiseFilter {
      minAmount ignoredPairs ignoredTxns descRules { mode text }
    }
  }
`;

const SAVE_NOISE_FILTER = gql`
  mutation SaveCaseNoiseFilter($input: NoiseFilterInput!) {
    saveCaseNoiseFilter(input: $input) {
      minAmount ignoredPairs ignoredTxns descRules { mode text }
    }
  }
`;

let client: ApolloClient<object> | null = null;
// True while hydrating from the server — suppresses the write-back so loading
// the saved state does not immediately re-save it.
let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface NoiseFilterPayload {
  minAmount    : number;
  ignoredPairs : string[];
  ignoredTxns  : number[];
  descRules    : DescRule[];
}

function currentState(): NoiseFilterPayload {
  return {
    minAmount: minAmountVar(),
    ignoredPairs: [...ignoredPairsVar()],
    ignoredTxns: [...ignoredTxnsVar()],
    descRules: ignoredDescVar().map((r) => ({mode: r.mode, text: r.text})),
  };
}

// Persist the whole filter to the DB (debounced — batches rapid edits). Called
// after every change to any of the four marks.
function persist(): void {
  if (hydrating || !client) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    client
      ?.mutate({mutation: SAVE_NOISE_FILTER,
        variables: {input: currentState()}})
      .catch(() => {/* offline / no active case — retried on next edit */});
  }, 350);
}

// Load the active case's saved filter into the vars. Runs on first mount and
// whenever the active case changes, so each case shows exactly its own marks.
export async function hydrateNoiseFilter(
  c: ApolloClient<object>,
): Promise<void> {
  client = c;
  hydrating = true;
  try {
    const {data} = await c.query<{caseNoiseFilter: NoiseFilterPayload}>({
      query: NOISE_FILTER_QUERY, fetchPolicy: "network-only",
    });
    const f = data.caseNoiseFilter;
    minAmountVar(Number(f.minAmount) > 0 ? Number(f.minAmount) : 0);
    ignoredPairsVar(new Set(f.ignoredPairs));
    ignoredTxnsVar(new Set(f.ignoredTxns));
    ignoredDescVar(f.descRules.map((r) => ({mode: r.mode, text: r.text})));
  } catch {
    /* leave the vars as-is — fail open (show everything) rather than crash */
  } finally {
    hydrating = false;
  }
}

// Mount once (e.g. in the app header): keeps the noise filter in sync with the
// active case. Re-hydrates whenever the active case id changes.
export function useNoiseFilterSync(activeCaseId: number | null): void {
  const c = useApolloClient();
  useEffect(() => {
    client = c;
    if (activeCaseId == null) {
      // No case selected — clear the marks so nothing leaks across cases.
      hydrating = true;
      minAmountVar(0);
      ignoredPairsVar(new Set());
      ignoredTxnsVar(new Set());
      ignoredDescVar([]);
      hydrating = false;
      return;
    }
    void hydrateNoiseFilter(c);
  }, [c, activeCaseId]);
}

// --- marked-unimportant account pairs --------------------------------------
// Directional key: money from `bankAccountId` to counterparty account number.
export function pairKey(bankAccountId: number, counterparty: string): string {
  return `${bankAccountId}→${counterparty.trim()}`;
}

// The pair key for a transaction, or null when it has no counterparty account.
export function txnPairKey(
  t: {bankAccountId: number; counterpartyAccount: string | null},
): string | null {
  const cp = t.counterpartyAccount?.trim();
  return cp ? pairKey(t.bankAccountId, cp) : null;
}

export function toggleIgnoredPair(key: string): void {
  const next = new Set(ignoredPairsVar());
  if (next.has(key)) next.delete(key);
  else next.add(key);
  ignoredPairsVar(next);
  persist();
}

// Permanently mark a batch of pairs unimportant in one shot (the "remove all
// below threshold" action) — no per-keystroke recompute.
export function ignorePairs(keys: string[]): void {
  const next = new Set(ignoredPairsVar());
  for (const k of keys) next.add(k);
  ignoredPairsVar(next);
  persist();
}

// Bring a batch of pairs back (undo). Empty argument restores everything.
export function restorePairs(keys?: string[]): void {
  if (!keys) {
    ignoredPairsVar(new Set());
    persist();
    return;
  }
  const next = new Set(ignoredPairsVar());
  for (const k of keys) next.delete(k);
  ignoredPairsVar(next);
  persist();
}

export function useIgnoredPairs(): Set<string> {
  return useReactiveVar(ignoredPairsVar);
}

// --- Individually removed transactions -------------------------------------
// The analyst can drop a SINGLE transaction (by id) — e.g. keep the one big
// transfer in a pair and remove the four small ones around it. Removed ids are
// dropped from every count, chart, pair total AND from the connection graph.
export function toggleIgnoredTxn(id: number): void {
  const next = new Set(ignoredTxnsVar());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  ignoredTxnsVar(next);
  persist();
}

// Remove a batch of transaction ids in one shot (e.g. "remove all but the
// biggest in this pair").
export function ignoreTxns(ids: number[]): void {
  const next = new Set(ignoredTxnsVar());
  for (const id of ids) next.add(id);
  ignoredTxnsVar(next);
  persist();
}

// Bring removed transactions back (undo). Empty argument restores everything.
export function restoreTxns(ids?: number[]): void {
  if (!ids) {
    ignoredTxnsVar(new Set());
    persist();
    return;
  }
  const next = new Set(ignoredTxnsVar());
  for (const id of ids) next.delete(id);
  ignoredTxnsVar(next);
  persist();
}

export function useIgnoredTxns(): Set<number> {
  return useReactiveVar(ignoredTxnsVar);
}

// --- Global minimum-amount noise floor -------------------------------------
// The analyst only cares about big money. Every transaction whose amount is
// below this floor is treated as unimportant noise — dropped from every count,
// chart, pair total on the Transactions page AND from the connection graph.
// This is the primary declutter tool: it strips the mass of tiny transactions
// so the link chart shows only the significant suspect connections. 0 = off.
export function setMinAmount(value: number): void {
  const n = Number.isFinite(value) && value > 0 ? value : 0;
  minAmountVar(n);
  persist();
}

export function useMinAmount(): number {
  return useReactiveVar(minAmountVar);
}

// True when a transaction is below the active noise floor (floor 0 = never).
export function isBelowMin(amount: number, min: number): boolean {
  return min > 0 && amount < min;
}

// --- Description-pattern noise rules ---------------------------------------
// Organisations use formatted гүйлгээний утга. A rule marks every transaction
// whose description starts-with / ends-with / contains a text as unimportant —
// removed from every calculation AND from the connection graph.
export function addDescRule(mode: DescMode, text: string): void {
  const t = text.trim();
  if (!t) return;
  const cur = ignoredDescVar();
  if (cur.some((r) => r.mode === mode && r.text === t)) return;
  ignoredDescVar([...cur, {mode, text: t}]);
  persist();
}

export function removeDescRule(index: number): void {
  ignoredDescVar(ignoredDescVar().filter((_r, i) => i !== index));
  persist();
}

export function clearDescRules(): void {
  ignoredDescVar([]);
  persist();
}

export function useIgnoredDesc(): DescRule[] {
  return useReactiveVar(ignoredDescVar);
}

// True when `description` matches ANY rule (case-insensitive).
export function matchesDescRules(
  description: string | null, rules: DescRule[],
): boolean {
  if (!rules.length) return false;
  const d = (description ?? "").toLowerCase();
  return rules.some((r) => {
    const t = r.text.toLowerCase();
    return r.mode === "starts" ? d.startsWith(t)
      : r.mode === "ends" ? d.endsWith(t)
      : d.includes(t);
  });
}
