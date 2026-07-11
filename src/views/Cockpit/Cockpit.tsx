import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ClaudeTab from "../Claude/ClaudeTab";
import WindowControls from "./WindowControls";
import AppLogo from "./AppLogo";
import ProfileConstellation from "../Persona/ProfileConstellation";
import PersonaEditor from "../Persona/PersonaEditor";
import PalettePanel from "./PalettePanel";
import UpdateButton, { checkForUpdate } from "./UpdateButton";
import AttentionCenter from "./AttentionCenter";
import AttentionInbox from "./AttentionInbox";
import { NAV_CLI_EVENT, type NavCliDetail } from "../../state/attentionNav";
import RingIcon from "./RingIcon";
import ThemeFrame from "./ThemeFrame";
import GoalConfetti from "./GoalConfetti";
import ThemeCelebrate from "./ThemeCelebrate";
import { usePersonas, useProviders, type PersonaDoc } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import { useLiveModels } from "../../state/liveModels";
import { usePaletteStore, installPaletteSync } from "../../state/paletteStore";
import { PANEL_PALETTES, resolveAccentColor } from "../../state/panelPalettes";
import { THEME_DECOR } from "../../state/themeDecor";
import { applyPaletteVars } from "../../state/uiPalette";
import { useWindowStore } from "../../state/windowStore";
import { useShellStore } from "../../state/shellStore";
import { useGitStore } from "../../state/gitStore";
import { useMcpStore } from "../../state/mcpStore";
import ShellOverlay from "../Claude/ShellOverlay";
import GitPanel from "../Git/GitPanel";
import McpPanel from "../MCP/McpPanel";
import McpConfigEditor from "../MCP/McpConfigEditor";
import PersonaOrb from "../PersonaOrb/PersonaOrb";
import { useMcp, type McpServer } from "../../hooks/useMcp";

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

const CLI_STORAGE_KEY = "cocodes:active-cli";

export default function Cockpit() {
  const [activeCli, setActiveCli] = useState<string>(
    () => localStorage.getItem(CLI_STORAGE_KEY) ?? "claude",
  );

  const paletteName = usePaletteStore((s) => s.name);
  const accent = usePaletteStore((s) => s.accent);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const accentColor = resolveAccentColor(PANEL_PALETTES[paletteName], accent);
  const mini = useWindowStore((s) => s.mini);

  // Every theme carries a decoration config (THEME_DECOR): a signature ring
  // glyph for the palette dot, a premium frame + wordmark, and a switch-in
  // celebration — all scoped under [data-palette]. World Cup alone keeps its
  // bespoke confetti; the rest flow through the generalised ThemeCelebrate.
  const decor = THEME_DECOR[paletteName];
  const isWorldCup = paletteName === "world-cup-2026";
  // A monotonically rising "ticket": each theme switch bumps it, which both
  // turns the celebration on and (via `key`) forces a fresh remount so the new
  // theme's particles are rebuilt — even when switching again mid-celebration.
  // 0 = no celebration showing.
  const [celebrateTick, setCelebrateTick] = useState(0);
  // Stable so the celebration's self-unmount timer isn't reset by the cockpit's
  // frequent re-renders (terminals update constantly) — an unstable onDone in
  // the child's timer effect deps would clear+restart the timer every render and
  // it would never fire.
  const endCelebrate = useCallback(() => setCelebrateTick(0), []);

  const profileId = useProfileStore((s) => s.activeProfileId);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const { personas, get, save } = usePersonas();
  const { providers } = useProviders();
  // undefined = editor closed, null = creating, string = editing that persona.
  const [editorFor, setEditorFor] = useState<string | null | undefined>(undefined);
  const activePersona = personas.find((p) => p.id === profileId);
  const activeName = activePersona?.name ?? profileId;

  // Recover from a stale active-profile that points at a persona which no longer
  // exists (e.g. one deleted in a past session — `cocodes:active-profile` was
  // never cleared). That left the constellation with NOTHING selected ("all
  // personas unselected") while the sidebar still showed the dead persona's
  // sessions; selecting any real persona then switched the per-persona session
  // store and the old group/sessions vanished with no way back. Once the list
  // has loaded, snap the active profile to a real persona (the default Claude
  // Code persona, else the first) so the UI is always in a consistent state.
  useEffect(() => {
    if (personas.length === 0) return; // list not loaded yet
    if (personas.some((p) => p.id === profileId)) return; // already valid
    const fallback = personas.find((p) => p.id === "claude") ?? personas[0];
    if (fallback) setActiveProfile(fallback.id);
  }, [personas, profileId, setActiveProfile]);

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

  // The CLI's own configured model (claude settings.json / codex config.toml).
  // null when the CLI picks dynamically with nothing pinned — then we show
  // "default" rather than a hardcoded guess that drifts from reality.
  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  const [codexModel, setCodexModel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void invoke<string | null>("claude_default_model").then(
      (m) => !cancelled && setClaudeModel(m),
    );
    void invoke<string | null>("codex_default_model").then(
      (m) => !cancelled && setCodexModel(m),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The real model the active persona runs: its base-model provider's model when
  // set; otherwise the CLI's own configured model; otherwise "default".
  const activeCliId = activeDoc?.cli ?? activePersona?.cli ?? "claude";
  const provider = activeDoc?.base_model
    ? providers.find((p) => p.id === activeDoc.base_model)
    : undefined;
  const cliModel =
    activeCliId === "claude" ? claudeModel : activeCliId === "codex" ? codexModel : null;
  // The real model read off the active persona's running session banner — most
  // accurate, so it wins over the injected/config value.
  const bannerModel = useLiveModels((s) => s.byProfile[profileId]);
  const modelLabel = bannerModel || provider?.model || cliModel || "default";

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

  // Attention navigation: a tray notification (or in-app banner) for a session
  // waiting on the user's authorization switches the persona + CLI tab here; the
  // matching ClaudeTab then selects the waiting session.
  useEffect(() => {
    const handler = (e: Event) => {
      const { profileId: pid, cli } = (e as CustomEvent<NavCliDetail>).detail;
      setActiveProfile(pid);
      if (CLIS.find((c) => c.id === cli && c.ready)) setActiveCli(cli);
    };
    window.addEventListener(NAV_CLI_EVENT, handler);
    return () => window.removeEventListener(NAV_CLI_EVENT, handler);
  }, [setActiveProfile]);

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

  // Floating Git panel — only used when the sidebar is collapsed (otherwise Git
  // lives in its sidebar tab). Toggled by the toolbar's git chip.
  const gitEverOpened = useGitStore((s) => s.everOpened);
  const gitOpen = useGitStore((s) => s.open);
  const gitMaximized = useGitStore((s) => s.maximized);
  const closeGit = useGitStore((s) => s.close);
  const toggleGitMax = useGitStore((s) => s.toggleMax);

  // MCP panel state.
  const mcpEverOpened = useMcpStore((s) => s.everOpened);
  const mcpOpen = useMcpStore((s) => s.open);
  const closeMcp = useMcpStore((s) => s.close);
  const { servers: mcpServers, loading: mcpLoading, toggle: mcpToggle, upsert: mcpUpsert, remove: mcpRemove, applyToClients } = useMcp();
  // undefined = editor closed, null = new custom, string = open preset by key, McpServer = editing existing.
  const [mcpEditing, setMcpEditing] = useState<McpServer | null | string | undefined>(undefined);

  useEffect(() => applyPaletteVars(paletteName, accent), [paletteName, accent]);
  useEffect(() => installPaletteSync(), []);

  // Check for updates 5s after launch, then quietly re-check every 30 minutes so
  // a version published while the app stays open surfaces the download button on
  // its own (the check is silent unless an update is found). We also re-check the
  // moment the window regains focus — so returning to a long-open app picks up a
  // release right away instead of waiting out the interval — and when the machine
  // wakes from sleep, since timers don't fire while suspended. Both are throttled
  // to at most once a minute so rapid focus/blur can't hammer the endpoint.
  useEffect(() => {
    let last = 0;
    const run = () => {
      const now = Date.now();
      if (now - last < 60 * 1000) return;
      last = now;
      void checkForUpdate();
    };
    // First check bypasses the throttle so it always runs, even if a focus event
    // fired during the 5s startup window.
    const t = window.setTimeout(() => { last = Date.now(); void checkForUpdate(); }, 5000);
    const i = window.setInterval(run, 30 * 60 * 1000);
    const onFocus = () => run();
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(i);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Celebration: fire when the user *switches into* a decorated theme (World Cup
  // → confetti, CoCodes → oracle descent) — not on every render, and not on a
  // relaunch that's already in it. The overlay rendered is chosen by palette.
  const prevPalette = useRef(paletteName);
  useEffect(() => {
    if (prevPalette.current !== paletteName) {
      setCelebrateTick((n) => n + 1);
    }
    prevPalette.current = paletteName;
  }, [paletteName]);

  // …and once on the very first launch after the seasonal rollout, so the
  // auto-activated theme still gets its kickoff (then never again on launch).
  useEffect(() => {
    if (paletteName !== "world-cup-2026") return;
    try {
      if (!localStorage.getItem("cocodes:wc2026-celebrated")) {
        localStorage.setItem("cocodes:wc2026-celebrated", "1");
        setCelebrateTick((n) => n + 1);
      }
    } catch { /* localStorage unavailable; skip the kickoff */ }
    // Run once on mount — the transition effect above covers later switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`cockpit${mini ? " mini" : ""}`}>
      <div className="cockpit-frame" aria-hidden="true" data-tauri-drag-region />
      {/* Premium frame + wordmark + signature motif for the active theme (not in
          mini). The motif echoes the theme — palmettes + constellation for
          Olympus, ivy for forest, snow for nordic, … */}
      {!mini && <ThemeFrame scope={paletteName} />}
      <div className="cockpit-panel">
        {mini ? (
          <div className="cockpit-mini-bar" data-tauri-drag-region>
            <AppLogo className="cockpit-mini-logo" />
            <span className="cockpit-mini-title">CoCodes · {activeName}</span>
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
                <UpdateButton />
                <div className="cockpit-palette-wrap">
                  <button
                    type="button"
                    className="cockpit-theme-dot"
                    onClick={() => setPaletteOpen((v) => !v)}
                    title={`Palette: ${PANEL_PALETTES[paletteName].label}`}
                    aria-label="Choose panel palette"
                    aria-expanded={paletteOpen}
                    style={{
                      // The ringed orb wants a neutral disc to pop against; the
                      // ring icon tints itself from `color` (the accent).
                      background: "#15151b",
                      color: accentColor,
                    }}
                  >
                    <span className="cockpit-theme-ring-wrap">
                      {/* A core sized to read against the ring — Olympus uses a
                          cool celestial core so the gold laurel doesn't wash out;
                          others sit the ring over a faint accent core. */}
                      <PersonaOrb color={decor.ringCore} reactive={false} spin={0.5} />
                      <RingIcon kind={decor.ringIcon} className="cockpit-theme-ring" />
                    </span>
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
                  <ClaudeTab
                    cli={cli.id}
                    profileId={pid}
                    visible={isVisible}
                    modelLabel={isVisible ? modelLabel : undefined}
                  />
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
          {!mini && mcpEverOpened && (
            <McpPanel
              open={mcpOpen}
              servers={mcpServers}
              loading={mcpLoading}
              onClose={closeMcp}
              onConfigurePreset={(key) => setMcpEditing(key)}
              onAdd={() => setMcpEditing(null)}
              onEdit={(s) => setMcpEditing(s)}
              onToggle={(id) => void mcpToggle(id)}
              onDelete={(id) => void mcpRemove(id)}
            />
          )}
        </main>
      </div>

      {mcpEditing !== undefined && (
        <McpConfigEditor
          server={typeof mcpEditing === "string" ? null : mcpEditing}
          presetKey={typeof mcpEditing === "string" ? mcpEditing : undefined}
          onSave={async (server, clientIds) => {
            await mcpUpsert(server);
            if (clientIds.length > 0) {
              await applyToClients(server, clientIds);
            }
          }}
          onClose={() => setMcpEditing(undefined)}
        />
      )}

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

      {celebrateTick > 0 &&
        (isWorldCup ? (
          <GoalConfetti key={celebrateTick} onDone={endCelebrate} />
        ) : (
          <ThemeCelebrate key={celebrateTick} name={paletteName} onDone={endCelebrate} />
        ))}

      <AttentionCenter />
      <AttentionInbox />
    </div>
  );
}
