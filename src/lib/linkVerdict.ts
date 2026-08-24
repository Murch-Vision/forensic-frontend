/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : linkVerdict.ts
 * Created at  : 2026-08-07
 * Author      : jeefo
 * Purpose     : Plain-language Дүгнэлт for the link chart — deterministic
 *               Mongolian sentences generated from the edge/graph numbers, so
 *               a first-time viewer (дарга, шинэ мөрдөгч) reads conclusions
 *               instead of decoding colors and thicknesses.
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {formatMoney, formatNum} from "./format";
import type {NetworkLink, NetworkNode} from "./networkGraph";

// Server link types → words. Raw enum keys never reach the screen.
export const LINK_TYPE_LABEL: Record<string, string> = {
  FINANCIAL_TRANSFER : "Мөнгөн шилжүүлэг",
  PHONE_CONTACT      : "Утасны холбоо",
  SHARED_ADDRESS     : "Нэг хаяг",
  SHARED_DEVICE      : "Нэг төхөөрөмж",
  SHARED_IP          : "Нэг IP",
  MANUAL             : "Гар тэмдэглэл",
  UNKNOWN            : "Тодорхойгүй",
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH    : "Өндөр",
  MEDIUM  : "Дунд",
  LOW     : "Бага",
  UNKNOWN : "Тодорхойгүй",
};

const mins = (sec: number) => Math.round(sec / 60);

// Frequency in words an outsider reads without knowing the scale.
const txnFreq = (n: number) =>
  n >= 20 ? "маш байнгын"
  : n >= 10 ? "байнгын"
  : n >= 5 ? "тогтмол"
  : n >= 2 ? "хэд хэдэн удаагийн"
  : "ганц удаагийн";

/**
 * Sentences about ONE connection — shown in the detail panel when an edge is
 * clicked. Кто, хэд удаа, нийт хэдэн төгрөг, аль чиглэлд — бүгд үгээр.
 */
export function linkVerdict(
  l: NetworkLink,
  srcLabel: string,
  tgtLabel: string,
): string[] {
  const out: string[] = [];
  const f = l.facts ?? {};
  if (l.kind === "txn") {
    if (f.txnCount) {
      out.push(`${srcLabel} ба ${tgtLabel} хооронд ${formatNum(f.txnCount)} `
        + `удаагийн мөнгөн гүйлгээ хийгдсэн, нийт дүн `
        + `${formatMoney(f.txnTotal ?? 0)}.`);
    } else {
      out.push(`${srcLabel} ба ${tgtLabel} хооронд мөнгөн гүйлгээ илэрсэн`
        + `${f.txnTotal ? ` — нийт ${formatMoney(f.txnTotal)}` : ""}.`);
    }
    const ab = f.moneyOut ?? 0;
    const ba = f.moneyIn ?? 0;
    const sum = ab + ba;
    if (sum > 0) {
      const dominant = Math.max(ab, ba);
      const pct = Math.round((dominant / sum) * 100);
      const [from, to] = ab >= ba
        ? [srcLabel, tgtLabel] : [tgtLabel, srcLabel];
      out.push(pct >= 70
        ? `Мөнгөний дийлэнх нь (${pct}%) ${from} → ${to} чиглэлд шилжсэн.`
        : "Мөнгө хоёр чиглэлд ойролцоо хэмжээгээр шилжсэн.");
    }
    if (l.soft) {
      out.push("Энэ холбоос дансны хуулгаас бус, нэр/регистрийн таарлаар "
        + "илэрсэн — баримтаар нягтлах шаардлагатай.");
    } else if (f.txnCount) {
      out.push(`Энэ нь ${txnFreq(f.txnCount)} санхүүгийн харилцааг илтгэнэ.`);
    }
  } else if (l.kind === "call") {
    if (f.callCount) {
      out.push(`${srcLabel} ба ${tgtLabel} хоорондоо `
        + `${formatNum(f.callCount)} удаа холбогдож, нийт `
        + `${formatNum(mins(f.callSeconds ?? 0))} минут ярьсан.`);
      out.push(f.callCount >= 10
        ? "Байнгын утсаар харилцдаг — ойр хамаарлыг илтгэнэ."
        : f.callCount >= 3
          ? "Хааяа утсаар холбогддог."
          : "Цөөн удаагийн холболт.");
    }
  } else if (l.kind === "manual") {
    out.push(`Мөрдөгчийн өөрийн тэмдэглэсэн холбоос: `
      + `«${l.label ?? "Холбоос"}».`);
  } else if (l.kind === "owns") {
    out.push(`${tgtLabel} нь ${srcLabel}-д бүртгэлтэй (эзэмшил).`);
  }
  return out;
}

export interface GraphVerdictItem {
  title: string;
  tone: "info" | "money" | "attention" | "network" | "manual";
  text: string;
  // Node to focus when the sentence is clicked (the hub person etc.).
  focusId?: string;
}

/**
 * Conclusions about the WHOLE visible picture — the «Дүгнэлт» card. Computed
 * from exactly the nodes/links on screen, so the sentences never contradict
 * the drawing the reader is looking at.
 */
export function graphVerdict(
  nodes: NetworkNode[],
  links: NetworkLink[],
): GraphVerdictItem[] {
  const out: GraphVerdictItem[] = [];
  if (!nodes.length) return out;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const persons = nodes.filter((n) => n.type === "PERSON");
  const orphanAccounts = nodes.filter((n) => n.type === "ACCOUNT");

  const txn = links.filter((l) => l.kind === "txn");
  const call = links.filter((l) => l.kind === "call");
  const manual = links.filter((l) => l.kind === "manual");

  // What the picture holds.
  const parts = [`${formatNum(persons.length)} этгээд`];
  if (orphanAccounts.length) {
    parts.push(`эзэн нь тогтоогдоогүй ${formatNum(orphanAccounts.length)} данс`);
  }
  const edgeParts: string[] = [];
  if (txn.length) edgeParts.push(`${formatNum(txn.length)} мөнгөн`);
  if (call.length) edgeParts.push(`${formatNum(call.length)} дуудлагын`);
  out.push({title: "Сүлжээний хамрах хүрээ", tone: "info",
    text: `Зурагт ${parts.join(", ")} байна`
    + (edgeParts.length
      ? `, хоорондоо ${edgeParts.join(", ")} холбоосоор холбогдсон.` : ".")});

  // Total money on screen.
  const totalMoney = txn.reduce((s, l) => s + (l.facts?.txnTotal ?? 0), 0);
  if (totalMoney > 0) {
    out.push({title: "Нийт мөнгөн урсгал", tone: "money",
      text: `Харагдаж буй мөнгөн гүйлгээний нийт дүн `
      + `${formatMoney(totalMoney)}.`});
  }

  // The biggest money pair, with direction when one side dominates.
  const topMoney = [...txn]
    .filter((l) => (l.facts?.txnTotal ?? 0) > 0)
    .sort((a, b) => (b.facts?.txnTotal ?? 0) - (a.facts?.txnTotal ?? 0))[0];
  if (topMoney) {
    const s = byId.get(topMoney.source);
    const t = byId.get(topMoney.target);
    const f = topMoney.facts ?? {};
    if (s && t) {
      let text = `Хамгийн их мөнгө ${s.label} ба ${t.label} хооронд шилжсэн: `
        + `${formatMoney(f.txnTotal ?? 0)}`
        + (f.txnCount ? ` (${formatNum(f.txnCount)} гүйлгээ)` : "") + ".";
      const ab = f.moneyOut ?? 0;
      const ba = f.moneyIn ?? 0;
      if (ab + ba > 0 && Math.max(ab, ba) / (ab + ba) >= 0.7) {
        const [from, to] = ab >= ba ? [s.label, t.label] : [t.label, s.label];
        text += ` Гол чиглэл: ${from} → ${to}.`;
      }
      out.push({title: "Хамгийн өндөр дүнтэй холбоос",
        tone: "attention", text,
        focusId: s.type === "PERSON" ? s.id : t.id});
    }
  }

  // The busiest call pair.
  const topCall = [...call]
    .filter((l) => (l.facts?.callCount ?? 0) > 0)
    .sort((a, b) => (b.facts?.callCount ?? 0) - (a.facts?.callCount ?? 0))[0];
  if (topCall) {
    const s = byId.get(topCall.source);
    const t = byId.get(topCall.target);
    const f = topCall.facts ?? {};
    if (s && t) {
      out.push({title: "Хамгийн идэвхтэй дуудлага", tone: "attention",
        text: `Хамгийн их ярьсан хос: ${s.label} ба ${t.label} — `
        + `${formatNum(f.callCount ?? 0)} дуудлага, `
        + `${formatNum(mins(f.callSeconds ?? 0))} минут.`});
    }
  }

  // The hub: the person with the most evidence connections. A phone's call
  // edges count for its owner, so heavy phone traffic lands on the person.
  const deg = new Map<string, number>();
  for (const l of links) {
    if (l.kind === "owns") continue;
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1);
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1);
  }
  for (const l of links) {
    if (l.kind !== "owns") continue;
    const carried = deg.get(l.target) ?? 0;
    if (carried) deg.set(l.source, (deg.get(l.source) ?? 0) + carried);
  }
  const hub = persons
    .map((p) => ({p, d: deg.get(p.id) ?? 0}))
    .sort((a, b) => b.d - a.d)[0];
  if (hub && hub.d >= 3 && persons.length >= 3) {
    out.push({
      title: "Сүлжээний гол төв",
      tone: "network",
      text: `${hub.p.label} хамгийн олон холбоостой `
        + `(${formatNum(hub.d)}) — сүлжээний төв байх магадлалтай.`,
      focusId: hub.p.id,
    });
  }

  if (manual.length) {
    out.push({title: "Гар тэмдэглэгээ", tone: "manual",
      text: `Мөрдөгч ${formatNum(manual.length)} холбоосыг гараар `
      + `тэмдэглэсэн.`});
  }
  return out;
}
