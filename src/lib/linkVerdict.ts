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

  // "Primary people" are the people whose OWN statements are loaded: the
  // builder adds a Гүйлгээ summary only to an endpoint that owns imported
  // statement rows. They are the investigation centers, never intermediaries.
  const primary = persons.filter((p) =>
    p.stats.some(([label]) => label === "Гүйлгээ"));
  const primaryIds = new Set(primary.map((p) => p.id));
  if (primary.length) {
    out.push({
      title: "Шалгаж буй үндсэн хүмүүс",
      tone: "info",
      text: primary.slice(0, 5).map((p) => p.label).join(", ")
        + (primary.length > 5 ? ` болон өөр ${formatNum(primary.length - 5)} хүн` : "")
        + ". Эдгээрийн дансны хуулгыг сүлжээний төв болгон харьцуулсан.",
    });
  }

  // A real intermediary is a NON-primary node sitting equally close (within
  // two hops) to two or more primary people. Keep account nodes intact: one
  // unknown bank account
  // used by several investigated people is exactly the signal this page must
  // surface, not project away as generic person centrality.
  const incident = new Map<string, NetworkLink[]>();
  const adjacency = new Map(nodes.map((n) => [n.id, new Set<string>()]));
  const addIncident = (id: string, link: NetworkLink) => {
    const list = incident.get(id) ?? [];
    list.push(link);
    incident.set(id, list);
  };
  for (const l of links) {
    if (l.kind === "owns") continue;
    addIncident(l.source, l);
    addIncident(l.target, l);
    adjacency.get(l.source)?.add(l.target);
    adjacency.get(l.target)?.add(l.source);
  }
  const distances = new Map<string, Map<string, number>>();
  for (const root of primary) {
    const dist = new Map([[root.id, 0]]);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i += 1) {
      const current = queue[i];
      for (const next of adjacency.get(current) ?? []) {
        if (dist.has(next)) continue;
        dist.set(next, (dist.get(current) ?? 0) + 1);
        queue.push(next);
      }
    }
    distances.set(root.id, dist);
  }
  const shared = nodes.flatMap((node) => {
    if (primaryIds.has(node.id)) return [];
    const edges = incident.get(node.id) ?? [];
    const reached = primary.flatMap((root) => {
      const distance = distances.get(root.id)?.get(node.id);
      return distance == null ? [] : [{root, distance}];
    });
    const minDistance = Math.min(...reached.map((x) => x.distance));
    const roots = reached.filter((x) => x.distance === minDistance)
      .map((x) => x.root);
    // One or two hops catches the visible bridge band without declaring every
    // distant boundary in a large component an intermediary.
    if (roots.length < 2 || minDistance > 2) return [];
    let money = 0;
    let txns = 0;
    let calls = 0;
    for (const l of edges) {
      money += l.facts?.txnTotal ?? 0;
      txns += l.facts?.txnCount ?? 0;
      calls += l.facts?.callCount ?? 0;
    }
    return [{node, roots, distance: minDistance, money, txns, calls}];
  }).sort((a, b) => b.roots.length - a.roots.length
    || b.money - a.money || b.txns - a.txns || b.calls - a.calls);

  for (const item of shared.slice(0, 6)) {
    const identity = item.node.type === "ACCOUNT"
      ? item.node.sub || item.node.label : item.node.label;
    const evidence = item.txns > 0
      ? `${formatNum(item.txns)} гүйлгээ · ${formatMoney(item.money)}`
      : item.calls > 0 ? `${formatNum(item.calls)} дуудлага` : "шууд холбоос";
    const bridge = item.distance === 1
      ? "Хоёр талтай шууд холбогдсон"
      : "Хоёр талаас 2 дамжлагын зайд";
    out.push({
      title: item.node.type === "ACCOUNT" ? "Дундын банкны данс"
        : item.node.type === "PHONE" ? "Дундын утас" : "Дундын харилцагч",
      tone: "attention",
      text: `${identity}\n${item.roots.map((r) => r.label).join(" ↔ ")}\n`
        + `${bridge} · ${evidence}`,
    });
  }
  if (shared.length > 6) {
    out.push({
      title: "Бусад дундын холбоос",
      tone: "network",
      text: `Нэмэлт ${formatNum(shared.length - 6)} дундын данс/харилцагч илэрсэн.`,
    });
  }

  if (manual.length) {
    out.push({title: "Гар тэмдэглэгээ", tone: "manual",
      text: `Мөрдөгч ${formatNum(manual.length)} холбоосыг гараар `
      + `тэмдэглэсэн.`});
  }
  const priority = (title: string) =>
    title === "Шалгаж буй үндсэн хүмүүс" ? 0
    : title.startsWith("Дундын") ? 1
    : title === "Бусад дундын холбоос" ? 2
    : title === "Хамгийн өндөр дүнтэй холбоос" ? 3
    : title === "Нийт мөнгөн урсгал" ? 4
    : title === "Сүлжээний хамрах хүрээ" ? 5 : 6;
  out.sort((a, b) => priority(a.title) - priority(b.title));
  return out;
}
