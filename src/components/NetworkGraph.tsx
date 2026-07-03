/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : NetworkGraph.tsx
 * Created at  : 2026-06-24
 * Updated at  : 2026-06-30
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {forwardRef, useEffect, useImperativeHandle, useRef} from "react";
import type {
  NetworkLink,
  NetworkLinkKind,
  NetworkNode,
  NetworkNodeType,
} from "../lib/networkGraph";

// Self-contained <canvas> force-directed graph — no charting dependency. A
// small Verlet-ish simulation (charge repulsion + link springs + per-cluster
// gravity) runs in a requestAnimationFrame loop and the whole scene is painted
// to a single canvas, so hundreds of nodes pan/zoom smoothly (SVG choked at
// this size — every transform reflowed a thousand DOM elements). Nodes are
// pulled toward their cluster anchor so cells settle into separated blobs.
// Nodes are draggable, the canvas pans, and the wheel zooms about the cursor.

interface TypeStyle {
  ring : string;
  icon : string;
  r    : number;
}

const TYPE_STYLE: Record<NetworkNodeType, TypeStyle> = {
  PERSON  : {ring: "#00C853", icon: "👤", r: 18},
  ACCOUNT : {ring: "#00B0FF", icon: "🏦", r: 14},
  PHONE   : {ring: "#E040FB", icon: "📱", r: 12},
};

const TYPE_LABEL: Record<NetworkNodeType, string> = {
  PERSON  : "Сэжигтэн",
  ACCOUNT : "Данс",
  PHONE   : "Утас",
};

// Edge palette: money green, calls cyan, intel purple, ownership neutral.
// Exported so the link-chart filter chips stay in sync with the drawn edges.
export const LINK_STYLE: Record<NetworkLinkKind, {color: string; label: string}> = {
  txn   : {color: "#00E676", label: "Гүйлгээ"},
  call  : {color: "#00E5FF", label: "Дуудлага"},
  intel : {color: "#E040FB", label: "Хамаарал"},
  owns  : {color: "#3a4a6a", label: "Эзэмшил"},
};

interface SimNode extends NetworkNode {
  x  : number;
  y  : number;
  vx : number;
  vy : number;
  // Cluster anchor this node gravitates toward.
  ax : number;
  ay : number;
  // Pinned position while dragging (null = free).
  fx : number | null;
  fy : number | null;
}

interface SimLink {
  s        : SimNode;
  t        : SimNode;
  strength : number;
  kind     : NetworkLinkKind;
  label?   : string;
  // The caller's link object, handed back on click.
  orig     : NetworkLink;
}

interface View {
  k  : number;
  tx : number;
  ty : number;
}

const WIDTH = 1280;
const HEIGHT = 720;
const RENDER_HEIGHT = 640;
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const LABEL_FONT = "bold 10px -apple-system, system-ui, sans-serif";

function radiusOf(n: SimNode): number {
  return TYPE_STYLE[n.type].r * n.weight;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// One simulation step. Mutates the node array in place and returns the next
// alpha (cooling factor). Forces scale with alpha so the layout settles.
function tick(nodes: SimNode[], links: SimLink[], alpha: number): number {
  const cluster = 0.055 * alpha;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    // Pull toward this node's cluster anchor instead of the canvas center —
    // this is what makes the cells separate into visible blobs.
    a.vx += (a.ax - a.x) * cluster;
    a.vy += (a.ay - a.y) * cluster;

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) d2 = 1;
      // Same-cell nodes repel gently; cross-cell nodes repel harder so the
      // clusters push each other apart.
      const same = a.cluster === b.cluster;
      const charge = (same ? 2600 : 6500) / d2 * alpha;
      const min = radiusOf(a) + radiusOf(b) + 14;
      const dist = Math.sqrt(d2);
      let ux = dx / dist;
      let uy = dy / dist;
      // Coincident nodes have no separation direction — invent one from the
      // pair's indices so they can't stay stacked forever.
      if (ux === 0 && uy === 0) {
        ux = Math.cos(i * 3.1 + j);
        uy = Math.sin(i * 3.1 + j);
      }
      // Hard collision push keeps node bodies from overlapping.
      const overlap = dist < min ? (min - dist) * 0.5 * alpha : 0;
      a.vx += ux * (charge + overlap);
      a.vy += uy * (charge + overlap);
      b.vx -= ux * (charge + overlap);
      b.vy -= uy * (charge + overlap);
    }
  }

  for (const l of links) {
    const dx = l.t.x - l.s.x;
    const dy = l.t.y - l.s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ideal = l.s.cluster === l.t.cluster ? 70 : 200;
    const k = 0.05 * alpha * (0.4 + l.strength * 0.15);
    const f = (dist - ideal) * k;
    const ux = dx / dist;
    const uy = dy / dist;
    l.s.vx += ux * f;
    l.s.vy += uy * f;
    l.t.vx -= ux * f;
    l.t.vy -= uy * f;
  }

  for (const n of nodes) {
    if (n.fx !== null && n.fy !== null) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    n.vx = clamp(n.vx * 0.84, -45, 45);
    n.vy = clamp(n.vy * 0.84, -45, 45);
    n.x += n.vx;
    n.y += n.vy;
  }

  return alpha * 0.99;
}

// Imperative surface for the hosting page — search-to-focus lives here.
export interface NetworkGraphHandle {
  // Center the view on a node and mark it with a focus ring. The ring clears
  // as soon as the analyst pans/drags/clicks the canvas again.
  focusNode : (id: string) => void;
}

interface NetworkGraphProps {
  nodes : NetworkNode[];
  links : NetworkLink[];
  // Fired with the clicked node, or null when clicking empty canvas.
  onNodeClick? : (node: NetworkNode | null) => void;
  // Fired when an edge (not a node) is clicked — noise removal lives on edges.
  onLinkClick? : (link: NetworkLink | null) => void;
}

export default forwardRef<NetworkGraphHandle, NetworkGraphProps>(
function NetworkGraph(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const alphaRef = useRef(1);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const dragRef = useRef<SimNode | null>(null);
  const clusterDragRef = useRef<
    {members: SimNode[]; lastX: number; lastY: number} | null>(null);
  const panRef = useRef<{x: number; y: number} | null>(null);
  // Pointer-down snapshot: a release within a few px is a click.
  const clickRef = useRef<
    {x: number; y: number; node: SimNode | null; link: SimLink | null}
    | null>(null);
  const hoverRef = useRef<string | null>(null);
  const hoverLinkRef = useRef<SimLink | null>(null);
  const viewRef = useRef<View>({k: 1, tx: 0, ty: 0});
  // Graph→screen mapping captured at draw time, reused for hit testing.
  const fitRef = useRef({fit: 1, offX: 0, offY: 0});
  // Node currently ringed by search-to-focus (null = none).
  const focusRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    focusNode(id: string) {
      const node = nodesRef.current.find((n) => n.id === id);
      const canvas = canvasRef.current;
      if (!node || !canvas) return;
      focusRef.current = id;
      // Center the node: screen = graph·(fit·k) + t + off, solved for t with
      // the node's graph position at the canvas center. Zoom in enough that
      // the node is unmistakable, but never zoom OUT of a closer view.
      const {fit, offX, offY} = fitRef.current;
      const k = clamp(Math.max(viewRef.current.k, 1.8), 0.3, 5);
      const scale = fit * k;
      viewRef.current = {
        k,
        tx: canvas.clientWidth / 2 - offX - node.x * scale,
        ty: canvas.clientHeight / 2 - offY - node.y * scale,
      };
      ensureRunning();
    },
  }));

  // Paint the whole scene to the canvas. Cheap enough to run every frame.
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (canvas.width !== Math.round(cssW * dpr)
      || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    const fit = Math.min(cssW / WIDTH, cssH / HEIGHT);
    const offX = (cssW - WIDTH * fit) / 2;
    const offY = (cssH - HEIGHT * fit) / 2;
    fitRef.current = {fit, offX, offY};

    const v = viewRef.current;
    const scale = fit * v.k;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.translate(v.tx + offX, v.ty + offY);
    ctx.scale(scale, scale);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const hover = hoverRef.current;
    const neighbors = new Set<string>();
    if (hover) {
      for (const l of links) {
        if (l.s.id === hover) neighbors.add(l.t.id);
        if (l.t.id === hover) neighbors.add(l.s.id);
      }
    }

    // Links, colored by evidence kind.
    const hoverLink = hoverLinkRef.current;
    for (const l of links) {
      const active = (hover && (l.s.id === hover || l.t.id === hover))
        || l === hoverLink;
      const st = LINK_STYLE[l.kind];
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      ctx.lineTo(l.t.x, l.t.y);
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = hover
        ? (active ? 0.95 : 0.05)
        : active ? 0.95 : (l.kind === "owns" ? 0.45 : 0.4);
      ctx.lineWidth = active ? l.strength * 0.8 + 1.2 : l.strength * 0.6;
      ctx.stroke();
    }
    // Aggregate labels on the hovered node's edges / the hovered edge itself.
    if (hover || hoverLink) {
      ctx.font = "600 10px 'Cascadia Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const l of links) {
        const on = hover
          ? (l.s.id === hover || l.t.id === hover)
          : l === hoverLink;
        if (!l.label || !on) continue;
        const mx = (l.s.x + l.t.x) / 2;
        const my = (l.s.y + l.t.y) / 2;
        const w = ctx.measureText(l.label).width + 10;
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = "#0b0e1a";
        ctx.fillRect(mx - w / 2, my - 8, w, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = LINK_STYLE[l.kind].color;
        ctx.fillText(l.label, mx, my);
      }
    }
    ctx.globalAlpha = 1;

    // Nodes.
    const showAll = v.k >= 1.3;
    for (const n of nodes) {
      const st = TYPE_STYLE[n.type];
      const r = radiusOf(n);
      const dim = hover && hover !== n.id && !neighbors.has(n.id);
      const baseAlpha = dim ? 0.2 : 1;

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = "#0b0e1a";
      ctx.fill();
      ctx.globalAlpha = baseAlpha * 0.12;
      ctx.fillStyle = st.ring;
      ctx.fill();
      ctx.globalAlpha = baseAlpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = st.ring;
      ctx.stroke();

      ctx.font = `${r}px ${EMOJI_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(st.icon, n.x, n.y);

      const showLabel = n.weight >= 1 || showAll
        || hover === n.id || neighbors.has(n.id);
      if (showLabel) {
        ctx.font = LABEL_FONT;
        ctx.textBaseline = "top";
        ctx.fillStyle = "#c8cce0";
        ctx.fillText(n.label, n.x, n.y + r + 3);
        if (n.sub && (showAll || hover === n.id)) {
          ctx.fillStyle = "#7a7fa0";
          ctx.fillText(n.sub, n.x, n.y + r + 15);
        }
      }
    }
    // Search-focus ring, drawn on top of everything so the found node is
    // unmistakable in a dense graph.
    if (focusRef.current) {
      const n = nodes.find((x) => x.id === focusRef.current);
      if (n) {
        const r = radiusOf(n);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // Single rAF loop: ticks the sim while it's still cooling, always repaints,
  // and keeps going while dragging or panning. Idle when there's nothing to do.
  function ensureRunning() {
    if (runningRef.current) return;
    runningRef.current = true;
    const frame = () => {
      let cont = false;
      if (alphaRef.current > 0.01) {
        alphaRef.current = tick(nodesRef.current, linksRef.current,
          alphaRef.current);
        cont = true;
      }
      draw();
      if (dragRef.current || clusterDragRef.current || panRef.current) {
        cont = true;
      }
      if (cont) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        runningRef.current = false;
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  function reheat() {
    if (alphaRef.current < 0.3) alphaRef.current = 0.3;
    ensureRunning();
  }

  // Build the simulation graph once per dataset.
  useEffect(() => {
    // Assign every cluster an anchor — the most populated cell sits in the
    // middle, the rest ring it on an ellipse.
    const counts = new Map<string, number>();
    for (const n of props.nodes) {
      counts.set(n.cluster, (counts.get(n.cluster) ?? 0) + 1);
    }
    const clusters = [...counts.keys()]
      .sort((a, b) => counts.get(b)! - counts.get(a)!);
    const coreKey = clusters[0];
    const ring = clusters.slice(1);
    const anchors = new Map<string, {x: number; y: number}>();
    anchors.set(coreKey, {x: WIDTH / 2, y: HEIGHT / 2});
    ring.forEach((c, i) => {
      const angle = (i / ring.length) * Math.PI * 2;
      // Alternate two radii so many small cells don't crowd one ellipse.
      const spread = ring.length > 6 && i % 2 === 1 ? 0.62 : 1;
      anchors.set(c, {
        x: WIDTH / 2 + Math.cos(angle) * 470 * spread,
        y: HEIGHT / 2 + Math.sin(angle) * 250 * spread,
      });
    });

    const map = new Map<string, SimNode>();
    const sim: SimNode[] = props.nodes.map((node, i) => {
      const anchor = anchors.get(node.cluster)!;
      // Golden-angle spiral gives every node a unique, deterministic spawn
      // offset — coincident spawns would leave repulsion with no direction.
      const angle = i * 2.399963;
      const rad = 26 + (i % 9) * 7;
      const s: SimNode = {
        ...node,
        x  : anchor.x + Math.cos(angle) * rad,
        y  : anchor.y + Math.sin(angle) * rad,
        vx : 0,
        vy : 0,
        ax : anchor.x,
        ay : anchor.y,
        fx : null,
        fy : null,
      };
      map.set(node.id, s);
      return s;
    });
    const lk: SimLink[] = props.links
      .map((l) => ({s: map.get(l.source)!, t: map.get(l.target)!,
        strength: l.strength, kind: l.kind, label: l.label, orig: l}))
      .filter((l) => l.s && l.t);

    nodesRef.current = sim;
    linksRef.current = lk;
    hoverLinkRef.current = null;
    alphaRef.current = 1;
    ensureRunning();
    return () => {
      cancelAnimationFrame(rafRef.current);
      // Reset so a remount (e.g. StrictMode's double-invoke) can restart the
      // loop — otherwise ensureRunning sees a stale `true` and bails.
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nodes, props.links]);

  // Repaint on container resize so the layout keeps filling the card.
  useEffect(() => {
    const onResize = () => ensureRunning();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen → graph coordinates given the current fit + pan/zoom transform.
  function toGraph(clientX: number, clientY: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const {fit, offX, offY} = fitRef.current;
    const v = viewRef.current;
    const scale = fit * v.k;
    return {
      x: (sx - v.tx - offX) / scale,
      y: (sy - v.ty - offY) / scale,
    };
  }

  function nodeAt(clientX: number, clientY: number): SimNode | null {
    const p = toGraph(clientX, clientY);
    const {fit} = fitRef.current;
    // ~6 screen px of slop so hovering/clicking near a node still hits it.
    const slop = 6 / (fit * viewRef.current.k);
    let found: SimNode | null = null;
    for (const n of nodesRef.current) {
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      const r = radiusOf(n) + slop;
      // Last match wins — it's the node drawn on top.
      if (dx * dx + dy * dy <= r * r) found = n;
    }
    return found;
  }

  // Nearest evidence edge within ~6 screen px of the pointer (point-to-segment
  // distance). Ownership edges are structural, not evidence — never hit.
  function linkAt(clientX: number, clientY: number): SimLink | null {
    const p = toGraph(clientX, clientY);
    const {fit} = fitRef.current;
    const slop = 6 / (fit * viewRef.current.k);
    let best: SimLink | null = null;
    let bestD = slop;
    for (const l of linksRef.current) {
      if (l.kind === "owns") continue;
      const dx = l.t.x - l.s.x;
      const dy = l.t.y - l.s.y;
      const len2 = dx * dx + dy * dy || 1;
      const u = clamp(((p.x - l.s.x) * dx + (p.y - l.s.y) * dy) / len2, 0, 1);
      const qx = l.s.x + u * dx;
      const qy = l.s.y + u * dy;
      const d = Math.hypot(p.x - qx, p.y - qy);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  // Zoom about a screen point (CSS px relative to the canvas). The full
  // screen mapping is screen = graph·(fit·k) + t + off — the fit factor
  // cancels between old and new zoom, but the letterbox offset does NOT:
  // leaving it out made every wheel step drift the point under the cursor
  // by off·(1 − k'/k) px, so zooming visibly slid away from the cursor.
  function zoomAt(sx: number, sy: number, factor: number) {
    const {offX, offY} = fitRef.current;
    const v = viewRef.current;
    const k = clamp(v.k * factor, 0.3, 5);
    const r = k / v.k;
    const tx = sx - offX - (sx - v.tx - offX) * r;
    const ty = sy - offY - (sy - v.ty - offY) * r;
    viewRef.current = {k, tx, ty};
    ensureRunning();
  }

  // Native, non-passive wheel listener — React's onWheel is passive, so
  // preventDefault is ignored there and the page scrolls behind the graph.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top,
        e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    canvas.addEventListener("wheel", onWheel, {passive: false});
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setCursor(c: string) {
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = c;
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // Any manual interaction dismisses the search-focus ring.
    focusRef.current = null;
    const node = nodeAt(e.clientX, e.clientY);
    const link = node ? null : linkAt(e.clientX, e.clientY);
    clickRef.current = {x: e.clientX, y: e.clientY, node, link};
    if (node) {
      const p = toGraph(e.clientX, e.clientY);
      // Grabbing a person drags their whole constellation; grabbing an
      // account/phone drags just that node.
      if (node.type === "PERSON") {
        const members = nodesRef.current.filter(
          (m) => m.cluster === node.cluster);
        members.forEach((m) => {
          m.fx = m.x;
          m.fy = m.y;
        });
        clusterDragRef.current = {members, lastX: p.x, lastY: p.y};
        setCursor("grabbing");
        reheat();
        return;
      }
      dragRef.current = node;
      node.fx = p.x;
      node.fy = p.y;
      setCursor("grabbing");
      reheat();
      return;
    }
    panRef.current = {x: e.clientX, y: e.clientY};
    setCursor("grabbing");
    ensureRunning();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (clusterDragRef.current) {
      const cd = clusterDragRef.current;
      const p = toGraph(e.clientX, e.clientY);
      const dx = p.x - cd.lastX;
      const dy = p.y - cd.lastY;
      cd.lastX = p.x;
      cd.lastY = p.y;
      // Translate the whole cell rigidly — positions and anchors — so it
      // stays put after release.
      for (const m of cd.members) {
        m.x += dx;
        m.y += dy;
        m.ax += dx;
        m.ay += dy;
        m.fx = m.x;
        m.fy = m.y;
      }
      return;
    }
    if (dragRef.current) {
      const p = toGraph(e.clientX, e.clientY);
      dragRef.current.fx = p.x;
      dragRef.current.fy = p.y;
      return;
    }
    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      panRef.current = {x: e.clientX, y: e.clientY};
      const v = viewRef.current;
      viewRef.current = {...v, tx: v.tx + dx, ty: v.ty + dy};
      return;
    }
    const node = nodeAt(e.clientX, e.clientY);
    const id = node ? node.id : null;
    const link = node ? null : linkAt(e.clientX, e.clientY);
    const isHub = node && node.type === "PERSON";
    setCursor(node ? (isHub ? "move" : "pointer") : link ? "pointer" : "grab");
    if (id !== hoverRef.current || link !== hoverLinkRef.current) {
      hoverRef.current = id;
      hoverLinkRef.current = link;
      ensureRunning();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const c = clickRef.current;
    clickRef.current = null;
    if (c && Math.abs(e.clientX - c.x) < 5 && Math.abs(e.clientY - c.y) < 5) {
      if (c.node) {
        props.onNodeClick?.(c.node);
        props.onLinkClick?.(null);
      } else if (c.link) {
        props.onLinkClick?.(c.link.orig);
        props.onNodeClick?.(null);
      } else {
        props.onNodeClick?.(null);
        props.onLinkClick?.(null);
      }
    }
    if (clusterDragRef.current) {
      for (const m of clusterDragRef.current.members) {
        m.fx = null;
        m.fy = null;
      }
      clusterDragRef.current = null;
    }
    if (dragRef.current) {
      dragRef.current.fx = null;
      dragRef.current.fy = null;
      dragRef.current = null;
    }
    panRef.current = null;
    setCursor("grab");
  }

  function onPointerLeave() {
    if (hoverRef.current || hoverLinkRef.current) {
      hoverRef.current = null;
      hoverLinkRef.current = null;
      ensureRunning();
    }
  }

  function onReset() {
    viewRef.current = {k: 1, tx: 0, ty: 0};
    nodesRef.current.forEach((n) => {
      n.fx = null;
      n.fy = null;
    });
    alphaRef.current = 1;
    ensureRunning();
  }

  function zoomButton(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
  }

  const btnStyle: React.CSSProperties = {
    width: 30, height: 30, fontSize: 16, lineHeight: "1",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div style={{position: "relative"}}>
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 2,
        display: "flex", gap: 6,
      }}>
        <button className="btn" style={btnStyle}
          onClick={() => zoomButton(1.2)}>+</button>
        <button className="btn" style={btnStyle}
          onClick={() => zoomButton(1 / 1.2)}>−</button>
        <button className="btn" style={{height: 30}} onClick={onReset}>
          ↺ Дахин эхлүүлэх
        </button>
      </div>
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 2,
        display: "flex", flexDirection: "column", gap: 4,
        background: "rgba(10,12,24,0.65)", padding: "8px 10px",
        borderRadius: 8, fontSize: 11,
      }}>
        {(Object.keys(TYPE_STYLE) as NetworkNodeType[]).map((t) => (
          <div key={t} style={{display: "flex", alignItems: "center", gap: 6}}>
            <span style={{
              width: 12, height: 12, borderRadius: "50%",
              border: `2px solid ${TYPE_STYLE[t].ring}`,
              background: "#0b0e1a", display: "inline-block",
            }} />
            <span style={{color: "#9aa0b5"}}>{TYPE_LABEL[t]}</span>
          </div>
        ))}
        <div style={{height: 1, background: "#252a45", margin: "3px 0"}} />
        {(Object.keys(LINK_STYLE) as NetworkLinkKind[]).map((k) => (
          <div key={k} style={{display: "flex", alignItems: "center", gap: 6}}>
            <span style={{
              width: 12, height: 3, borderRadius: 2,
              background: LINK_STYLE[k].color, display: "inline-block",
            }} />
            <span style={{color: "#9aa0b5"}}>{LINK_STYLE[k].label}</span>
          </div>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: "100%", height: RENDER_HEIGHT, cursor: "grab",
          borderRadius: 8, touchAction: "none", display: "block",
          background:
            "radial-gradient(circle at 50% 40%, #131726 0%, #0a0c16 100%)",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
});
