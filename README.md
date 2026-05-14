# 🌊 TideLog — Obsidian Plugin

> AI-guided daily planning and reflection with morning SOP, evening review, insights, and metacognition coaching.

TideLog is an Obsidian plugin that helps you build metacognitive awareness through an AI-driven **Plan → Log → Review → Insight** feedback loop.

---

## ✨ Core Philosophy

```
  Plan → Daily Log → AI Analysis → Insight Dialogue → Metacognitive Growth → Better Actions
    ↑                                                                           ↓
    └───────────────────────── Positive Feedback Loop ──────────────────────────┘
```

Like having a coaching conversation — discover patterns you wouldn't see on your own.

---

## 💎 Free vs Pro

TideLog's core daily workflow is **free forever**. Pro unlocks the deeper coaching layer.

| Feature | Free | Pro |
|---|:---:|:---:|
| 🌅 Morning plan SOP (energy check + task input + carry-forward) | ✅ | ✅ |
| 🌙 Evening review — required 5 questions | ✅ | ✅ |
| 📋 Kanban board (month / week / day) | ✅ | ✅ |
| 💬 Free chat with AI | ✅ | ✅ |
| 🔌 All AI providers (OpenRouter / Claude / Gemini / GPT / SiliconFlow / Custom) | ✅ | ✅ |
| 🌙 Evening review — optional 4 questions (deep analysis, reflection, principles, free writing) | 🔒 | ✅ |
| 📊 **AI Weekly insight report** | 🔒 | ✅ |
| 📈 **AI Monthly insight report** | 🔒 | ✅ |
| 👤 **AI user profile analysis & auto-update** | 🔒 | ✅ |
| 🕰️ **Chat with your past self** (ground AI in 30 days of journals) | 🔒 | ✅ |
| 📅 Calendar emotion heatmap | 🔒 | ✅ |
| 🏠 Data dashboard | 🔒 | ✅ |
| 🔄 Auto pattern + principle extraction | 🔒 | ✅ |

---

## 💰 Pricing

| Plan | Price | Best for |
|---|---|---|
| 🆓 **Free** | ¥0 | Anyone who wants the core daily Plan + Log workflow |
| 📅 **Annual** | **¥49 / year** | Try Pro flexibly, upgrade anytime |
| 🔥 **Lifetime** | **¥99 one-time** | Best value — pay once, use forever |

- Up to **3 devices** per license · **7-day refund**, no questions asked
- Purchase: [爱发电](https://afdian.com/item/463307362c2f11f1b39d52540025c377)
- Already purchased? Enter your code in Settings → TideLog → Pro

---

## 🚀 Features

### 🌅 Morning Plan SOP

- Energy level self-assessment (1–10)
- Multi-task input with subtask nesting
- Auto-writes to daily note under `## Morning Plan`
- Unfinished task carry-forward from the past 3 days

### 🌙 Evening Review SOP (5+4 question flow)

**Required (5 questions) — free:**

1. 🎯 Goal alignment — review task completion
2. ✨ Success journal — record today's achievements
3. 😊 Emotion logging — happiness moments + emotion score
4. 💭 Anxiety awareness — identify and analyze negative emotions
5. 📋 Tomorrow's plan — plan the most important task for tomorrow

**Optional (4 questions) — Pro:**

6. 🔍 Deep analysis — 5 Whys root-cause exploration
7. 🪞 Reflection — Stoic triple question
8. 💎 Principle extraction — distill reusable life principles
9. ✍️ Free writing — open expression

### 📊 Insight System (Pro)

- **Weekly insight** — task completion rate, emotion trends, success patterns, challenge analysis
- **Monthly insight** — monthly trends, growth milestones, deep pattern analysis
- **Profile suggestions** — AI suggests user profile updates based on journal data

### 🕰️ Chat with your past self (Pro)

A new dedicated mode in the Insight tab. TideLog feeds your last 30 days of
daily notes — plus your principles, patterns, and profile — into the chat as
grounded context. Ask things like:

- "When have I felt anxious about freedom?"
- "What progress have I made this month?"
- "What recurring emotions show up lately?"

The AI quotes specific dates and journal excerpts when answering.

### 📅 Calendar & Kanban

- **Review calendar** (Pro) — emotion heatmap + hover tooltips + click to open daily note
- **Kanban board** (free) — month/week/day three-level pyramid view
- **Task carry-forward** — unfinished tasks appear automatically, one-click inherit

### 📈 Dashboard (Pro)

- **🎯 Today's focus** — today's task list + energy state + carry-forward count
- **📋 Weekly progress** — task completion progress bar
- **💭 Emotion trend** — 7-day emotion bar chart
- **💡 Insights** — random principle + active pattern display

### 💬 Free Chat

- Chat with AI anytime about thoughts and ideas
- Smart intent detection for plan updates
- Coaching-style guidance to help see blind spots

---

## 🔌 AI Providers

| Provider | Status | Notes |
|----------|--------|-------|
| OpenRouter | ⭐ Recommended | One key, many models, cost-effective. **First-run wizard picks this by default.** |
| Anthropic Claude | ✅ | Direct Claude API |
| Google Gemini | ✅ | Gemini 2.0 Flash |
| OpenAI | ✅ | GPT-4o |
| SiliconFlow | ✅ | DeepSeek / Qwen / GLM via 硅基流动 |
| Custom API | ✅ | Any OpenAI-compatible endpoint (DeepSeek, Groq, Ollama, …) |

Custom model names + connection test button supported.

---

## 📦 Installation

### Manual Install

1. Download `main.js`, `manifest.json`, `styles.css` from the latest [Release](https://github.com/enhen3/Tidelog/releases)
2. Create `.obsidian/plugins/tidelog/` in your vault
3. Copy the files into that directory
4. Restart Obsidian → Settings → Community Plugins → Enable **TideLog**

### First-run setup

On first launch, a 4-step wizard walks you through picking an AI provider,
pasting your API key, and running a connection test. It takes about a minute.

### Development

```bash
git clone https://github.com/enhen3/Tidelog.git
cd Tidelog
npm install
npm run dev    # Development mode (watch)
npm run build  # Production build
```

---

## ⚙️ Configuration

In Obsidian Settings → TideLog:

1. **Pro license** — paste your activation code (purchased via Afdian)
2. **AI Provider** — choose provider, configure API key, custom model name
3. **Connection Test** — one-click API connectivity check
4. **Day Boundary** — set when a "day" starts (default: 2:00 AM)
5. **Folder Paths** — customize daily, plan, and archive directories
6. **Review Questions** — enable/disable each question, customize order
7. **Privacy** — opt out of anonymous usage data anytime

---

## 🔒 Privacy

TideLog collects **anonymous, opt-out usage data** to improve the product:
- ✅ What we collect: feature-usage counts (e.g. "evening SOP started",
  "weekly insight generated"), an anonymous random ID, plugin version,
  and language.
- ❌ What we **never** collect: journal content, AI prompts/responses,
  API keys, vault name, IP address, or anything identifying you.
- 🔧 Turn it off anytime in Settings → TideLog → Privacy.

Your journal data lives in your Obsidian vault and is only ever sent to the
AI provider you chose (with the API key you configured) — never to us.

---

## 📂 Vault Structure

The plugin automatically creates and manages:

```
your-vault/
├── 01-Daily/              # Daily notes
│   ├── 2026-03-06.md
│   └── ...
├── 02-Plan/               # Plans
│   ├── Weekly/
│   │   └── 2026-W10.md
│   └── Monthly/
│       └── 2026-03.md
└── 03-Archive/            # Archive
    ├── user_profile.md    # User profile
    ├── principles.md      # Principles library
    ├── patterns.md        # Patterns library
    └── Insights/          # Insight reports
        ├── 2026-W10-weekly.md
        └── 2026-03-monthly.md
```

---

## 📋 Commands

| Command | Description |
|---------|-------------|
| `TideLog: Open Chat` | Open the chat sidebar |
| `TideLog: Morning Plan` | Start morning planning SOP |
| `TideLog: Evening Review` | Start evening review SOP |
| `TideLog: Open Dashboard` | Open dashboard view (Pro) |
| `TideLog: Open Kanban` | Open kanban board |
| `TideLog: Open Calendar` | Open calendar view (Pro) |

---

## 🛠 Tech Stack

- TypeScript + esbuild
- Obsidian API (zero external dependencies)
- SSE streaming (AI streaming responses)
- Deep settings merge (providers deep merge)
- License + telemetry: Cloudflare Workers + D1

---

## License

MIT — see [LICENSE](./LICENSE)

---

<details>
<summary>🇨🇳 中文说明</summary>

# 🌊 TideLog

> AI 引导的每日潮流 — 计划、记录、反思

TideLog 是一个 Obsidian 插件，通过 AI 引导的 **计划 → 日记 → 复盘 → 洞察** 正循环，帮助你建立元认知能力，更深刻地了解自己的思维和行动模式。

像和心理咨询师聊天一样，发现平时看不到的自己。

### 💎 免费版 vs Pro 版

核心的「每日计划 + 日记」流程**永久免费**。Pro 解锁更深层的 AI 教练能力。

| 功能 | 免费版 | Pro 版 |
|---|:---:|:---:|
| 🌅 晨间计划 SOP（精力评估 + 任务输入 + 任务继承）| ✅ | ✅ |
| 🌙 晚间复盘 — 必问 5 题 | ✅ | ✅ |
| 📋 看板（月/周/日）| ✅ | ✅ |
| 💬 自由对话 | ✅ | ✅ |
| 🔌 所有 AI 提供商 | ✅ | ✅ |
| 🌙 晚间复盘 — 选答 4 题（深度分析、反思、原则、随笔）| 🔒 | ✅ |
| 📊 **AI 周报洞察** | 🔒 | ✅ |
| 📈 **AI 月报洞察** | 🔒 | ✅ |
| 👤 **AI 用户画像分析 & 自动更新** | 🔒 | ✅ |
| 🕰️ **和过去的自己对话**（基于 30 天日记的 AI 对话）| 🔒 | ✅ |
| 📅 日历情绪热力图 | 🔒 | ✅ |
| 🏠 数据仪表盘 | 🔒 | ✅ |
| 🔄 自动模式 + 原则提炼 | 🔒 | ✅ |

### 💰 定价

| 版本 | 价格 | 适合 |
|---|---|---|
| 🆓 **免费版** | ¥0 | 想要核心计划/日记流程的所有人 |
| 📅 **年度版** | **¥49 / 年** | 灵活体验 Pro，可随时升级 |
| 🔥 **终身版** | **¥99 一次付清** | 最划算 — 一次付费，永久使用 |

最多支持 **3 台设备** · **7 天无理由退款**
购买入口：[爱发电](https://afdian.com/item/463307362c2f11f1b39d52540025c377)
已购买？在「设置 → TideLog → Pro」输入兑换码激活

### 主要功能

- **🌅 晨间计划 SOP** — 精力评估 + 多任务输入 + 子任务 + 任务继承
- **🌙 晚间复盘 SOP** — 5+4 问题流（目标对标、成功日记、情绪记录、焦虑觉察、明日计划 + 深度分析、反思、原则提炼、自由随笔）
- **📊 洞察系统** — 周报、月报、画像建议（Pro）
- **🕰️ 和过去的自己对话** — 基于最近 30 天日记 + 画像 + 原则的 AI 对话（Pro）
- **📅 日历与看板** — 情绪热力图（Pro）+ 金字塔视图 + 任务继承
- **📈 仪表盘** — 今日聚焦 + 周进度 + 情绪趋势（Pro）
- **💬 自由对话** — 随时与 AI 聊天，智能意图检测

### 安装

1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Vault 中创建 `.obsidian/plugins/tidelog/`
3. 将文件复制到该目录
4. 重启 Obsidian → 设置 → 社区插件 → 启用 **TideLog**

首次启用时会有一个 4 步引导向导（推荐 OpenRouter + 粘贴 API key + 测试 + 开始第一次晨间计划），大约 1 分钟。

### 隐私

TideLog 收集**匿名、可关闭**的使用数据用于改进产品：
- ✅ 收集：功能使用次数（如「晨间 SOP 启动」「周报生成」）、匿名随机 ID、插件版本、语言
- ❌ **不收集**：日记内容、AI 对话内容、API key、Vault 名、IP 地址或任何身份信息
- 🔧 随时关闭：设置 → TideLog → 隐私

你的日记数据始终在你的 Obsidian Vault 里，只会发送给你自己配置的 AI 提供商（用你自己的 API key）—— 永远不会发给我们。

</details>

