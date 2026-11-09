import {analyseGraph} from "./graphAnalysis";
import {formatMoney, formatNum} from "./format";
import type {NetworkNode, NetworkLink} from "./networkGraph";

export interface ReportAnalysisImage {imageBase64: string; width: number; height: number}
export interface ReportGraphAnalysis {
  version: 1;
  flow: {from: string; to: string; amount: number; directed: boolean; soft: boolean;
    fromRed: boolean; toRed: boolean}[];
  flowImages: ReportAnalysisImage[];
  shared: {rows: string[][]; image?: ReportAnalysisImage};
  red: {rows: string[][]; image?: ReportAnalysisImage};
}
const identity = (node: NetworkNode, owner = node) =>
  (owner.offender ? "ХЭРЭГТЭН · " : "") + owner.label
  + (node.id !== owner.id ? ` · ${node.label}` : "")
  + (node.type === "ACCOUNT" && node.sub ? ` · ${node.sub}` : "");

// Full filtered scene, independent of the page currently open in each table.
export function buildReportGraphAnalysis(nodes: NetworkNode[], links: NetworkLink[]): ReportGraphAnalysis {
  const a = analyseGraph(nodes, links);
  return {version: 1, flowImages: [],
    flow: a.flow.map(r => ({from: identity(r.source), to: identity(r.target),
      amount: r.amount, directed: r.directed, soft: r.soft,
      fromRed: !!r.source.offender, toRed: !!r.target.offender})),
    shared: {rows: a.shared.map(r => [identity(r.node), r.roots.map(n => n.label).join(" ↔ "),
      `${r.distance} дамжлага`, [r.money > 0 && formatMoney(r.money),
        r.txns > 0 && `${formatNum(r.txns)} гүйлгээ`, r.calls > 0 && `${formatNum(r.calls)} дуудлага`]
        .filter(Boolean).join(" · ") || "Холбоос"])},
    red: {rows: a.red.map(r => [identity(r.source, r.sourcePerson), identity(r.target, r.targetPerson),
      r.link.label || ({txn: "Гүйлгээ", call: "Дуудлага", owns: "Эзэмшил",
        intel: "Хамаарал", manual: "Гар холбоос"}[r.link.kind])])},
  };
}

export function encodeAnalysis(analysis: ReportGraphAnalysis): string {
  const bytes = new TextEncoder().encode(JSON.stringify(analysis));
  // A short-lived upload transports base64; it must preserve Mongolian UTF-8.
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}
