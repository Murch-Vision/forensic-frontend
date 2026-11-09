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
import {sharedGraphRelations} from "./graphAnalysis";
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
  // Structured findings render as one compact list instead of many cards.
  rows?: Array<{
    kind: string;
    identity: string;
    connects: string;
    bridge: string;
    evidence: string;
  }>;
}

/**
 * Conclusions about the WHOLE visible picture — the «Дүгнэлт» card. Computed
 * from exactly the nodes/links on screen, so the sentences never contradict
 * the drawing the reader is looking at.
 */
export function graphVerdict(
  nodes: NetworkNode[],
  links: NetworkLink[],
  options?: {sharedLimit: number},
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
  if (txn.length) {
    edgeParts.push(`${formatNum(txn.length)} дансны гүйлгээгээр`);
  }
  if (call.length) edgeParts.push(`${formatNum(call.length)} утасны дуудлагаар`);
  out.push({title: "Сүлжээний хамрах хүрээ", tone: "info",
    text: `Зурагт ${parts.join(", ")} байна`
    + (edgeParts.length
      ? `, хоорондоо ${edgeParts.join(", ")} холбогдсон.` : ".")});

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

  const primary = persons.filter((p) =>
    p.stats.some(([label]) => label === "Гүйлгээ"));
  if (primary.length) {
    out.push({title: "Шалгаж буй хүмүүс", tone: "info",
      text: primary.slice(0, 5).map((p) => p.label).join(", ")
        + (primary.length > 5 ? ` болон өөр ${formatNum(primary.length - 5)} хүн` : "")
        + ". Эдгээрийн дансны хуулгыг сүлжээний төв болгон харьцуулсан."});
  }
  const shared = sharedGraphRelations(nodes, links);

  const listedShared = options
    ? [...shared].sort((a, b) => b.money - a.money || a.node.id.localeCompare(b.node.id))
      .slice(0, options.sharedLimit) : shared;
  const sharedRows = listedShared.map((item) => {
    const identity = item.node.type === "ACCOUNT"
      ? item.node.sub || item.node.label : item.node.label;
    const evidence = item.txns > 0
      ? `${formatNum(item.txns)} гүйлгээ · ${formatMoney(item.money)}`
      : item.calls > 0 ? `${formatNum(item.calls)} дуудлага` : "шууд холбоос";
    const rootCount = formatNum(item.roots.length);
    const bridge = item.distance === 1
      ? `Шалгаж буй ${rootCount} хүмүүстэй дансны гүйлгээгээр холбогдсон`
      : `${rootCount} шалгаж буй хүнээс 2 дамжлагын зайд`;
    return {
      kind: item.node.type === "ACCOUNT" ? "Данс"
        : item.node.type === "PHONE" ? "Утас" : "Харилцагч",
      identity,
      connects: item.roots.map((r) => r.label).join(" ↔ "),
      bridge,
      evidence,
    };
  });
  if (sharedRows.length) {
    out.push({
      title: `Дундын холбоосууд · ${formatNum(shared.length)}`,
      tone: "info",
      text: "Хоёр ба түүнээс олон шалгаж буй хүнийг холбосон данс, харилцагчид."
        + (options ? ` Нийт ${formatNum(shared.length)} харилцагчаас мөнгөн дүнгээр топ ${options.sharedLimit}-ийг жагсаав.` : ""),
      rows: sharedRows,
    });
  }

  if (manual.length) {
    out.push({title: "Гар тэмдэглэгээ", tone: "manual",
      text: `Мөрдөгч ${formatNum(manual.length)} холбоосыг гараар `
      + `тэмдэглэсэн.`});
  }
  const priority = (title: string) =>
    title === "Шалгаж буй хүмүүс" ? 0
    : title.startsWith("Дундын") ? 1
    : title === "Хамгийн өндөр дүнтэй холбоос" ? 3
    : title === "Нийт мөнгөн урсгал" ? 4
    : title === "Сүлжээний хамрах хүрээ" ? 5 : 6;
  out.sort((a, b) => priority(a.title) - priority(b.title));
  return out;
}
