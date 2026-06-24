import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowUp,
  BarChart2,
  BookOpen,
  Bot,
  Brain,
  Calendar,
  CheckCircle,
  Clipboard,
  Cloud,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Gauge,
  Gift,
  GitBranch,
  GitFork,
  GitMerge,
  GitPullRequest,
  Globe,
  HelpCircle,
  History,
  Info,
  Keyboard,
  Layers,
  Link,
  List,
  LogIn,
  LogOut,
  MessageCircle,
  MessageSquare,
  Minimize2,
  Monitor,
  Moon,
  Package,
  Palette,
  Pencil,
  Play,
  Plug,
  Radio,
  RefreshCw,
  Repeat,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Star,
  Target,
  Terminal,
  Users,
  Wand2,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────

type CatId = "session" | "code" | "info" | "ai" | "config" | "connect" | "account";

interface Cmd {
  slash: string;
  label: string;
  desc: string;
  Icon: LucideIcon;
  cat: CatId;
  /** false = insert only — command needs additional arguments */
  submit: boolean;
}

interface Cat {
  id: CatId;
  label: string;
  color: string;
}

// ── Command definitions ─────────────────────────────────────────────

const CATS: Cat[] = [
  { id: "session", label: "Session",  color: "#d0a76f" },
  { id: "code",    label: "Code",     color: "#5dd6c5" },
  { id: "info",    label: "Info",     color: "#7eb8f7" },
  { id: "ai",      label: "AI & Mode",color: "#e8b04a" },
  { id: "config",  label: "Config",   color: "#b48ee0" },
  { id: "connect", label: "Connect",  color: "#6bcb8b" },
  { id: "account", label: "Account",  color: "#e07e7e" },
];

const CMDS: Cmd[] = [
  // ── Session ──────────────────────────────────────────────────────
  { slash: "/clear",            label: "Clear",          desc: "Start a new session with empty context (previous session stays on disk)",  Icon: RotateCcw,    cat: "session", submit: true  },
  { slash: "/compact",          label: "Compact",        desc: "Free up context by summarizing the conversation so far",                   Icon: Layers,       cat: "session", submit: true  },
  { slash: "/resume",           label: "Resume",         desc: "Resume a previous conversation",                                           Icon: History,      cat: "session", submit: true  },
  { slash: "/branch",           label: "Branch",         desc: "Create a branch of the current conversation at this point",                Icon: GitBranch,    cat: "session", submit: true  },
  { slash: "/fork",             label: "Fork",           desc: "Spawn a background agent that inherits the full conversation",             Icon: GitFork,      cat: "session", submit: true  },
  { slash: "/rewind",           label: "Rewind",         desc: "Restore the code and/or conversation to a previous point",                Icon: RotateCcw,    cat: "session", submit: true  },
  { slash: "/export",           label: "Export",         desc: "Export the current conversation to a file or clipboard",                   Icon: Download,     cat: "session", submit: true  },
  { slash: "/background",       label: "Background",     desc: "Send this session to the background and free the terminal",               Icon: Moon,         cat: "session", submit: true  },
  { slash: "/recap",            label: "Recap",          desc: "Generate a one-line session recap now",                                    Icon: ScrollText,   cat: "session", submit: true  },
  { slash: "/rename",           label: "Rename",         desc: "Rename the current conversation",                                         Icon: Pencil,       cat: "session", submit: false },
  { slash: "/copy",             label: "Copy",           desc: "Copy Claude's last response to clipboard (or /copy N for Nth-latest)",    Icon: Copy,         cat: "session", submit: true  },
  { slash: "/exit",             label: "Exit",           desc: "Exit the CLI",                                                             Icon: LogOut,       cat: "session", submit: true  },

  // ── Code ─────────────────────────────────────────────────────────
  { slash: "/init",             label: "Init",           desc: "Initialize a new CLAUDE.md file with codebase documentation",             Icon: FilePlus2,    cat: "code",    submit: true  },
  { slash: "/review",           label: "Review",         desc: "Review a pull request",                                                   Icon: GitMerge,     cat: "code",    submit: true  },
  { slash: "/diff",             label: "Diff",           desc: "View uncommitted changes and per-turn diffs",                             Icon: GitPullRequest, cat: "code",  submit: true  },
  { slash: "/autofix-pr",       label: "Autofix PR",     desc: "Monitor and autofix any issues with the current PR",                      Icon: Wrench,       cat: "code",    submit: true  },
  { slash: "/security-review",  label: "Security",       desc: "Complete a security review of the pending changes on the current branch", Icon: ShieldCheck,  cat: "code",    submit: true  },
  { slash: "/simplify",         label: "Simplify",       desc: "Review the changed code for reuse, simplification, and efficiency",       Icon: Minimize2,    cat: "code",    submit: true  },
  { slash: "/verify",           label: "Verify",         desc: "Verify that a code change actually does what it's supposed to",           Icon: CheckCircle,  cat: "code",    submit: true  },
  { slash: "/run",              label: "Run",            desc: "Launch and drive this project's app to confirm a change is working",      Icon: Play,         cat: "code",    submit: true  },
  { slash: "/add-dir",          label: "Add Dir",        desc: "Add a new working directory to this session",                             Icon: FolderPlus,   cat: "code",    submit: false },
  { slash: "/cd",               label: "Change Dir",     desc: "Move this session to a new working directory",                            Icon: FolderOpen,   cat: "code",    submit: false },

  // ── Info ─────────────────────────────────────────────────────────
  { slash: "/help",             label: "Help",           desc: "Show help and available commands",                                         Icon: HelpCircle,   cat: "info",    submit: true  },
  { slash: "/status",           label: "Status",         desc: "Show Claude Code status: version, model, account, API, and tool statuses",Icon: Info,         cat: "info",    submit: true  },
  { slash: "/doctor",           label: "Doctor",         desc: "Diagnose and verify your Claude Code installation and settings",          Icon: Activity,     cat: "info",    submit: true  },
  { slash: "/context",          label: "Context",        desc: "Visualize current context usage as a colored grid",                       Icon: BarChart2,    cat: "info",    submit: true  },
  { slash: "/insights",         label: "Insights",       desc: "Generate a report analyzing your Claude Code sessions",                   Icon: BarChart2,    cat: "info",    submit: true  },
  { slash: "/release-notes",    label: "What's New",     desc: "View release notes",                                                      Icon: Star,         cat: "info",    submit: true  },
  { slash: "/skills",           label: "Skills",         desc: "List available skills",                                                   Icon: List,         cat: "info",    submit: true  },

  // ── AI & Mode ────────────────────────────────────────────────────
  { slash: "/model",            label: "Model",          desc: "Set the AI model for Claude Code (e.g. /model claude-opus-4-8)",          Icon: Bot,          cat: "ai",      submit: false },
  { slash: "/fast",             label: "Fast Mode",      desc: "Toggle fast mode — uses Opus 4.8 with faster output",                    Icon: Zap,          cat: "ai",      submit: true  },
  { slash: "/effort",           label: "Effort",         desc: "Set effort level for model usage",                                        Icon: Gauge,        cat: "ai",      submit: false },
  { slash: "/advisor",          label: "Advisor",        desc: "Let Claude consult a stronger model at key moments",                      Icon: Brain,        cat: "ai",      submit: true  },
  { slash: "/plan",             label: "Plan",           desc: "Enable plan mode or view the current session plan",                       Icon: Clipboard,    cat: "ai",      submit: true  },
  { slash: "/goal",             label: "Goal",           desc: "Set a goal Claude checks before stopping",                                Icon: Target,       cat: "ai",      submit: false },
  { slash: "/loop",             label: "Loop",           desc: "Run a prompt or slash command on a recurring interval",                   Icon: Repeat,       cat: "ai",      submit: false },
  { slash: "/agents",           label: "Agents",         desc: "Manage agent configurations",                                             Icon: Users,        cat: "ai",      submit: true  },
  { slash: "/focus",            label: "Focus",          desc: "Toggle focus view — just your prompt, summary, and response",             Icon: Eye,          cat: "ai",      submit: true  },
  { slash: "/btw",              label: "BTW",            desc: "Ask a quick side question without interrupting the main conversation",    Icon: MessageCircle, cat: "ai",     submit: false },
  { slash: "/ultraplan",        label: "Ultraplan",      desc: "Draft an editable plan in Claude Code on the web",                       Icon: Wand2,        cat: "ai",      submit: true  },
  { slash: "/ultrareview",      label: "Ultrareview",    desc: "Start a cloud agent that finds and verifies bugs in your branch",         Icon: Search,       cat: "ai",      submit: true  },

  // ── Config ───────────────────────────────────────────────────────
  { slash: "/config",           label: "Config",         desc: "Open settings",                                                           Icon: Settings,     cat: "config",  submit: true  },
  { slash: "/permissions",      label: "Permissions",    desc: "Manage allow and deny tool permission rules",                             Icon: ShieldCheck,  cat: "config",  submit: true  },
  { slash: "/keybindings",      label: "Keybindings",    desc: "Open your keyboard shortcuts file",                                       Icon: Keyboard,     cat: "config",  submit: true  },
  { slash: "/hooks",            label: "Hooks",          desc: "View hook configurations for tool events",                               Icon: Link,         cat: "config",  submit: true  },
  { slash: "/theme",            label: "Theme",          desc: "Change the theme",                                                        Icon: Palette,      cat: "config",  submit: true  },
  { slash: "/color",            label: "Color",          desc: "Set the prompt bar color for this session",                              Icon: Sliders,      cat: "config",  submit: false },
  { slash: "/tui",              label: "TUI",            desc: "Set the terminal UI renderer (default | fullscreen)",                    Icon: Terminal,     cat: "config",  submit: false },
  { slash: "/terminal-setup",   label: "Shell Setup",    desc: "Install Shift+Enter key binding for newlines",                           Icon: Terminal,     cat: "config",  submit: true  },
  { slash: "/privacy-settings", label: "Privacy",        desc: "View and update your privacy settings",                                  Icon: EyeOff,       cat: "config",  submit: true  },
  { slash: "/sandbox",          label: "Sandbox",        desc: "Configure sandbox settings",                                             Icon: ShieldCheck,  cat: "config",  submit: true  },
  { slash: "/update-config",    label: "Update Config",  desc: "Configure the Claude Code harness via settings.json",                    Icon: RefreshCw,    cat: "config",  submit: false },

  // ── Connect ──────────────────────────────────────────────────────
  { slash: "/mcp",              label: "MCP",            desc: "Manage MCP servers (add / list / remove)",                               Icon: Plug,         cat: "connect", submit: false },
  { slash: "/ide",              label: "IDE",            desc: "Manage IDE integrations and show status",                                Icon: Code2,        cat: "connect", submit: true  },
  { slash: "/chrome",           label: "Chrome",         desc: "Open Claude in Chrome (beta) settings",                                  Icon: Globe,        cat: "connect", submit: true  },
  { slash: "/desktop",          label: "Desktop",        desc: "Continue the current session in Claude Desktop",                         Icon: Monitor,      cat: "connect", submit: true  },
  { slash: "/mobile",           label: "Mobile",         desc: "Show QR code to download the Claude mobile app",                         Icon: Smartphone,   cat: "connect", submit: true  },
  { slash: "/install-github-app",label: "GitHub App",   desc: "Set up Claude GitHub Actions for a repository",                          Icon: GitBranch,    cat: "connect", submit: true  },
  { slash: "/install-slack-app", label: "Slack App",    desc: "Install the Claude Slack app",                                           Icon: MessageSquare, cat: "connect", submit: true  },
  { slash: "/teleport",         label: "Teleport",       desc: "Resume a Claude Code session from claude.ai",                            Icon: Zap,          cat: "connect", submit: true  },
  { slash: "/remote-control",   label: "Remote",         desc: "Control this session from your phone or claude.ai/code",                Icon: Smartphone,   cat: "connect", submit: true  },
  { slash: "/remote-env",       label: "Remote Env",     desc: "Choose the default environment for cloud agents",                        Icon: Cloud,        cat: "connect", submit: false },
  { slash: "/plugin",           label: "Plugin",         desc: "Manage Claude Code plugins",                                             Icon: Package,      cat: "connect", submit: true  },
  { slash: "/reload-plugins",   label: "Reload Plugins", desc: "Activate pending plugin changes in the current session",                Icon: RefreshCw,    cat: "connect", submit: true  },
  { slash: "/reload-skills",    label: "Reload Skills",  desc: "Pick up skills added or changed on disk during this session",            Icon: RefreshCw,    cat: "connect", submit: true  },
  { slash: "/schedule",         label: "Schedule",       desc: "Create, update, list, or run scheduled cloud agent routines",            Icon: Calendar,     cat: "connect", submit: false },
  { slash: "/tasks",            label: "Tasks",          desc: "View and manage everything running in the background",                   Icon: List,         cat: "connect", submit: true  },

  // ── Account ──────────────────────────────────────────────────────
  { slash: "/login",            label: "Login",          desc: "Sign in with your Anthropic account",                                     Icon: LogIn,        cat: "account", submit: true  },
  { slash: "/logout",           label: "Logout",         desc: "Sign out from your Anthropic account",                                   Icon: LogOut,       cat: "account", submit: true  },
  { slash: "/memory",           label: "Memory",         desc: "Open a memory file in your editor",                                       Icon: BookOpen,     cat: "account", submit: true  },
  { slash: "/feedback",         label: "Feedback",       desc: "Submit feedback, report a bug, or share your conversation",              Icon: MessageSquare, cat: "account", submit: true },
  { slash: "/passes",           label: "Passes",         desc: "Share a free week of Claude Code with friends and earn usage credits",   Icon: Gift,         cat: "account", submit: true  },
  { slash: "/upgrade",          label: "Upgrade",        desc: "Upgrade to Max for higher rate limits and more Opus",                    Icon: ArrowUp,      cat: "account", submit: true  },
  { slash: "/powerup",          label: "Powerup",        desc: "Discover Claude Code features through quick interactive lessons",         Icon: Sparkles,     cat: "account", submit: true  },
  { slash: "/team-onboarding",  label: "Onboarding",     desc: "Help teammates ramp on Claude Code with a guide from your usage",        Icon: Users,        cat: "account", submit: true  },
  { slash: "/statusline",       label: "Status Line",    desc: "Set up Claude Code's status line UI",                                    Icon: Activity,     cat: "account", submit: true  },
  { slash: "/radio",            label: "Radio",          desc: "Listen to Claude FM lo-fi radio",                                         Icon: Radio,        cat: "account", submit: true  },
  { slash: "/stickers",         label: "Stickers",       desc: "Order Claude Code stickers",                                              Icon: Star,         cat: "account", submit: true  },
];

// ── CommandPalette component ────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCommand: (slash: string, submit: boolean) => void;
}

/** Detailed hover explanation for a command chip — what the chip's icon+label
 *  alone can't convey. Anchored to the hovered chip; flips above/below to stay
 *  on screen. */
interface TipState {
  cmd: Cmd;
  color: string;
  cx: number;
  top: number;
  bottom: number;
}

export default function CommandPalette({ open, onClose, onCommand }: Props) {
  const [query, setQuery] = useState("");
  const [tip, setTip] = useState<TipState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTip(null);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

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
      <div className="cmd-palette-search">
        <Search size={12} strokeWidth={1.75} className="cmd-palette-search-ico" />
        <input
          ref={inputRef}
          className="cmd-palette-input"
          placeholder="Search slash commands…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setTip(null); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "Enter" && filtered && filtered.length > 0) run(filtered[0]);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        <button className="cmd-palette-x" onClick={onClose} aria-label="Close palette">
          <X size={11} strokeWidth={2.5} />
        </button>
      </div>

      <div className="cmd-palette-body">
        {filtered ? (
          filtered.length > 0 ? (
            <div className="cmd-palette-flat">
              {filtered.map((c) => (
                <FlatRow key={c.slash} cmd={c} color={catColor(c.cat)} onRun={() => run(c)} />
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
                <span className="cmd-cat-label" style={{ color: cat.color }}>{cat.label}</span>
                <div className="cmd-cat-grid">
                  {cmds.map((c) => (
                    <Chip
                      key={c.slash}
                      cmd={c}
                      color={cat.color}
                      onRun={() => run(c)}
                      onHover={(el) => {
                        const r = el.getBoundingClientRect();
                        setTip({
                          cmd: c,
                          color: cat.color,
                          cx: r.left + r.width / 2,
                          top: r.top,
                          bottom: r.bottom,
                        });
                      }}
                      onLeave={() => setTip((t) => (t?.cmd === c ? null : t))}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {tip && <CommandTip tip={tip} />}
    </div>
  );
}

/** The floating explanation, portaled to <body> so the palette's `overflow:
 *  hidden` can't clip it. Flips above the chip by default; drops below when the
 *  chip is too near the top of the viewport. */
function CommandTip({ tip }: { tip: TipState }) {
  const MARGIN = 10;
  const HALF = 130; // half of max-width, for horizontal clamping
  const below = tip.top < 130;
  const left = Math.min(
    Math.max(tip.cx, MARGIN + HALF),
    window.innerWidth - MARGIN - HALF,
  );
  return createPortal(
    <div
      className="cmd-tip"
      role="tooltip"
      style={{
        left,
        top: below ? tip.bottom + 8 : tip.top - 8,
        transform: below ? "translateX(-50%)" : "translate(-50%, -100%)",
      }}
    >
      <span className="cmd-tip-head">
        <span className="cmd-tip-slash" style={{ color: tip.color }}>
          {tip.cmd.slash}
        </span>
        <span className="cmd-tip-label">{tip.cmd.label}</span>
      </span>
      <span className="cmd-tip-desc">{tip.cmd.desc}</span>
      {!tip.cmd.submit && (
        <span className="cmd-tip-args">Inserts only — needs arguments</span>
      )}
    </div>,
    document.body,
  );
}

function Chip({
  cmd,
  color,
  onRun,
  onHover,
  onLeave,
}: {
  cmd: Cmd;
  color: string;
  onRun: () => void;
  onHover: (el: HTMLElement) => void;
  onLeave: () => void;
}) {
  const { Icon } = cmd;
  return (
    <button
      type="button"
      className="cmd-chip"
      aria-label={`${cmd.slash} — ${cmd.desc}`}
      onClick={onRun}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={onLeave}
      onFocus={(e) => onHover(e.currentTarget)}
      onBlur={onLeave}
      style={{ "--chip": color } as React.CSSProperties}
    >
      <span className="cmd-chip-ico"><Icon size={14} strokeWidth={1.75} /></span>
      <span className="cmd-chip-txt">{cmd.label}</span>
    </button>
  );
}

function FlatRow({ cmd, color, onRun }: { cmd: Cmd; color: string; onRun: () => void }) {
  const { Icon } = cmd;
  return (
    <button
      type="button"
      className="cmd-row"
      onClick={onRun}
      style={{ "--chip": color } as React.CSSProperties}
    >
      <span className="cmd-row-ico"><Icon size={13} strokeWidth={1.75} /></span>
      <span className="cmd-row-slash">{cmd.slash}</span>
      <span className="cmd-row-desc">{cmd.desc}</span>
      {!cmd.submit && <span className="cmd-row-args">+ args</span>}
    </button>
  );
}
