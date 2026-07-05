import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles, Maximize2, CornerDownLeft, Loader2, RefreshCw, X, Check, Rows3, PanelBottomClose, Dices, MessageCircle, Cpu, ChevronDown, Megaphone } from "lucide-react";
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
import ClaudeMascot from "../Persona/ClaudeMascot";
import CodexMascot from "../Persona/CodexMascot";
import GrokMascot from "../Persona/GrokMascot";
import KimiMascot from "../Persona/KimiMascot";
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

function focusPaneExternal(paneId: string) {
  window.dispatchEvent(new CustomEvent(FOCUS_PANE_EVENT, { detail: { paneId } }));
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
  const { get: getPersona } = usePersonas();

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

  // The deck's cast — paneId → character costume, distinct across terminals.
  const costumes = useMemo(() => castCostumes(panes), [panes]);

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
          {counts.waiting > 0 && <span className="deck-badge waiting">{counts.waiting} waiting</span>}
          {counts.running > 0 && <span className="deck-badge running">{counts.running} running</span>}
          <span className="deck-badge">{panes.length} panes</span>
        </span>
        <span className="deck-spacer" />
        <div className="deck-model" ref={modelRef}>
          <Tooltip label="Model the sprites report with — Auto follows each persona's base model">
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

      <div className="deck-cards">
        {/* Layout order — cards map one-to-one onto the terminals' on-screen order. */}
        {panes.map((p) => (
          <DeckCard
            key={p.paneId}
            pane={p}
            costume={costumes.get(p.paneId) ?? 0}
            status={statusOf(p)}
            sessionProfileId={sessionProfileId}
            checked={checked?.has(p.paneId) ?? false}
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

/** Cast the deck: each terminal gets a character it keeps (drawn from its pane
 *  id), and no two terminals on stage wear the same one — a hash collision
 *  probes forward to the next free costume, in layout order. Characters repeat
 *  only when a session has more panes than costumes. State changes a sprite's
 *  pose and expression, never its costume. */
function castCostumes(panes: PaneNode[]): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const p of panes) {
    let c = spriteHash(`cos:${p.paneId}`) % COSTUME_COUNT;
    if (taken.size < COSTUME_COUNT) {
      while (taken.has(c)) c = (c + 1) % COSTUME_COUNT;
    }
    taken.add(c);
    out.set(p.paneId, c);
  }
  return out;
}

/** The card's animated mascot, mirroring the pane's state: working (bobbing /
 *  swaying / tapping / pondering / scribbling — picked per pane; the strenuous
 *  rhythms break a sweat, ponderers float thought dots, and every worker blinks
 *  now and then), waiting on the user (jumping with a "!" or anxiously
 *  shivering with a "?"), idling (sleeping with drifting z's, or daydreaming
 *  with half-open eyes and rising bubbles), cheering (report just landed —
 *  a happy hop under a burst of sparkles).
 *
 *  Faces are diverse: known CLIs wear their real mascot (claude → the Claude
 *  Code avatar); others get a drawn blob whose shape (round / square / antenna /
 *  ears) derives from the pane id. Mascots additionally wear the character the
 *  deck cast them as (see castCostumes — distinct per terminal; state changes
 *  pose and expression, never the costume) and swap in overlay "expression
 *  eyes" for moods the static face can't make. Every sprite runs at its own
 *  animation phase so a deck full of workers never moves in lockstep. */
function DeckSprite({
  status,
  color,
  cheer,
  name,
  cli,
  paneId,
  costume,
}: {
  status: PaneStatus;
  color: string;
  cheer: boolean;
  name: string;
  cli: string;
  paneId: string;
  /** The terminal's character (0–7), cast once per deck — state-invariant. */
  costume: number;
}) {
  const Mascot = SPRITE_MASCOTS[cli];
  const h = spriteHash(paneId);
  const variant = h % 4; // blob shape
  const work = (h >> 2) % 5; // work rhythm: bob / sway / tap / think / scribble
  const waitV = (h >> 5) % 2; // waiting style: jump-"!" / shiver-"?"
  const idleV = (h >> 6) % 2; // idle style: sleep-zzz / daydream-bubbles
  const isMascot = !!Mascot;
  const phase = { animationDelay: `${-(h % 900)}ms` };
  // Running props follow the character for mascots (see RUN_SWEAT / RUN_BADGES
  // / RUN_EYES); blobs keep their hashed work rhythm's props.
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
  const eyeMood = cheer
    ? "happy" // ∪∪ smiling arcs
    : status === "waiting"
      ? "plead" // glossy wide eyes begging for input
      : status === "idle"
        ? idleV === 0
          ? "shut" // fast asleep
          : "drowsy" // half-lidded daydream
        : runningMood;
  return (
    <div
      className={`deck-sprite ${status} v${variant} work${work} wait${waitV} idle${idleV} cos${costume}${Mascot ? " mascot" : ""}${cheer ? " cheer" : ""}`}
      title={name}
      style={{ ["--sprite-color" as string]: color } as React.CSSProperties}
    >
      {Mascot ? (
        <div className="sprite-body sprite-mascot" style={phase}>
          {/* Wardrobe — the terminal's cast character, layered around the
              unchanged mascot (see COSTUME_PROPS). */}
          {COSTUME_PROPS[costume]}
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
          <Mascot className="sprite-mascot-svg" />
          {/* Expression eyes — drawn over the mascot's own for moods its
              static face can't make. */}
          {eyeMood && (
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
      {status === "running" && dots && (
        <span className="sprite-dots" aria-hidden="true"><i /><i /><i /></span>
      )}
      {status === "running" && sweat && (
        <span className="sprite-sweat" aria-hidden="true" />
      )}
      {status === "running" && isMascot && RUN_BADGES[costume]}
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
  status,
  sessionProfileId,
  checked,
  onToggleCheck,
  onHover,
  onJump,
  onZoom,
  onSetAutoLabel,
  getPersona,
}: {
  pane: PaneNode;
  /** The terminal's character (0–7), cast once per deck by castCostumes. */
  costume: number;
  status: PaneStatus;
  sessionProfileId: string;
  checked: boolean;
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
    usePaneReportStore.getState().finish(pane.paneId, endedAt, text);
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
      className={`deck-card status-${status}${checked ? " checked" : ""}`}
      style={cardStyle}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
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
        <Tooltip label="Ask for a report on the current or last task">
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
      </div>
    </div>
  );
}
