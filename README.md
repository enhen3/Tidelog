# 🌊 TideLog

> Turn daily planning and reflection into an AI-guided growth system inside Obsidian.

TideLog helps you run a repeatable **Plan → Log → Review → Insight** loop without leaving your vault. It is built for people who already write daily notes, but want those notes to become better decisions, clearer priorities, and visible personal patterns.

## Why TideLog

Most journals are write-only: you capture thoughts, but the patterns stay hidden. TideLog turns your daily notes into a coaching workflow:

- **Plan the day** with a morning SOP that captures energy, priorities, and carry-forward tasks.
- **Review the day** with customizable evening questions instead of staring at a blank page.
- **Find patterns** with weekly/monthly insight reports, emotion trends, principles, and recurring behaviors.
- **Keep ownership** of your vault: TideLog writes Markdown files to your Obsidian folders and only calls external services when you trigger AI or license features.

## Quick Start

1. Install TideLog and open **Obsidian Settings → TideLog**.
2. Configure your preferred AI provider and run **Test connection**.
3. Use `TideLog: Start morning review` to plan your day.
4. Use `TideLog: Start evening review` to complete your daily reflection.
5. Upgrade to **TideLog Pro** when you want the full review flow, dashboards, calendar heatmap, and AI insight reports.

## Free vs Pro at a Glance

The free version is enough to try the workflow. Pro is designed for users who want TideLog to become their long-term self-review system.

- **Free**: morning planning, free chat with your configured AI provider, basic daily note writing, first 2 evening review questions.
- **Pro**: full 5+4 evening review, weekly/monthly insight reports, dashboard, calendar heatmap, profile suggestions, and pattern/principle extraction.
- **Buy Pro**: <https://afdian.com/item/463307362c2f11f1b39d52540025c377>

```
  Plan → Daily Log → AI Analysis → Insight Dialogue → Metacognitive Growth → Better Actions
    ↑                                                                           ↓
    └───────────────────────── Positive Feedback Loop ──────────────────────────┘
```

---

## Features

### Morning Plan SOP

- Energy level self-assessment (1–10)
- Multi-task input with subtask nesting
- Auto-writes to daily note under `## Morning Plan`
- Unfinished task carry-forward from the past 3 days

### Evening Review SOP

- Free users can complete the first 2 review questions.
- Pro users unlock the full 5 required + 4 optional question flow.
- Questions can be reordered and customized in settings.

**Required questions:**

1. Goal alignment — review task completion
2. Success journal — record today's achievements
3. Emotion logging — happiness moments + emotion score
4. Anxiety awareness — identify and analyze negative emotions
5. Tomorrow's plan — plan the most important task for tomorrow

**Optional questions:**

6. Deep analysis — 5 Whys root-cause exploration
7. Reflection — Stoic triple question
8. Principle extraction — distill reusable life principles
9. Free writing — open expression

### Insight System

- Weekly insight — task completion rate, emotion trends, success patterns, challenge analysis
- Monthly insight — monthly trends, growth milestones, deep pattern analysis
- Profile suggestions — AI suggests user profile updates based on journal data

### Calendar & Kanban

- Review calendar — emotion heatmap + hover tooltips + click to open daily note
- Kanban board — month/week/day three-level pyramid view
- Task carry-forward — unfinished tasks appear automatically, one-click inherit

### Dashboard

- Today's focus — today's task list + energy state + carry-forward count
- Weekly progress — task completion progress bar
- Emotion trend — 7-day emotion bar chart
- Insights — random principle + active pattern display

### Free Chat

- Chat with AI anytime about thoughts and ideas
- Smart intent detection for plan updates
- Coaching-style guidance to help see blind spots

---

## Free vs Pro

TideLog can be installed and used for free. Full access requires a TideLog Pro license.

| Feature | Free | Pro |
|---|---:|---:|
| Morning plan SOP | Yes | Yes |
| Free chat with your configured AI provider | Yes | Yes |
| Basic task capture and daily note writing | Yes | Yes |
| Evening review questions | First 2 | Full 5+4 flow |
| Weekly insight report | No | Yes |
| Monthly insight report | No | Yes |
| Profile suggestions | No | Yes |
| Dashboard view | No | Yes |
| Calendar heatmap | No | Yes |
| Device activations | Not applicable | 3 devices per license |
| Offline license grace period | Not applicable | 7 days |

Pricing is currently handled through Afdian:

- Annual license: ¥49/year.
- Lifetime license: ¥99 one-time payment.
- Purchase page: <https://afdian.com/item/463307362c2f11f1b39d52540025c377>.

After purchase, Afdian provides a TideLog License key. Enter that key in Obsidian Settings → TideLog → Pro. If you lose the key, use the License portal linked from settings and provide the purchase email plus Afdian order ID.

Refunds and support are handled by the developer through the support channels below. If you cannot activate a valid purchase, contact support with your order ID and the error message shown in TideLog.

---

## AI Providers

| Provider | Status | Notes |
|----------|--------|-------|
| OpenRouter | Recommended | Multi-model access, cost-effective |
| Anthropic Claude | Supported | Direct Claude API |
| Google Gemini | Supported | Gemini API |
| OpenAI | Supported | OpenAI API |
| SiliconFlow | Supported | OpenAI-compatible endpoint |
| Custom API | Supported | Any OpenAI-compatible endpoint |

AI features require your own API key or account with the provider you choose. TideLog does not include AI credits.

Custom model names + connection test button supported.

---

## Installation

### Manual Install

1. Download `main.js`, `manifest.json`, `styles.css` from the latest [Release](https://github.com/enhen3/Tidelog/releases).
2. Create `.obsidian/plugins/tidelog/` in your vault.
3. Copy the files into that directory.
4. Restart Obsidian → Settings → Community Plugins → Enable **TideLog**.

### Development

```bash
git clone https://github.com/enhen3/Tidelog.git
cd Tidelog
npm install
npm run dev           # Development mode (watch)
npm run build         # Production build only
npm run deploy        # Copy built assets to your local vault
npm run check         # Typecheck, lint, tests, build, release asset checks
```

`npm run deploy` requires `OBSIDIAN_VAULT` to point at your test vault path.

---

## Configuration

In Obsidian Settings → TideLog:

1. AI provider — choose provider, configure API key, custom model name.
2. Connection test — one-click API connectivity check.
3. Day boundary — set when a "day" starts.
4. Folder paths — customize daily, plan, and archive directories.
5. Review questions — customize order and content.
6. Pro license — activate, deactivate, or open the self-service License portal.

---

## Vault Structure

TideLog creates folders and files only when a feature needs them, such as starting a plan/review flow or generating an insight.

```
your-vault/
├── 01-Daily/
│   ├── 2026-03-06.md
│   └── ...
├── 02-Plan/
│   ├── Weekly/
│   │   └── 2026-W10.md
│   └── Monthly/
│       └── 2026-03.md
└── 03-Archive/
    ├── user_profile.md
    ├── principles.md
    ├── patterns.md
    ├── quick_capture.md
    └── Insights/
        ├── 2026-W10-weekly.md
        └── 2026-03-monthly.md
```

---

## Commands

| Command | Description |
|---------|-------------|
| `TideLog: Open chat` | Open the chat sidebar |
| `TideLog: Open getting started` | Reopen the quick start guide |
| `TideLog: Start morning review` | Start morning planning SOP |
| `TideLog: Start evening review` | Start evening review SOP |
| `TideLog: Generate weekly insight` | Generate a weekly insight report |
| `TideLog: Generate monthly insight` | Generate a monthly insight report |
| `TideLog: Open dashboard` | Open dashboard view |
| `TideLog: Open kanban board` | Open kanban board |
| `TideLog: Open calendar heatmap` | Open calendar view |

---

## Network Usage

TideLog makes outbound HTTPS requests only when you configure or trigger features that need them:

1. **AI API calls** — When you use AI-powered features, TideLog sends the relevant prompt and selected journal content to the AI provider configured in settings: OpenRouter, Anthropic, Google Gemini, OpenAI, SiliconFlow, or your custom endpoint. API keys and submitted content are governed by that provider's terms and privacy policy.
2. **Connection tests** — When you click the connection test button, TideLog contacts the selected AI provider to verify your API key and model configuration.
3. **License activation and verification** — If you activate TideLog Pro, TideLog contacts `https://tidelog-api.mydreamchronicle.com` to validate the License key and enforce the 3-device limit. The request contains the License key and a generated device identifier; no vault content is sent.
4. **Purchase and License portal links** — Buttons in settings open Afdian or `https://tidelog-api.mydreamchronicle.com/portal` in your browser. Opening those pages is user-initiated.

TideLog does not include client-side telemetry, analytics SDKs, dynamic ads, or any self-update mechanism.

See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

## Permissions and Data Access

TideLog runs inside your Obsidian vault and needs vault access to provide its core workflow:

- **Vault enumeration**: TideLog scans configured daily-note, review, and insight folders to build the calendar heatmap, dashboard, Kanban views, carry-forward task lists, and weekly/monthly summaries.
- **Vault read**: TideLog reads the notes you select or the notes in configured TideLog folders when rendering dashboards, carrying forward unfinished tasks, or generating AI prompts you explicitly trigger.
- **Vault write**: TideLog creates and updates Markdown notes for morning plans, evening reviews, tasks, insight reports, templates, and cache files in the folders you configure.
- **Network access**: TideLog only sends data to your configured AI provider when you use AI features, and to TideLog's license service when you activate or verify Pro. License requests do not include vault note content.

TideLog does not access files outside your Obsidian vault.

---

## Support

- GitHub issues: <https://github.com/enhen3/Tidelog/issues>
- License activation support: include your Afdian order ID, License key prefix, device error message, and TideLog version.
- Do not post full API keys, full License keys, or private journal content in public issues.

---

## Tech Stack

- TypeScript + esbuild
- Obsidian API
- Obsidian `requestUrl` for mobile-compatible network calls
- Cloudflare Worker + D1 for License verification

---

## License

TideLog source code is licensed under the GNU Affero General Public License v3.0. TideLog Pro access, the official license service, and paid distribution terms remain commercial product terms. See [LICENSE](./LICENSE).

---

<details>
<summary>中文说明</summary>

# TideLog

TideLog 是一个 Obsidian 插件，通过 AI 引导的 **计划 → 日记 → 复盘 → 洞察** 正循环，帮助你建立元认知能力，更深刻地了解自己的思维和行动模式。

### 快速开始

1. 安装后打开 Obsidian 设置 → TideLog。
2. 配置 AI 服务商和 API Key，并点击测试连接。
3. 运行 `TideLog: Start morning review` 开始晨间计划。
4. 运行 `TideLog: Start evening review` 完成晚间复盘。
5. 如果你需要完整复盘、仪表盘、热力图和 AI 周/月洞察，可以升级 TideLog Pro。

### 主要功能

- 晨间计划 SOP：精力评估、多任务输入、子任务、任务继承。
- 晚间复盘 SOP：免费版可完成前 2 个问题，Pro 解锁完整 5+4 问题流。
- 洞察系统：周报、月报、用户画像建议。
- 日历与看板：情绪热力图、金字塔视图、任务继承。
- 仪表盘：今日聚焦、周进度、情绪趋势。
- 自由对话：随时与 AI 聊天，智能意图检测。

### 免费版与 Pro

TideLog 可以免费安装使用。完整功能需要 TideLog Pro License。

| 功能 | 免费版 | Pro |
|---|---:|---:|
| 晨间计划 SOP | 支持 | 支持 |
| 使用自带 API Key 自由对话 | 支持 | 支持 |
| 基础任务记录与日记写入 | 支持 | 支持 |
| 晚间复盘问题 | 前 2 个 | 完整 5+4 流程 |
| 周报洞察 | 不支持 | 支持 |
| 月报洞察 | 不支持 | 支持 |
| 用户画像建议 | 不支持 | 支持 |
| 仪表盘 | 不支持 | 支持 |
| 日历热力图 | 不支持 | 支持 |
| 设备数 | 不适用 | 每个 License 3 台设备 |
| 离线宽限期 | 不适用 | 7 天 |

当前通过爱发电购买：

- 年度版：¥49/年。
- 终身版：¥99 一次性买断。
- 购买地址：<https://afdian.com/item/463307362c2f11f1b39d52540025c377>。

购买后，爱发电会提供 TideLog License。请在 Obsidian 设置 → TideLog → Pro 中输入激活。如果找不到 License，可以用设置页中的 License portal，凭购买邮箱和爱发电订单号查询。

### 网络通信说明

TideLog 只在以下场景发起 HTTPS 请求：

1. AI 功能调用：使用晨间计划、晚间复盘、洞察生成等功能时，会将相关提示词和必要日记内容发送到你在设置中配置的 AI 服务商。
2. 连接测试：点击测试按钮时，会向所选 AI 服务商验证 API Key 和模型配置。
3. Pro 授权验证：激活 Pro 后，会向 `https://tidelog-api.mydreamchronicle.com` 发送 License 和设备标识符，用于验证授权和管理 3 台设备限制，不发送 Vault 内容。
4. 购买和 License portal：设置页按钮会在浏览器中打开爱发电或 License portal，此操作由用户主动触发。

TideLog 不包含客户端遥测、分析 SDK、动态广告或自动更新机制。完整隐私说明见 [PRIVACY.md](./PRIVACY.md)。

### 许可证

TideLog 源代码采用 GNU Affero General Public License v3.0。TideLog Pro 授权、官方 License 服务和付费分发条款仍属于商业产品条款。完整条款见 [LICENSE](./LICENSE)。

### 权限与数据访问

TideLog 在你的 Obsidian Vault 内运行，需要以下权限来完成核心工作流：

- Vault 枚举：扫描你配置的日记、复盘和洞察文件夹，用于日历热力图、仪表盘、看板、任务继承和周/月总结。
- Vault 读取：读取你选择的笔记或 TideLog 配置文件夹中的笔记，用于渲染视图、继承未完成任务，或生成你主动触发的 AI 提示词。
- Vault 写入：在你配置的文件夹中创建或更新晨间计划、晚间复盘、任务、洞察报告、模板和缓存文件。
- 网络访问：仅在你使用 AI 功能时请求你配置的 AI 服务商；仅在激活或验证 Pro 时请求 TideLog 授权服务。授权请求不包含 Vault 笔记内容。

TideLog 不访问 Obsidian Vault 之外的文件。

</details>
