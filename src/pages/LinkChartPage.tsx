/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : LinkChartPage.tsx
 * Created at  : 2026-06-23
 * Updated at  : 2026-07-02
 * Author      : jeefo
 * Purpose     :
 * Description :
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {useEffect, useMemo, useRef, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {useApolloClient, useMutation, useQuery} from "@apollo/client";
import {
  ACTIVE_CASE_QUERY,
  CALL_RECORDS_QUERY,
  CASE_GRAPHS_QUERY,
  CREATE_CASE_GRAPH,
  CREATE_MANUAL_LINK,
  DELETE_CASE_GRAPH,
  DELETE_MANUAL_LINK,
  GENERATE_LINKS,
  LINKCHART_QUERY,
  NETWORK_FLOW_QUERY,
  SET_ACTIVE_CASE,
  SET_SUSPECT_PHOTO,
  TAG_EVIDENCE,
  TRANSACTIONS_QUERY,
  UPDATE_CASE_GRAPH,
  UPDATE_MANUAL_LINK,
} from "../graphql/queries";
import {
  Card,
  DataTable,
  Empty,
  Loading,
  PageHeader,
  SankeyChart,
  ToggleChip,
} from "../components/kit";
import {Select} from "../components/inputs";
import NetworkGraph, {LINK_STYLE} from "../components/NetworkGraph";
import type {NetworkGraphHandle} from "../components/NetworkGraph";
import CaseGate from "../components/CaseGate";
import PersonFormModal, {type SavedPerson} from "../components/PersonFormModal";
import {useDrilldown} from "../lib/drilldown";
import {
  ignorePairs,
  isBelowMin,
  matchesDescRules,
  pairKey,
  txnPairKey,
  useIgnoredDesc,
  useIgnoredPairs,
  useIgnoredTxns,
  useMinAmount,
} from "../lib/ignoredPairs";
import {formatMoney} from "../lib/format";
import {buildEvidenceNetwork} from "../lib/networkGraph";
import type {
  NetworkLink,
  NetworkLinkKind,
  NetworkNode,
} from "../lib/networkGraph";
import type {SuspectLinkType} from "../types";

// The case's connection map: suspects, accounts and phones from the ACTUAL
// imported evidence, with transactions/calls aggregated into weighted edges.

interface LcSuspect {
  id           : number;
  suspectId    : string;
  fullName     : string;
  riskLevel    : string;
  organization : string | null;
  initials     : string;
  photoData    : string | null;
}

interface LcLink {
  id              : number;
  sourceSuspectId : number;
  targetSuspectId : number;
  linkType        : SuspectLinkType;
  description     : string | null;
  strength        : number;
  totalFinancialValue : number | null;
  totalCallCount  : number | null;
  confidenceLevel : string;
  // Ids of the transactions backing a FINANCIAL_TRANSFER link — used to
  // re-total it under the active noise filter (empty for other link types).
  contributingTxnIds : number[];
  // The saved board a MANUAL connection belongs to (null = default view).
  caseGraphId : number | null;
}

interface LcData {
  suspects     : LcSuspect[];
  suspectLinks : LcLink[];
}

interface TxData {
  bankAccounts: Array<{
    id: number; accountNumber: string; bankName: string;
    maskedNumber: string; suspectId: number | null;
  }>;
  transactions: Array<{
    id: number; bankAccountId: number; amount: number; type: string;
    counterpartyAccount: string | null; counterpartyName: string | null;
    description: string | null;
  }>;
}

interface CallData {
  callRecords: Array<{
    id: number; callerNumber: string; calledNumber: string;
    durationSeconds: number; direction: string | null;
    suspectId: number | null;
  }>;
  suspects: Array<{
    id: number; fullName: string; riskLevel: string;
    phoneNumbers: Array<{id: number; number: string}>;
  }>;
}

const NODE_TYPE_LABEL: Record<string, string> = {
  PERSON  : "Сэжигтэн",
  ACCOUNT : "Данс",
  PHONE   : "Утас",
};

// Toggleable evidence-edge kinds, in legend order. "owns" is structural
// (person → their account/phone) and always drawn.
const EDGE_KINDS: NetworkLinkKind[] = ["txn", "call", "manual"];

// Downscale a chosen image to a 256x256 JPEG data-URI (keeps the DB small) —
// same treatment the People page gives portraits.
function resizeToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no 2d context"));
        ctx.drawImage(img, 0, 0, 256, 256);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function LinkChartPage() {
  const {data, loading, refetch} = useQuery<LcData>(LINKCHART_QUERY);
  const txQ = useQuery<TxData>(TRANSACTIONS_QUERY);
  const callQ = useQuery<CallData>(CALL_RECORDS_QUERY);
  const flowQ = useQuery<{networkFlow: {
    nodeLabels: string[]; nodeColors: string[]; sourceIndices: number[];
    targetIndices: number[]; values: number[]; linkColors: string[];
  }}>(NETWORK_FLOW_QUERY);
  const [generate, {loading: generating}] = useMutation(GENERATE_LINKS);
  const [selected, setSelected] = useState<NetworkNode | null>(null);
  // Clicked EDGE — the noise-removal target (a whole connection at once).
  const [selectedLink, setSelectedLink] = useState<NetworkLink | null>(null);
  // Isolate ("ego") mode: when set, ONLY this node and its direct connections
  // are shown, arranged as a clean radial ring around it — the analyst pulls a
  // single hub out of the hairball to read its connections in isolation.
  const [focusId, setFocusId] = useState<string | null>(null);

  // --- Manual connections (analyst-drawn relationships) --------------------
  // Everything is done straight on the graph now: click a person → "🔗 Холбох"
  // → click another person to draw the link; click a drawn (amber, dashed)
  // link to rename it, change its confidence, or disconnect it. No modal, no
  // separate manager card.
  const [createLink] = useMutation(CREATE_MANUAL_LINK);
  const [updateLink] = useMutation(UPDATE_MANUAL_LINK);
  const [deleteLink] = useMutation(DELETE_MANUAL_LINK);
  // Suspect portrait: set/replace it straight from the selected node's panel.
  const [setPhoto] = useMutation(SET_SUSPECT_PHOTO);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // The person whose panel triggered the file picker (so we know who to set).
  const photoTargetRef = useRef<number | null>(null);
  function pickPhoto(suspectId: number) {
    photoTargetRef.current = suspectId;
    photoInputRef.current?.click();
  }
  async function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";   // allow re-picking the same file later
    const id = photoTargetRef.current;
    if (!file || id == null) return;
    setPhotoBusy(true);
    try {
      const uri = await resizeToDataUri(file);
      await setPhoto({variables: {id, photoData: uri}});
      await refetch();
      // Keep the open panel in sync so its button flips to "solih" at once.
      setSelected((prev) => prev && Number(prev.id.slice(2)) === id
        ? {...prev, photoData: uri} : prev);
    } catch {
      /* ignore — bad image / cancelled */
    } finally {
      setPhotoBusy(false);
    }
  }
  async function clearPhoto(suspectId: number) {
    setPhotoBusy(true);
    try {
      await setPhoto({variables: {id: suspectId, photoData: null}});
      await refetch();
      setSelected((prev) => prev && Number(prev.id.slice(2)) === suspectId
        ? {...prev, photoData: null} : prev);
    } finally {
      setPhotoBusy(false);
    }
  }
  // Connect mode: the source person awaiting a target click (null = off).
  const [connectFrom, setConnectFrom] = useState<NetworkNode | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  // Shown when the analyst tries to draw a connection with no board loaded —
  // connections live ONLY inside a saved graph, so they must save/load one.
  const [needBoardHint, setNeedBoardHint] = useState(false);
  const [connectHint, setConnectHint] = useState("");
  // Inline editor for the currently selected manual edge.
  const [linkEdit, setLinkEdit] =
    useState<{label: string; confidence: string} | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  // Two-click inline confirm for cutting a manual link (no native popup).
  const [cutArmed, setCutArmed] = useState(false);
  // After drawing a link, auto-open its inline editor once the graph rebuilds
  // (so the analyst can name it right away).
  const [pendingPair, setPendingPair] =
    useState<{s: number; t: number} | null>(null);
  // "Add a brand-new person and connect them" — the target isn't in the case
  // yet, so we pop the shared person form, create them, pull them into the case
  // and draw the link. Holds the source person while the modal is open.
  const [addConnectFrom, setAddConnectFrom] = useState<NetworkNode | null>(null);
  const [tagEvidence] = useMutation(TAG_EVIDENCE);
  const caseQ = useQuery<{activeCase: {id: number} | null}>(ACTIVE_CASE_QUERY);
  const activeCaseId = caseQ.data?.activeCase?.id ?? null;

  // Open the "new person → connect" modal. Manual links live inside a saved
  // board, so require one first (mirrors startConnect).
  function startAddConnect(node: NetworkNode) {
    if (activeGraphId == null) {
      setNeedBoardHint(true);
      startSaveNew();
      return;
    }
    setSelectedLink(null);
    setNeedBoardHint(false);
    setAddConnectFrom(node);
  }

  // The modal saved a new suspect: pull them into the active case (so the
  // scoped graph shows them) and draw a manual link from the source person.
  async function onNewPersonConnected(saved: SavedPerson) {
    const from = addConnectFrom;
    if (!from || activeGraphId == null) {
      setAddConnectFrom(null);
      return;
    }
    const sId = Number(from.id.slice(2));   // "s:12" → 12
    if (activeCaseId != null) {
      await tagEvidence({variables: {
        caseFileId: activeCaseId, sourceType: "SUSPECT", sourceId: saved.id,
        description: "Холбоосын зураглалаас нэмсэн", severity: "INFO",
      }}).catch(() => undefined);
    }
    await createLink({variables: {input: {
      sourceSuspectId: sId, targetSuspectId: saved.id,
      description: "Холбоос", confidenceLevel: "HIGH",
      caseGraphId: activeGraphId,
    }}});
    await refetch();
    setAddConnectFrom(null);
    setSelected(null);
    // Open the new edge's inline editor as soon as it appears.
    setPendingPair({s: sId, t: saved.id});
  }

  function startConnect(node: NetworkNode) {
    // Connections belong to a saved graph. With no board loaded there's nowhere
    // to put one, so guide the analyst to save/select a graph first.
    if (activeGraphId == null) {
      setConnectFrom(null);
      setNeedBoardHint(true);
      startSaveNew();
      return;
    }
    setSelectedLink(null);
    setConnectHint("");
    setNeedBoardHint(false);
    setConnectFrom(node);
  }
  function cancelConnect() {
    setConnectFrom(null);
    setConnectHint("");
  }
  async function completeConnect(target: NetworkNode) {
    const from = connectFrom;
    if (!from) return;
    if (from.type !== "PERSON" || target.type !== "PERSON") {
      setConnectHint("Зөвхөн хоёр хүнийг холбоно уу"); return;
    }
    if (target.id === from.id) {cancelConnect(); return;}
    const sId = Number(from.id.slice(2));   // "s:12" → 12
    const tId = Number(target.id.slice(2));
    setConnectBusy(true);
    setConnectHint("");
    try {
      await createLink({variables: {input: {
        sourceSuspectId: sId, targetSuspectId: tId,
        description: "Холбоос", confidenceLevel: "HIGH",
        // Belongs to the loaded board (null = default view), so it won't leak
        // into other boards.
        caseGraphId: activeGraphId,
      }}});
      await refetch();
      setConnectFrom(null);
      setSelected(null);
      // Open the new edge's inline editor as soon as it appears in the graph.
      setPendingPair({s: sId, t: tId});
    } catch (err) {
      setConnectHint(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setConnectBusy(false);
    }
  }
  // Click a person while connecting draws the link; anything else selects.
  function handleNodeClick(node: NetworkNode | null) {
    if (connectFrom) {
      if (node) completeConnect(node);
      else cancelConnect();
      return;
    }
    setSelected(node);
  }

  async function saveLinkEdit() {
    if (!selectedLink?.linkId || !linkEdit) return;
    setLinkBusy(true);
    try {
      await updateLink({variables: {id: selectedLink.linkId,
        description: linkEdit.label.trim() || "Холбоос",
        confidenceLevel: linkEdit.confidence}});
      await refetch();
    } catch {
      /* surfaced by refetch state; ignore */
    } finally {
      setLinkBusy(false);
    }
  }

  async function removeConn(id: number) {
    try {
      await deleteLink({variables: {id}});
      await refetch();
      setSelectedLink(null);
    } catch {
      /* surfaced by refetch state; ignore */
    }
  }
  // Selected node = a drilldown; surface it in the header breadcrumb.
  useDrilldown(selected?.label ?? null);
  // Pairs the analyst marked "not important" on the Transactions page. Both
  // their edge AND the counterparty node are removed from the graph here.
  const ignoredPairs = useIgnoredPairs();
  const ignoredTxns = useIgnoredTxns();
  const descRules = useIgnoredDesc();
  // Noise floor — the primary declutter tool. Every transaction below it drops
  // out of the graph so only the significant suspect connections remain.
  const minAmount = useMinAmount();
  // Nodes the analyst removed by clicking them in the graph. Persisted so the
  // decluttered view survives reloads.
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(
        localStorage.getItem("forensic.hiddenNodes") || "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  function saveHidden(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem("forensic.hiddenNodes", JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  function hideNode(id: string) {
    const next = new Set(hidden);
    next.add(id);
    saveHidden(next);
    setSelected(null);
  }
  function restoreNodes() {
    saveHidden(new Set());
  }
  // Edge kinds the analyst switched off (legend chips above the graph).
  // Persisted so "hide the intel hairball" survives reloads.
  const [hiddenKinds, setHiddenKinds] = useState<Set<NetworkLinkKind>>(() => {
    try {
      return new Set(JSON.parse(
        localStorage.getItem("forensic.hiddenEdgeKinds") || "[]"
      ) as NetworkLinkKind[]);
    } catch {
      return new Set();
    }
  });
  // Search-to-focus: find any node (name / account number / phone) in the
  // dense graph, jump the view to it and open its detail panel.
  const graphRef = useRef<NetworkGraphHandle>(null);
  const [search, setSearch] = useState("");
  function focusSearchResult(node: NetworkNode) {
    setSelected(node);
    setSelectedLink(null);
    setSearch("");
    graphRef.current?.focusNode(node.id);
  }
  function applyHiddenKinds(next: Set<NetworkLinkKind>) {
    setHiddenKinds(next);
    try {
      localStorage.setItem(
        "forensic.hiddenEdgeKinds", JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  function toggleKind(kind: NetworkLinkKind) {
    const next = new Set(hiddenKinds);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    applyHiddenKinds(next);
  }

  // --- Saved graph boards --------------------------------------------------
  // A detective arranges the chart for one angle (money / phone / associates)
  // and saves the WHOLE graph. Many boards live per case; loading one restores
  // its visible edge kinds, hidden nodes and node layout.
  interface SavedGraph {id: number; name: string; state: string;
    updatedAt: string}
  const graphsQ = useQuery<{caseGraphs: SavedGraph[]}>(CASE_GRAPHS_QUERY);
  const savedGraphs = graphsQ.data?.caseGraphs ?? [];
  const [createGraph] = useMutation(CREATE_CASE_GRAPH);
  const [updateGraph] = useMutation(UPDATE_CASE_GRAPH);
  const [deleteGraph] = useMutation(DELETE_CASE_GRAPH);
  // The board currently loaded (so "Хадгалах" can overwrite it).
  const [activeGraphId, setActiveGraphId] = useState<number | null>(null);
  // Inline (non-blocking) board UI — replaces the native prompt/confirm popups.
  // graphNameDraft: naming a NEW board; renameDraft: renaming one; confirmDel:
  // the board id armed for delete.
  const [graphNameDraft, setGraphNameDraft] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] =
    useState<{id: number; name: string} | null>(null);
  const [confirmDelGraph, setConfirmDelGraph] = useState<number | null>(null);
  // Momentary "✓ saved" flash after overwriting the loaded board.
  const [savedFlash, setSavedFlash] = useState(false);
  // Layout to restore into the canvas + a key that forces re-application.
  // Seeded from localStorage so freely-dragged node positions come back after
  // a reload without needing to save a board.
  const [layout, setLayout] = useState<{
    positions: Record<string, {x: number; y: number; s?: number; sh?: "rect"}> | null; key: number;
  }>(() => {
    try {
      const raw = localStorage.getItem("forensic.nodePositions");
      return {positions: raw ? JSON.parse(raw) : null, key: 0};
    } catch {
      return {positions: null, key: 0};
    }
  });

  // Called whenever the analyst drags a node (or resets). Persist the new
  // arrangement so it survives reloads, and update the restore baseline
  // WITHOUT bumping `key` — so the next natural rebuild (e.g. after adding a
  // link) keeps the dragged layout instead of snapping nodes back, but no
  // forced re-layout happens right now. null = reset → forget saved positions.
  function persistPositions(
    positions: Record<string, {x: number; y: number; s?: number; sh?: "rect"}> | null) {
    try {
      if (positions) {
        localStorage.setItem(
          "forensic.nodePositions", JSON.stringify(positions));
      } else {
        localStorage.removeItem("forensic.nodePositions");
      }
    } catch {
      /* ignore */
    }
    setLayout((prev) => ({positions, key: prev.key}));
  }

  // Snapshot the whole current view for saving.
  function captureState(): string {
    return JSON.stringify({
      hiddenKinds: [...hiddenKinds],
      hidden: [...hidden],
      positions: graphRef.current?.getPositions() ?? {},
    });
  }

  // Open the inline name field (no blocking browser prompt).
  function startSaveNew() {
    setRenameDraft(null);
    setConfirmDelGraph(null);
    setGraphNameDraft("");
  }
  async function commitNewGraph() {
    if (graphNameDraft == null) return;
    const {data} = await createGraph({variables: {
      name: graphNameDraft.trim() || "Нэргүй граф", state: captureState()}});
    await graphsQ.refetch();
    const id = data?.createCaseGraph?.id;
    if (id) setActiveGraphId(id);
    setGraphNameDraft(null);
    // Now a board is active — the analyst can add connections to it.
    setNeedBoardHint(false);
  }

  async function overwriteGraph() {
    if (activeGraphId == null) return;
    await updateGraph({variables: {id: activeGraphId, state: captureState()}});
    await graphsQ.refetch();
    // Brief confirmation so a silent overwrite doesn't feel like nothing saved.
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }

  function loadGraph(g: SavedGraph) {
    let st: {hiddenKinds?: string[]; hidden?: string[];
      positions?: Record<string, {x: number; y: number; s?: number; sh?: "rect"}>} = {};
    try {st = JSON.parse(g.state || "{}");} catch {st = {};}
    applyHiddenKinds(new Set((st.hiddenKinds ?? []) as NetworkLinkKind[]));
    saveHidden(new Set(st.hidden ?? []));
    const pos = st.positions ?? {};
    setLayout({positions: pos, key: Date.now()});
    // A loaded board's layout becomes the new persistent baseline too.
    try {
      localStorage.setItem("forensic.nodePositions", JSON.stringify(pos));
    } catch {
      /* ignore */
    }
    setActiveGraphId(g.id);
    setSelected(null);
    setSelectedLink(null);
  }

  // --- URL persistence -------------------------------------------------------
  // Keep the active case + loaded board in the query string so a refresh (or a
  // shared/bookmarked link) reopens exactly what was on screen. Restore reads a
  // value CAPTURED AT MOUNT (the refs below), so the reflect effects — which may
  // momentarily strip a param before state catches up — can't defeat it.
  const [searchParams, setSearchParams] = useSearchParams();
  const apollo = useApolloClient();
  const [setActiveCaseMut] = useMutation(SET_ACTIVE_CASE);
  const wantCaseId = useRef<number | null>(
    Number(searchParams.get("case")) || null).current;
  const wantGraphId = useRef<number | null>(
    Number(searchParams.get("graph")) || null).current;
  const caseRestored = useRef(false);
  const graphRestored = useRef(false);

  function writeParam(key: string, value: number | null) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const want = value == null ? null : String(value);
      if ((next.get(key) ?? null) === want) return prev;   // no change
      if (want == null) next.delete(key); else next.set(key, want);
      return next;
    }, {replace: true});
  }

  // Restore ?case (deep link). A normal refresh already keeps the case
  // server-side, so this only acts when the link points at a different case.
  useEffect(() => {
    if (caseRestored.current || wantCaseId == null || caseQ.loading) return;
    caseRestored.current = true;
    if (wantCaseId !== activeCaseId) {
      void setActiveCaseMut({variables: {caseFileId: wantCaseId}})
        .then(() => apollo.resetStore());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseQ.loading]);

  // Restore ?graph once this case's boards have loaded.
  useEffect(() => {
    if (graphRestored.current || wantGraphId == null || graphsQ.loading) return;
    const g = savedGraphs.find((x) => x.id === wantGraphId);
    if (g) loadGraph(g);
    graphRestored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphsQ.loading, savedGraphs]);

  // Reflect the current selections back into the URL.
  useEffect(() => {
    writeParam("case", activeCaseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);
  useEffect(() => {
    writeParam("graph", activeGraphId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGraphId]);

  function startRename(g: SavedGraph) {
    setGraphNameDraft(null);
    setConfirmDelGraph(null);
    setRenameDraft({id: g.id, name: g.name});
  }
  async function commitRename() {
    if (!renameDraft) return;
    const name = renameDraft.name.trim();
    if (!name) {setRenameDraft(null); return;}
    await updateGraph({variables: {id: renameDraft.id, name}});
    await graphsQ.refetch();
    setRenameDraft(null);
  }

  async function removeGraph(id: number) {
    const wasActive = activeGraphId === id;
    await deleteGraph({variables: {id}});
    await graphsQ.refetch();
    // The board's manual connections were cascade-deleted server-side — refetch
    // so they leave the cache too.
    await refetch();
    setConfirmDelGraph(null);
    if (wasActive) {
      // Deleting the LOADED board must visibly clear it — drop the selection so
      // the dropdown returns to its placeholder, forget the saved arrangement,
      // and bump the layout key so the canvas re-lays out (reacts) instead of
      // leaving the deleted board's node positions stuck on screen.
      setActiveGraphId(null);
      try {
        localStorage.removeItem("forensic.nodePositions");
      } catch {
        /* ignore */
      }
      setLayout({positions: null, key: Date.now()});
      setSelected(null);
      setSelectedLink(null);
    }
  }

  async function onGenerate() {
    await generate();
    await refetch();
  }

  // Remove a clicked transaction edge: mark EVERY account→counterparty pair
  // that feeds this graph edge (both directions) unimportant. Shares the
  // ignored-pairs store with the Transactions page, so it is restorable from
  // /transactions?view=removed.
  function removeTxnEdge(link: NetworkLink) {
    if (!txQ.data) return;
    const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    // An edge endpoint is now a PERSON (owned accounts folded in) or a single
    // fallback account. Resolve each side to the set of bank-account ids behind
    // it, then mark every txn flowing between the two sets (both directions).
    const acctsOf = (endpointId: string): Set<number> => {
      if (endpointId.startsWith("s:")) {
        const sid = Number(endpointId.slice(2));
        return new Set(txQ.data!.bankAccounts
          .filter((a) => a.suspectId === sid).map((a) => a.id));
      }
      return new Set([Number(endpointId.slice(2))]);   // "a:12" → 12
    };
    const aAccts = acctsOf(link.source);
    const bAccts = acctsOf(link.target);
    const idByNumber = new Map(txQ.data.bankAccounts
      .map((a) => [onlyDigits(a.accountNumber), a.id]));
    const keys = new Set<string>();
    for (const t of txQ.data.transactions) {
      const cp = t.counterpartyAccount?.trim();
      if (!cp) continue;
      const toId = idByNumber.get(onlyDigits(cp));
      if (toId == null) continue;
      if ((aAccts.has(t.bankAccountId) && bAccts.has(toId))
        || (bAccts.has(t.bankAccountId) && aAccts.has(toId))) {
        keys.add(pairKey(t.bankAccountId, cp));
      }
    }
    if (keys.size) ignorePairs([...keys]);
    setSelectedLink(null);
  }

  const network = useMemo(() => {
    if (!data || !txQ.data || !callQ.data) return null;
    const accounts = txQ.data.bankAccounts;
    const phones = callQ.data.suspects.flatMap((s) =>
      s.phoneNumbers.map((p) => ({suspectId: s.id, number: p.number})));

    const onlyDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");
    const idByNumber = new Map(
      accounts.map((a) => [onlyDigits(a.accountNumber), a.id]));
    const canon = (a: number, b: number) => a < b ? `${a}|${b}` : `${b}|${a}`;

    // Each ignored pair "A→B": drop the A↔B edge (both directions). A node
    // only disappears once it has NO money edges left — so a big counterparty
    // that also happens to be in a small (removed) pair is NOT lost.
    const ignoredEdges = new Set<string>();
    for (const key of ignoredPairs) {
      const [fromStr, cpNum] = key.split("→");
      const fromId = Number(fromStr);
      const toId = idByNumber.get(onlyDigits(cpNum));
      if (toId != null) ignoredEdges.add(canon(fromId, toId));
    }
    const txns = txQ.data.transactions.filter((t) => {
      // Individually removed on the Txns page — never an edge.
      if (ignoredTxns.has(t.id)) return false;
      // Small money floored out — the main declutter lever for the graph.
      if (isBelowMin(t.amount, minAmount)) return false;
      // Description-noise (organisation formats) marked on the Txns page.
      if (matchesDescRules(t.description, descRules)) return false;
      const toId = t.counterpartyAccount
        ? idByNumber.get(onlyDigits(t.counterpartyAccount)) : undefined;
      if (toId == null) return true;  // external counterparty — never an edge
      return !ignoredEdges.has(canon(t.bankAccountId, toId));
    });

    // Analyst-drawn MANUAL connections live ONLY inside a saved board: a manual
    // link shows solely on the board it belongs to, and NOTHING shows when no
    // board is loaded (there is no global/default set of connections). Auto-
    // generated evidence links always show.
    const scopedLinks = data.suspectLinks.filter((l) =>
      l.linkType !== "MANUAL"
      || (activeGraphId != null && l.caseGraphId === activeGraphId));

    const net = buildEvidenceNetwork(
      data.suspects,
      scopedLinks,
      accounts,
      txns,
      callQ.data.callRecords,
      phones
    );

    // Per-kind edge totals BEFORE the visibility chips — each chip shows what
    // its kind would add back even while switched off.
    const kindCounts: Partial<Record<NetworkLinkKind, number>> = {};
    for (const l of net.links) {
      // Soft edges (merged name-matched transfers) aren't counted — they only
      // draw between already-visible people, so counting them here would make
      // the "Гүйлгээ" chip claim far more edges than are actually on screen.
      if (l.soft) continue;
      kindCounts[l.kind] = (kindCounts[l.kind] ?? 0) + 1;
    }
    // Drop the switched-off kinds ("owns" is structural — never toggled).
    const visLinks = net.links.filter((l) =>
      l.kind === "owns" || !hiddenKinds.has(l.kind));

    // Money/call flow only (the auto-generated "intel" links connect nearly
    // everyone — the purple hairball — so they don't keep a node alive).
    const flow = new Set<string>();
    for (const l of visLinks) {
      // "soft" money edges (name-matched FINANCIAL_TRANSFER merged into the
      // money view) never keep a node alive — they only draw between people
      // already on the canvas, so they can't re-bush the graph.
      if ((l.kind === "txn" || l.kind === "call") && !l.soft) {
        flow.add(l.source);
        flow.add(l.target);
      }
    }
    // ...unless BOTH flow kinds are switched off and intel is the view the
    // analyst asked for — then intel edges carry their persons.
    if (hiddenKinds.has("txn") && hiddenKinds.has("call")
      && !hiddenKinds.has("intel")) {
      for (const l of visLinks) {
        if (l.kind === "intel") {
          flow.add(l.source);
          flow.add(l.target);
        }
      }
    }
    // Manual (analyst-drawn) connections are ground truth — always keep both
    // endpoints so a hand-drawn relationship never disappears behind the
    // noise filters, even when the two people have no money/call flow.
    if (!hiddenKinds.has("manual")) {
      for (const l of visLinks) {
        if (l.kind === "manual") {
          flow.add(l.source);
          flow.add(l.target);
        }
      }
    }
    const owner = new Map<string, string>();  // account/phone id → person id
    for (const l of visLinks) {
      if (l.kind === "owns") owner.set(l.target, l.source);
    }
    // Keep flow nodes + the owner person of any kept account. Accounts nobody
    // transacts with (edges all removed) and isolated ownership avatars drop.
    const keep = new Set(flow);
    for (const id of flow) {
      const o = owner.get(id);
      if (o) keep.add(o);
    }
    const nodes = net.nodes.filter((n) => keep.has(n.id) && !hidden.has(n.id));
    const links = visLinks.filter((l) =>
      keep.has(l.source) && keep.has(l.target)
      && !hidden.has(l.source) && !hidden.has(l.target));
    return {nodes, links, kindCounts};
  }, [data, txQ.data, callQ.data, ignoredPairs, ignoredTxns, descRules,
    minAmount, hidden, hiddenKinds, activeGraphId]);

  // Isolate view: the focused node + its direct neighbors only, laid out as a
  // radial ring (the focused node dead-center, neighbors evenly around it — a
  // second, wider ring when there are many). This is the "pull only this node's
  // connections into a cluster" view. Positions are in the graph's internal
  // coordinate space (1280×720, so center = 640,360), fed to the canvas as a
  // saved layout so it spawns settled exactly on the ring.
  const focusView = useMemo(() => {
    if (!focusId || !network) return null;
    const center = network.nodes.find((n) => n.id === focusId);
    if (!center) return null;
    const nbrIds = new Set<string>();
    for (const l of network.links) {
      if (l.source === focusId) nbrIds.add(l.target);
      if (l.target === focusId) nbrIds.add(l.source);
    }
    const keep = new Set(nbrIds);
    keep.add(focusId);
    const nodes = network.nodes.filter((n) => keep.has(n.id));
    const links = network.links.filter(
      (l) => keep.has(l.source) && keep.has(l.target));
    // People first (they carry the story), then accounts/phones — so like
    // neighbors sit together on the ring instead of scattering by chance.
    const typeRank = (t: string) => (t === "PERSON" ? 0 : t === "ACCOUNT" ? 1 : 2);
    const nbrs = nodes
      .filter((n) => n.id !== focusId)
      .sort((a, b) => typeRank(a.type) - typeRank(b.type)
        || a.label.localeCompare(b.label));
    const CX = 640, CY = 360;
    const positions: Record<string, {x: number; y: number}> = {
      [focusId]: {x: CX, y: CY},
    };
    const placeRing = (arr: typeof nbrs, radius: number) => {
      arr.forEach((node, i) => {
        const a = -Math.PI / 2 + (i / Math.max(1, arr.length)) * Math.PI * 2;
        positions[node.id] =
          {x: CX + Math.cos(a) * radius, y: CY + Math.sin(a) * radius};
      });
    };
    if (nbrs.length > 18) {
      // Two concentric rings so a big hub doesn't cram everything onto one
      // crowded circle. Even indices inner, odd outer.
      placeRing(nbrs.filter((_, i) => i % 2 === 0), 205);
      placeRing(nbrs.filter((_, i) => i % 2 === 1), 320);
    } else {
      placeRing(nbrs, Math.min(300, 130 + nbrs.length * 6));
    }
    return {nodes, links, positions, center, count: nbrs.length};
  }, [focusId, network]);

  // Enter/leave isolate mode → frame the whole ring (reset pan/zoom). The child
  // canvas rebuilds its sim in ITS effect (which runs before this parent one),
  // so by the time we reset the view the ring positions are already applied.
  useEffect(() => {
    graphRef.current?.resetView();
  }, [focusId]);

  // If the isolated node leaves the graph (hidden, or filtered out by a noise
  // change), drop back to the full view so we never strand an empty canvas.
  useEffect(() => {
    if (focusId && network && !network.nodes.some((n) => n.id === focusId)) {
      setFocusId(null);
    }
  }, [focusId, network]);

  // A freshly-drawn link: once it shows up in the rebuilt graph, select its
  // edge so the inline rename editor opens automatically.
  useEffect(() => {
    if (!pendingPair || !network) return;
    const s = `s:${pendingPair.s}`;
    const t = `s:${pendingPair.t}`;
    const link = network.links.find((l) => l.kind === "manual"
      && ((l.source === s && l.target === t)
        || (l.source === t && l.target === s)));
    if (link) {
      setSelected(null);
      setSelectedLink(link);
      setPendingPair(null);
    }
  }, [network, pendingPair]);

  // Keep the inline manual-edge editor in sync with the selected edge.
  useEffect(() => {
    setCutArmed(false);
    if (selectedLink?.kind === "manual" && selectedLink.linkId != null) {
      const row = data?.suspectLinks.find((x) => x.id === selectedLink.linkId);
      setLinkEdit({
        label: selectedLink.label ?? row?.description ?? "",
        confidence: row?.confidenceLevel || "HIGH",
      });
    } else {
      setLinkEdit(null);
    }
  }, [selectedLink, data]);

  const actions = (
    <div style={{display: "flex", gap: 8}}>
      <button className="btn btn-primary" onClick={onGenerate}
        disabled={generating}>
        {generating ? "БОЛОВСРУУЛЖ БАЙНА..." : "ХОЛБООС ҮҮСГЭХ"}
      </button>
    </div>
  );

  if (loading || !data || !network) {
    return (
      <div className="page-container">
        <PageHeader icon="🕸" title="Холбоосын зураглал"
          subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />
        <CaseGate>
          <Loading />
        </CaseGate>
      </div>
    );
  }

  // Mirror of NetworkGraph.clusterAround's rule: a node is worth gathering only
  // if it has at least one OWN satellite — a leaf that connects to nothing but
  // it, or a node it owns. Nodes whose only neighbours are other hubs (centers)
  // have nothing to gather, so the button stays hidden.
  function hasGatherable(nodeId: string): boolean {
    const elsewhere = new Set<string>();
    const owned = new Set<string>();
    for (const l of network!.links) {
      if (l.source === nodeId || l.target === nodeId) {
        const other = l.source === nodeId ? l.target : l.source;
        if (l.kind === "owns") owned.add(other);
      } else {
        elsewhere.add(l.source);
        elsewhere.add(l.target);
      }
    }
    return network!.links.some((l) => {
      const other = l.source === nodeId ? l.target
        : l.target === nodeId ? l.source : null;
      return other != null && (owned.has(other) || !elsewhere.has(other));
    });
  }

  const suspects = data.suspects;
  const nameById = new Map(suspects.map((s) => [s.id, s.fullName]));
  // Raw per-kind totals (pre-toggle) — the chips double as the edge legend.
  const totalEvidence = EDGE_KINDS.reduce(
    (sum, k) => sum + (network.kindCounts[k] ?? 0), 0);
  // Matches against label AND sub (sub carries account/phone numbers, so a
  // number fragment finds its node too). Persons and prefix hits sort first.
  const searchQ = search.trim().toLowerCase();
  const searchHits = searchQ
    ? network.nodes
      .filter((n) => n.label.toLowerCase().includes(searchQ)
        || (n.sub ?? "").toLowerCase().includes(searchQ)
        // An owned account's bank + number now lives in the person's stats, so
        // search those too — otherwise account-number lookup would break.
        || n.stats.some(([, v]) => v.toLowerCase().includes(searchQ)))
      .sort((a, b) => {
        const pa = a.type === "PERSON" ? 0 : 1;
        const pb = b.type === "PERSON" ? 0 : 1;
        if (pa !== pb) return pa - pb;
        const sa = a.label.toLowerCase().startsWith(searchQ) ? 0 : 1;
        const sb = b.label.toLowerCase().startsWith(searchQ) ? 0 : 1;
        return sa !== sb ? sa - sb : a.label.localeCompare(b.label);
      })
    : [];
  // Keep the links list consistent with the (filtered) graph: only links whose
  // BOTH suspects still appear as nodes. Otherwise the count contradicts what's
  // actually drawn after removing unimportant pairs.
  const shownSuspectIds = new Set(
    network.nodes.filter((n) => n.type === "PERSON")
      .map((n) => Number(n.id.slice(2))));
  // Re-total every FINANCIAL_TRANSFER link against the ACTIVE noise filter, so
  // the list shows the same money the filtered graph does — not the raw
  // all-transactions total the server stored at generation time. A backing txn
  // counts only if it survives the exact test the Transactions page applies.
  const txnById = new Map((txQ.data?.transactions ?? []).map((t) => [t.id, t]));
  const txnKept = (t: {id: number; amount: number; description: string | null;
    bankAccountId: number; counterpartyAccount: string | null}): boolean => {
    if (ignoredTxns.has(t.id)) return false;
    if (isBelowMin(t.amount, minAmount)) return false;
    if (matchesDescRules(t.description, descRules)) return false;
    const pk = txnPairKey(t);
    return !(pk != null && ignoredPairs.has(pk));
  };
  const shownLinks = data.suspectLinks
    .filter((l) => shownSuspectIds.has(l.sourceSuspectId)
      && shownSuspectIds.has(l.targetSuspectId)
      // Manual connections live only inside a loaded board.
      && (l.linkType !== "MANUAL"
        || (activeGraphId != null && l.caseGraphId === activeGraphId)))
    .flatMap((l) => {
      // Non-financial links (calls, shared address/device) and links generated
      // before this feature (no backing ids yet) pass through unchanged.
      if (l.linkType !== "FINANCIAL_TRANSFER"
        || l.contributingTxnIds.length === 0) return [l];
      const kept = l.contributingTxnIds
        .map((id) => txnById.get(id))
        .filter((t): t is NonNullable<typeof t> => !!t && txnKept(t));
      // Every backing txn was marked unimportant → drop the whole connection,
      // matching the filtered graph (no phantom "762 txns / 16M" row).
      if (kept.length === 0) return [];
      const sum = kept.reduce((acc, t) => acc + t.amount, 0);
      return [{
        ...l,
        strength: Math.min(10, kept.length),
        totalFinancialValue: sum,
        description: `${kept.length} transactions totaling ${formatMoney(sum)}`,
      }];
    });
  return (
    <div className="page-container">
      <PageHeader icon="🕸" title="Холбоосын зураглал"
        subtitle="СҮЛЖЭЭНИЙ ШИНЖИЛГЭЭ" actions={actions} />
      <CaseGate>

      {/* Shared hidden picker for setting a person's portrait from their node. */}
      <input ref={photoInputRef} type="file" accept="image/*"
        style={{display: "none"}} onChange={onPhotoPicked} />

      <Card
        title="Нотлох баримтын сүлжээ"
        actions={
          <div style={{display: "flex", gap: 8, alignItems: "center",
            flexWrap: "wrap"}}>
            {graphNameDraft !== null ? (
              // Inline "save as new" name field.
              <>
                <input className="form-input" autoFocus
                  style={{width: 220, height: 32}}
                  value={graphNameDraft}
                  onChange={(e) => setGraphNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitNewGraph();
                    else if (e.key === "Escape") setGraphNameDraft(null);
                  }}
                  placeholder="Графын нэр… (ж: Санхүүгийн сүлжээ)" />
                <button className="btn btn-primary" onClick={commitNewGraph}>
                  ✔ Хадгалах
                </button>
                <button className="btn"
                  onClick={() => {
                    setGraphNameDraft(null);
                    setNeedBoardHint(false);
                  }}>Болих</button>
              </>
            ) : renameDraft ? (
              // Inline rename field.
              <>
                <input className="form-input" autoFocus
                  style={{width: 220, height: 32}}
                  value={renameDraft.name}
                  onChange={(e) =>
                    setRenameDraft({...renameDraft, name: e.target.value})}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    else if (e.key === "Escape") setRenameDraft(null);
                  }}
                  placeholder="Шинэ нэр…" />
                <button className="btn btn-primary" onClick={commitRename}>
                  ✔ Хадгалах
                </button>
                <button className="btn"
                  onClick={() => setRenameDraft(null)}>Болих</button>
              </>
            ) : (
              <>
                {savedGraphs.length > 0 && (
                  <Select value={activeGraphId ?? ""}
                    onChange={(v) => {
                      const g = savedGraphs.find((x) => x.id === Number(v));
                      if (g) loadGraph(g);
                    }}
                    title="Хадгалсан графыг ачаалах"
                    style={{width: 190}}
                    triggerLabel={activeGraphId
                      ? savedGraphs.find((x) => x.id === activeGraphId)?.name
                      : "📂 Хадгалсан граф…"}
                    options={[{value: "", label: "📂 Хадгалсан граф…"},
                      ...savedGraphs.map((g) =>
                        ({value: g.id, label: g.name}))]} />
                )}
                {activeGraphId != null && (
                  confirmDelGraph === activeGraphId ? (
                    <span style={{display: "inline-flex", gap: 6,
                      alignItems: "center", fontSize: 13, color: "#c8cce0"}}>
                      Устгах уу?
                      <button className="btn btn-danger btn-sm"
                        onClick={() => removeGraph(activeGraphId)}>Тийм</button>
                      <button className="btn btn-sm"
                        onClick={() => setConfirmDelGraph(null)}>Үгүй</button>
                    </span>
                  ) : (
                    <>
                      {/* A graph is loaded → "Save" overwrites IT; "Шинээр"
                          saves a separate copy under a new name. */}
                      <button className="btn btn-primary" onClick={overwriteGraph}
                        title={"Өөрчлөлтийг «"
                          + (savedGraphs.find((x) => x.id === activeGraphId)?.name
                            ?? "") + "» графт хадгалах"}>
                        {savedFlash ? "✓ Хадгалагдлаа" : "💾 Хадгалах"}
                      </button>
                      <button className="btn" onClick={startSaveNew}
                        title="Одоогийн байдлыг ШИНЭ нэрээр (хуулбар) хадгалах">
                        📄 Шинээр хадгалах
                      </button>
                      <button className="btn" title="Нэр солих"
                        onClick={() => {
                          const g = savedGraphs.find(
                            (x) => x.id === activeGraphId);
                          if (g) startRename(g);
                        }}>✎</button>
                      <button className="btn btn-danger" title="Графыг устгах"
                        onClick={() => setConfirmDelGraph(activeGraphId)}>
                        ✕
                      </button>
                    </>
                  )
                )}
                {/* No graph loaded → the only save action is "save as new". */}
                {activeGraphId == null && (
                  <button className="btn btn-primary" onClick={startSaveNew}
                    title="Одоогийн графыг шинэ нэрээр хадгалах">
                    💾 Граф хадгалах
                  </button>
                )}
                {hidden.size > 0 && (
                  <button className="btn" onClick={restoreNodes}
                    title="Хасагдсан зангилаануудыг буцааж харуулах">
                    ↩ Зангилаа ({hidden.size})
                  </button>
                )}
              </>
            )}
          </div>
        }
        style={{marginBottom: 16}}>
        {totalEvidence > 0 && (
          <div className="graph-filter-bar">
            <span className="graph-filter-label">Холбоос харуулах:</span>
            {EDGE_KINDS
              .filter((kind) => (network.kindCounts[kind] ?? 0) > 0)
              .map((kind) => (
                <ToggleChip key={kind}
                  label={`${LINK_STYLE[kind].label} · ${network.kindCounts[kind] ?? 0}`}
                  color={LINK_STYLE[kind].color}
                  on={!hiddenKinds.has(kind)}
                  onToggle={() => toggleKind(kind)} />
              ))}
            <div className="graph-search">
              <input type="text" className="form-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchHits.length > 0) {
                    focusSearchResult(searchHits[0]);
                  } else if (e.key === "Escape") {
                    setSearch("");
                  }
                }}
                onBlur={() => setSearch("")}
                placeholder="Хайх — нэр, данс, утас…"
                aria-label="Зангилаа хайх" />
              {searchQ && (
                <div className="graph-search-menu">
                  {searchHits.slice(0, 8).map((n) => (
                    <button key={n.id} type="button"
                      className="graph-search-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        focusSearchResult(n);
                      }}>
                      <span className={`graph-search-type ${n.type.toLowerCase()}`}>
                        {NODE_TYPE_LABEL[n.type] ?? n.type}
                      </span>
                      <span className="graph-search-name">{n.label}</span>
                      {n.sub && (
                        <span className="graph-search-sub">{n.sub}</span>
                      )}
                    </button>
                  ))}
                  {searchHits.length > 8 && (
                    <div className="graph-search-more">
                      …нийт {searchHits.length} илэрц — хайлтаа нарийсгана уу
                    </div>
                  )}
                  {searchHits.length === 0 && (
                    <div className="graph-search-more">Илэрц алга</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {network.nodes.length > 0 ? (
          <div style={{position: "relative"}}>
            <NetworkGraph ref={graphRef}
              nodes={focusView ? focusView.nodes : network.nodes}
              links={focusView ? focusView.links : network.links}
              selectedId={connectFrom?.id ?? selected?.id ?? focusId}
              initialPositions={focusView ? focusView.positions : layout.positions}
              layoutKey={focusView ? `focus:${focusId}` : layout.key}
              // Dragging inside isolate mode rearranges the ring for viewing but
              // must NOT overwrite the real saved layout — only persist in the
              // normal full view.
              onLayoutChange={focusView ? undefined : persistPositions}
              onNodeClick={handleNodeClick} onLinkClick={setSelectedLink} />
            {focusView && (
              <div style={{
                position: "absolute", top: 10, left: "50%",
                transform: "translateX(-50%)", zIndex: 3,
                background: "rgba(10,12,24,0.94)",
                border: "1px solid #00E5FF",
                color: "#e8ebff", padding: "8px 12px", borderRadius: 8,
                fontSize: 13, display: "flex", alignItems: "center", gap: 10,
                boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
              }}>
                <span>
                  ◎ Зөвхөн <b style={{color: "#00E5FF"}}>
                    {focusView.center.label}</b>-ийн холбоос
                  <span style={{color: "#9aa0b5"}}>
                    {" · "}{focusView.count} зангилаа</span>
                </span>
                <button className="btn btn-sm" onClick={() => setFocusId(null)}>
                  ✕ Бүгдийг харах
                </button>
              </div>
            )}
            {connectFrom && (
              <div style={{
                position: "absolute", top: 10, left: "50%",
                transform: "translateX(-50%)", zIndex: 3,
                background: "rgba(10,12,24,0.94)",
                border: `1px solid ${LINK_STYLE.manual.color}`,
                color: "#e8ebff", padding: "8px 12px", borderRadius: 8,
                fontSize: 13, display: "flex", alignItems: "center", gap: 10,
                maxWidth: "92%", boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
              }}>
                <span>
                  🔗 <b style={{color: LINK_STYLE.manual.color}}>
                    {connectFrom.label}</b>
                  {connectBusy
                    ? " — холбож байна…"
                    : " — хэнтэй холбохоо график дээрх өөр хүн дээр дарж сонго"}
                  {connectHint && (
                    <span style={{color: "var(--accent-red)"}}>
                      {" · "}{connectHint}
                    </span>
                  )}
                </span>
                <button className="btn btn-sm" onClick={cancelConnect}>
                  Болих
                </button>
              </div>
            )}
            {needBoardHint && activeGraphId == null && (
              <div style={{
                position: "absolute", top: 10, left: "50%",
                transform: "translateX(-50%)", zIndex: 3,
                background: "rgba(10,12,24,0.94)",
                border: `1px solid ${LINK_STYLE.manual.color}`,
                color: "#e8ebff", padding: "8px 12px", borderRadius: 8,
                fontSize: 13, display: "flex", alignItems: "center", gap: 10,
                maxWidth: "92%", boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
              }}>
                <span>
                  💾 Холбоос зөвхөн хадгалсан графт хадгалагдана — эхлээд
                  графаа нэрлээд хадгална уу.
                </span>
                <button className="btn btn-sm"
                  onClick={() => setNeedBoardHint(false)}>Ойлголоо</button>
              </div>
            )}
            {selected && (
              <div className="graph-detail-panel">
                <div className="graph-detail-head">
                  <div>
                    <div className="graph-detail-type">
                      {NODE_TYPE_LABEL[selected.type] ?? selected.type}
                    </div>
                    <div className="graph-detail-title">{selected.label}</div>
                    {selected.sub && (
                      <div className="graph-detail-sub">{selected.sub}</div>
                    )}
                  </div>
                  <button className="graph-detail-close"
                    onClick={() => setSelected(null)}
                    aria-label="Хаах">×</button>
                </div>
                {selected.stats.length > 0 ? (
                  <div className="graph-detail-stats">
                    {selected.stats.map(([label, value]) => (
                      <div key={label} className="graph-detail-row">
                        <span>{label}</span>
                        <span>{value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="graph-detail-sub" style={{marginTop: 8}}>
                    Нэмэлт мэдээлэл алга.
                  </div>
                )}
                {(() => {
                  // Direct connections, evidence first — click one to walk
                  // the network hop by hop.
                  const kindOrder =
                    {manual: 0, txn: 1, call: 2, intel: 3, owns: 4};
                  const rows = network.links
                    .filter((l) =>
                      l.source === selected.id || l.target === selected.id)
                    .map((l) => {
                      const otherId = l.source === selected.id
                        ? l.target : l.source;
                      const other = network.nodes.find(
                        (n) => n.id === otherId);
                      return other ? {link: l, other} : null;
                    })
                    .filter((r): r is {link: NetworkLink; other: NetworkNode} =>
                      r != null)
                    .sort((a, b) =>
                      kindOrder[a.link.kind] - kindOrder[b.link.kind]);
                  if (rows.length === 0) return null;
                  return (
                    <>
                      <div className="graph-detail-links-title">
                        Шууд холбоо · {rows.length}
                      </div>
                      <div className="graph-detail-links">
                        {rows.map(({link, other}, i) => (
                          <button key={`${other.id}|${link.kind}|${i}`}
                            type="button" className="graph-detail-link-row"
                            title="Энэ зангилаа руу очих"
                            onClick={() => focusSearchResult(other)}>
                            <span className="graph-detail-link-dot" style={{
                              background: LINK_STYLE[link.kind].color}} />
                            <span className="graph-detail-link-name">
                              {other.label}
                            </span>
                            <span className="graph-detail-link-meta">
                              {link.label ?? LINK_STYLE[link.kind].label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
                {selected.type === "PERSON" && (() => {
                  const sid = Number(selected.id.slice(2));
                  const hasPhoto = !!selected.photoData;
                  return (
                    <div style={{display: "flex", gap: 6, marginTop: 12}}>
                      <button className="btn btn-sm" style={{flex: 1}}
                        disabled={photoBusy}
                        onClick={() => pickPhoto(sid)}
                        title="Энэ хүний зургийг оноох (зангилаа дээр харагдана)">
                        {photoBusy ? "…"
                          : hasPhoto ? "🖼 Зураг солих" : "📷 Зураг нэмэх"}
                      </button>
                      {hasPhoto && (
                        <button className="btn btn-sm" disabled={photoBusy}
                          onClick={() => clearPhoto(sid)}
                          title="Зургийг устгаж дүрс зураг руу буцаах">
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })()}
                {/* Resize ONLY this node (persisted with the layout). */}
                <div style={{display: "flex", alignItems: "center", gap: 6,
                  marginTop: 8}}>
                  <span style={{fontSize: 12, color: "#9aa0b5", flex: 1}}>
                    Зангилааны хэмжээ
                  </span>
                  <button className="btn btn-sm"
                    title="Энэ зангилааг жижигрүүлэх"
                    onClick={() =>
                      graphRef.current?.setNodeScale(selected.id, 1 / 1.3)}>
                    −
                  </button>
                  <button className="btn btn-sm"
                    title="Хэмжээг анхныд нь буцаах"
                    onClick={() =>
                      graphRef.current?.setNodeScale(selected.id, 0)}>
                    ↺
                  </button>
                  <button className="btn btn-sm"
                    title="Энэ зангилааг томруулах"
                    onClick={() =>
                      graphRef.current?.setNodeScale(selected.id, 1.3)}>
                    ＋
                  </button>
                </div>
                {/* Node body shape — a rectangle shows a full photo un-cropped. */}
                <div style={{display: "flex", alignItems: "center", gap: 6,
                  marginTop: 6}}>
                  <span style={{fontSize: 12, color: "#9aa0b5", flex: 1}}>
                    Хэлбэр
                  </span>
                  <button className="btn btn-sm"
                    title="Дугуй хэлбэр"
                    onClick={() =>
                      graphRef.current?.setNodeShape(selected.id, "circle")}>
                    ⬤ Дугуй
                  </button>
                  <button className="btn btn-sm"
                    title="Тэгш өнцөгт хэлбэр (зураг бүтэн харагдана)"
                    onClick={() =>
                      graphRef.current?.setNodeShape(selected.id, "rect")}>
                    ▢ Дөрвөлжин
                  </button>
                </div>
                {/* Gather ONLY this node's OWN satellites — nodes it owns, or
                    leaves that connect to nothing but it — into a clean radial
                    cluster. Never other hubs/centers, so they stay put. The
                    declutter tool for a node buried in the hairball. */}
                {!focusId && hasGatherable(selected.id) && (
                  <button className="btn btn-sm"
                    style={{width: "100%", marginTop: 8,
                      borderColor: "#00E676", color: "#00E676"}}
                    onClick={() => graphRef.current?.clusterAround(selected.id)}
                    title={"Зөвхөн энэ зангилаанд л холбогдсон (өөр хаана ч"
                      + " холбогдоогүй) зангилаануудыг эргэн тойронд нь"
                      + " бөөгнөрүүлэх — бусад төв зангилаа байрандаа хэвээр"}>
                    ✥ Холбоосыг бөөгнөрүүлэх
                  </button>
                )}
                {focusId !== selected.id && network.links.some((l) =>
                  l.source === selected.id || l.target === selected.id) && (
                  <button className="btn btn-sm"
                    style={{width: "100%", marginTop: 8,
                      borderColor: "#00E5FF", color: "#00E5FF"}}
                    onClick={() => setFocusId(selected.id)}
                    title="Зөвхөн энэ зангилааны холбоосыг дугуй бөөгнөрлөөр харах">
                    ◎ Зөвхөн энэ холбоосыг харах
                  </button>
                )}
                {selected.type === "PERSON" && (
                  <button className="btn btn-sm"
                    style={{width: "100%", marginTop: 8,
                      borderColor: LINK_STYLE.manual.color,
                      color: LINK_STYLE.manual.color}}
                    onClick={() => startConnect(selected)}
                    title="Энэ хүнийг график дээрх өөр хүнтэй гар холбоосоор холбох">
                    🔗 Байгаа хүнтэй холбох
                  </button>
                )}
                {selected.type === "PERSON" && (
                  <button className="btn btn-sm"
                    style={{width: "100%", marginTop: 8,
                      borderColor: LINK_STYLE.manual.color,
                      color: LINK_STYLE.manual.color}}
                    onClick={() => startAddConnect(selected)}
                    title={"Жагсаалтад байхгүй шинэ хүн үүсгэж энэ хүнтэй"
                      + " холбох"}>
                    ➕ Шинэ хүн нэмж холбох
                  </button>
                )}
                <button className="btn btn-danger btn-sm"
                  style={{width: "100%", marginTop: 8}}
                  onClick={() => hideNode(selected.id)}
                  title="Энэ зангилааг зураглалаас хасах">
                  ✕ Энэ зангилааг хасах
                </button>
              </div>
            )}
            {selectedLink && !selected && (() => {
              const l = selectedLink;
              const src = network.nodes.find((n) => n.id === l.source);
              const tgt = network.nodes.find((n) => n.id === l.target);
              const kindLabel = l.kind === "txn" ? "Гүйлгээний холбоос"
                : l.kind === "call" ? "Дуудлагын холбоос"
                : l.kind === "manual" ? "Гар холбоос" : "Хамаарал";
              return (
                <div className="graph-detail-panel">
                  <div className="graph-detail-head">
                    <div>
                      <div className="graph-detail-type">{kindLabel}</div>
                      <div className="graph-detail-title">
                        {src?.label ?? l.source} ↔ {tgt?.label ?? l.target}
                      </div>
                      {(src?.sub || tgt?.sub) && (
                        <div className="graph-detail-sub">
                          {src?.sub ?? "—"} ↔ {tgt?.sub ?? "—"}
                        </div>
                      )}
                    </div>
                    <button className="graph-detail-close"
                      onClick={() => setSelectedLink(null)}
                      aria-label="Хаах">×</button>
                  </div>
                  {l.label && (
                    <div className="graph-detail-stats">
                      <div className="graph-detail-row">
                        <span>Нийт</span>
                        <span>{l.label}</span>
                      </div>
                    </div>
                  )}
                  {l.kind === "manual" && l.linkId != null ? (
                    <div style={{marginTop: 12}}>
                      <div className="form-label">Холбоосын төрөл</div>
                      <input type="text" className="form-input"
                        style={{width: "100%"}}
                        value={linkEdit?.label ?? ""}
                        onChange={(e) => setLinkEdit((p) => ({
                          label: e.target.value,
                          confidence: p?.confidence ?? "HIGH"}))}
                        onKeyDown={(e) => {if (e.key === "Enter") saveLinkEdit();}}
                        placeholder="Холбоосын төрлийг өөрөө бичнэ үү…" />
                      <div className="form-label" style={{marginTop: 8}}>
                        Итгэл
                      </div>
                      <Select value={linkEdit?.confidence ?? "HIGH"}
                        onChange={(v) => setLinkEdit((p) => ({
                          label: p?.label ?? "", confidence: v}))}
                        style={{width: "100%"}}
                        options={[
                          {value: "HIGH", label: "Өндөр"},
                          {value: "MEDIUM", label: "Дунд"},
                          {value: "LOW", label: "Бага"},
                        ]} />
                      <div style={{display: "flex", gap: 8, marginTop: 12}}>
                        <button className="btn btn-primary btn-sm"
                          style={{flex: 1}} onClick={saveLinkEdit}
                          disabled={linkBusy}
                          title="Өөрчлөлтийг хадгалах">
                          {linkBusy ? "…" : "✔ Хадгалах"}
                        </button>
                        {cutArmed ? (
                          <div style={{flex: 1, display: "flex", gap: 6}}>
                            <button className="btn btn-danger btn-sm"
                              style={{flex: 1}}
                              onClick={() => removeConn(l.linkId!)}
                              title="Тийм, таслах">Тийм</button>
                            <button className="btn btn-sm" style={{flex: 1}}
                              onClick={() => setCutArmed(false)}>Үгүй</button>
                          </div>
                        ) : (
                          <button className="btn btn-danger btn-sm"
                            style={{flex: 1}}
                            onClick={() => setCutArmed(true)}
                            title="Энэ гар холбоосыг таслах">
                            ✕ Таслах
                          </button>
                        )}
                      </div>
                    </div>
                  ) : l.kind === "txn" ? (
                    <button className="btn btn-danger btn-sm"
                      style={{width: "100%", marginTop: 12}}
                      onClick={() => removeTxnEdge(l)}
                      title={"Энэ хоёр дансны хоорондох бүх гүйлгээг хэрэггүй "
                        + "гэж хасах — Сэргээх хуудаснаас буцаана"}>
                      ✕ Энэ холбоосыг хасах
                    </button>
                  ) : (
                    <div className="graph-detail-sub" style={{marginTop: 10}}>
                      Зөвхөн гүйлгээ болон гар холбоосыг засах/хасах боломжтой.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <Empty message={totalEvidence > 0 && hiddenKinds.size > 0
            ? "Бүх холбоос нуугдсан — дээрх шүүлтүүрээс төрөл асаана уу"
            : "Сүлжээ алга — сэжигтэн, гүйлгээ, дуудлага импортлогдоогүй байна"} />
        )}
      </Card>

      <Card title={`Холбоосын жагсаалт (${shownLinks.length})`}
        style={{marginBottom: 16}} noPadding>
        <div>
          <DataTable
            rows={shownLinks}
            rowKey={(l) => l.id}
            pageSize={25}
            empty="Холбоос алга — 'ХОЛБООС ҮҮСГЭХ' дарна уу"
            columns={[
              {header: "Эх сурвалж", render: (l) => nameById.get(l.sourceSuspectId) ?? l.sourceSuspectId},
              {header: "Зорилго", render: (l) => nameById.get(l.targetSuspectId) ?? l.targetSuspectId},
              {header: "Төрөл", render: (l) => (
                <span className="badge info">{l.linkType}</span>
              )},
              {header: "Хүч", align: "right", render: (l) => l.strength},
              {header: "Итгэл", render: (l) => l.confidenceLevel},
              {header: "Тайлбар", render: (l) => l.description ?? "—"},
            ]}
          />
        </div>
      </Card>

      <Card title="Мөнгөн урсгал" style={{marginTop: 16}}>
        {flowQ.data && flowQ.data.networkFlow.nodeLabels.length > 0 ? (
          <SankeyChart
            labels={flowQ.data.networkFlow.nodeLabels}
            source={flowQ.data.networkFlow.sourceIndices}
            target={flowQ.data.networkFlow.targetIndices}
            value={flowQ.data.networkFlow.values}
            nodeColors={flowQ.data.networkFlow.nodeColors}
            linkColors={flowQ.data.networkFlow.linkColors}
          />
        ) : (
          <Empty message="Мөнгөн урсгал илрээгүй" />
        )}
      </Card>

      </CaseGate>

      {/* Add a person not yet in the case, then wire them to the source node. */}
      <PersonFormModal
        open={addConnectFrom != null}
        onClose={() => setAddConnectFrom(null)}
        onSaved={onNewPersonConnected}
      />
    </div>
  );
}
