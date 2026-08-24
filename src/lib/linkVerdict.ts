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

  // Project the visible evidence graph onto PEOPLE. A call travels through a
  // person's phone node, but that must count as one relationship with the
  // other person — not dozens of phone/account edges attributed to the owner.
  const owner = new Map<string, string>();
  for (const l of links) {
    if (l.kind === "owns" && byId.get(l.source)?.type === "PERSON") {
      owner.set(l.target, l.source);
    }
  }
  const asPerson = (id: string) => byId.get(id)?.type === "PERSON"
    ? id : owner.get(id);
  type PairFacts = {kinds: Set<string>; money: number; calls: number};
  const pairFacts = new Map<string, PairFacts>();
  const adjacency = new Map(persons.map((p) => [p.id, new Set<string>()]));
  for (const l of links) {
    if (l.kind === "owns") continue;
    const a = asPerson(l.source);
    const b = asPerson(l.target);
    if (!a || !b || a === b) continue;
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const facts = pairFacts.get(key)
      ?? {kinds: new Set<string>(), money: 0, calls: 0};
    facts.kinds.add(l.kind);
    facts.money += l.facts?.txnTotal ?? 0;
    facts.calls += l.facts?.callCount ?? 0;
    pairFacts.set(key, facts);
  }

  const relationshipCount = (id: string) => adjacency.get(id)?.size ?? 0;
  const mostConnected = [...persons]
    .sort((a, b) => relationshipCount(b.id) - relationshipCount(a.id)
      || a.label.localeCompare(b.label))[0];
  if (mostConnected && relationshipCount(mostConnected.id) > 0) {
    const neighbors = [...(adjacency.get(mostConnected.id) ?? [])]
      .map((id) => byId.get(id)?.label).filter(Boolean) as string[];
    out.push({
      title: "Хамгийн олон харилцаатай хүн",
      tone: "network",
      text: `${mostConnected.label} нь ${formatNum(neighbors.length)} өөр `
        + `хүнтэй шууд холбоотой — ${neighbors.slice(0, 3).join(", ")}`
        + (neighbors.length > 3 ? ` болон өөр ${formatNum(neighbors.length - 3)} хүн` : "")
        + ". Энэ тоонд нэг хүнтэй хийсэн олон гүйлгээ, дуудлагыг давхардуулж тооцоогүй.",
      focusId: mostConnected.id,
    });
  }

  // Brandes betweenness centrality: highlights people who sit on shortest
  // paths between other people — the actual intermediaries in the network.
  const between = new Map(persons.map((p) => [p.id, 0]));
  for (const source of persons.map((p) => p.id)) {
    const stack: string[] = [];
    const pred = new Map(persons.map((p) => [p.id, [] as string[]]));
    const paths = new Map(persons.map((p) => [p.id, 0]));
    const dist = new Map(persons.map((p) => [p.id, -1]));
    paths.set(source, 1);
    dist.set(source, 0);
    const queue = [source];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const v = queue[qi];
      stack.push(v);
      for (const w of adjacency.get(v) ?? []) {
        if ((dist.get(w) ?? -1) < 0) {
          queue.push(w);
          dist.set(w, (dist.get(v) ?? 0) + 1);
        }
        if (dist.get(w) === (dist.get(v) ?? 0) + 1) {
          paths.set(w, (paths.get(w) ?? 0) + (paths.get(v) ?? 0));
          pred.get(w)?.push(v);
        }
      }
    }
    const dependency = new Map(persons.map((p) => [p.id, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w) ?? []) {
        const wPaths = paths.get(w) ?? 0;
        if (wPaths > 0) {
          dependency.set(v, (dependency.get(v) ?? 0)
            + ((paths.get(v) ?? 0) / wPaths) * (1 + (dependency.get(w) ?? 0)));
        }
      }
      if (w !== source) between.set(w,
        (between.get(w) ?? 0) + (dependency.get(w) ?? 0));
    }
  }
  const intermediaries = persons
    .map((p) => ({p, score: (between.get(p.id) ?? 0) / 2,
      degree: relationshipCount(p.id)}))
    .filter((x) => x.score > 0 && x.degree >= 2)
    .sort((a, b) => b.score - a.score || b.degree - a.degree)
    .slice(0, 3);
  if (intermediaries.length) {
    const descriptions = intermediaries.map(({p, degree}) => {
      const neighborIds = [...(adjacency.get(p.id) ?? [])];
      const nbrs = neighborIds
        .map((id) => byId.get(id)?.label).filter(Boolean) as string[];
      let money = 0;
      let calls = 0;
      for (const id of neighborIds) {
        const key = p.id < id ? `${p.id}|${id}` : `${id}|${p.id}`;
        const facts = pairFacts.get(key);
        money += facts?.money ?? 0;
        calls += facts?.calls ?? 0;
      }
      const evidence = [
        money > 0 ? `${formatMoney(money)}-ийн урсгал` : "",
        calls > 0 ? `${formatNum(calls)} дуудлага` : "",
      ].filter(Boolean).join(", ");
      return `${p.label} (${formatNum(degree)} хүн: ${nbrs.slice(0, 2).join(", ")}`
        + (nbrs.length > 2 ? ` зэрэг` : "")
        + (evidence ? `; ${evidence}` : "") + ")";
    });
    out.push({
      title: "Дундын харилцагчид",
      tone: "attention",
      text: `${descriptions.join("; ")} нь бусад хүмүүсийн хоорондын хамгийн `
        + "богино холбоосын замд олон давтагдаж байна. Эдгээр хүний гүйлгээ, "
        + "дуудлагын чиглэл болон хугацааг түрүүлж нягтлах шаардлагатай.",
      focusId: intermediaries[0].p.id,
    });
  }

  // Harmonic centrality remains meaningful when the graph has disconnected
  // components. These are structural center nodes: they can reach the largest
  // share of people through the fewest hand-offs, which differs from raw degree.
  const central = persons.map((p) => {
    const dist = new Map([[p.id, 0]]);
    const queue = [p.id];
    for (let qi = 0; qi < queue.length; qi += 1) {
      const v = queue[qi];
      for (const w of adjacency.get(v) ?? []) {
        if (dist.has(w)) continue;
        dist.set(w, (dist.get(v) ?? 0) + 1);
        queue.push(w);
      }
    }
    let score = 0;
    for (const d of dist.values()) if (d > 0) score += 1 / d;
    return {p, score, reachable: dist.size - 1};
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score
      || relationshipCount(b.p.id) - relationshipCount(a.p.id));
  if (central.length) {
    const best = central[0].score;
    const centers = central.filter((x) => x.score >= best * 0.9).slice(0, 3);
    out.push({
      title: "Center node болсон хүмүүс",
      tone: "network",
      text: `${centers.map(({p, reachable}) => `${p.label} (`
        + `${formatNum(reachable)} хүнд дам хүрнэ)`).join(", ")} нь сүлжээний `
        + "бусад хүмүүст хамгийн цөөн дамжлагаар хүрч байгаа бүтцийн төвүүд байна.",
      focusId: centers[0].p.id,
    });
  }

  if (manual.length) {
    out.push({title: "Гар тэмдэглэгээ", tone: "manual",
      text: `Мөрдөгч ${formatNum(manual.length)} холбоосыг гараар `
      + `тэмдэглэсэн.`});
  }
  return out;
}
