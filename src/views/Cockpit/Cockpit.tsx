import { useEffect, useState } from "react";
import ClaudeTab from "../Claude/ClaudeTab";
import WindowControls from "./WindowControls";
import AppLogo from "./AppLogo";
import ProfileConstellation from "../Persona/ProfileConstellation";
import PersonaEditor from "../Persona/PersonaEditor";
import { usePersonas, useProviders, type PersonaDoc } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import { useThemeStore, installThemeSync } from "../../state/themeStore";
import { ORB_THEMES } from "../../state/orbThemes";
import { applyThemeVars } from "../../state/uiPalette";
import { useWindowStore } from "../../state/windowStore";

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
  { id: "kimi",   label: "Kimi",   ready: false, defaultModel: "Kimi K2" },
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

  // The real model the active persona runs: its base-model preset's model name
  // when set, otherwise the CLI's actual default model.
  const activeCliId = activeDoc?.cli ?? activePersona?.cli ?? "claude";
  const provider = activeDoc?.base_model
    ? providers.find((p) => p.id === activeDoc.base_model)
    : undefined;
  const modelLabel =
    provider?.model ||
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

  useEffect(() => applyThemeVars(themeName), [themeName]);
  useEffect(() => installThemeSync(), []);

  return (
    <div className={`cockpit${mini ? " mini" : ""}`}>
      <div className="cockpit-frame" aria-hidden="true" data-tauri-drag-region />
      <div className="cockpit-panel">
        {mini ? (
          <div className="cockpit-mini-bar" data-tauri-drag-region>
            <AppLogo className="cockpit-mini-logo" />
            <span className="cockpit-mini-title">Open Terminus · {activeName}</span>
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

      {editorFor !== undefined && (
        <PersonaEditor
          editId={editorFor}
          load={get}
          save={save}
          onClose={() => setEditorFor(undefined)}
          onSaved={(id) => setActiveProfile(id)}
        />
      )}
    </div>
  );
}
