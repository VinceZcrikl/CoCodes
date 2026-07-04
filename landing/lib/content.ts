export type Lang = "en" | "zh";

export const GITHUB_URL = "https://github.com/VinceZcrikl/CoCodes";
export const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

export interface PersonaSpec {
  id: string;
  name: string;
  cli: string;
  model: string;
  color: string;
  monogram: string;
  blurb: { en: string; zh: string };
}

export const PERSONAS: PersonaSpec[] = [
  {
    id: "claude",
    name: "Claude Code",
    cli: "claude",
    model: "Opus 4.8",
    color: "#e8c879",
    monogram: "C",
    blurb: {
      en: "The default pilot. Ships a rich SOUL with delegation instincts — it can hand tasks to the other personas mid-flight.",
      zh: "默认驾驶员。自带完整 SOUL 与委派本能——工作中途即可把任务派给其他 persona。",
    },
  },
  {
    id: "codex",
    name: "Codex",
    cli: "codex",
    model: "GPT-5.5",
    color: "#c4cad2",
    monogram: "X",
    blurb: {
      en: "The systems engineer. Receives [TASK→codex] blocks and returns results straight into the originating pane.",
      zh: "系统工程师。接收 [TASK→codex] 任务块，把结果直接送回发起的窗格。",
    },
  },
  {
    id: "grok",
    name: "Grok Build",
    cli: "grok",
    model: "Grok 4",
    color: "#9aa6f5",
    monogram: "G",
    blurb: {
      en: "The fast prototyper. Point it at a pane, drop the avatar, and it respawns the session under its own SOUL.",
      zh: "快速原型手。把头像拖进任意窗格，会话立刻以它的 SOUL 重生。",
    },
  },
  {
    id: "kimi",
    name: "Kimi Code",
    cli: "kimi",
    model: "Kimi K2.7",
    color: "#74cc98",
    monogram: "K",
    blurb: {
      en: "The long-context reader. Its persona carries a Moonshot base-model preset — key in once, switch forever.",
      zh: "长上下文阅读者。persona 内置 Moonshot 模型预设——密钥填一次，随时切换。",
    },
  },
];

export interface Content {
  nav: {
    features: string;
    personas: string;
    themes: string;
    download: string;
    github: string;
  };
  hero: {
    badge: string;
    title1: string;
    title2: string;
    subtitle: string;
    downloadMac: string;
    downloadOther: string;
    platforms: string;
    scrollHint: string;
  };
  live: {
    kicker: string;
    title: string;
    body: string;
    cards: { title: string; body: string; tag: string }[];
  };
  personas: {
    kicker: string;
    title: string;
    body: string;
    soulFiles: string;
    dragHint: string;
    perModel: string;
    perModelBody: string;
    cliLabel: string;
    modelLabel: string;
  };
  delegation: {
    kicker: string;
    title: string;
    body: string;
    steps: { title: string; body: string }[];
    paneNote: string;
  };
  providers: {
    kicker: string;
    title: string;
    body: string;
    ready: string;
    soon: string;
    presetsTitle: string;
    presetsBody: string;
    authTitle: string;
    authBody: string;
  };
  themes: {
    kicker: string;
    title: string;
    body: string;
    lightBadge: string;
    seasonal: string;
    tryHint: string;
  };
  bento: {
    kicker: string;
    title: string;
    items: { title: string; body: string }[];
  };
  cta: {
    title: string;
    body: string;
    download: string;
    orBuild: string;
    requirements: string;
  };
  footer: {
    tagline: string;
    license: string;
    built: string;
  };
}

export const CONTENT: Record<Lang, Content> = {
  en: {
    nav: {
      features: "Features",
      personas: "Personas",
      themes: "Themes",
      download: "Download",
      github: "GitHub",
    },
    hero: {
      badge: "macOS · Windows · Linux — MIT licensed",
      title1: "Agent coding",
      title2: "cockpit",
      subtitle:
        "A terminal-native desktop home for your AI coding CLIs. Claude Code, Codex, Grok and Kimi run live inside real pseudo-terminals — nothing re-implemented, nothing proxied. You fly the actual CLI, with a layer of orchestration on top.",
      downloadMac: "Download for macOS",
      downloadOther: "All downloads",
      platforms: "Free & open source · auto-updates from GitHub Releases",
      scrollHint: "Enter the cockpit",
    },
    live: {
      kicker: "The difference",
      title: "Live embedded CLIs, not a wrapper.",
      body: "Most “AI IDE” chrome re-implements the agent behind an API. CoCodes spawns the real CLI in a real PTY and renders it at full fidelity — every keybinding, every slash command, every update the vendor ships lands in your cockpit on day one.",
      cards: [
        {
          title: "True pseudo-terminals",
          body: "Each pane is a genuine PTY via portable-pty. The CLI believes it owns a terminal, because it does.",
          tag: "portable-pty",
        },
        {
          title: "WebGL rendering",
          body: "xterm.js with the WebGL addon — buttery scrollback and ligature-perfect output at any pane count.",
          tag: "xterm.js · WebGL",
        },
        {
          title: "Sessions that survive",
          body: "PTYs outlive reloads with reconnect + replay. Every pane maps to its own conversation via --session-id / --resume.",
          tag: "keep-alive · --resume",
        },
      ],
    },
    personas: {
      kicker: "A constellation of personas",
      title: "Give every session a soul.",
      body: "A persona is a saved identity: a SOUL.md system prompt, a MEMORY.md, a USER.md, a mascot avatar, a preferred CLI and its own base model. Injected via --append-system-prompt-file — or full replace mode that swaps the system prompt entirely.",
      soulFiles: "What a persona carries",
      dragHint:
        "Drag an avatar onto any pane to hot-swap it — the pane respawns under the new persona's SOUL and preferred CLI without touching its neighbours.",
      perModel: "Per-persona base model",
      perModelBody:
        "Each persona pins its own provider preset — one can run Opus, another DeepSeek, a third a local Ollama model. Model choice travels with the identity, not the app.",
      cliLabel: "Preferred CLI",
      modelLabel: "Default model",
    },
    delegation: {
      kicker: "Multi-agent flight deck",
      title: "Panes that talk to each other.",
      body: "Split any pane tmux-style — horizontal, vertical, zoom-to-focus. Each split is its own PTY, persona and CLI. Then let them collaborate: the Claude persona can emit task blocks that CoCodes routes to another pane, and results flow back automatically.",
      steps: [
        {
          title: "Delegate",
          body: "Claude emits a [TASK→codex] … [/TASK] block in its own transcript.",
        },
        {
          title: "Route",
          body: "CoCodes detects the block and pipes the task into the Codex pane's stdin.",
        },
        {
          title: "Return",
          body: "The answer comes back as [Agent response from Codex] — right where the work started.",
        },
      ],
      paneNote:
        "Also on deck: relay a selection to the next pane, zoom any split to full-window, and drag a past session onto a pane to resume it.",
    },
    providers: {
      kicker: "Providers",
      title: "One cockpit, every copilot.",
      body: "Switch the hosted CLI per tab, per pane, per persona. The header always shows the model the CLI actually booted with — read from its own startup banner, never guessed.",
      ready: "Ready",
      soon: "Soon",
      presetsTitle: "Base-model presets",
      presetsBody:
        "Point any persona at an Anthropic-compatible endpoint by pasting just a key — Moonshot Kimi, Zhipu GLM, StepFun, DeepSeek — or run fully local with Ollama and LM Studio on the Codex side. Tokens live in ~/.cocodes/.env and are never echoed back.",
      authTitle: "Subscription auth, no API key",
      authBody:
        "The default Claude path signs in with your /login OAuth credentials from ~/.claude. CoCodes never sets ANTHROPIC_API_KEY — your subscription is the ticket.",
    },
    themes: {
      kicker: "Designer theming",
      title: "Ten palettes, one accent axis.",
      body: "Curated panel palettes with deep low-chroma surfaces and parchment text — plus a separable accent axis of eleven hues, so you can recolor any pane independently. Click a swatch; this pane is wearing the real shipped colours.",
      lightBadge: "light",
      seasonal:
        "Seasonal easter egg: the “Trionda Night” World Cup 2026 theme brings ambient stadium motion — and a goal celebration.",
      tryHint: "Click to re-skin",
    },
    bento: {
      kicker: "The rest of the flight deck",
      title: "Built-in instruments.",
      items: [
        {
          title: "Session Deck",
          body: "Every terminal becomes a themed task card with an AI-written label — your missions at a glance.",
        },
        {
          title: "Session · Explore · Git sidebar",
          body: "A tabbed, drag-to-resize sidebar whose content adapts to its width.",
        },
        {
          title: "Git panel with AI commits",
          body: "Status, log and graph in-app — and commit messages drafted by the agent.",
        },
        {
          title: "MCP manager",
          body: "Enable MCP servers globally; their tool hints fold into each persona's prompt.",
        },
        {
          title: "One-tap screenshots",
          body: "Capture a region; the file path drops straight into your prompt.",
        },
        {
          title: "Command palette",
          body: "A searchable catalog of slash commands and files — ⌘K away.",
        },
        {
          title: "Composer injection",
          body: "A chat-like box that pipes each line into the CLI's stdin. Type like chat, run like terminal.",
        },
        {
          title: "Attention center",
          body: "Tray notifications when a session needs authorization; running agents get a flowing light border.",
        },
        {
          title: "Native polish",
          body: "Frameless frosted glass, compact mini mode, signed auto-updates.",
        },
      ],
    },
    cta: {
      title: "Take your seat in the cockpit.",
      body: "Free, open source, MIT licensed. Bring at least one coding CLI — CoCodes will show you the exact install command for anything missing.",
      download: "Download the latest release",
      orBuild: "or build from source",
      requirements: "Node ≥ 18 · Rust ≥ 1.77 · Tauri 2 toolchain",
    },
    footer: {
      tagline: "Agent coding cockpit",
      license: "MIT License",
      built: "A Tauri 2 desktop app · this page runs on Next.js",
    },
  },

  zh: {
    nav: {
      features: "功能",
      personas: "人格",
      themes: "主题",
      download: "下载",
      github: "GitHub",
    },
    hero: {
      badge: "macOS · Windows · Linux — MIT 开源",
      title1: "智能体编码",
      title2: "座舱",
      subtitle:
        "为 AI 编码 CLI 打造的终端原生桌面基地。Claude Code、Codex、Grok、Kimi 在真实伪终端中原生运行——不重写、不代理，你驾驶的就是官方 CLI 本体，外加一层编排系统。",
      downloadMac: "下载 macOS 版",
      downloadOther: "全部下载",
      platforms: "免费开源 · 由 GitHub Releases 自动更新",
      scrollHint: "进入座舱",
    },
    live: {
      kicker: "本质区别",
      title: "原生嵌入 CLI，而非套壳。",
      body: "多数“AI IDE”在 API 后面重新实现了智能体。CoCodes 在真实 PTY 中直接拉起官方 CLI 并全保真渲染——每个快捷键、每条斜杠命令、厂商发布的每次更新，第一天就出现在你的座舱里。",
      cards: [
        {
          title: "真·伪终端",
          body: "每个窗格都是 portable-pty 提供的真实 PTY。CLI 相信自己拥有一个终端——因为它确实拥有。",
          tag: "portable-pty",
        },
        {
          title: "WebGL 渲染",
          body: "xterm.js + WebGL 插件——任意窗格数量下都丝滑滚动、字符渲染完美。",
          tag: "xterm.js · WebGL",
        },
        {
          title: "打不断的会话",
          body: "PTY 在重载后依然存活，重连并回放缓冲区。每个窗格经 --session-id / --resume 对应独立会话。",
          tag: "keep-alive · --resume",
        },
      ],
    },
    personas: {
      kicker: "人格星座",
      title: "给每个会话注入灵魂。",
      body: "Persona 是一份可保存的身份：SOUL.md 系统提示、MEMORY.md 记忆、USER.md 用户画像、吉祥物头像、偏好 CLI 与专属基座模型。通过 --append-system-prompt-file 注入，或用 replace 模式整体替换系统提示。",
      soulFiles: "一个 persona 携带什么",
      dragHint:
        "把头像拖到任意窗格即可热切换——该窗格立刻以新 persona 的 SOUL 与偏好 CLI 重生，丝毫不影响相邻窗格。",
      perModel: "每个人格独立基座模型",
      perModelBody:
        "每个 persona 固定自己的模型预设——一个跑 Opus，一个跑 DeepSeek，另一个跑本地 Ollama。模型选择跟随身份，而非全局设置。",
      cliLabel: "偏好 CLI",
      modelLabel: "默认模型",
    },
    delegation: {
      kicker: "多智能体飞行甲板",
      title: "窗格之间会对话。",
      body: "tmux 式任意分屏——横切、竖切、聚焦缩放。每个分屏都是独立的 PTY、persona 与 CLI。更进一步，让它们协作：Claude persona 可以发出任务块，CoCodes 自动路由到另一个窗格，结果自动流回。",
      steps: [
        {
          title: "委派",
          body: "Claude 在自己的对话中输出 [TASK→codex] … [/TASK] 任务块。",
        },
        {
          title: "路由",
          body: "CoCodes 检测到任务块，把任务注入 Codex 窗格的 stdin。",
        },
        {
          title: "回传",
          body: "结果以 [Agent response from Codex] 的形式回到任务发起处。",
        },
      ],
      paneNote:
        "甲板上还有：把选中内容中继给下一个窗格、任意分屏一键全窗缩放、把历史会话拖进窗格即可续接。",
    },
    providers: {
      kicker: "供应商",
      title: "一个座舱，所有副驾。",
      body: "按标签页、按窗格、按 persona 切换托管 CLI。顶栏永远显示 CLI 实际启动的模型——读取自它自己的启动横幅，从不猜测。",
      ready: "就绪",
      soon: "即将",
      presetsTitle: "基座模型预设",
      presetsBody:
        "只需粘贴一个密钥，即可把任意 persona 指向 Anthropic 兼容端点——Moonshot Kimi、智谱 GLM、阶跃星辰、DeepSeek——或在 Codex 侧用 Ollama、LM Studio 纯本地运行。密钥存于 ~/.cocodes/.env，绝不回显。",
      authTitle: "订阅登录，无需 API Key",
      authBody:
        "默认 Claude 通道使用 ~/.claude 中的 /login OAuth 凭据。CoCodes 从不设置 ANTHROPIC_API_KEY——你的订阅就是登机牌。",
    },
    themes: {
      kicker: "设计师主题",
      title: "十套调色板，一条点缀轴。",
      body: "精心调校的面板配色：深邃低饱和表面 + 羊皮纸色文字，外加可独立拆分的十一色点缀轴，任何窗格都能单独换色。点击色卡试试——这个窗格穿的就是应用内真实发布的颜色。",
      lightBadge: "浅色",
      seasonal:
        "季节彩蛋：“Trionda Night”世界杯 2026 主题自带球场氛围动效——还有进球庆祝。",
      tryHint: "点击换肤",
    },
    bento: {
      kicker: "飞行甲板的其余仪表",
      title: "内置仪器。",
      items: [
        {
          title: "Session Deck",
          body: "每个终端变成一张主题任务卡，配 AI 撰写的标签——任务一览无余。",
        },
        {
          title: "Session · Explore · Git 侧栏",
          body: "三栏式侧边栏，拖拽调宽，内容随宽度自适应。",
        },
        {
          title: "Git 面板 + AI 提交",
          body: "状态、日志、提交图全部应用内完成——提交信息由智能体起草。",
        },
        {
          title: "MCP 管理器",
          body: "全局启用 MCP 服务器，其工具提示自动折叠进每个 persona 的提示词。",
        },
        {
          title: "一键截图",
          body: "框选区域截图，文件路径直接落入提示词输入框。",
        },
        {
          title: "命令面板",
          body: "可搜索的斜杠命令与文件目录——⌘K 即达。",
        },
        {
          title: "Composer 注入",
          body: "聊天式输入框，逐行注入 CLI 的 stdin。像聊天一样输入，像终端一样执行。",
        },
        {
          title: "注意力中心",
          body: "会话等待授权时托盘通知；运行中的智能体有流光边框。",
        },
        {
          title: "原生质感",
          body: "无边框磨砂玻璃、迷你紧凑模式、签名校验的自动更新。",
        },
      ],
    },
    cta: {
      title: "坐进你的座舱。",
      body: "免费、开源、MIT 许可。只需装好任意一个编码 CLI——缺什么，CoCodes 会直接告诉你精确的安装命令。",
      download: "下载最新版本",
      orBuild: "或从源码构建",
      requirements: "Node ≥ 18 · Rust ≥ 1.77 · Tauri 2 工具链",
    },
    footer: {
      tagline: "智能体编码座舱",
      license: "MIT 许可证",
      built: "Tauri 2 桌面应用 · 本页由 Next.js 驱动",
    },
  },
};
