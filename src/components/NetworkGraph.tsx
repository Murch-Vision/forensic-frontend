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
  txn    : {color: "#00E676", label: "Гүйлгээ"},
  call   : {color: "#00E5FF", label: "Дуудлага"},
  intel  : {color: "#E040FB", label: "Хамаарал"},
  owns   : {color: "#3a4a6a", label: "Эзэмшил"},
  // Analyst-drawn relationship — amber, dashed, always prominent.
  manual : {color: "#FFAB00", label: "Гар холбоос"},
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
  // Per-node size multiplier (1 = default) — the analyst can enlarge a single
  // node (e.g. to read its portrait) without touching any other.
  scale : number;
  // Per-node body shape. "rect" shows a portrait as a full (rounded) rectangle
  // instead of clipping it to a circle.
  shape : "circle" | "rect";
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

// A node's drawn radius, including its own per-node size multiplier so an
// enlarged node (e.g. to show a portrait) is bigger everywhere it matters
// (drawing, hit-testing, collision).
function radiusOf(n: SimNode): number {
  return TYPE_STYLE[n.type].r * n.weight * (n.scale ?? 1);
}

// Trace a node's body path (circle, or a rounded square of side 2r) so fill,
// clip and stroke all share the same silhouette.
function traceNodeBody(ctx: CanvasRenderingContext2D, n: SimNode, r: number) {
  ctx.beginPath();
  if (n.shape === "rect") {
    const rad = r * 0.28;
    const x = n.x - r, y = n.y - r, w = r * 2, h = r * 2;
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  } else {
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  }
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
  // Current node layout — {nodeId: {x, y}} — captured when saving a board.
  getPositions : () => Record<string, {x: number; y: number; s?: number; sh?: "rect"}>;
  // Multiply ONE node's size (or reset with factor 0) and persist the layout.
  setNodeScale : (id: string, factor: number) => void;
  // Switch ONE node between a circle and a (rounded) rectangle body.
  setNodeShape : (id: string, shape: "circle" | "rect") => void;
  // Reset pan/zoom to the default fit (whole scene centered) without touching
  // node pins — used when entering/leaving isolate mode so the radial cluster
  // is framed in full.
  resetView : () => void;
  // Pull ONLY the target's direct neighbors into a pinned ring around it,
  // leaving every other node exactly where it is. Unlike isolate mode this
  // keeps the whole graph on screen — it just gathers the target's own
  // connections into a tidy cluster in place.
  clusterAround : (id: string) => void;
}

interface NetworkGraphProps {
  nodes : NetworkNode[];
  links : NetworkLink[];
  // Selected node — its direct connections stay highlighted (everything else
  // dimmed) until deselection, independent of the transient hover.
  selectedId? : string | null;
  // Fired with the clicked node, or null when clicking empty canvas.
  onNodeClick? : (node: NetworkNode | null) => void;
  // Fired when an edge (not a node) is clicked — noise removal lives on edges.
  onLinkClick? : (link: NetworkLink | null) => void;
  // Saved layout to restore (from a saved board). Nodes with a saved position
  // spawn exactly there and the simulation starts settled, so the arrangement
  // the detective saved comes back as-is. Bumping `layoutKey` re-applies it.
  initialPositions? : Record<string, {x: number; y: number; s?: number; sh?: "rect"}> | null;
  layoutKey? : string | number;
  // Fired after a drag settles (or after a reset) with the current node
  // layout, so the host can persist the arrangement. null = the layout was
  // reset and any saved positions should be forgotten.
  onLayoutChange? : (
    positions: Record<string, {x: number; y: number; s?: number; sh?: "rect"}> | null) => void;
  // Text visibility, driven by the chips above the graph. Node names and edge
  // value tags are the two things that turn a dense hub into a wall of text.
  showNames? : boolean;
  showEdgeLabels? : boolean;
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
  // Grab offset (node center − pointer) for a single-node drag, so the node
  // doesn't jump to the cursor when grabbed off-center.
  const dragOffsetRef = useRef<{dx: number; dy: number}>({dx: 0, dy: 0});
  // Decoded suspect photos, keyed by their data URI, so a portrait is drawn in
  // place of the 👤 icon. Loaded lazily; a fresh load repaints once ready.
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
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
  // Mirror of props.selectedId — draw() runs inside a rAF closure that can
  // outlive the render that started it, so it must read through a ref.
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = props.selectedId ?? null;
  // Same reasoning as selectedRef — draw() reads these from inside a rAF.
  const namesRef = useRef(true);
  namesRef.current = props.showNames ?? true;
  const edgeLabelsRef = useRef(true);
  edgeLabelsRef.current = props.showEdgeLabels ?? true;
  useEffect(() => {
    ensureRunning();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId, props.showNames, props.showEdgeLabels]);

  useImperativeHandle(ref, () => ({
    getPositions() {
      return currentPositions();
    },
    setNodeScale(id: string, factor: number) {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node) return;
      // factor 0 → reset to default size; otherwise multiply. Default (1) is
      // the floor — nodes can be enlarged but never shrunk below default.
      node.scale = factor === 0
        ? 1 : clamp((node.scale ?? 1) * factor, 1, 6);
      ensureRunning();                    // repaint at the new size
      emitLayout(currentPositions());     // persist it with the layout
    },
    setNodeShape(id: string, shape: "circle" | "rect") {
      const node = nodesRef.current.find((n) => n.id === id);
      if (!node) return;
      node.shape = shape;
      ensureRunning();
      emitLayout(currentPositions());
    },
    resetView() {
      viewRef.current = {k: 1, tx: 0, ty: 0};
      focusRef.current = null;
      ensureRunning();
    },
    clusterAround(id: string) {
      const nodes = nodesRef.current;
      const links = linksRef.current;
      const center = nodes.find((n) => n.id === id);
      if (!center) return;
      // Gather ONLY the target's OWN satellites: nodes it owns, or leaves that
      // connect to nothing but the target. A neighbor that ALSO links to other
      // nodes is its own hub (a "center") — pulling it here would rip it from
      // its constellation, so leave it exactly where it is. One pass classifies
      // every node: `elsewhere` = has an edge that doesn't touch the target;
      // `owned` = hangs off the target by an ownership edge.
      const elsewhere = new Set<string>();
      const owned = new Set<string>();
      for (const l of links) {
        if (l.s.id === id || l.t.id === id) {
          const other = l.s.id === id ? l.t : l.s;
          if (l.kind === "owns") owned.add(other.id);
        } else {
          elsewhere.add(l.s.id);
          elsewhere.add(l.t.id);
        }
      }
      const rank = (t: NetworkNodeType) =>
        t === "PERSON" ? 0 : t === "ACCOUNT" ? 1 : 2;
      const seen = new Set<string>();
      const nbrs: SimNode[] = [];
      for (const l of links) {
        const other = l.s.id === id ? l.t : l.t.id === id ? l.s : null;
        if (!other || seen.has(other.id)) continue;
        // Skip real centers: connected elsewhere AND not owned by the target.
        if (elsewhere.has(other.id) && !owned.has(other.id)) continue;
        seen.add(other.id);
        nbrs.push(other);
      }
      nbrs.sort((a, b) => rank(a.type) - rank(b.type)
        || a.label.localeCompare(b.label));
      // Pin the center where it already sits — the cluster forms around it.
      center.fx = center.ax = center.x;
      center.fy = center.ay = center.y;
      const place = (arr: SimNode[], radius: number) => {
        arr.forEach((n, i) => {
          const a = -Math.PI / 2 + (i / Math.max(1, arr.length)) * Math.PI * 2;
          const x = center.x + Math.cos(a) * radius;
          const y = center.y + Math.sin(a) * radius;
          n.x = n.fx = n.ax = x;
          n.y = n.fy = n.ay = y;
        });
      };
      // Many neighbors → two concentric rings so nodes don't collide.
      if (nbrs.length > 18) {
        place(nbrs.filter((_, i) => i % 2 === 0), 135);
        place(nbrs.filter((_, i) => i % 2 === 1), 225);
      } else {
        place(nbrs, Math.min(210, 95 + nbrs.length * 6));
      }
      ensureRunning();
      emitLayout(currentPositions());
    },
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

  // Lazily decode a portrait data URI; repaint once it's ready so the photo
  // pops in without a full re-layout.
  function getImage(src: string): HTMLImageElement {
    const cache = imgCacheRef.current;
    let img = cache.get(src);
    if (!img) {
      img = new Image();
      img.onload = () => draw();
      img.src = src;
      cache.set(src, img);
    }
    return img;
  }

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
    // Highlight source: transient hover wins, else the selected node keeps
    // its direct connections lit until deselection.
    const hl = hover ?? selectedRef.current;
    const neighbors = new Set<string>();
    if (hl) {
      for (const l of links) {
        if (l.s.id === hl) neighbors.add(l.t.id);
        if (l.t.id === hl) neighbors.add(l.s.id);
      }
    }

    // Links, colored by evidence kind.
    const hoverLink = hoverLinkRef.current;
    for (const l of links) {
      const active = (hl && (l.s.id === hl || l.t.id === hl))
        || l === hoverLink;
      const st = LINK_STYLE[l.kind];
      const manual = l.kind === "manual";
      ctx.beginPath();
      ctx.moveTo(l.s.x, l.s.y);
      ctx.lineTo(l.t.x, l.t.y);
      ctx.strokeStyle = st.color;
      // Manual (analyst-drawn) edges are the ground truth — keep them readable
      // even when another node is highlighted, and dash them so they stand out
      // from the auto-derived evidence edges.
      ctx.globalAlpha = hl
        ? (active ? 0.95 : (manual ? 0.5 : 0.05))
        : active ? 0.95 : (manual ? 0.85 : l.kind === "owns" ? 0.45 : 0.4);
      ctx.lineWidth = active ? l.strength * 0.8 + 1.2 : l.strength * 0.6;
      if (manual) ctx.setLineDash([7, 5]);
      ctx.stroke();
      if (manual) ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // Nodes.
    const showAll = v.k >= 1.3;
    for (const n of nodes) {
      const st = TYPE_STYLE[n.type];
      const r = radiusOf(n);
      const dim = hl && hl !== n.id && !neighbors.has(n.id);
      const baseAlpha = dim ? 0.2 : 1;

      // Body: circle (default) or rounded rectangle — a rect shows the full
      // square portrait instead of clipping it to a disc.
      traceNodeBody(ctx, n, r);
      ctx.globalAlpha = baseAlpha;
      ctx.fillStyle = "#0b0e1a";
      ctx.fill();

      // A person with a photo shows their portrait; otherwise the tinted 👤
      // icon. The photo loads lazily — until it's ready the icon stands in and
      // we repaint when it arrives.
      const photo = n.type === "PERSON" && n.photoData
        ? getImage(n.photoData) : null;
      const photoReady = !!photo && photo.complete && photo.naturalWidth > 0;
      if (photoReady) {
        ctx.save();
        traceNodeBody(ctx, n, r);
        ctx.clip();
        ctx.globalAlpha = baseAlpha;
        ctx.drawImage(photo!, n.x - r, n.y - r, r * 2, r * 2);
        ctx.restore();
      } else {
        traceNodeBody(ctx, n, r);
        ctx.globalAlpha = baseAlpha * 0.12;
        ctx.fillStyle = st.ring;
        ctx.fill();
        ctx.globalAlpha = baseAlpha;
        ctx.font = `${r}px ${EMOJI_FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(st.icon, n.x, n.y);
      }
      // Ring on top (re-trace — clip/fill consumed the previous path).
      traceNodeBody(ctx, n, r);
      ctx.globalAlpha = baseAlpha;
      ctx.lineWidth = 3;
      ctx.strokeStyle = st.ring;
      ctx.stroke();

      const showLabel = namesRef.current
        && (n.weight >= 1 || showAll || hl === n.id || neighbors.has(n.id));
      if (showLabel) {
        ctx.font = LABEL_FONT;
        ctx.textBaseline = "top";
        ctx.fillStyle = "#c8cce0";
        ctx.fillText(n.label, n.x, n.y + r + 3);
        if (n.sub && (showAll || hl === n.id)) {
          ctx.fillStyle = "#7a7fa0";
          ctx.fillText(n.sub, n.x, n.y + r + 15);
        }
      }
    }

    // Edge labels on the highlighted node's edges / the hovered edge — drawn
    // AFTER the nodes so the value tag always sits on top and is never buried
    // behind a node the edge happens to pass under.
    if ((hl || hoverLink) && edgeLabelsRef.current) {
      ctx.font = "600 10px 'Cascadia Mono', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // A hub can carry a hundred edges whose midpoints all land in the same
      // few pixels, which used to render as an unreadable stack of tags. Place
      // the strongest first and drop any that would collide with one already
      // down, after trying a couple of slots further along the edge.
      const tagged = links.filter((l) => l.label && (hl
        ? (l.s.id === hl || l.t.id === hl)
        : l === hoverLink));
      tagged.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));

      const placed: {x: number; y: number; w: number; h: number}[] = [];
      const hits = (a: {x: number; y: number; w: number; h: number}) =>
        placed.some((p) => Math.abs(a.x - p.x) * 2 < a.w + p.w
          && Math.abs(a.y - p.y) * 2 < a.h + p.h);

      for (const l of tagged) {
        const w = ctx.measureText(l.label!).width + 10;
        let spot: {x: number; y: number; w: number; h: number} | null = null;
        // Midpoint first, then off-centre slots, so a busy hub still shows as
        // many tags as physically fit instead of one illegible pile.
        for (const t of [0.5, 0.36, 0.64, 0.24, 0.76]) {
          const cand = {
            x: l.s.x + (l.t.x - l.s.x) * t,
            y: l.s.y + (l.t.y - l.s.y) * t,
            w, h: 16,
          };
          if (!hits(cand)) { spot = cand; break; }
        }
        if (!spot) continue;
        placed.push(spot);

        ctx.globalAlpha = 0.88;
        ctx.fillStyle = "#0b0e1a";
        ctx.fillRect(spot.x - w / 2, spot.y - 8, w, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = LINK_STYLE[l.kind].color;
        ctx.fillText(l.label!, spot.x, spot.y);
      }
      ctx.globalAlpha = 1;
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

  // Current node layout as {id: {x, y}} — used for persisting the arrangement
  // and by the imperative getPositions() below.
  function currentPositions(): Record<string, {x: number; y: number; s?: number; sh?: "rect"}> {
    const out: Record<string, {x: number; y: number; s?: number; sh?: "rect"}> = {};
    for (const n of nodesRef.current) {
      out[n.id] = {x: Math.round(n.x), y: Math.round(n.y),
        // Only record scale/shape when non-default, keeping saved state lean.
        ...(n.scale !== 1 ? {s: n.scale} : {}),
        ...(n.shape === "rect" ? {sh: "rect" as const} : {})};
    }
    return out;
  }

  function emitLayout(positions: Record<string, {x: number; y: number; s?: number; sh?: "rect"}> | null) {
    props.onLayoutChange?.(positions);
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

    const saved = props.initialPositions ?? null;
    let restoredAny = false;
    const map = new Map<string, SimNode>();
    const sim: SimNode[] = props.nodes.map((node, i) => {
      const anchor = anchors.get(node.cluster)!;
      // Golden-angle spiral gives every node a unique, deterministic spawn
      // offset — coincident spawns would leave repulsion with no direction.
      const angle = i * 2.399963;
      const rad = 26 + (i % 9) * 7;
      // A saved board restores each node to exactly where it was arranged.
      const pos = saved?.[node.id];
      if (pos) restoredAny = true;
      const s: SimNode = {
        ...node,
        x  : pos ? pos.x : anchor.x + Math.cos(angle) * rad,
        y  : pos ? pos.y : anchor.y + Math.sin(angle) * rad,
        vx : 0,
        vy : 0,
        ax : pos ? pos.x : anchor.x,
        ay : pos ? pos.y : anchor.y,
        // A restored node is pinned exactly where it was saved, so a saved
        // arrangement comes back rock-steady and never drifts. A fresh node
        // stays free so the initial auto-layout can place it.
        fx : pos ? pos.x : null,
        fy : pos ? pos.y : null,
        // Restore the node's saved size + shape (defaults: 1, circle).
        scale : pos?.s ?? 1,
        shape : pos?.sh === "rect" ? "rect" : "circle",
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
    // Restoring a saved board: start almost settled so the arranged layout is
    // preserved instead of being re-flung by a hot simulation. A fresh graph
    // starts hot (alpha 1) to lay itself out.
    alphaRef.current = restoredAny ? 0.02 : 1;
    ensureRunning();
    return () => {
      cancelAnimationFrame(rafRef.current);
      // Reset so a remount (e.g. StrictMode's double-invoke) can restart the
      // loop — otherwise ensureRunning sees a stale `true` and bails.
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.nodes, props.links, props.layoutKey]);

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
      // Rect nodes hit as a square, circles as a disc. Last match wins — it's
      // the node drawn on top.
      const hit = n.shape === "rect"
        ? Math.abs(dx) <= r && Math.abs(dy) <= r
        : dx * dx + dy * dy <= r * r;
      if (hit) found = n;
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
      // account/phone drags just that node. Pinning happens on the first
      // move (see onPointerMove) — NOT here — so a plain click never nudges
      // or re-pins a node. We also no longer reheat the simulation: dragging
      // one node now leaves every other node exactly where it is instead of
      // springing the whole graph around.
      if (node.type === "PERSON") {
        const members = nodesRef.current.filter(
          (m) => m.cluster === node.cluster);
        clusterDragRef.current = {members, lastX: p.x, lastY: p.y};
        setCursor("grabbing");
        ensureRunning();
        return;
      }
      dragRef.current = node;
      dragOffsetRef.current = {dx: node.x - p.x, dy: node.y - p.y};
      setCursor("grabbing");
      ensureRunning();
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
      const off = dragOffsetRef.current;
      // Move x/y DIRECTLY (not just fx/fy) — the physics tick that would copy
      // fx→y only runs while the sim is hot, and we no longer reheat on drag,
      // so a settled account/phone node would otherwise never move. fx/fy are
      // set too, pinning it where it's dropped.
      const n = dragRef.current;
      n.x = p.x + off.dx;
      n.y = p.y + off.dy;
      n.fx = n.x;
      n.fy = n.y;
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
    const isClick = !!c && Math.abs(e.clientX - c.x) < 5
      && Math.abs(e.clientY - c.y) < 5;
    if (isClick) {
      if (c!.node) {
        props.onNodeClick?.(c!.node);
        props.onLinkClick?.(null);
      } else if (c!.link) {
        props.onLinkClick?.(c!.link.orig);
        props.onNodeClick?.(null);
      } else {
        props.onNodeClick?.(null);
        props.onLinkClick?.(null);
      }
    }
    // A real drag (moved > a few px) leaves the node(s) pinned where they were
    // dropped, so the arrangement stays put for good. A plain click never
    // touched the pins, so nothing shifts.
    let dragged = false;
    if (clusterDragRef.current) {
      if (!isClick) dragged = true;
      clusterDragRef.current = null;
    }
    if (dragRef.current) {
      if (!isClick) {
        dragged = true;
        // Move the node's gravity anchor with it too, so nothing tugs it back.
        dragRef.current.ax = dragRef.current.x;
        dragRef.current.ay = dragRef.current.y;
      }
      dragRef.current = null;
    }
    panRef.current = null;
    setCursor("grab");
    // Persist the arrangement the analyst just made.
    if (dragged) emitLayout(currentPositions());
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
    // Forget any saved arrangement — this is a clean, fresh re-layout.
    emitLayout(null);
  }

  function zoomButton(factor: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
  }


  // The controls float over the canvas, so .btn's transparent background lets
  // the graph show through and hides them. Force an OPAQUE surface (+ a little
  // shadow) so they read clearly against any node or edge behind them.
  const overlayBtn: React.CSSProperties = {
    background: "var(--bg-card)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
  };
  const btnStyle: React.CSSProperties = {
    ...overlayBtn,
    width: 30, height: 30, fontSize: 16, lineHeight: "1",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  // Legend lists ONLY the node types / edge kinds actually present, so a kind
  // with no edges (e.g. no purple "Хамаарал" left after merging money) doesn't
  // linger in the key and confuse the analyst.
  const presentTypes = new Set(props.nodes.map((n) => n.type));
  const presentKinds = new Set(props.links.map((l) => l.kind));

  return (
    <div style={{position: "relative"}}>
      <div style={{
        position: "absolute", top: 10, right: 10, zIndex: 2,
        display: "flex", gap: 6,
      }}>
        <button className="btn" style={btnStyle}
          title="Томруулах (zoom)" onClick={() => zoomButton(1.2)}>+</button>
        <button className="btn" style={btnStyle}
          title="Жижигрүүлэх (zoom)" onClick={() => zoomButton(1 / 1.2)}>−</button>
        <button className="btn" style={{...overlayBtn, height: 30}}
          onClick={onReset}>
          ↺ Дахин эхлүүлэх
        </button>
      </div>
      <div style={{
        position: "absolute", top: 10, left: 10, zIndex: 2,
        display: "flex", flexDirection: "column", gap: 4,
        background: "rgba(10,12,24,0.65)", padding: "8px 10px",
        borderRadius: 8, fontSize: 11,
      }}>
        {(Object.keys(TYPE_STYLE) as NetworkNodeType[])
          .filter((t) => presentTypes.has(t)).map((t) => (
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
        {(Object.keys(LINK_STYLE) as NetworkLinkKind[])
          .filter((k) => presentKinds.has(k)).map((k) => (
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
