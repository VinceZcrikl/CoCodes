import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ClaudeTab from "../Claude/ClaudeTab";
import WindowControls from "./WindowControls";
import AppLogo from "./AppLogo";
import ProfileConstellation from "../Persona/ProfileConstellation";
import PersonaEditor from "../Persona/PersonaEditor";
import PalettePanel from "./PalettePanel";
import TriondaBall from "./TriondaBall";
import LaurelWreath from "./LaurelWreath";
import TempleFrame from "./TempleFrame";
import GoalConfetti from "./GoalConfetti";
import OracleDescent from "./OracleDescent";
import { usePersonas, useProviders, type PersonaDoc } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import { usePaletteStore, installPaletteSync } from "../../state/paletteStore";
import { PANEL_PALETTES, resolveAccentColor } from "../../state/panelPalettes";
import { applyPaletteVars } from "../../state/uiPalette";
import { useWindowStore } from "../../state/windowStore";
import { useShellStore } from "../../state/shellStore";
import { useGitStore } from "../../state/gitStore";
import ShellOverlay from "../Claude/ShellOverlay";
import GitPanel from "../Git/GitPanel";
import PersonaOrb from "../PersonaOrb/PersonaOrb";

interface CliDef {
  id: string;
  label: string;
  ready: boolean;
  /** The real model a fresh session of this CLI runs by default, shown in the
   *  brand status when the persona has no base-model preset override. */
  defaultModel: string;
}

const CLIS: CliDef[] = [
  { id: "claude", label: "Claude", ready: true,  defaultModel: "Opus 4.8" },
  { id: "codex",  label: "Codex",  ready: true,  defaultModel: "GPT-5.5" },
  { id: "gemini", label: "Gemini", ready: false, defaultModel: "Gemini 2.5 Pro" },
  { id: "grok",   label: "Grok",   ready: true,  defaultModel: "Grok 4" },
  { id: "kimi",   label: "Kimi Code", ready: true, defaultModel: "Kimi K2.7" },
];

const CLI_STORAGE_KEY = "theoi:active-cli";

export default function Cockpit() {
  const [activeCli, setActiveCli] = useState<string>(
    () => localStorage.getItem(CLI_STORAGE_KEY) ?? "claude",
  );

  const paletteName = usePaletteStore((s) => s.name);
  const accent = usePaletteStore((s) => s.accent);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const accentColor = resolveAccentColor(PANEL_PALETTES[paletteName], accent);
  const mini = useWindowStore((s) => s.mini);

  // The World Cup theme swaps the palette dot for the Trionda ball and unlocks
  // the festive chrome (the rest is CSS, scoped to [data-palette]). The Theoi ·
  // Olympus theme does the same with a laurel-wreathed orb + Greek chrome.
  const isWorldCup = paletteName === "world-cup-2026";
  const isTheoi = paletteName === "theoi";
  const [celebrate, setCelebrate] = useState(false);

  const profileId = useProfileStore((s) => s.activeProfileId);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const { personas, get, save } = usePersonas();
  const { providers } = useProviders();
  // undefined = editor closed, null = creating, string = editing that persona.
  const [editorFor, setEditorFor] = useState<string | null | undefined>(undefined);
  const activePersona = personas.find((p) => p.id === profileId);
  const activeName = activePersona?.name ?? profileId;

  // Full doc for the active persona — gives us its base-model for the model
  // label. Refetched when the persona changes or the library is edited.
  const [activeDoc, setActiveDoc] = useState<PersonaDoc | null>(null);
  useEffect(() => {
    let cancelled = false;
    void get(profileId).then((doc) => {
      if (!cancelled) setActiveDoc(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [profileId, personas, get]);

  // The real model the subscription `claude` CLI runs, read from
  // ~/.claude/settings.json. null when no model is pinned there (Claude Code
  // then picks one dynamically — no static answer), so we fall back to a label.
  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void invoke<string | null>("claude_default_model").then((m) => {
      if (!cancelled) setClaudeModel(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The real model the active persona runs: its base-model preset's model name
  // when set; otherwise, for the subscription claude CLI, the model pinned in
  // ~/.claude/settings.json; otherwise the CLI's labelled default.
  const activeCliId = activeDoc?.cli ?? activePersona?.cli ?? "claude";
  const provider = activeDoc?.base_model
    ? providers.find((p) => p.id === activeDoc.base_model)
    : undefined;
  const modelLabel =
    provider?.model ||
    (activeCliId === "claude" ? claudeModel : null) ||
    CLIS.find((c) => c.id === activeCliId)?.defaultModel ||
    "ready";

  // Keep a ClaudeTab alive for every persona we've visited (not just the
  // active one), so switching persona toggles visibility instead of tearing
  // down + respawning the terminals. Combined with the always-mounted CLI
  // tabs below, every visited (persona, cli) panel persists.
  const [visitedPersonas, setVisitedPersonas] = useState<Set<string>>(
    () => new Set([profileId]),
  );
  useEffect(() => {
    setVisitedPersonas((prev) =>
      prev.has(profileId) ? prev : new Set(prev).add(profileId),
    );
  }, [profileId]);

  // When the active persona changes, switch the CLI tab to that persona's
  // preferred CLI (if it is one of the enabled tabs).
  useEffect(() => {
    const preferred = activePersona?.cli;
    if (preferred && CLIS.find((c) => c.id === preferred && c.ready)) {
      setActiveCli(preferred);
    }
  // Only run when the persona identity changes, not on every activeCli update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePersona?.id, activePersona?.cli]);

  // Persist chosen tab so the cockpit reopens on the same CLI.
  useEffect(() => {
    try { localStorage.setItem(CLI_STORAGE_KEY, activeCli); } catch { /* ignore */ }
  }, [activeCli]);

  // Floating shell window state (toolbar `>_`): a window over the panel, not a
  // CLI tab swap — so the assistant terminal stays put underneath.
  const shellEverOpened = useShellStore((s) => s.everOpened);
  const shellOpen = useShellStore((s) => s.open);
  const shellMaximized = useShellStore((s) => s.maximized);
  const closeShell = useShellStore((s) => s.close);
  const toggleShellMax = useShellStore((s) => s.toggleMax);

  // Floating Git window (toolbar git icon) — read-only source-control inspector.
  const gitEverOpened = useGitStore((s) => s.everOpened);
  const gitOpen = useGitStore((s) => s.open);
  const gitMaximized = useGitStore((s) => s.maximized);
  const closeGit = useGitStore((s) => s.close);
  const toggleGitMax = useGitStore((s) => s.toggleMax);

  useEffect(() => applyPaletteVars(paletteName, accent), [paletteName, accent]);
  useEffect(() => installPaletteSync(), []);

  // Celebration: fire when the user *switches into* a decorated theme (World Cup
  // → confetti, Theoi → oracle descent) — not on every render, and not on a
  // relaunch that's already in it. The overlay rendered is chosen by palette.
  const prevPalette = useRef(paletteName);
  useEffect(() => {
    const decorated = paletteName === "world-cup-2026" || paletteName === "theoi";
    if (decorated && prevPalette.current !== paletteName) {
      setCelebrate(true);
    }
    prevPalette.current = paletteName;
  }, [paletteName]);

  // …and once on the very first launch after the seasonal rollout, so the
  // auto-activated theme still gets its kickoff (then never again on launch).
  useEffect(() => {
    if (paletteName !== "world-cup-2026") return;
    try {
      if (!localStorage.getItem("theoi:wc2026-celebrated")) {
        localStorage.setItem("theoi:wc2026-celebrated", "1");
        setCelebrate(true);
      }
    } catch { /* localStorage unavailable; skip the kickoff */ }
    // Run once on mount — the transition effect above covers later switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`cockpit${mini ? " mini" : ""}`}>
      <div className="cockpit-frame" aria-hidden="true" data-tauri-drag-region />
      {/* Greek-temple facade around the panel (theoi theme only, not in mini). */}
      {isTheoi && !mini && <TempleFrame />}
      <div className="cockpit-panel">
        {mini ? (
          <div className="cockpit-mini-bar" data-tauri-drag-region>
            <AppLogo className="cockpit-mini-logo" />
            <span className="cockpit-mini-title">Theoi · {activeName}</span>
            <WindowControls />
          </div>
        ) : (
          <>
            {/* Single header row: current persona (left) · persona
                constellation (avatars + add) · theme + window controls (right).
                The active persona drives which CLI is shown. */}
            <nav className="cockpit-header" data-tauri-drag-region>
              <ProfileConstellation
                activeModel={modelLabel}
                onEdit={(id) => setEditorFor(id)}
                onNew={() => setEditorFor(null)}
              />

              <div className="cockpit-header-right">
                <div className="cockpit-palette-wrap">
                  <button
                    type="button"
                    className="cockpit-theme-dot"
                    onClick={() => setPaletteOpen((v) => !v)}
                    title={`Palette: ${PANEL_PALETTES[paletteName].label}`}
                    aria-label="Choose panel palette"
                    aria-expanded={paletteOpen}
                    style={{
                      // The Trionda ball and laurel-ringed orb both want a
                      // neutral disc to pop against; plain orb keeps the accent
                      // fill it tints itself from.
                      background: isWorldCup || isTheoi ? "#15151b" : accentColor,
                      color: accentColor,
                    }}
                  >
                    {isWorldCup ? (
                      <TriondaBall className="cockpit-theme-ball" />
                    ) : isTheoi ? (
                      <span className="cockpit-theme-laurel-wrap">
                        {/* Cool celestial core so the gold laurel reads against
                            it (a gold orb + gold laurel would wash out). */}
                        <PersonaOrb color="#cdd9f2" reactive={false} spin={0.5} />
                        <LaurelWreath className="cockpit-theme-laurel" />
                      </span>
                    ) : (
                      <PersonaOrb color={accentColor} reactive={false} spin={0.5} />
                    )}
                  </button>
                  {paletteOpen && (
                    <PalettePanel onClose={() => setPaletteOpen(false)} />
                  )}
                </div>
                <WindowControls />
              </div>
            </nav>
          </>
        )}

        <main className="cockpit-body">
          {/* One ClaudeTab per visited (persona, cli). All stay mounted and
              only the active one is shown — switching persona or CLI tab keeps
              every other panel's terminals live. Sessions are namespaced per
              (persona, cli) so they never intermix. */}
          {[...visitedPersonas].flatMap((pid) =>
            CLIS.filter((c) => c.ready).map((cli) => {
              const isVisible = pid === profileId && cli.id === activeCli;
              return (
                <div
                  key={`${pid}::${cli.id}`}
                  style={{ display: isVisible ? "contents" : "none" }}
                >
                  <ClaudeTab cli={cli.id} profileId={pid} visible={isVisible} />
                </div>
              );
            }),
          )}

          {/* Floating shell window — hovers over the active panel, kept mounted
              once opened so its history survives hide/show. Suppressed in the
              mini window. */}
          {!mini && shellEverOpened && (
            <ShellOverlay
              open={shellOpen}
              maximized={shellMaximized}
              onToggleMax={toggleShellMax}
              onClose={closeShell}
            />
          )}
          {!mini && gitEverOpened && (
            <GitPanel
              open={gitOpen}
              maximized={gitMaximized}
              onToggleMax={toggleGitMax}
              onClose={closeGit}
            />
          )}
        </main>
      </div>

      {editorFor !== undefined && (
        <PersonaEditor
          editId={editorFor}
          load={get}
          save={save}
          onClose={() => setEditorFor(undefined)}
          onSaved={(id) => setActiveProfile(id)}
          onDeleted={(id) => {
            // If the active persona was deleted, fall back to the default.
            if (profileId === id) setActiveProfile("claude");
          }}
        />
      )}

      {celebrate &&
        (isWorldCup ? (
          <GoalConfetti onDone={() => setCelebrate(false)} />
        ) : isTheoi ? (
          <OracleDescent onDone={() => setCelebrate(false)} />
        ) : null)}
    </div>
  );
}
