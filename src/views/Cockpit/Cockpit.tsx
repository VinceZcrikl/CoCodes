import { useEffect, useState } from "react";
import { Bot, Plus } from "lucide-react";
import ClaudeTab from "../Claude/ClaudeTab";
import WindowControls from "./WindowControls";
import ProfileConstellation from "../Persona/ProfileConstellation";
import PersonaAvatar from "../Persona/PersonaAvatar";
import PersonaManager from "../Persona/PersonaManager";
import { usePersonas } from "../../hooks/usePersonas";
import { useProfileStore } from "../../state/profileStore";
import { useThemeStore, installThemeSync } from "../../state/themeStore";
import { ORB_THEMES } from "../../state/orbThemes";
import { applyThemeVars } from "../../state/uiPalette";
import { useWindowStore } from "../../state/windowStore";

/** A CLI the cockpit can host. Phase 0 ships Claude; the others are placeholders
 *  the registry (§7 of the plan) will light up in later phases. */
interface CliDef {
  id: string;
  label: string;
  ready: boolean;
}

const CLIS: CliDef[] = [
  { id: "claude", label: "Claude", ready: true },
  { id: "codex", label: "Codex", ready: false },
  { id: "gemini", label: "Gemini", ready: false },
  { id: "grok", label: "Grok", ready: false },
  { id: "kimi", label: "Kimi", ready: false },
];

export default function Cockpit() {
  const activeCli = "claude";

  const themeName = useThemeStore((s) => s.name);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const mini = useWindowStore((s) => s.mini);

  const profileId = useProfileStore((s) => s.activeProfileId);
  const { personas } = usePersonas();
  const [personaOpen, setPersonaOpen] = useState(false);
  const activePersona = personas.find((p) => p.id === profileId);
  const activeName = activePersona?.name ?? profileId;
  const activeAvatar = activePersona?.avatar ?? "";

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
            {/* Row 1: current persona (left) · CLI tabs + window controls (right) */}
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
                <div
                  className="cockpit-tab-row"
                  role="tablist"
                  aria-label="AI coding CLIs"
                >
                  {CLIS.map((cli) => (
                    <button
                      key={cli.id}
                      type="button"
                      role="tab"
                      aria-selected={activeCli === cli.id}
                      className={`cockpit-tab${activeCli === cli.id ? " active" : ""}${
                        cli.ready ? "" : " disabled"
                      }`}
                      disabled={!cli.ready}
                      title={cli.ready ? cli.label : `${cli.label} — coming soon`}
                    >
                      {cli.label}
                      {!cli.ready && <span className="cockpit-tab-soon">soon</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="cockpit-tab add"
                    disabled
                    title="Add a CLI — coming soon"
                    aria-label="Add a CLI"
                  >
                    <Plus size={14} strokeWidth={2} />
                  </button>
                </div>

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

            {/* Row 2: full-width persona constellation (switch + add). */}
            <ProfileConstellation onManage={() => setPersonaOpen(true)} />
          </>
        )}

        <main className="cockpit-body">
          {activeCli === "claude" && <ClaudeTab />}
        </main>
      </div>

      {personaOpen && <PersonaManager onClose={() => setPersonaOpen(false)} />}
    </div>
  );
}
