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

## 🚀 Features

### 🌅 Morning Plan SOP

- Energy level self-assessment (1–10)
- Multi-task input with subtask nesting
- Auto-writes to daily note under `## Morning Plan`
- Unfinished task carry-forward from the past 3 days

### 🌙 Evening Review SOP (5+4 question flow)

**Required (5 questions):**

1. 🎯 Goal alignment — review task completion
2. ✨ Success journal — record today's achievements
3. 😊 Emotion logging — happiness moments + emotion score
4. 💭 Anxiety awareness — identify and analyze negative emotions
5. 📋 Tomorrow's plan — plan the most important task for tomorrow

**Optional (4 questions):**

6. 🔍 Deep analysis — 5 Whys root-cause exploration
7. 🪞 Reflection — Stoic triple question
8. 💎 Principle extraction — distill reusable life principles
9. ✍️ Free writing — open expression

### 📊 Insight System

- **Weekly insight** — task completion rate, emotion trends, success patterns, challenge analysis
- **Monthly insight** — monthly trends, growth milestones, deep pattern analysis
- **Profile suggestions** — AI suggests user profile updates based on journal data

### 📅 Calendar & Kanban

- **Review calendar** — emotion heatmap + hover tooltips + click to open daily note
- **Kanban board** — month/week/day three-level pyramid view
- **Task carry-forward** — unfinished tasks appear automatically, one-click inherit

### 📈 Dashboard

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
| OpenRouter | ✅ Recommended | Multi-model access, cost-effective |
| Anthropic Claude | ✅ | Direct Claude API |
| Google Gemini | ✅ | Gemini 2.0 Flash |
| OpenAI | ✅ | GPT-4o |
| Custom API | ✅ | Any OpenAI-compatible endpoint |

Custom model names + connection test button supported.

---

## 📦 Installation

### Manual Install

1. Download `main.js`, `manifest.json`, `styles.css` from the latest [Release](https://github.com/enhen3/Tidelog/releases)
2. Create `.obsidian/plugins/tidelog/` in your vault
3. Copy the files into that directory
4. Restart Obsidian → Settings → Community Plugins → Enable **TideLog**

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

1. **AI Provider** — choose provider, configure API key, custom model name
2. **Connection Test** — one-click API connectivity check
3. **Day Boundary** — set when a "day" starts (default: 6:00 AM)
4. **Folder Paths** — customize daily, plan, and archive directories
5. **Review Questions** — enable/disable each question, customize order

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
| `TideLog: Open Dashboard` | Open dashboard view |
| `TideLog: Open Kanban` | Open kanban board |
| `TideLog: Open Calendar` | Open calendar view |

---

## 🛠 Tech Stack

- TypeScript + esbuild
- Obsidian API (zero external dependencies)
- SSE streaming (AI streaming responses)
- Deep settings merge (providers deep merge)

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

### 主要功能

- **🌅 晨间计划 SOP** — 精力评估 + 多任务输入 + 子任务 + 任务继承
- **🌙 晚间复盘 SOP** — 5+4 问题流（目标对标、成功日记、情绪记录、焦虑觉察、明日计划 + 深度分析、反思、原则提炼、自由随笔）
- **📊 洞察系统** — 周报、月报、画像建议
- **📅 日历与看板** — 情绪热力图 + 金字塔视图 + 任务继承
- **📈 仪表盘** — 今日聚焦 + 周进度 + 情绪趋势
- **💬 自由对话** — 随时与 AI 聊天，智能意图检测

### 安装

1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Vault 中创建 `.obsidian/plugins/tidelog/`
3. 将文件复制到该目录
4. 重启 Obsidian → 设置 → 社区插件 → 启用 **TideLog**

</details>
