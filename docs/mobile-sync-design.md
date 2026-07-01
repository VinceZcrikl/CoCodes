# CoCodes 移动端 ↔ 桌面端互联 · 方案设计文档

> 目标：让 CoCodes 拥有一个跨平台手机 App，与桌面端互联互通，在移动端和电脑端之间**无缝衔接**一个正在运行的 AI 编码会话。
>
> 本文是可行性调研 + 参考架构对比 + CoCodes 落地方案。调研对象：OpenAI Codex、Hermes Agent、OpenClaw / AnyClaw、Stably Orca。

---

## 1. 结论速览（TL;DR）

- **可行，且成本可控。** CoCodes 现有后端本质上已经是一个"带回放的无头终端多路复用器"，只差把会话总线安全地暴露到网络上。
- **参考架构收敛到同一张图**（Orca 用 9.6k star 的真实项目验证过）：
  **`daemon`（持久 PTY 宿主）+ `relay`（JSON-RPC over socket，挂 fs/pty/git/workspace/hook handler）**，本地 UI / 远程机 / 手机都是同一个 relay 的客户端。
- **手机 = read-mostly 瘦客户端，桌面 = source of truth。** 真正的 CLI 永远跑在电脑上，手机只做远程渲染 + 控制。
- **网络分层，别一上来就上云中继**：
  `LAN 直连（默认）` → `Tailscale / SSH 兜底` → `可选加密中继做跨网（默认关闭）`。
- **CoCodes 现有 Tauri command 与 Orca 的 relay handler 几乎一一对应**，重构成本可控。

---

## 2. CoCodes 现状盘点

纯本地 Tauri 2 桌面应用（Rust 核心 + 系统 WebView），把 AI 编码 CLI 跑在真实 PTY 里。关键模块与"移动互联"地基：

| 现有模块 | 作用 | 对移动互联的意义 |
|---|---|---|
| `terminal.rs` — `TerminalRegistry` | 每会话一个真实 PTY，带 **256KB replay buffer**（`REPLAY_BUFFER_MAX`），重连回放当前屏 | ⭐ "加载当前实时状态"的基础，手机 attach 同一 session 即见现场 |
| Tauri `Emitter` 事件流 (`data`/`exit`/`model-activity`) | PTY 输出以 base64 `DataEvent` 推给前端 xterm | 事件流转发到网络即可让手机实时跟随 |
| `terminal_write` / `terminal_resize` / `terminal_close` | 前端控制面 | 手机的输入/调整/中断控制面 |
| `sessions.rs` | 会话列表持久化为 JSON（`~/.cocodes/sessions/…`） | 会话列表同步的数据源 |
| `notify_hooks.rs` | 回环 HTTP 捕获 CLI **权限审批提示** → `cocodes://needs-attention` | ⭐ 手机要 push 的"需要你批准"通知 |
| `codex_proxy.rs` | 应用内嵌 `tiny_http` + `reqwest` | 证明"app 内跑网络服务"的模式成熟、可复用 |
| `lib.rs` 关窗只隐藏到托盘、PTY 继续跑 | keep-alive 会话 | ⭐ 无缝衔接前提：电脑息屏、任务在跑、手机接上去 |

**短板**：PTY 随进程退出而死（仅窗口隐藏时存活）；无网络层；无独立常驻 daemon。

---

## 3. 参考架构对比

### 3.1 OpenAI Codex —— 云中继 + 瘦客户端
- 四个端（Codex App / CLI / IDE / ChatGPT）用 ChatGPT 账号串联。
- **安全中继层**：可信机器**主动出站**连云端中继，穿 NAT；中继做路由 + 状态同步 + 推送。
- 手机打开即"加载环境当前实时状态"；"Handoff" 在执行环境间搬运会话线程。
- **启示**：出站连中继是穿 NAT 的标准解；手机是瘦客户端。

### 3.2 Hermes Agent —— 消息网关 + 统一 agent 核
- 三层：界面（CLI/IM/IDE）→ 单一 `AIAgent`(`run_agent.py`) → 执行后端（Local/Docker/SSH/Daytona/Modal）。
- 长驻 gateway 挂 20+ **消息平台适配器**（Telegram/Discord/飞书/微信…），手机用现成 IM 当 UI，会话上下文跨平台共享（SQLite）。
- IDE 走 **ACP：stdio / JSON-RPC**。
- **启示**：手机零定制走 IM 最省力，但缺终端流/diff 富交互；审批类通知走 IM/push 体验好，可作 fallback。

### 3.3 OpenClaw / AnyClaw —— 两条极端路线
- **OpenClaw Gateway**：单一 **WebSocket 端口 18789** 作控制面；所有客户端握手时声明 **role + scope**，**token/密码鉴权**；node（桌面跑 CLI）与 controller（手机）都连它，由 Gateway 配对路由。
- **AnyClaw（Android 本地）**：APK 内置 Termux bootstrap，**在手机本地跑** Codex 原生二进制；三本地服务 18789(WS)/18923(HTTP UI)/18924(DNS-TLS 代理)；**无桌面同步**。
- **启示**：OpenClaw 的"握手声明 role+scope + token"是 LAN 配对鉴权范式；AnyClaw 是"电脑不开机也能用"的 Plan B（代价：算力/电量/凭据压手机，失去接管现场）。

### 3.4 Stably Orca —— 与 CoCodes 正面同类（重点参考，源码验证）
Electron ADE，多 agent 并行 worktree。后端两层：

- **`src/main/daemon/`**：独立长驻进程托管 PTY，**scrollback 重启不丢**（ndjson 落盘 + `reattach-snapshot` + worktree hibernation）。
- **`src/relay/`**：**统一 IPC 总线**。本地 **Unix/TCP socket**，**13 字节二进制头 + JSON-RPC 2.0**；握手仅版本协商无鉴权（本地可信）；挂 `fs / pty / git / workspace-session / agent-exec / agent-hook / port-scan / preflight / plugin-overlay` 等 handler。**agent 子进程、桌面 UI、远程机、手机都是这一个 relay 的客户端。**
- **`src/main/ssh/`（`ssh-relay-*` 20 文件）**：把 relay 二进制**部署到远程机器**，经 **SSH 多路复用通道 + 端口转发**桥接回桌面，版本匹配 + 自动重连。
- **`src/main/network/macos-tailscale-dns-diagnostic.ts`**：内置 **Tailscale** 诊断。
- **手机伴侣**（独立仓库）：一次性配对产出 **device token**；**LAN 直连、默认无云中继**，关桌面即断连，桌面=source of truth；**可选**经 Stably 服务器的**加密中继**做跨网（**默认关闭**）；手机 read-mostly（状态/scrollback/回复 prompt/休眠 worktree/过 SCM/切账号）+ 完成推送。

**核心启示**：把后端统一成 **daemon + relay(JSON-RPC over socket)**，让本地 UI / 远程机 / 手机都当 relay 客户端——是这类多 agent 驾驶舱做跨端的标准解法。

### 3.5 横向对比

| 维度 | Codex | Hermes | OpenClaw | AnyClaw | **Orca** |
|---|---|---|---|---|---|
| 手机角色 | 瘦客户端 | IM 聊天 | WS 控制器 | 本地全功能 | read-mostly 瘦客户端 |
| 传输 | 云中继(出站) | 各 IM + ACP | 单一 WS:18789 | 本地回环 | socket+JSON-RPC / SSH隧道 / 可选中继 |
| 配对鉴权 | ChatGPT 账号 | IM 账号 | 握手 role+scope+token | 无(本地) | device token |
| 跨网 | 云中继 | 看后端 | 自托管+隧道 | 无 | LAN直连+可选加密中继(默认关) |
| 终端富交互 | ✅ | ❌ 聊天式 | ✅ | ✅ | ✅ |
| 离线无电脑 | ❌ | 看后端 | ❌ | ✅ | ❌ |

---

## 4. 网络层方案（异地通信）

**硬约束**：双方通常都在 NAT 后（家里 Wi-Fi + 手机蜂窝），谁也无法主动连对方。不同网时**物理上必须有一个带公网 IP 的会合点**——要么中继（数据过它），要么信令+TURN（兜底时数据仍过它）。绕不开。

| 场景 | 方案 | 要写的代码 | 说明 |
|---|---|---|---|
| 同 Wi-Fi | 直连网关 + 二维码 token | 网关本体（必写） | 延迟最低、零云成本 |
| 异地·开发者自用 | **叠 Tailscale**，复用同网代码 | **0** | WireGuard 端到端加密，中继(DERP)盲转，最快验证异地 |
| 异地·正式产品 | **自建出站中继 broker** + 推送 | 薄 relay + E2E 加密 | 双方出站连 relay，穿 NAT 无需端口转发 |
| （不建议） | WebRTC P2P | 高 | 仍需信令 + TURN 兜底，终端流收益不大 |

### Tailscale 安全性备注
- 底层 WireGuard 端到端加密，**私钥永不离开设备**；DERP 中继**只转发密文、无法解密**；协调服务器拿不到私钥。
- 唯一信任点：协调服务器的**密钥分发**（可能被塞入恶意节点）→ 用 **Tailnet Lock**（新节点需已有可信节点签名）或 **Headscale**（自托管控制面）消除。
- 纵深防御：即使同处一个 tailnet，**网关层仍要 CoCodes 自己的 token + scope**，别把"同网"等同于"有权操作终端"；ANTHROPIC 凭据永不出电脑。

---

## 5. CoCodes 目标架构

```
┌─────────────────────────── 桌面机器 ───────────────────────────┐
│                                                                │
│   [持久 daemon]  ── 托管 PTY，keep-alive，replay/快照重连        │
│        │                                                       │
│        │  relay 协议 (JSON-RPC over socket, 二进制分帧)          │
│        ▼                                                       │
│   [Session Bus / relay]  ── 挂 handler: pty/fs/git/session/hook │
│        ▲            ▲                                           │
│        │            │                                          │
│   本地 Tauri UI   remote_gateway (WS + token + 二维码配对)       │
│                     │                                          │
└─────────────────────┼──────────────────────────────────────────┘
                      │  LAN 直连  /  Tailscale  /  可选加密中继
                      ▼
              [手机 App —— read-mostly 瘦客户端]
              状态 · scrollback · 回复 prompt · 审批 · 切账号 · 推送
```

**协议选型**（借 Orca）：控制面用 **JSON-RPC 2.0**；本地传输沿用 Tauri IPC，网络传输用 **WebSocket**（双向、低延迟、适合终端流）。PTY 输出复用现有 `DataEvent`（base64）。握手声明 **role + scope + token**（借 OpenClaw）。

**手机 App 选型**：优先 **Tauri 2 移动端瘦客户端**（`src-tauri/icons/` 已含 android/ios），复用现有 React + xterm.js UI，只把"PTY 后端"换成"远程 WS 客户端后端"藏在同一前端接口后。备选 React Native / Flutter / PWA。手机端**不跑 CLI、不开 PTY**。

---

## 6. 落地路线（分阶段，按风险递增）

- **Phase 1 — relay 协议抽象（纯重构，零行为变化）**
  把 `terminal.rs` 的 emit + write/resize/close，以及 `git.rs`/`fs.rs`/`sessions.rs`/`notify_hooks.rs` 的能力，收敛到一个内部 **Session Bus / relay 抽象**（JSON-RPC 风格），让"本地 Tauri 前端"成为它的第一个订阅者。对照 Orca 的 relay handler 一一映射。

- **Phase 2 — LAN 网关**
  新增 `remote_gateway` 模块（照搬 `codex_proxy.rs` 的 `tiny_http` 模式，加 **WS 升级 + 二维码配对 token + role/scope 握手**），桌面可被同网设备连接。**先用手机浏览器**连上验证。

- **Phase 3 — 移动瘦客户端**
  Tauri mobile 构建，xterm.js 渲染，WS 连接，`needs-attention` 走系统推送。手机能力先做 read-mostly（状态/scrollback/回复/审批/切账号）。

- **Phase 4 — 异地通信**
  先文档指引 **Tailscale**（零中继代码验证异地）；再做**自建出站中继 broker + E2E 加密 + APNs/FCM 推送**，达到 Codex 级体验。

- **Phase 5（可选，Plan B）— 手机本地模式**
  仿 AnyClaw，让手机在无电脑时本地跑 CLI。非主线。

- **（可选）远程算力**：仿 Orca `ssh-relay-*`，把 relay 部署到远程机器经 SSH 隧道桥接。

### 安全底线
全程 WSS/TLS；中继场景做**端到端加密**（relay 只转发密文）；配对 token 带 **scope + 可吊销**；**凭据永不下发手机**；ACL 收最小权限；开 Tailnet Lock（若用 Tailscale）。

---

## 7. 现有代码 → 目标映射

| CoCodes 现状 | Orca 对应 | 动作 |
|---|---|---|
| `terminal_*` / `git_*` / `fs_*` / `sessions_*` 分立 Tauri command | 单一 relay 的各 handler | Phase 1 收敛到一个 relay 协议 |
| PTY 随进程退出而死 | 独立 `daemon/`（重启/休眠不丢） | 想要休眠后接管，需抽独立常驻进程 |
| base64 `DataEvent` + Tauri Emitter | 13B 头 + JSON-RPC 2.0 over socket | 协议照搬，mobile 加 WS 传输 |
| `notify_hooks.rs` 回环审批 | `agent-hook-server` | 复用，接手机推送 |
| `codex_proxy.rs` (`tiny_http`+`reqwest`) | — | 复用为 `remote_gateway` 起点 |
| 无 | `ssh-relay-*` / Tailscale 诊断 | 远程/异地阶段再借 |

---

## 附：调研来源

- Codex：[Work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/) · [Codex App docs](https://developers.openai.com/codex/app) · [Remote connections](https://developers.openai.com/codex/remote-connections)
- Hermes：[Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/) · [NousResearch/hermes-agent](https://github.com/nousresearch/hermes-agent)
- OpenClaw：[Gateway protocol](https://docs.openclaw.ai/gateway/protocol) · [Gateway CLI](https://docs.openclaw.ai/cli/gateway) · [OpenClawAndroid / AnyClaw](https://github.com/OpenClawAndroid/openclaw-android-assistant)
- Orca：[stablyai/orca](https://github.com/stablyai/orca)（源码 `src/relay/`、`src/main/daemon/`、`src/main/ssh/`、`src/main/network/`）· [Verdent 对比](https://www.verdent.ai/guides/claw-code-claude-code-vs-openclaw)
- 网络：WireGuard / Tailscale（Tailnet Lock、DERP 中继、Headscale）

> 源码层面已确认：Orca 的 `daemon/`、`relay/protocol.ts`、`relay/relay-handshake.ts`、`ssh/ssh-relay-*`、`network/*tailscale*`。手机配对段为官方文档/公开资料描述（桌面侧桥接代码未在该仓库命名暴露，手机 App 为独立仓库）。
