import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Maximize2, CornerDownLeft, Loader2, RefreshCw, X, Check, Rows3, PanelBottomClose, Dices, MessageCircle, Cpu, ChevronDown, Megaphone, Users, Forward, ArrowDownToLine } from "lucide-react";
import type { LayoutNode, PaneNode } from "../../hooks/useClaudeSessions";
import { forEachPane } from "../../hooks/useClaudeSessions";
import { useDeckStore } from "../../state/deckStore";
import { useTerminalBusy } from "../../hooks/useTerminalBusy";
import { getLastRun } from "../../state/terminalActivity";
import { usePaneReportStore } from "../../state/paneReports";
import { useAttentionStore } from "../../state/attentionStore";
import { usePersonaModel } from "../../hooks/usePersonaModel";
import { usePersonas } from "../../hooks/usePersonas";
import {
  INJECT_PANE_EVENT,
  FOCUS_PANE_EVENT,
  type InjectPaneDetail,
} from "../../state/delegationMonitor";
import Tooltip from "../../components/Tooltip";
import { ATTENTION_INBOX_EVENT } from "../Cockpit/AttentionInbox";
import ClaudeMascot from "../Persona/ClaudeMascot";
import CodexMascot from "../Persona/CodexMascot";
import GrokMascot from "../Persona/GrokMascot";
import KimiMascot from "../Persona/KimiMascot";
import CostumedGrokMascot, { type GrokCostume } from "../Persona/CostumedGrokMascot";
import {
  MASCOT_SENTINEL,
  costumeOf,
  costumeIndexOf,
  isPlainMascotAvatar,
  isImageAvatar,
} from "../Persona/PersonaAvatar";
import { usePaletteStore } from "../../state/paletteStore";
import { cssVarsForPalette } from "../../state/uiPalette";
import {
  PANEL_PALETTES,
  PANEL_PALETTE_ORDER,
  resolveAccentColor,
  type PanelPaletteName,
  type AccentName,
} from "../../state/panelPalettes";

interface Props {
  open: boolean;
  layout: LayoutNode;
  /** Session-level persona; a pane may override it. */
  sessionProfileId: string;
  onClose: () => void;
  onSetAutoLabel: (paneId: string, label: string) => void;
  /** Persist a pane's theme override (used by the shuffle-themes action). */
  onSetPanePalette: (paneId: string, palette?: string, accent?: string) => void;
}

type PaneStatus = "waiting" | "running" | "idle";

/** Send text to a pane and submit it (CR), via the same window-event channel the
 *  delegation router uses. */
function sendToPane(paneId: string, text: string) {
  const detail: InjectPaneDetail = { paneId, text };
  window.dispatchEvent(new CustomEvent(INJECT_PANE_EVENT, { detail }));
}

/** Fill a pane's input box WITHOUT submitting — the user reviews/edits the pulled
 *  context before sending. Same channel as `sendToPane`, `submit: false`. */
function fillPane(paneId: string, text: string) {
  const detail: InjectPaneDetail = { paneId, text, submit: false };
  window.dispatchEvent(new CustomEvent(INJECT_PANE_EVENT, { detail }));
}

function focusPaneExternal(paneId: string) {
  window.dispatchEvent(new CustomEvent(FOCUS_PANE_EVENT, { detail: { paneId } }));
}

/** Handle a paste that carries an image: save each pasted image to a temp file
 *  and inject its path (space-suffixed) into every target pane, the same way the
 *  screenshot tool hands a captured image to a CLI. A plain input can't hold an
 *  image, so without this a pasted screenshot would be silently dropped. Returns
 *  true if it consumed an image (so the caller suppresses the default paste). */
async function handleImagePaste(
  e: React.ClipboardEvent,
  targets: string[],
): Promise<boolean> {
  const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
  if (files.length === 0) return false;
  e.preventDefault();
  if (targets.length === 0) return true;
  for (const file of files) {
    try {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
      const ext = file.type.split("/")[1] || "png";
      const path = await invoke<string>("save_pasted_image", { bytes, ext });
      for (const id of targets) fillPane(id, `${path} `);
    } catch (err) {
      console.warn("paste image failed", err);
    }
  }
  return true;
}

/** Distill a permission prompt onto the sprite's hand-held sign — the tool
 *  being authorized ("Bash?"), or a generic go-ahead. */
function signTextFor(msg: string | null): string {
  const m =
    msg?.match(/\b(?:use|run|execute)\s+([A-Za-z][\w-]{1,14})/i) ??
    msg?.match(/\b(Bash|Edit|Write|Read|Fetch|Search|MCP|Task|Grep|Glob|Notebook)\b/);
  return m ? `${m[1]}?` : "OK?";
}

/** A pane's display label, everywhere the deck speaks about it. */
function paneLabel(p: PaneNode): string {
  return p.title ?? p.autoLabel ?? p.cli;
}

/** Resolve a provider id to summarize with: an explicit override (the deck's
 *  model picker) when still usable, else the persona's base_model when usable,
 *  else the first usable provider on file. Mirrors usePaneLabel. */
async function resolveProviderId(
  getDoc: (id: string) => Promise<{ base_model?: string | null } | null>,
  profileId: string,
  override?: string | null,
): Promise<string | null> {
  let usable: { id: string }[] = [];
  try {
    usable = await invoke<{ id: string }[]>("ai_commit_providers");
  } catch {
    return null;
  }
  if (usable.length === 0) return null;
  if (override && usable.some((p) => p.id === override)) return override;
  try {
    const doc = await getDoc(profileId);
    const base = doc?.base_model;
    if (base && usable.some((p) => p.id === base)) return base;
  } catch {
    /* fall through */
  }
  return usable[0].id;
}

/** Session Deck — a task-card overview of the current session's panes. Each card
 *  shows a live status light, persona, task label, model/cwd, a one-line output
 *  preview, and a reply box that injects into that terminal. A broadcast bar at
 *  top sends one message to all (or a checked subset of) panes. Hovering a card
 *  spotlights the matching pane; clicking jumps to it. */
export default function SessionDeck({
  open,
  layout,
  sessionProfileId,
  onClose,
  onSetAutoLabel,
  onSetPanePalette,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const setHovered = useDeckStore((s) => s.setHovered);
  const docked = useDeckStore((s) => s.docked);
  const toggleDocked = useDeckStore((s) => s.toggleDocked);
  const dockedHeight = useDeckStore((s) => s.dockedHeight);
  const setDockedHeight = useDeckStore((s) => s.setDockedHeight);

  // Drag the top border to resize the docked band. Height lives in the
  // (persisted) deck store; we listen on the window so the drag keeps tracking
  // outside the handle. Dragging up (negative dy) grows the band.
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockedHeight;
    const onMove = (ev: PointerEvent) => setDockedHeight(startH - (ev.clientY - startY));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("resizing-row");
    };
    document.body.classList.add("resizing-row");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const { busyPanes } = useTerminalBusy();
  const attention = useAttentionStore((s) => s.queue);
  const { get: getPersona, personas } = usePersonas();

  // Model picker — which provider the sprites summarize with (speech bubble +
  // hover status). "Auto" follows each pane persona's base model; an explicit
  // pick overrides it for the whole deck and persists across restarts.
  const reportProviderId = useDeckStore((s) => s.reportProviderId);
  const setReportProvider = useDeckStore((s) => s.setReportProvider);
  const [providers, setProviders] = useState<{ id: string; label: string; model: string }[]>([]);
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void invoke<{ id: string; label: string; model: string }[]>("ai_commit_providers")
      .then((list) => { if (alive) setProviders(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);
  useEffect(() => {
    if (!modelOpen) return;
    const onClick = (e: MouseEvent) => {
      if (modelRef.current?.contains(e.target as Node)) return;
      setModelOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [modelOpen]);
  const reportProvider = providers.find((p) => p.id === reportProviderId) ?? null;

  // Panes of the current session, in layout order.
  const panes = useMemo(() => {
    const out: PaneNode[] = [];
    forEachPane(layout, (p) => out.push(p));
    return out.filter((p) => p.cli); // skip unbound (empty) panes
  }, [layout]);

  // persona id → avatar string (reacts when the library is edited).
  const avatarByProfile = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of personas) m.set(p.id, p.avatar ?? "");
    return m;
  }, [personas]);

  // The deck's cast — paneId → character costume. Personas with an explicit
  // costume avatar pin that wardrobe slot; remaining panes fill free slots.
  const costumes = useMemo(
    () => castCostumes(panes, sessionProfileId, avatarByProfile),
    [panes, sessionProfileId, avatarByProfile],
  );

  // paneId → status. Attention (waiting on user) outranks running outranks idle.
  const waitingPaneIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of attention) s.add(a.id.split(":")[0]); // id = "<paneId>:<convId>"
    return s;
  }, [attention]);

  const statusOf = useCallback(
    (p: PaneNode): PaneStatus =>
      waitingPaneIds.has(p.paneId) ? "waiting" : busyPanes.has(p.paneId) ? "running" : "idle",
    [waitingPaneIds, busyPanes],
  );

  const counts = useMemo(() => {
    let running = 0;
    let waiting = 0;
    for (const p of panes) {
      const s = statusOf(p);
      if (s === "running") running++;
      else if (s === "waiting") waiting++;
    }
    return { running, waiting };
  }, [panes, statusOf]);

  // Broadcast target selection: explicit checks win; otherwise the quick mode
  // ("all", or "idle" to avoid interrupting running agents).
  const [checked, setChecked] = useState<Set<string> | null>(null);
  const [targetMode, setTargetMode] = useState<"all" | "idle">("all");
  const [broadcast, setBroadcast] = useState("");
  const targets =
    checked ??
    new Set(
      panes
        .filter((p) => targetMode === "all" || statusOf(p) === "idle")
        .map((p) => p.paneId),
    );
  const sendBroadcast = () => {
    const text = broadcast.trim();
    if (!text) return;
    for (const id of targets) sendToPane(id, text);
    setBroadcast("");
  };

  // Shuffle: give every pane still on the global scheme its own random theme
  // (distinct from the global and from every already-themed sibling). Panes the
  // user themed explicitly are left untouched.
  const shuffleThemes = () => {
    const globalName = usePaletteStore.getState().name;
    const dark = PANEL_PALETTE_ORDER.filter(
      (n) => !PANEL_PALETTES[n].light && n !== globalName,
    );
    const used = new Set(panes.map((p) => p.palette).filter(Boolean) as string[]);
    for (const p of panes) {
      if (p.palette) continue;
      const free = dark.filter((n) => !used.has(n));
      const pool = free.length > 0 ? free : dark;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      used.add(pick);
      onSetPanePalette(p.paneId, pick, "auto");
    }
  };

  // Relabel-all: regenerate every pane's AI task label with the current prompt.
  const [relabeling, setRelabeling] = useState(false);
  const relabelAll = useCallback(async () => {
    setRelabeling(true);
    try {
      for (const p of panes) {
        const profileId = p.profileId ?? sessionProfileId;
        try {
          const transcript = await invoke<string>("terminal_tail", {
            id: `${p.paneId}:${p.convId}`,
          });
          if (transcript.trim().length < 40) continue;
          const providerId = await resolveProviderId(getPersona, profileId);
          if (!providerId) break; // no provider → nothing to do
          const label = await invoke<string>("ai_summarize_terminal", { providerId, transcript });
          if (label.trim()) onSetAutoLabel(p.paneId, label);
        } catch {
          /* skip this pane, keep going */
        }
      }
    } finally {
      setRelabeling(false);
    }
  }, [panes, sessionProfileId, getPersona, onSetAutoLabel]);

  // Resolve a provider id to its display model name (for the bubble's
  // attribution chip) from the already-fetched provider list.
  const modelNameOf = useCallback(
    (providerId: string | null): string | undefined => {
      if (!providerId) return undefined;
      const p = providers.find((x) => x.id === providerId);
      return p ? p.model || p.label || p.id : providerId;
    },
    [providers],
  );

  // ── Standup — the sprites report in turn, scrum style. ──
  // Walks the cast in layout order: spotlight the card, write (or reuse) its
  // report, dwell a beat, move on. Clicking the button again stops the round.
  const [standupPane, setStandupPane] = useState<string | null>(null);
  const [standupIdx, setStandupIdx] = useState(0);
  const standupCancel = useRef(false);
  const standupRunning = standupPane !== null;

  const standupReport = useCallback(
    async (p: PaneNode) => {
      const store = usePaneReportStore.getState();
      const key = getLastRun(p.paneId)?.endedAt ?? performance.now();
      const existing = store.reports[p.paneId];
      if (existing && !existing.stale && existing.forEndedAt >= key) {
        // Already spoken for this run — just make sure the bubble shows.
        if (existing.dismissed) store.reopen(p.paneId);
        return;
      }
      store.begin(p.paneId, key);
      let text: string | null = null;
      let usedProviderId: string | null = null;
      try {
        text = await Promise.race([
          (async () => {
            const transcript = await invoke<string>("terminal_tail", { id: `${p.paneId}:${p.convId}` });
            if (transcript.trim().length < 40) return null;
            const providerId = await resolveProviderId(
              getPersona,
              p.profileId ?? sessionProfileId,
              useDeckStore.getState().reportProviderId,
            );
            if (!providerId) return null;
            usedProviderId = providerId;
            const raw = await invoke<string>("ai_pane_report", { providerId, transcript });
            return raw.trim() ? raw : null;
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("standup report timed out")), REPORT_TIMEOUT_MS),
          ),
        ]);
      } catch {
        /* this sprite passes its turn */
      }
      usePaneReportStore.getState().finish(p.paneId, key, text, modelNameOf(usedProviderId));
    },
    [getPersona, sessionProfileId, modelNameOf],
  );

  const runStandup = useCallback(async () => {
    if (standupRunning) {
      standupCancel.current = true;
      return;
    }
    standupCancel.current = false;
    for (let i = 0; i < panes.length; i++) {
      if (standupCancel.current) break;
      setStandupIdx(i);
      setStandupPane(panes[i].paneId);
      await standupReport(panes[i]);
      if (standupCancel.current) break;
      // Dwell so each report gets its moment before the next sprite speaks.
      await new Promise((r) => setTimeout(r, 1200));
    }
    setStandupPane(null);
  }, [standupRunning, panes, standupReport]);

  // ── Relay + courier — hand one terminal's report to another. ──
  // The courier sprite physically runs the envelope from the source card to the
  // target card (pure decoration; the message itself is sent immediately).
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const courierRef = useRef<HTMLDivElement | null>(null);
  const [courier, setCourier] = useState<{
    key: number;
    cli: string;
    toId: string;
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);

  const fireCourier = useCallback(
    (fromId: string, toId: string) => {
      const box = cardsRef.current;
      if (!box) return;
      const from = box.querySelector<HTMLElement>(`[data-deck-pane="${CSS.escape(fromId)}"] .deck-sprite`);
      const to = box.querySelector<HTMLElement>(`[data-deck-pane="${CSS.escape(toId)}"] .deck-sprite`);
      if (!from || !to) return;
      const b = box.getBoundingClientRect();
      const f = from.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      setCourier({
        key: performance.now(),
        cli: panes.find((p) => p.paneId === fromId)?.cli ?? "",
        toId,
        x: f.left - b.left + box.scrollLeft,
        y: f.top - b.top + box.scrollTop,
        dx: t.left - f.left,
        dy: t.top - f.top,
      });
    },
    [panes],
  );

  // Fly the courier (WAAPI so the path is computed per delivery); on arrival the
  // envelope pops and the receiving card gives a little bounce.
  useEffect(() => {
    if (!courier) return;
    const el = courierRef.current;
    if (!el) {
      setCourier(null);
      return;
    }
    const anim = el.animate(
      [
        { transform: "translate(0px, 0px) scale(0.5)", opacity: 0 },
        { transform: "translate(0px, 0px) scale(1)", opacity: 1, offset: 0.12 },
        { transform: `translate(${courier.dx}px, ${courier.dy}px) scale(1)`, opacity: 1, offset: 0.88 },
        { transform: `translate(${courier.dx}px, ${courier.dy}px) scale(0.5)`, opacity: 0 },
      ],
      { duration: 1100, easing: "cubic-bezier(0.45, 0.05, 0.55, 0.95)" },
    );
    anim.onfinish = () => {
      const target = cardsRef.current?.querySelector<HTMLElement>(
        `[data-deck-pane="${CSS.escape(courier.toId)}"]`,
      );
      if (target) {
        target.classList.add("deck-drop-bounce");
        window.setTimeout(() => target.classList.remove("deck-drop-bounce"), 700);
      }
      setCourier(null);
    };
    return () => anim.cancel();
  }, [courier]);

  const relay = useCallback(
    async (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const from = panes.find((p) => p.paneId === fromId);
      if (!from) return;
      fireCourier(fromId, toId);
      // Prefer the report already on file; otherwise write one for the handoff.
      let text = usePaneReportStore.getState().reports[fromId]?.text ?? null;
      if (!text) {
        try {
          const transcript = await invoke<string>("terminal_tail", { id: `${fromId}:${from.convId}` });
          if (transcript.trim().length >= 40) {
            const providerId = await resolveProviderId(
              getPersona,
              from.profileId ?? sessionProfileId,
              useDeckStore.getState().reportProviderId,
            );
            if (providerId) {
              const raw = await invoke<string>("ai_pane_report", { providerId, transcript });
              if (raw.trim()) text = raw.trim();
            }
          }
        } catch {
          /* fall through to the generic handoff line */
        }
      }
      sendToPane(
        toId,
        text
          ? `Handoff from the "${paneLabel(from)}" terminal: ${text}`
          : `Handoff from the "${paneLabel(from)}" terminal — it has an update for you.`,
      );
    },
    [panes, fireCourier, getPersona, sessionProfileId],
  );

  // Pull a sibling terminal's context INTO this one — the richer cousin of
  // relay. Where relay forwards a one-line quest report, this summarizes the
  // source's recent transcript into a factual handoff brief (ai_pane_context)
  // and FILLS the target's input box without submitting, so the user can edit
  // before sending. `fromId` = source (whose history we pull), `toId` = the
  // pane that receives the context.
  const pullContext = useCallback(
    async (fromId: string, toId: string) => {
      if (fromId === toId) return;
      const from = panes.find((p) => p.paneId === fromId);
      if (!from) return;
      fireCourier(fromId, toId);
      let brief: string | null = null;
      try {
        const transcript = await invoke<string>("terminal_tail", { id: `${fromId}:${from.convId}` });
        if (transcript.trim().length >= 40) {
          const providerId = await resolveProviderId(
            getPersona,
            from.profileId ?? sessionProfileId,
            useDeckStore.getState().reportProviderId,
          );
          if (providerId) {
            const raw = await invoke<string>("ai_pane_context", { providerId, transcript });
            if (raw.trim()) brief = raw.trim();
          }
        }
      } catch {
        /* fall through to the on-file report, then a generic line */
      }
      // Fall back to any report already on file if the summary couldn't be made.
      if (!brief) brief = usePaneReportStore.getState().reports[fromId]?.text ?? null;
      const label = paneLabel(from);
      fillPane(
        toId,
        brief
          ? `Context from the "${label}" terminal:\n${brief}\n\nUse this as background for the current task.`
          : `Context from the "${label}" terminal — check what it has been working on before continuing.`,
      );
    },
    [panes, fireCourier, getPersona, sessionProfileId],
  );

  const CourierMascot = courier ? SPRITE_MASCOTS[courier.cli] : null;

  // Dismiss on outside-click (ignoring the toolbar toggle) and Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if ((e.target as Element).closest('[data-panel-toggle="deck"]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Docked mode is part of the layout, not a transient popover — it stays put
    // on outside clicks / Escape; only the mini floating panel auto-dismisses.
    if (!docked) window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, docked, onClose]);

  // Clear any lingering spotlight when the deck closes.
  useEffect(() => {
    if (!open) setHovered(null);
  }, [open, setHovered]);

  return (
    <div
      ref={panelRef}
      className={`session-deck${docked ? " docked" : ""}`}
      style={{
        display: open ? "flex" : "none",
        ...(docked ? { height: dockedHeight } : {}),
      }}
      role="dialog"
      aria-label="Session deck"
    >
      {docked && (
        <div
          className="deck-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize deck"
          onPointerDown={startResize}
          onDoubleClick={() => setDockedHeight(300)}
          title="Drag to resize · double-click to reset"
        />
      )}
      <header className="deck-header">
        <span className="deck-title">Session Deck</span>
        <span className="deck-counts">
          {counts.waiting > 0 && (
            <button
              type="button"
              className="deck-badge waiting clickable"
              onClick={() => window.dispatchEvent(new CustomEvent(ATTENTION_INBOX_EVENT))}
              title="Open the attention inbox (⌘⇧A)"
            >
              {counts.waiting} waiting
            </button>
          )}
          {counts.running > 0 && <span className="deck-badge running">{counts.running} running</span>}
          <span className="deck-badge">{panes.length} panes</span>
        </span>
        <span className="deck-spacer" />
        <div className="deck-model" ref={modelRef}>
          <Tooltip label="Model the sprites report with">
            <button
              type="button"
              className={`deck-model-btn${modelOpen ? " open" : ""}`}
              onClick={() => setModelOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={modelOpen}
            >
              <Cpu size={12} />
              <span className="deck-model-current">{reportProvider?.label ?? "Auto"}</span>
              <ChevronDown size={11} />
            </button>
          </Tooltip>
          {modelOpen && (
            <div className="deck-model-menu" role="menu">
              <button
                type="button"
                className={`deck-model-item${reportProvider ? "" : " current"}`}
                onClick={() => { setReportProvider(null); setModelOpen(false); }}
              >
                <Check size={12} strokeWidth={2.2} className="deck-model-tick" />
                <span className="deck-model-label">Auto</span>
                <span className="deck-model-name">persona base model</span>
              </button>
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`deck-model-item${p.id === reportProvider?.id ? " current" : ""}`}
                  onClick={() => { setReportProvider(p.id); setModelOpen(false); }}
                >
                  <Check size={12} strokeWidth={2.2} className="deck-model-tick" />
                  <span className="deck-model-label">{p.label}</span>
                  <span className="deck-model-name">{p.model}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Tooltip label={standupRunning ? "Stop the standup" : "Standup — each sprite reports in turn"}>
          <button
            type="button"
            className={`deck-relabel deck-standup${standupRunning ? " on" : ""}`}
            onClick={() => void runStandup()}
            disabled={panes.length === 0}
          >
            {standupRunning ? <Loader2 size={12} className="deck-spin" /> : <Users size={12} />}
            <span>{standupRunning ? `${standupIdx + 1}/${panes.length}` : "Standup"}</span>
          </button>
        </Tooltip>
        <Tooltip label="Give terminals still on the global theme a random one">
          <button
            type="button"
            className="deck-icon-btn deck-shuffle"
            onClick={shuffleThemes}
            aria-label="Shuffle themes"
          >
            <Dices size={14} />
          </button>
        </Tooltip>
        <Tooltip label="Regenerate every task label">
          <button
            type="button"
            className="deck-relabel"
            onClick={relabelAll}
            disabled={relabeling}
          >
            {relabeling ? <Loader2 size={12} className="deck-spin" /> : <RefreshCw size={12} />}
            <span>Relabel all</span>
          </button>
        </Tooltip>
        <Tooltip label={docked ? "Collapse to mini panel" : "Dock across all terminals"}>
          <button
            type="button"
            className={`deck-icon-btn deck-dock${docked ? " on" : ""}`}
            onClick={toggleDocked}
            aria-label={docked ? "Collapse deck" : "Dock deck"}
            aria-pressed={docked}
          >
            {docked ? <PanelBottomClose size={14} /> : <Rows3 size={14} />}
          </button>
        </Tooltip>
        <button type="button" className="deck-close" onClick={onClose} aria-label="Close deck">
          <X size={14} />
        </button>
      </header>

      {/* Broadcast bar — send one message to the checked subset, or to the
          quick-target mode (all terminals / only idle ones). */}
      <div className="deck-broadcast">
        {!checked && (
          <div className="deck-target-chips" role="radiogroup" aria-label="Broadcast targets">
            <button
              type="button"
              className={`deck-target-chip${targetMode === "all" ? " on" : ""}`}
              onClick={() => setTargetMode("all")}
            >
              All
            </button>
            <Tooltip label="Only idle terminals — don't interrupt running agents">
              <button
                type="button"
                className={`deck-target-chip${targetMode === "idle" ? " on" : ""}`}
                onClick={() => setTargetMode("idle")}
              >
                Idle
              </button>
            </Tooltip>
          </div>
        )}
        <input
          className="deck-broadcast-input"
          placeholder={
            checked
              ? `Message ${targets.size} selected…`
              : targetMode === "idle"
                ? `Message ${targets.size} idle terminal${targets.size === 1 ? "" : "s"}…`
                : `Message all ${panes.length} terminals…`
          }
          value={broadcast}
          onChange={(e) => setBroadcast(e.target.value)}
          onPaste={(e) => void handleImagePaste(e, [...targets])}
          onKeyDown={(e) => {
            // Ignore Enter while an IME is composing — that Enter picks a
            // candidate, it must not submit the message.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendBroadcast();
            }
          }}
        />
        <Tooltip label="Send to targets (Enter)">
          <button
            type="button"
            className="deck-broadcast-send"
            onClick={sendBroadcast}
            disabled={!broadcast.trim() || targets.size === 0}
            aria-label="Broadcast"
          >
            <CornerDownLeft size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="deck-cards" ref={cardsRef}>
        {/* The relay courier — an envelope-carrying sprite crossing the deck. */}
        {courier && (
          <div
            key={courier.key}
            ref={courierRef}
            className="deck-courier"
            style={{ left: courier.x, top: courier.y }}
            aria-hidden="true"
          >
            <div className="deck-courier-body">
              {CourierMascot ? <CourierMascot className="deck-courier-svg" /> : <span className="deck-courier-blob" />}
              <span className="deck-courier-mail">✉</span>
            </div>
          </div>
        )}
        {/* Layout order — cards map one-to-one onto the terminals' on-screen order. */}
        {panes.map((p) => (
          <DeckCard
            key={p.paneId}
            pane={p}
            costume={costumes.get(p.paneId) ?? 0}
            avatar={avatarByProfile.get(p.profileId ?? sessionProfileId) ?? ""}
            status={statusOf(p)}
            sessionProfileId={sessionProfileId}
            checked={checked?.has(p.paneId) ?? false}
            standupTurn={standupPane === p.paneId}
            others={panes.filter((o) => o.paneId !== p.paneId).map((o) => ({ paneId: o.paneId, label: paneLabel(o) }))}
            onRelay={(toId) => void relay(p.paneId, toId)}
            onDropRelay={(fromId) => void relay(fromId, p.paneId)}
            onPullContext={(fromId) => void pullContext(fromId, p.paneId)}
            onToggleCheck={() =>
              setChecked((prev) => {
                const next = new Set(prev ?? []);
                if (next.has(p.paneId)) next.delete(p.paneId);
                else next.add(p.paneId);
                return next.size === 0 ? null : next;
              })
            }
            onHover={(hover) => setHovered(hover ? p.paneId : null)}
            onJump={() => { focusPaneExternal(p.paneId); onClose(); }}
            onZoom={() => { focusPaneExternal(p.paneId); onClose(); }}
            onSetAutoLabel={(label) => onSetAutoLabel(p.paneId, label)}
            getPersona={getPersona}
          />
        ))}
      </div>
    </div>
  );
}

/** How long a fetched hover status stays fresh before another hover re-asks. */
const TIP_TTL_MS = 30_000;
/** Hovering must dwell this long before the AI status fetch fires, so sweeping
 *  the mouse across the deck doesn't fire a model call per card. */
const TIP_INTENT_MS = 300;
/** A run must last at least this long before its end earns a spoken report —
 *  filters out tiny output blips that aren't a "task finishing". (Ledger runMs
 *  includes the 4s quiet tail that marks the run over, so this is ~4s of real
 *  output.) */
const MIN_RUN_FOR_REPORT_MS = 8000;
/** Hard ceiling on a report generation. If `terminal_tail`/`ai_pane_report`
 *  never settles (a wedged provider or backend call), the "writing report…"
 *  bubble would otherwise hang forever and block every retry. After this we give
 *  up, clear the writing state, and let the run be reported again later. */
const REPORT_TIMEOUT_MS = 45000;
/** A run at least this long earns confetti when it lands — an accomplishment,
 *  not a quick errand. */
const CELEBRATE_MIN_RUN_MS = 120_000;
/** DataTransfer type for dragging a sprite onto another card (a relay). */
const RELAY_DRAG_TYPE = "application/x-cocodes-pane";

/** CLI → built-in mascot face. A claude pane's sprite IS the Claude Code mascot
 *  (the same avatar as the pane header), and likewise for the other CLIs; only
 *  unknown CLIs (e.g. shell) fall back to the drawn blob. */
const SPRITE_MASCOTS: Record<string, React.ComponentType<{ className?: string }>> = {
  claude: ClaudeMascot,
  codex: CodexMascot,
  grok: GrokMascot,
  kimi: KimiMascot,
};

/** Stable per-pane hash so each sprite gets its own look and rhythm. */
function spriteHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

/** Costume count — indices into the mascot wardrobe (see COSTUME_PROPS and the
 *  m-* CSS): 0–7 archetypes (cowboy, wizard, athlete, scholar, hero, imp,
 *  robot, laureate), 8–15 coding scenes (detective, builder, astronaut,
 *  scientist, firefighter, artist, surgeon, conductor), 16–23 practical roles
 *  (writer, teacher, anchor, editor, explorer, analyst, pilot, chef). */
const COSTUME_COUNT = 24;

/** The wardrobe — each costume is layered around the unchanged mascot. */
const COSTUME_PROPS: Record<number, React.ReactNode> = {
  0: <span className="m-hat-cowboy" aria-hidden="true" />,
  1: <span className="m-hat-wizard" aria-hidden="true" />,
  2: <span className="m-band" aria-hidden="true" />,
  3: <span className="m-specs" aria-hidden="true" />,
  4: <span className="m-cape" aria-hidden="true" />,
  5: (
    <>
      <span className="m-horn l" aria-hidden="true" />
      <span className="m-horn r" aria-hidden="true" />
    </>
  ),
  6: <span className="m-antenna" aria-hidden="true" />,
  7: <span className="m-laurel" aria-hidden="true" />,
  8: (
    <>
      <span className="m-hat-sleuth" aria-hidden="true" />
      <span className="m-monocle" aria-hidden="true" />
    </>
  ),
  9: <span className="m-hat-hard" aria-hidden="true" />,
  10: <span className="m-helmet" aria-hidden="true" />,
  11: <span className="m-goggles" aria-hidden="true" />,
  12: <span className="m-hat-fire" aria-hidden="true" />,
  13: <span className="m-beret" aria-hidden="true" />,
  14: (
    <>
      <span className="m-hat-scrub" aria-hidden="true" />
      <span className="m-mirror" aria-hidden="true" />
    </>
  ),
  15: (
    <>
      <span className="m-bowtie" aria-hidden="true" />
      <span className="m-baton" aria-hidden="true" />
    </>
  ),
  16: <span className="m-quill" aria-hidden="true" />,
  17: <span className="m-mortar" aria-hidden="true" />,
  18: (
    <>
      <span className="m-headset" aria-hidden="true" />
      <span className="m-tie" aria-hidden="true" />
    </>
  ),
  19: <span className="m-phones" aria-hidden="true" />,
  20: <span className="m-pith" aria-hidden="true" />,
  21: <span className="m-visor" aria-hidden="true" />,
  22: <span className="m-hat-pilot" aria-hidden="true" />,
  23: <span className="m-toque" aria-hidden="true" />,
};

/** What each character's eyes do while it works (see the m-eyes moods). Keys
 *  absent → the mascot keeps its own eyes. */
const RUN_EYES: Record<number, string> = {
  1: "up", // wizard channels upward
  13: "up", // artist studies the canvas
  2: "grit", // athlete strains
  5: "grit", // imp grinds
  9: "grit", // builder hammers
  12: "grit", // firefighter charges
  3: "down", // scholar reads
  14: "down", // surgeon watches the table
  16: "down", // writer watches the page
  19: "down", // editor watches the timeline
  21: "down", // analyst watches the figures
  8: "magnify", // detective peers through the monocle
  20: "scan", // explorer sweeps the horizon
  15: "drowsy", // conductor, lost in the music
};

/** Characters that break a sweat while working. */
const RUN_SWEAT = new Set([2, 5, 12]);

/** The badge each character emits while working (rendered at the sprite root).
 *  Scholar's thought dots and the sweat drop are handled separately. */
const RUN_BADGES: Record<number, React.ReactNode> = {
  1: <span className="sprite-spell" aria-hidden="true"><i>✦</i><i>✦</i></span>,
  8: <span className="sprite-clues" aria-hidden="true"><i /><i /></span>,
  9: <span className="sprite-sparks" aria-hidden="true"><i>✧</i><i>✧</i></span>,
  10: <span className="sprite-thrust" aria-hidden="true" />,
  11: <span className="sprite-bubbles" aria-hidden="true"><i /><i /></span>,
  12: <span className="sprite-flame" aria-hidden="true" />,
  13: <span className="sprite-paint" aria-hidden="true"><i /><i /><i /></span>,
  14: <span className="sprite-med" aria-hidden="true" />,
  15: <span className="sprite-notes" aria-hidden="true"><i>♪</i><i>♩</i></span>,
  16: <span className="sprite-ink" aria-hidden="true"><i /><i /></span>,
  17: <span className="sprite-chalk" aria-hidden="true"><i /><i /><i /></span>,
  18: <span className="sprite-live" aria-hidden="true"><i />LIVE</span>,
  19: <span className="sprite-play" aria-hidden="true" />,
  20: <span className="sprite-search" aria-hidden="true" />,
  21: <span className="sprite-bars" aria-hidden="true"><i /><i /><i /></span>,
  22: <span className="sprite-beacon" aria-hidden="true" />,
  23: <span className="sprite-steam" aria-hidden="true"><i /><i /></span>,
};

/** Cast the deck: personas with an explicit costume avatar pin that wardrobe
 *  index (so the Session Deck sprite matches the persona picker). Remaining
 *  terminals fill free slots from their pane id — a hash collision probes
 *  forward so no two unpinned panes share a costume until the wardrobe is
 *  exhausted. State changes a sprite's pose and expression, never its costume. */
function castCostumes(
  panes: PaneNode[],
  sessionProfileId: string,
  avatarByProfile: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();

  // Pin costume avatars first so auto-cast panes avoid those slots when possible.
  for (const p of panes) {
    const avatar = (avatarByProfile.get(p.profileId ?? sessionProfileId) ?? "").trim();
    const idx = costumeIndexOf(avatar);
    if (idx == null || idx < 0) continue;
    out.set(p.paneId, idx);
    taken.add(idx);
  }

  for (const p of panes) {
    if (out.has(p.paneId)) continue;
    // Explicit plain / custom faces don't need a wardrobe pin — still assign a
    // stable cos index for work-animation rhythm when the face later falls back
    // to a mascot, but don't reserve a unique slot.
    const avatar = (avatarByProfile.get(p.profileId ?? sessionProfileId) ?? "").trim();
    if (avatar && (isPlainMascotAvatar(avatar) || isImageAvatar(avatar) || !avatar.startsWith("__mascot:"))) {
      // Custom image / emoji / plain mascot: cos class still drives body motion
      // when a mascot is shown; use a stable per-pane pick without uniqueness.
      out.set(p.paneId, spriteHash(`cos:${p.paneId}`) % COSTUME_COUNT);
      continue;
    }
    let c = spriteHash(`cos:${p.paneId}`) % COSTUME_COUNT;
    if (taken.size < COSTUME_COUNT) {
      while (taken.has(c)) c = (c + 1) % COSTUME_COUNT;
    }
    taken.add(c);
    out.set(p.paneId, c);
  }
  return out;
}

/** Resolve how a persona avatar should appear on a deck sprite.
 *  Costume avatars pin the wardrobe; plain mascots / images / emoji override
 *  the face; an empty avatar falls back to the pane's CLI mascot + auto cast. */
function spriteFaceFromAvatar(avatar: string, cli: string): {
  /** Render CSS wardrobe props (Claude cos hats). */
  wardrobe: boolean;
  /** Face is a built-in mascot (expression eyes / badges apply). */
  isMascot: boolean;
  /** Face element inside `.sprite-body`. null → drawn blob. */
  face: React.ReactNode | null;
} {
  const v = avatar.trim();
  const costumed = costumeOf(v);
  if (costumed?.family === "claude") {
    // Claude wardrobe is CSS props around the plain mascot — same cos index as
    // the persona picker's CostumedClaudeMascot.
    return {
      wardrobe: true,
      isMascot: true,
      face: <ClaudeMascot className="sprite-mascot-svg" />,
    };
  }
  if (costumed?.family === "grok") {
    // Grok's cast is SVG-drawn (no CSS wardrobe). The cos class still drives
    // body-work animations by index.
    return {
      wardrobe: false,
      isMascot: true,
      face: (
        <CostumedGrokMascot
          costume={costumed.costume as GrokCostume}
          className="sprite-mascot-svg"
        />
      ),
    };
  }
  if (v === MASCOT_SENTINEL.claude) {
    return { wardrobe: false, isMascot: true, face: <ClaudeMascot className="sprite-mascot-svg" /> };
  }
  if (v === MASCOT_SENTINEL.codex) {
    return { wardrobe: false, isMascot: true, face: <CodexMascot className="sprite-mascot-svg" /> };
  }
  if (v === MASCOT_SENTINEL.grok) {
    return { wardrobe: false, isMascot: true, face: <GrokMascot className="sprite-mascot-svg" /> };
  }
  if (v === MASCOT_SENTINEL.kimi) {
    return { wardrobe: false, isMascot: true, face: <KimiMascot className="sprite-mascot-svg" /> };
  }
  if (v && isImageAvatar(v)) {
    return {
      wardrobe: false,
      isMascot: false,
      face: <img className="sprite-custom-img" src={v} alt="" draggable={false} />,
    };
  }
  if (v && !v.startsWith("__mascot:")) {
    // Emoji / short text avatar.
    return {
      wardrobe: false,
      isMascot: false,
      face: <span className="sprite-custom-emoji" aria-hidden="true">{v}</span>,
    };
  }
  // Empty / unknown — CLI mascot + auto-cast wardrobe (or blob for unknown CLIs).
  const CliMascot = SPRITE_MASCOTS[cli];
  if (CliMascot) {
    return {
      wardrobe: true,
      isMascot: true,
      face: <CliMascot className="sprite-mascot-svg" />,
    };
  }
  return { wardrobe: false, isMascot: false, face: null };
}

/** The card's animated mascot, mirroring the pane's state: working (bobbing /
 *  swaying / tapping / pondering / scribbling — picked per pane; the strenuous
 *  rhythms break a sweat, ponderers float thought dots, and every worker blinks
 *  now and then), waiting on the user (jumping with a "!" or anxiously
 *  shivering with a "?"), idling (sleeping with drifting z's, or daydreaming
 *  with half-open eyes and rising bubbles), cheering (report just landed —
 *  a happy hop under a burst of sparkles).
 *
 *  Faces follow the persona's selected avatar when set (costume / plain mascot /
 *  image / emoji); otherwise known CLIs wear their real mascot and the deck
 *  casts a wardrobe costume (see castCostumes). Mascots swap in overlay
 *  "expression eyes" for moods the static face can't make. Every sprite runs
 *  at its own animation phase so a deck full of workers never moves in lockstep. */
function DeckSprite({
  status,
  color,
  cheer,
  name,
  cli,
  paneId,
  costume,
  avatar,
  sign,
}: {
  status: PaneStatus;
  color: string;
  cheer: boolean;
  name: string;
  cli: string;
  paneId: string;
  /** The terminal's character (0–23), cast once per deck — state-invariant. */
  costume: number;
  /** Persona avatar string — costume sentinel, image, emoji, or empty. */
  avatar: string;
  /** Waiting only: the hand-held sign's text ("Bash?"). null = no sign. */
  sign: string | null;
}) {
  const look = spriteFaceFromAvatar(avatar, cli);
  // Pat — clicking the sprite pets it: a happy squeeze under drifting hearts.
  const [pat, setPat] = useState(false);
  const patTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(patTimer.current), []);
  const onPat = () => {
    setPat(false); // restart the burst even mid-pat
    window.clearTimeout(patTimer.current);
    requestAnimationFrame(() => setPat(true));
    patTimer.current = window.setTimeout(() => setPat(false), 1300);
  };
  const h = spriteHash(paneId);
  const variant = h % 4; // blob shape
  const work = (h >> 2) % 5; // work rhythm: bob / sway / tap / think / scribble
  const waitV = (h >> 5) % 2; // waiting style: jump-"!" / shiver-"?"
  const idleV = (h >> 6) % 2; // idle style: sleep-zzz / daydream-bubbles
  const isMascot = look.isMascot;
  const phase = { animationDelay: `${-(h % 900)}ms` };
  // Running props follow the character for mascots (see RUN_SWEAT / RUN_BADGES
  // / RUN_EYES); blobs / custom faces keep their hashed work rhythm's props.
  const sweat = isMascot ? RUN_SWEAT.has(costume) : work === 2 || work === 4;
  const dots = isMascot ? costume === 3 : work === 3;
  // Overlay eye mood — expression eyes drawn over the mascot's own (a skin
  // patch hides the SVG eyes, the mood is drawn on top). null = its own eyes.
  const runningMood = isMascot
    ? (RUN_EYES[costume] ?? null)
    : work === 3
      ? "up"
      : work === 4
        ? "grit"
        : null;
  const eyeMood = pat
    ? "happy" // being petted beats every other mood
    : cheer
      ? "happy" // ∪∪ smiling arcs
      : status === "waiting"
        ? "plead" // glossy wide eyes begging for input
        : status === "idle"
          ? idleV === 0
            ? "shut" // fast asleep
            : "drowsy" // half-lidded daydream
          : runningMood;
  const hasFace = look.face != null;
  return (
    <div
      className={`deck-sprite ${status} v${variant} work${work} wait${waitV} idle${idleV} cos${costume}${hasFace ? " mascot" : ""}${cheer ? " cheer" : ""}${pat ? " pat" : ""}`}
      title={name}
      style={{ ["--sprite-color" as string]: color } as React.CSSProperties}
      onClick={onPat}
    >
      {hasFace ? (
        <div className="sprite-body sprite-mascot" style={phase}>
          {/* Wardrobe — Claude CSS props when the persona (or auto-cast) uses
              the shared cos0–23 cast. Grok SVG costumes / custom faces skip it. */}
          {look.wardrobe && COSTUME_PROPS[costume]}
          {/* State props — halo when sound asleep, wings when daydreaming. */}
          {status === "idle" && !cheer && idleV === 0 && (
            <span className="m-halo" aria-hidden="true" />
          )}
          {status === "idle" && !cheer && idleV === 1 && (
            <>
              <span className="m-wing l" aria-hidden="true" />
              <span className="m-wing r" aria-hidden="true" />
            </>
          )}
          {look.face}
          {/* Expression eyes — only over built-in mascot SVGs. */}
          {isMascot && eyeMood && (
            <span className={`m-eyes ${eyeMood}`} aria-hidden="true">
              <i className="l" /><i className="r" />
            </span>
          )}
        </div>
      ) : (
        <div className="sprite-body" style={phase}>
          {variant === 2 && <span className="sprite-antenna" aria-hidden="true" />}
          {variant === 3 && (
            <>
              <span className="sprite-ear l" aria-hidden="true" />
              <span className="sprite-ear r" aria-hidden="true" />
            </>
          )}
          <span className="sprite-eye l" />
          <span className="sprite-eye r" />
          <span className="sprite-mouth" />
        </div>
      )}
      {status === "idle" && !cheer && idleV === 0 && (
        <span className="sprite-zzz" aria-hidden="true">z<span>z</span></span>
      )}
      {status === "idle" && !cheer && idleV === 1 && (
        <span className="sprite-dream" aria-hidden="true"><i /><i /></span>
      )}
      {status === "waiting" && (
        <span className={`sprite-alert${waitV === 1 ? " ask" : ""}`} aria-hidden="true">
          {waitV === 1 ? "?" : "!"}
        </span>
      )}
      {/* The hand-held sign — what this sprite is asking permission for. */}
      {status === "waiting" && sign && (
        <span className="sprite-sign" aria-hidden="true">{sign}</span>
      )}
      {pat && (
        <span className="sprite-hearts" aria-hidden="true">
          <i>♥</i><i>♥</i><i>♥</i>
        </span>
      )}
      {status === "running" && dots && (
        <span className="sprite-dots" aria-hidden="true"><i /><i /><i /></span>
      )}
      {status === "running" && sweat && (
        <span className="sprite-sweat" aria-hidden="true" />
      )}
      {status === "running" && isMascot && look.wardrobe && RUN_BADGES[costume]}
      {cheer && (
        <span className="sprite-sparkles" aria-hidden="true">
          <i>✦</i><i>✦</i><i>✦</i>
        </span>
      )}
    </div>
  );
}

function DeckCard({
  pane,
  costume,
  avatar,
  status,
  sessionProfileId,
  checked,
  standupTurn,
  others,
  onRelay,
  onDropRelay,
  onPullContext,
  onToggleCheck,
  onHover,
  onJump,
  onZoom,
  onSetAutoLabel,
  getPersona,
}: {
  pane: PaneNode;
  /** The terminal's character (0–23), cast once per deck by castCostumes. */
  costume: number;
  /** Persona avatar string — synced into the deck sprite face/costume. */
  avatar: string;
  status: PaneStatus;
  sessionProfileId: string;
  checked: boolean;
  /** This sprite is the one speaking in the running standup — spotlight it. */
  standupTurn: boolean;
  /** The other terminals on deck — relay targets. */
  others: { paneId: string; label: string }[];
  /** Relay this pane's report to another pane. */
  onRelay: (toId: string) => void;
  /** A sprite was dropped onto this card — relay from that pane to this one. */
  onDropRelay: (fromId: string) => void;
  /** Pull a chosen sibling terminal's context INTO this card's pane (fills its
   *  input box with an AI brief of that sibling's recent work, unsubmitted). */
  onPullContext: (fromId: string) => void;
  onToggleCheck: () => void;
  onHover: (hover: boolean) => void;
  onJump: () => void;
  onZoom: () => void;
  onSetAutoLabel: (label: string) => void;
  getPersona: (id: string) => Promise<{ base_model?: string | null } | null>;
}) {
  const profileId = pane.profileId ?? sessionProfileId;
  const identity = usePersonaModel(profileId, pane.cli);
  const label = pane.title ?? pane.autoLabel ?? pane.cli;
  const cwdTail = pane.cwd ? pane.cwd.split("/").filter(Boolean).slice(-1)[0] : "~";

  // The card wears its terminal's theme. Sprite/edge take the effective accent;
  // when the pane has its own palette override, the standard CSS vars are scoped
  // onto the card (same mechanism PaneLayout uses for the pane chrome), so the
  // whole card — surface, borders, text, inputs — re-skins with the terminal and
  // follows any recolour live. Without an override both track the global scheme.
  const gName = usePaletteStore((s) => s.name);
  const gAccent = usePaletteStore((s) => s.accent);
  const hasThemeOverride = pane.palette != null || pane.accent != null;
  const effPalette = (pane.palette ?? gName) as PanelPaletteName;
  const effAccent = (pane.accent ?? gAccent) as AccentName;
  const spriteColor = resolveAccentColor(PANEL_PALETTES[effPalette], effAccent);
  const cardStyle: React.CSSProperties = {
    ["--deck-accent" as string]: spriteColor,
    ...(hasThemeOverride ? cssVarsForPalette(effPalette, effAccent) : {}),
  } as React.CSSProperties;

  // Hover status: like the bubble, the sprite's tooltip is one short AI status
  // sentence — "where things stand right now" — not a raw transcript dump.
  // Fetched lazily on hover (after a short dwell, so sweeping the deck is free)
  // and cached for TIP_TTL_MS; a finished pane that already has a quest report
  // just shows that report, with no extra model call.
  const [tip, setTip] = useState<{ text: string; ts: number } | null>(null);
  const tipLoading = useRef(false);
  const tipTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

  const fetchTip = async () => {
    if (tipLoading.current) return;
    if (tip && performance.now() - tip.ts < TIP_TTL_MS) return;
    tipLoading.current = true;
    try {
      const transcript = await invoke<string>("terminal_tail", { id: `${pane.paneId}:${pane.convId}` });
      if (transcript.trim().length < 40) return;
      const providerId = await resolveProviderId(
        getPersona, profileId, useDeckStore.getState().reportProviderId,
      );
      if (!providerId) return;
      const text = await invoke<string>("ai_pane_report", { providerId, transcript });
      if (text.trim()) setTip({ text, ts: performance.now() });
    } catch {
      /* the tooltip just keeps the last status */
    } finally {
      tipLoading.current = false;
    }
  };

  // Quest report: when a decent-length run ends, the sprite "speaks" — one
  // AI-generated sentence on what it just did. Run ends come from the global
  // activity ledger (busy edges), not this card's own status transitions, so a
  // run that finishes into a pending permission prompt ("waiting"), or while
  // this card isn't mounted (deck closed, another session active), still gets
  // its bubble the moment the card looks. Reports live in a global store so a
  // remount shows the same text without a second AI call. Dismissing hides the
  // bubble but keeps the report (the 💬 action reopens it); only the next run
  // discards it.
  const reportEntry = usePaneReportStore((s) => s.reports[pane.paneId]);
  const pendingFor = usePaneReportStore((s) => s.pending[pane.paneId]);
  const report = reportEntry && !reportEntry.dismissed ? reportEntry.text : null;
  const reporting = pendingFor !== undefined;
  const prevStatus = useRef<PaneStatus>(status);

  // While the pane waits on a permission prompt, the sprite speaks up: the
  // pending attention item's message (from the CLI's hook) in an amber bubble
  // that jumps to the terminal. Shown instead of the quest report until the
  // prompt is answered.
  const attentionMsg = useAttentionStore(
    (s) => s.queue.find((q) => q.id.startsWith(`${pane.paneId}:`))?.message ?? null,
  );

  // Generate one report. Resolves to null on success, or a short human-readable
  // reason when no report was produced — the manual 📣 path shows that reason
  // instead of a generic shrug; auto triggers just drop it.
  const makeReport = async (endedAt: number): Promise<string | null> => {
    const store = usePaneReportStore.getState();
    store.begin(pane.paneId, endedAt);
    let text: string | null = null;
    let fail: string | null = null;
    // The provider actually used, captured inside the race so the bubble can
    // attribute the report to the model that produced it.
    let usedProviderId: string | null = null;
    try {
      // Race the whole generation against a timeout so a wedged backend/provider
      // call can never leave the "writing report…" bubble stuck forever.
      text = await Promise.race([
        (async () => {
          const transcript = await invoke<string>("terminal_tail", { id: `${pane.paneId}:${pane.convId}` });
          if (transcript.length === 0) {
            fail = "couldn't read this terminal's output"; // unknown/closed id
            return null;
          }
          if (transcript.trim().length < 40) {
            fail = "too little output to summarize yet";
            return null;
          }
          const providerId = await resolveProviderId(
            getPersona, profileId, useDeckStore.getState().reportProviderId,
          );
          if (!providerId) {
            fail = "no usable AI provider configured";
            return null;
          }
          usedProviderId = providerId;
          const raw = await invoke<string>("ai_pane_report", { providerId, transcript });
          if (!raw.trim()) fail = "the model returned an empty reply";
          return raw.trim() ? raw : null;
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("report timed out")), REPORT_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      fail = typeof err === "string" ? err : err instanceof Error ? err.message : "the model call failed";
      console.warn("pane report failed", err); // a failed report just means no bubble
    }
    // Resolve the used provider id to a display model name for the bubble's
    // attribution chip (same list resolveProviderId picks from). Best-effort:
    // a failed lookup just omits the chip.
    let model: string | undefined;
    if (usedProviderId) {
      try {
        const list = await invoke<{ id: string; label: string; model: string }[]>("ai_commit_providers");
        const p = list.find((x) => x.id === usedProviderId);
        model = p ? p.model || p.label || p.id : usedProviderId;
      } catch {
        model = usedProviderId;
      }
    }
    usePaneReportStore.getState().finish(pane.paneId, endedAt, text, model);
    return text ? null : fail ?? "the model call failed";
  };

  useEffect(() => {
    const prev = prevStatus.current;
    prevStatus.current = status;
    if (status === "running" && prev !== "running") {
      usePaneReportStore.getState().clear(pane.paneId); // back to work — the old quest report is history
    }
  }, [status, pane.paneId]);

  // The ledger's endedAt bumping (cards re-render on the 200ms busy poll) is
  // the report trigger; status/report/pending re-checks let a run that ended
  // unreported (e.g. generation raced a new run) get picked up later.
  const lastRunEndedAt = getLastRun(pane.paneId)?.endedAt ?? 0;
  useEffect(() => {
    if (!lastRunEndedAt) return;
    const run = getLastRun(pane.paneId);
    if (!run || run.runMs < MIN_RUN_FOR_REPORT_MS) return;
    if (status === "running") return; // a new run already started — it'll report instead
    // A stale (restored-from-last-session) report has a forEndedAt on the old
    // clock, so it can't "cover" a live run — let this run report over it.
    if (reportEntry && !reportEntry.stale && reportEntry.forEndedAt >= run.endedAt) return; // already covered
    if (pendingFor === run.endedAt) return; // generation in flight
    void makeReport(run.endedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRunEndedAt, status, reportEntry, pendingFor]);

  // Manual report — ask the sprite to summarize what this terminal is doing (or
  // just did) right now, without waiting for a run edge. Keyed to the last
  // run's end when there is one, so the auto trigger sees it as covered; a
  // still-running pane keys to "now" and the real end still reports later.
  // An explicit ask must always answer visibly: `asked` lifts the waiting-state
  // bubble suppression (attention normally owns the stage), and a generation
  // that produced nothing says so instead of silently stopping the spinner.
  const [asked, setAsked] = useState(false);
  const [askFailed, setAskFailed] = useState<string | null>(null);
  const askReport = async () => {
    if (reporting) return;
    setAsked(true);
    setAskFailed(null);
    const key = getLastRun(pane.paneId)?.endedAt ?? performance.now();
    const fail = await makeReport(key);
    const entry = usePaneReportStore.getState().reports[pane.paneId];
    // Anything at-or-after our key means a report landed (ours, or a newer
    // auto one) — older/absent means this generation came back empty.
    setAskFailed(!entry || entry.forEndedAt < key ? fail ?? "the model call failed" : null);
  };

  const [reply, setReply] = useState("");
  const send = () => {
    const text = reply.trim();
    if (!text) return;
    sendToPane(pane.paneId, text);
    setReply(""); // focus stays for continuous replies
  };

  // Celebration — a run that lasted long enough to feel like an accomplishment
  // ends in confetti (once per run; the cheer bubble handles the words). Only a
  // *fresh* landing counts: no confetti for runs that ended before this card
  // looked, and none while the "end" is really a pending permission prompt.
  const [celebrate, setCelebrate] = useState(false);
  const celebratedRun = useRef(0);
  const lastRunEnd = getLastRun(pane.paneId)?.endedAt ?? 0;
  useEffect(() => {
    const run = getLastRun(pane.paneId);
    if (!run || run.runMs < CELEBRATE_MIN_RUN_MS) return;
    if (status !== "idle") return;
    if (run.endedAt === celebratedRun.current) return;
    if (performance.now() - run.endedAt > 15_000) return; // old news
    celebratedRun.current = run.endedAt;
    setCelebrate(true);
    const t = window.setTimeout(() => setCelebrate(false), 2600);
    return () => window.clearTimeout(t);
  }, [lastRunEnd, status, pane.paneId]);

  // Relay — forward this terminal's report to a chosen sibling. The sprite can
  // also be dragged onto another card for the same handoff.
  const [relayOpen, setRelayOpen] = useState(false);
  const relayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!relayOpen) return;
    const onClick = (e: MouseEvent) => {
      if (relayRef.current?.contains(e.target as Node)) return;
      setRelayOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [relayOpen]);

  // Pull context — bring a chosen sibling terminal's recent work INTO this pane
  // as an editable brief in the input box (the inbound counterpart to relay).
  const [pullOpen, setPullOpen] = useState(false);
  const pullRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pullOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pullRef.current?.contains(e.target as Node)) return;
      setPullOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pullOpen]);

  const [dropHover, setDropHover] = useState(false);

  // Manual relabel for just this pane.
  const [relabeling, setRelabeling] = useState(false);
  const relabel = async () => {
    setRelabeling(true);
    try {
      const transcript = await invoke<string>("terminal_tail", { id: `${pane.paneId}:${pane.convId}` });
      if (transcript.trim().length < 40) return;
      const providerId = await resolveProviderId(getPersona, profileId);
      if (!providerId) return;
      const newLabel = await invoke<string>("ai_summarize_terminal", { providerId, transcript });
      if (newLabel.trim()) onSetAutoLabel(newLabel);
    } catch {
      /* ignore */
    } finally {
      setRelabeling(false);
    }
  };

  return (
    <div
      className={`deck-card status-${status}${checked ? " checked" : ""}${standupTurn ? " standup-turn" : ""}${dropHover ? " drop-target" : ""}`}
      style={cardStyle}
      data-deck-pane={pane.paneId}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(RELAY_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDropHover(true);
      }}
      onDragLeave={(e) => {
        // Ignore leave events into our own children (they'd flicker the halo).
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setDropHover(false);
      }}
      onDrop={(e) => {
        setDropHover(false);
        const fromId = e.dataTransfer.getData(RELAY_DRAG_TYPE);
        if (!fromId || fromId === pane.paneId) return;
        e.preventDefault();
        onDropRelay(fromId);
      }}
    >
      {/* Hover-revealed controls; the checked state keeps them visible. */}
      <span className="deck-card-actions">
        {reportEntry?.dismissed && (
          <Tooltip label="Show the last report">
            <button
              type="button"
              className="deck-icon-btn"
              onClick={() => usePaneReportStore.getState().reopen(pane.paneId)}
              aria-label="Show last report"
            >
              <MessageCircle size={12} />
            </button>
          </Tooltip>
        )}
        <Tooltip label={checked ? "Remove from broadcast" : "Include in broadcast"}>
          <button
            type="button"
            className={`deck-card-check${checked ? " on" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
            aria-label={checked ? "Remove from broadcast" : "Include in broadcast"}
            aria-pressed={checked}
          >
            {checked && <Check size={11} strokeWidth={3} />}
          </button>
        </Tooltip>
        <Tooltip label="Regenerate label">
          <button type="button" className="deck-icon-btn" onClick={relabel} disabled={relabeling} aria-label="Relabel">
            {relabeling ? <Loader2 size={12} className="deck-spin" /> : <Sparkles size={12} />}
          </button>
        </Tooltip>
        <Tooltip label="Zoom this terminal">
          <button type="button" className="deck-icon-btn" onClick={onZoom} aria-label="Zoom">
            <Maximize2 size={12} />
          </button>
        </Tooltip>
      </span>

      {/* Head row: task label left, status right — frees the sprite's side for
          the speech bubble. */}
      <div className="deck-card-head">
        <button type="button" className="deck-card-label" onClick={onJump} title="Jump to this terminal">
          {label}
        </button>
        {reportEntry?.model && (
          <span className="deck-card-model" title={`Latest report summarized by ${reportEntry.model}`}>
            {reportEntry.model}
          </span>
        )}
        <span
          className={`deck-meta-state ${status}`}
          title={`${identity.name} · ${identity.model} · ${cwdTail}`}
        >
          {status}
        </span>
      </div>

      <div className="deck-card-main">
        {/* Hovering the sprite asks it "how's it going?" — one short AI status
            sentence (or the finished run's report, free). "…" while it thinks. */}
        <Tooltip
          side="bottom"
          delay={200}
          label={
            <span className="deck-preview-tip">
              {(status !== "running" && reportEntry?.text) || tip?.text || "…"}
            </span>
          }
        >
          <div
            className="deck-sprite-hit"
            draggable={others.length > 0}
            onDragStart={(e) => {
              e.dataTransfer.setData(RELAY_DRAG_TYPE, pane.paneId);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onMouseEnter={() => {
              if (status !== "running" && reportEntry) return; // the quest report IS the status
              tipTimer.current = window.setTimeout(() => void fetchTip(), TIP_INTENT_MS);
            }}
            onMouseLeave={() => window.clearTimeout(tipTimer.current)}
          >
            <DeckSprite
              status={status}
              color={spriteColor}
              cheer={!!report}
              name={identity.name}
              cli={pane.cli}
              paneId={pane.paneId}
              costume={costume}
              avatar={avatar || identity.avatar}
              sign={status === "waiting" ? signTextFor(attentionMsg) : null}
            />
          </div>
        </Tooltip>
        {/* The stage beside the sprite — full remaining width for its speech. */}
        <div className="deck-card-stage">
          {status === "waiting" && (
            <button
              type="button"
              className="deck-bubble attention"
              onClick={onJump}
              title="Jump to this terminal"
            >
              <span className="deck-bubble-text">
                {attentionMsg || "Needs your confirmation — click to jump over"}
              </span>
              <CornerDownLeft size={11} className="deck-bubble-go" aria-hidden="true" />
            </button>
          )}
          {(status !== "waiting" || asked) && reporting && !report && (
            <div className="deck-bubble thinking" aria-hidden="true">
              <Loader2 size={11} className="deck-spin" />
              <span>writing report…</span>
            </div>
          )}
          {askFailed && !reporting && !report && (
            <div className="deck-bubble thinking" role="status">
              <span>No report — {askFailed}</span>
              <button
                type="button"
                className="deck-bubble-close"
                onClick={() => setAskFailed(null)}
                aria-label="Dismiss"
              >
                <X size={11} />
              </button>
            </div>
          )}
          {(status !== "waiting" || asked) && report && (
            <div className="deck-bubble" role="status">
              <span className="deck-bubble-text">{report}</span>
              <button
                type="button"
                className="deck-bubble-close"
                onClick={() => usePaneReportStore.getState().dismiss(pane.paneId)}
                aria-label="Dismiss report"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="deck-card-reply">
        <input
          className="deck-reply-input"
          placeholder="Reply to this terminal…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onPaste={(e) => void handleImagePaste(e, [pane.paneId])}
          onKeyDown={(e) => {
            // Ignore Enter while an IME is composing (candidate selection).
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="button" className="deck-reply-send" onClick={send} disabled={!reply.trim()} aria-label="Send">
          <CornerDownLeft size={12} />
        </button>
        <Tooltip label="Report on the current or last task">
          <button
            type="button"
            className="deck-reply-report"
            onClick={() => void askReport()}
            disabled={reporting}
            aria-label="Summarize this terminal"
          >
            {reporting ? <Loader2 size={12} className="deck-spin" /> : <Megaphone size={12} />}
          </button>
        </Tooltip>
        {others.length > 0 && (
          <div className="deck-relay" ref={relayRef}>
            <Tooltip label="Relay report to another terminal">
              <button
                type="button"
                className={`deck-reply-report${relayOpen ? " open" : ""}`}
                onClick={() => setRelayOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={relayOpen}
                aria-label="Relay to another terminal"
              >
                <Forward size={12} />
              </button>
            </Tooltip>
            {relayOpen && (
              <div className="deck-relay-menu" role="menu">
                <span className="deck-relay-title">Relay to…</span>
                {others.map((o) => (
                  <button
                    key={o.paneId}
                    type="button"
                    className="deck-relay-item"
                    role="menuitem"
                    onClick={() => {
                      setRelayOpen(false);
                      onRelay(o.paneId);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {others.length > 0 && (
          <div className="deck-relay" ref={pullRef}>
            <Tooltip label="Pull another terminal's context here">
              <button
                type="button"
                className={`deck-reply-report${pullOpen ? " open" : ""}`}
                onClick={() => setPullOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={pullOpen}
                aria-label="Pull context from another terminal"
              >
                <ArrowDownToLine size={12} />
              </button>
            </Tooltip>
            {pullOpen && (
              <div className="deck-relay-menu" role="menu">
                <span className="deck-relay-title">Pull context from…</span>
                {others.map((o) => (
                  <button
                    key={o.paneId}
                    type="button"
                    className="deck-relay-item"
                    role="menuitem"
                    onClick={() => {
                      setPullOpen(false);
                      onPullContext(o.paneId);
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {celebrate && (
        <span className="deck-confetti" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </div>
  );
}
