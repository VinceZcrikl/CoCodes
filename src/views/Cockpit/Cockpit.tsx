import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import ClaudeTab from "../Claude/ClaudeTab";
import WindowControls from "./WindowControls";
import PersonaAvatar from "../Persona/PersonaAvatar";
import PersonaManager from "../Persona/PersonaManager";
import { usePersonas } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import { useThemeStore, installThemeSync } from "../../state/themeStore";
import { ORB_THEMES } from "../../state/orbThemes";
import { applyThemeVars } from "../../state/uiPalette";
import { useWindowStore } from "../../state/windowStore";

interface CliDef {
  id: string;
  label: string;
  ready: boolean;
}

const CLIS: CliDef[] = [
  { id: "claude", label: "Claude", ready: true },
  { id: "codex",  label: "Codex",  ready: true },
  { id: "gemini", label: "Gemini", ready: false },
  { id: "grok",   label: "Grok",   ready: true },
  { id: "kimi",   label: "Kimi",   ready: false },
];

const CLI_STORAGE_KEY = "openterminus:active-cli";

export default function Cockpit() {
  const [activeCli, setActiveCli] = useState<string>(
    () => localStorage.getItem(CLI_STORAGE_KEY) ?? "claude",
  );

  const themeName = useThemeStore((s) => s.name);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const mini = useWindowStore((s) => s.mini);

  const profileId = useProfileStore((s) => s.activeProfileId);
  const { personas } = usePersonas();
  const [personaOpen, setPersonaOpen] = useState(false);
  const activePersona = personas.find((p) => p.id === profileId);
  const activeName = activePersona?.name ?? profileId;
  const activeAvatar = activePersona?.avatar ?? "";

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

  useEffect(() => applyThemeVars(themeName), [themeName]);
  useEffect(() => installThemeSync(), []);

  return (
    <div className={`cockpit${mini ? " mini" : ""}`}>
      <div className="cockpit-frame" aria-hidden="true" data-tauri-drag-region />
      <div className="cockpit-panel">
        {mini ? (
          <div className="cockpit-mini-bar" data-tauri-drag-region>
            <Bot size={14} strokeWidth={2} aria-hidden="true" />
            <span className="cockpit-mini-title">Open Terminus · {activeName}</span>
            <WindowControls />
          </div>
        ) : (
          <>
            {/* Single header row: current persona (left) · theme + window
                controls (right). Switch persona via the brand → manager;
                the active persona drives which CLI is shown. */}
            <nav className="cockpit-header" data-tauri-drag-region>
              <button
                type="button"
                className="cockpit-persona-brand"
                onClick={() => setPersonaOpen(true)}
                title="Manage personas"
              >
                <PersonaAvatar
                  id={profileId}
                  name={activeName}
                  avatar={activeAvatar}
                  className="cockpit-persona-brand-avatar"
                />
                <span className="cockpit-persona-brand-meta">
                  <span className="cockpit-persona-brand-name">{activeName}</span>
                  <span className="cockpit-persona-brand-status">ready</span>
                </span>
              </button>

              <div className="cockpit-header-right">
                <button
                  type="button"
                  className="cockpit-theme-dot"
                  onClick={cycleTheme}
                  title={`Theme: ${ORB_THEMES[themeName].label} — click to cycle`}
                  aria-label="Cycle theme"
                  style={{ background: ORB_THEMES[themeName].accent }}
                />
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
        </main>
      </div>

      {personaOpen && <PersonaManager onClose={() => setPersonaOpen(false)} />}
    </div>
  );
}
