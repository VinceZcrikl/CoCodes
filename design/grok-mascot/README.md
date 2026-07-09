# Grok Build Mascot

Claude / Codex 的第三只小精灵。同一身体骨架，**原 Grok mark（圆角方环 + 对角斜杠）戴在脸上**，并拥有 **独立于 Claude 的 24 角色衣柜**。

## 基础形象

| 角色 | 皮肤 | 身份符号 | 体型 |
|------|------|----------|------|
| Claude | 陶土 | 无 / 戏服 | `rx=4.5` |
| Codex | 蓝紫玻璃 | 花冠 + `❯_` | `rx=6.5` |
| **Grok** | 银灰石墨 | **开环 + 斜杠 + 星尖** | `rx=5.5` |

## Grok 专属角色（≠ Claude）

Claude 是 cowboy / wizard / chef 那套人间职业戏服。  
Grok 是 **宇宙 · 构建 · 气质** 三幕，贴合 xAI / Grok Build：

| 0–7 Cosmic | 8–15 Build | 16–23 Vibe |
|------------|------------|------------|
| comet 彗星拖尾 | hacker 绿光护目 | jester 黑银铃帽 |
| void 虚空兜帽 | architect 蓝图 + T 尺 | rebel 红巾 + 星徽 |
| satellite 碟形天线 | debugger 六角触角 | oracle 紫晶第三眼 |
| rocket 鼻锥 + 尾焰 | welder 焊罩 + 火花 | captain 银舰长帽 |
| orbit 倾斜轨道环 | sprinter 水平速度条 | phantom 薄纱围巾 |
| nova 八向爆发 | patcher 创可贴 + 扳手 | racer 竞速盔 |
| eclipse 月食冠 | stacker 代码层叠块 | chrome 镜面束带 |
| singularity 奇点环 | terminal CRT 提示符 | pioneer 信号旗 |

存储：`__mascot:grok:comet__` 等（与 Claude 的 `__mascot:claude:cowboy__` 命名空间分离）。

### 主题染色

- `--mascot-base` 身体（也用于 carve gap）
- `--mascot-deep` 腿
- `--mascot-sheen` 开环 / 斜杠 / 星尖 / 高光

## 文件

| 文件 | 说明 |
|------|------|
| `../../src/views/Persona/GrokMascot.tsx` | 基础小精灵 |
| `../../src/views/Persona/CostumedGrokMascot.tsx` | 24 专属角色 |
| `grok.png` / `family.png` / `wardrobe.png` | 预览 |
