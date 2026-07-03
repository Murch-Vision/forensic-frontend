/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : ignoredPairs.ts
 * Created at  : 2026-07-02
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description : Analyst-curated set of account→counterparty pairs marked
 *               "not important". Their transactions are dropped from every
 *               calculation on the Transactions page AND from the connection
 *               map on the Link-chart page. The choice is shared through an
 *               Apollo reactive var (so both pages react instantly) and
 *               persisted to localStorage (so it survives reloads).
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {makeVar, useReactiveVar} from "@apollo/client";

const STORAGE_KEY = "forensic.ignoredTxnPairs";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export const ignoredPairsVar = makeVar<Set<string>>(load());

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

function persist(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full / disabled — the in-memory var still works this session */
  }
}

export function toggleIgnoredPair(key: string): void {
  const next = new Set(ignoredPairsVar());
  if (next.has(key)) next.delete(key);
  else next.add(key);
  ignoredPairsVar(next);
  persist(next);
}

// Permanently mark a batch of pairs unimportant in one shot (the "remove all
// below threshold" action) — no per-keystroke recompute.
export function ignorePairs(keys: string[]): void {
  const next = new Set(ignoredPairsVar());
  for (const k of keys) next.add(k);
  ignoredPairsVar(next);
  persist(next);
}

// Bring a batch of pairs back (undo). Empty argument restores everything.
export function restorePairs(keys?: string[]): void {
  if (!keys) {
    ignoredPairsVar(new Set());
    persist(new Set());
    return;
  }
  const next = new Set(ignoredPairsVar());
  for (const k of keys) next.delete(k);
  ignoredPairsVar(next);
  persist(next);
}

export function useIgnoredPairs(): Set<string> {
  return useReactiveVar(ignoredPairsVar);
}

// --- Individually removed transactions -------------------------------------
// The analyst can drop a SINGLE transaction (by id) — e.g. keep the one big
// transfer in a pair and remove the four small ones around it. Removed ids are
// dropped from every count, chart, pair total AND from the connection graph.
const TXN_KEY = "forensic.ignoredTxns";

function loadTxns(): Set<number> {
  try {
    const raw = localStorage.getItem(TXN_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

export const ignoredTxnsVar = makeVar<Set<number>>(loadTxns());

function persistTxns(set: Set<number>): void {
  try {
    localStorage.setItem(TXN_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

export function toggleIgnoredTxn(id: number): void {
  const next = new Set(ignoredTxnsVar());
  if (next.has(id)) next.delete(id);
  else next.add(id);
  ignoredTxnsVar(next);
  persistTxns(next);
}

// Remove a batch of transaction ids in one shot (e.g. "remove all but the
// biggest in this pair").
export function ignoreTxns(ids: number[]): void {
  const next = new Set(ignoredTxnsVar());
  for (const id of ids) next.add(id);
  ignoredTxnsVar(next);
  persistTxns(next);
}

// Bring removed transactions back (undo). Empty argument restores everything.
export function restoreTxns(ids?: number[]): void {
  if (!ids) {
    ignoredTxnsVar(new Set());
    persistTxns(new Set());
    return;
  }
  const next = new Set(ignoredTxnsVar());
  for (const id of ids) next.delete(id);
  ignoredTxnsVar(next);
  persistTxns(next);
}

export function useIgnoredTxns(): Set<number> {
  return useReactiveVar(ignoredTxnsVar);
}

// --- Global minimum-amount noise floor -------------------------------------
// The analyst only cares about big money. Every transaction whose amount is
// below this floor is treated as unimportant noise — dropped from every count,
// chart, pair total on the Transactions page AND from the connection graph.
// 0 = disabled (show everything). Persisted + reactive so both pages agree.
const MIN_AMOUNT_KEY = "forensic.minTxnAmount";

function loadMinAmount(): number {
  try {
    const n = Number(localStorage.getItem(MIN_AMOUNT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export const minAmountVar = makeVar<number>(loadMinAmount());

export function setMinAmount(value: number): void {
  const n = Number.isFinite(value) && value > 0 ? value : 0;
  minAmountVar(n);
  try {
    localStorage.setItem(MIN_AMOUNT_KEY, String(n));
  } catch {
    /* ignore */
  }
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
// removed from every calculation AND from the connection graph. Persisted +
// reactive so both pages agree.
export type DescMode = "starts" | "ends" | "contains";
export interface DescRule {mode: DescMode; text: string}

const DESC_KEY = "forensic.ignoredDescRules";

function loadDescRules(): DescRule[] {
  try {
    const raw = localStorage.getItem(DESC_KEY);
    return raw ? (JSON.parse(raw) as DescRule[]) : [];
  } catch {
    return [];
  }
}

export const ignoredDescVar = makeVar<DescRule[]>(loadDescRules());

function persistDesc(rules: DescRule[]): void {
  try {
    localStorage.setItem(DESC_KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export function addDescRule(mode: DescMode, text: string): void {
  const t = text.trim();
  if (!t) return;
  const cur = ignoredDescVar();
  if (cur.some((r) => r.mode === mode && r.text === t)) return;
  const next = [...cur, {mode, text: t}];
  ignoredDescVar(next);
  persistDesc(next);
}

export function removeDescRule(index: number): void {
  const next = ignoredDescVar().filter((_r, i) => i !== index);
  ignoredDescVar(next);
  persistDesc(next);
}

export function clearDescRules(): void {
  ignoredDescVar([]);
  persistDesc([]);
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
