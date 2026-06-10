import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart2,
  BookOpen,
  Bot,
  Code2,
  FilePlus2,
  GitPullRequest,
  HelpCircle,
  Info,
  Keyboard,
  Layers,
  LogIn,
  LogOut,
  MessageSquare,
  Plug,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Data types ──────────────────────────────────────────────────────

type CatId = "session" | "context" | "info" | "config" | "account";

interface Cmd {
  slash: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  cat: CatId;
  /** false = insert only (command needs arguments the user types) */
  submit: boolean;
}

interface Cat {
  id: CatId;
  label: string;
  color: string;
}

// ── Command registry ────────────────────────────────────────────────

const CATS: Cat[] = [
  { id: "session", label: "Session",  color: "#d0a76f" },
  { id: "context", label: "Context",  color: "#5dd6c5" },
  { id: "info",    label: "Info",     color: "#7eb8f7" },
  { id: "config",  label: "Config",   color: "#b48ee0" },
  { id: "account", label: "Account",  color: "#e07e7e" },
];

const CMDS: Cmd[] = [
  // Session
  { slash: "/clear",         label: "Clear",        desc: "Erase conversation history and free the context window",          Icon: RotateCcw,   cat: "session", submit: true  },
  { slash: "/compact",       label: "Compact",      desc: "Summarise history to reclaim context without losing thread",      Icon: Layers,      cat: "session", submit: true  },
  { slash: "/reset",         label: "Reset",        desc: "Reset all settings back to defaults",                             Icon: RefreshCw,   cat: "session", submit: true  },
  { slash: "/exit",          label: "Exit",         desc: "Exit Claude Code",                                                Icon: LogOut,      cat: "session", submit: true  },
  // Context
  { slash: "/init",          label: "Init",         desc: "Create a CLAUDE.md guide for this project",                      Icon: FilePlus2,   cat: "context", submit: true  },
  { slash: "/memory",        label: "Memory",       desc: "Open and edit your memory files",                                Icon: BookOpen,    cat: "context", submit: true  },
  { slash: "/review",        label: "Review",       desc: "Ask Claude to review the current code",                          Icon: Code2,       cat: "context", submit: true  },
  { slash: "/pr_comments",   label: "PR",           desc: "Fetch and display pull-request comments",                        Icon: GitPullRequest, cat: "context", submit: true },
  // Info
  { slash: "/help",          label: "Help",         desc: "List all available commands",                                    Icon: HelpCircle,  cat: "info",    submit: true  },
  { slash: "/cost",          label: "Cost",         desc: "Show token usage and cost for this session",                     Icon: BarChart2,   cat: "info",    submit: true  },
  { slash: "/doctor",        label: "Doctor",       desc: "Diagnose your Claude Code installation health",                  Icon: Activity,    cat: "info",    submit: true  },
  { slash: "/status",        label: "Status",       desc: "Show account and API connection status",                         Icon: Info,        cat: "info",    submit: true  },
  { slash: "/release-notes", label: "What's New",   desc: "View the latest release notes and changelog",                   Icon: ScrollText,  cat: "info",    submit: true  },
  // Config
  { slash: "/model",         label: "Model",        desc: "Switch the AI model  (e.g. /model claude-opus-4-8)",             Icon: Bot,         cat: "config",  submit: false },
  { slash: "/config",        label: "Config",       desc: "Inspect and edit Claude Code settings",                          Icon: Settings,    cat: "config",  submit: true  },
  { slash: "/permissions",   label: "Permissions",  desc: "View and manage tool permissions",                               Icon: ShieldCheck, cat: "config",  submit: true  },
  { slash: "/mcp",           label: "MCP",          desc: "Manage MCP server connections  (add / list / remove)",           Icon: Plug,        cat: "config",  submit: false },
  { slash: "/terminal-setup",label: "Shell",        desc: "Install shell integration for your terminal emulator",           Icon: Terminal,    cat: "config",  submit: true  },
  { slash: "/vim",           label: "Vim Mode",     desc: "Toggle vim-style keybindings on / off",                         Icon: Keyboard,    cat: "config",  submit: true  },
  // Account
  { slash: "/login",         label: "Login",        desc: "Switch to a different Anthropic account",                       Icon: LogIn,       cat: "account", submit: true  },
  { slash: "/logout",        label: "Logout",       desc: "Log out of the current account",                                Icon: LogOut,      cat: "account", submit: true  },
  { slash: "/feedback",      label: "Feedback",     desc: "Send feedback directly to the Anthropic team",                  Icon: MessageSquare, cat: "account", submit: true },
  { slash: "/bug",           label: "Bug",          desc: "Report a bug to Anthropic",                                     Icon: AlertCircle, cat: "account", submit: true  },
];

// ── CommandPalette component ────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCommand: (slash: string, submit: boolean) => void;
}

export default function CommandPalette({ open, onClose, onCommand }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input each time the palette opens.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  // Escape closes the palette.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      q
        ? CMDS.filter(
            (c) =>
              c.slash.includes(q) ||
              c.label.toLowerCase().includes(q) ||
              c.desc.toLowerCase().includes(q),
          )
        : null,
    [q],
  );

  if (!open) return null;

  const run = (cmd: Cmd) => {
    onCommand(cmd.slash, cmd.submit);
    onClose();
  };

  const catColor = (id: CatId) => CATS.find((c) => c.id === id)?.color ?? "";

  return (
    <div className="cmd-palette" role="dialog" aria-label="Command palette">
      {/* Search bar */}
      <div className="cmd-palette-search">
        <Search size={12} strokeWidth={1.75} className="cmd-palette-search-ico" />
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder="Search slash commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "Enter" && filtered && filtered.length > 0) {
              run(filtered[0]);
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="cmd-palette-x" onClick={onClose} aria-label="Close palette">
          <X size={11} strokeWidth={2.5} />
        </button>
      </div>

      {/* Content: flat search results or categorised grid */}
      <div className="cmd-palette-body">
        {filtered ? (
          filtered.length > 0 ? (
            <div className="cmd-palette-flat">
              {filtered.map((c) => (
                <FlatRow
                  key={c.slash}
                  cmd={c}
                  color={catColor(c.cat)}
                  onRun={() => run(c)}
                />
              ))}
            </div>
          ) : (
            <div className="cmd-palette-empty">No commands match "{query}"</div>
          )
        ) : (
          CATS.map((cat) => {
            const cmds = CMDS.filter((c) => c.cat === cat.id);
            return (
              <div key={cat.id} className="cmd-cat">
                <span
                  className="cmd-cat-label"
                  style={{ color: cat.color }}
                >
                  {cat.label}
                </span>
                <div className="cmd-cat-grid">
                  {cmds.map((c) => (
                    <Chip
                      key={c.slash}
                      cmd={c}
                      color={cat.color}
                      onRun={() => run(c)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Chip (grid view) ────────────────────────────────────────────────

function Chip({
  cmd,
  color,
  onRun,
}: {
  cmd: Cmd;
  color: string;
  onRun: () => void;
}) {
  const { Icon } = cmd;
  return (
    <button
      type="button"
      className="cmd-chip"
      title={cmd.desc}
      onClick={onRun}
      style={{ "--chip": color } as React.CSSProperties}
    >
      <span className="cmd-chip-ico">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <span className="cmd-chip-txt">{cmd.label}</span>
    </button>
  );
}

// ── FlatRow (search view) ───────────────────────────────────────────

function FlatRow({
  cmd,
  color,
  onRun,
}: {
  cmd: Cmd;
  color: string;
  onRun: () => void;
}) {
  const { Icon } = cmd;
  return (
    <button
      type="button"
      className="cmd-row"
      onClick={onRun}
      style={{ "--chip": color } as React.CSSProperties}
    >
      <span className="cmd-row-ico">
        <Icon size={13} strokeWidth={1.75} />
      </span>
      <span className="cmd-row-slash">{cmd.slash}</span>
      <span className="cmd-row-desc">{cmd.desc}</span>
      {!cmd.submit && <span className="cmd-row-args">+ args</span>}
    </button>
  );
}
