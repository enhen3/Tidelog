<p align="center">
  <img src="assets/tidelog-logo.svg" alt="TideLog logo" width="88">
</p>

<h1 align="center">TideLog</h1>

<p align="center">
  <strong>Turn Obsidian Daily Notes into a feedback loop for planning, review, insight, and action.</strong>
</p>

<p align="center">
  A Markdown-first daily operating system for people who want their notes to change what they do next.<br>
  <em>把每天写下来的计划、复盘和洞察，变成真正会反过来推动行动的系统。</em>
</p>

![TideLog product hero](assets/tidelog-hero.svg)

## Daily notes are not the system. The loop is.

Most people do not fail at note-taking because they lack another template.

They fail because yesterday’s notes do not reliably return to tomorrow’s decisions. Plans stay separate from reviews. Reviews become diary fragments. Insights appear once, then disappear into the vault.

**TideLog adds the missing loop inside Obsidian:**

```text
Plan → Review → Insight → Action
```

![TideLog workflow loop](assets/tidelog-loop.svg)

## What TideLog helps you do

| If your Obsidian looks like this | TideLog gives you |
|---|---|
| You write Daily Notes but rarely revisit them | A repeatable morning + evening structure that makes each day comparable |
| Your reviews become free-form diary entries | Guided, editable review questions tied to goals, outcomes, emotions, and next actions |
| You have months of notes but no visible pattern | Weekly/monthly AI insight reports, emotion trends, recurring behaviors, principles, and profile suggestions |
| You want AI help without moving life into another app | AI workflows that operate from your configured folders and write Markdown back to your vault |
| Your tasks and reflections live in different places | Dashboard, Calendar heatmap, and Kanban views that turn reflections back into action |

## The core experience

![TideLog feature preview](assets/tidelog-preview.svg)

### 1. Plan the day

Start with a lightweight morning SOP: energy, priorities, tasks, subtasks, and unfinished items carried forward from previous days.

### 2. Review the evening

Use editable review prompts instead of a blank page. Keep the questions that work, disable the ones that do not, and make the system fit your own method.

### 3. Find patterns with AI

Generate weekly/monthly insight reports from your own notes: mood shifts, recurring obstacles, successful behaviors, user/profile suggestions, and reusable principles.

### 4. Turn insight back into action

Use the Dashboard, Calendar heatmap, and Kanban views to see what is happening over time—and decide what to do next.

## Who TideLog is for

TideLog is designed for people who already live in Obsidian and want a stronger feedback system:

- Daily Notes users who want their notes to affect tomorrow’s priorities.
- Freelancers, independent builders, students, researchers, and career-transition periods where self-management matters.
- People building a personal operating system, second brain, review habit, or long-term AI memory workflow.
- Users who care about Markdown ownership and do not want their private life locked inside another SaaS tool.

It may be unnecessary if you only want a beautiful occasional diary app. TideLog is for people who want a repeatable system.

## Install and start

1. Install TideLog from **Obsidian Community plugins**: search for `TideLog`, install, then enable it.
2. Open **Obsidian Settings → TideLog** and configure your AI provider and API key if you want AI features.
3. Run `TideLog: Start morning review` to plan the day.
4. Run `TideLog: Start evening review` to review the evening.
5. When you have enough notes, run `TideLog: Generate weekly insight`, `TideLog: Generate monthly insight`, `TideLog: Open dashboard`, or `TideLog: Open calendar heatmap`.

## Free and Pro

TideLog is free to install and try. TideLog Pro unlocks the complete long-term review system.

| Feature | Free | Pro |
|---|---:|---:|
| Morning planning SOP | Yes | Yes |
| Chat with your own AI API key | Yes | Yes |
| Basic task capture and Markdown writing | Yes | Yes |
| Evening review prompts | First 2 prompts | Full 5+4 flow |
| Weekly/monthly insight reports | — | Yes |
| User/profile suggestions | — | Yes |
| Dashboard / Calendar heatmap / Kanban | — | Yes |
| Devices | — | 3 devices per license |
| Offline grace period | — | 7 days |

Current purchase options via Afdian:

- Annual: **¥49/year**
- Lifetime: **¥99 one-time purchase**
- Purchase: <https://afdian.com/item/463307362c2f11f1b39d52540025c377>

After purchase, Afdian provides a TideLog License. Activate it in **Obsidian Settings → TideLog → Pro**. If you cannot find the license, use the License portal in the settings page with your purchase email and Afdian order number.

## Privacy and data ownership

TideLog is designed around a simple principle: **your daily records stay in your vault unless you explicitly trigger a feature that needs a network request.**

TideLog reads or writes your vault only for the workflows you configure:

- scanning configured daily/planning/archive folders for Dashboard, Calendar heatmap, Kanban, task carry-forward, and weekly/monthly summaries;
- reading relevant notes to render views or prepare AI prompts you explicitly trigger;
- creating or updating morning plans, evening reviews, tasks, insight reports, templates, and local cache files in your configured folders.

TideLog stores your AI API key and TideLog Pro license key with Obsidian SecretStorage. Regular plugin settings store only non-secret configuration such as provider, model, folder paths, generated device identifier, and license status.

TideLog makes outbound HTTPS requests only for:

1. **AI API calls** when you trigger AI chat, planning, review, or insight generation through your configured provider;
2. **connection tests** when you test an AI provider/API key;
3. **license activation and verification** through `https://tidelog-api.mydreamchronicle.com` with your license key and generated device identifier—no vault note content is sent for license checks;
4. **purchase and license portal links** opened by your own click.

TideLog does **not** include client-side telemetry, analytics SDKs, dynamic ads, or any self-update mechanism. TideLog does not access files outside your Obsidian vault. See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

## Support

- GitHub issues: <https://github.com/enhen3/Tidelog/issues>
- License activation support: include your Afdian order number, license key prefix, device error message, and TideLog version.
- Do not paste full API keys, full license keys, or private diary content into public issues.

## License

TideLog source code is licensed under the GNU Affero General Public License v3.0. TideLog Pro access, the official license service, and paid distribution terms remain commercial product terms. See [LICENSE](./LICENSE).

---

<details>
<summary>中文简介</summary>

# TideLog

TideLog 是一个在 Obsidian 里运行的日常反馈系统：

```text
晨间计划 → 晚间复盘 → AI 洞察 → 下一步行动
```

它不是更复杂的日记模板，也不是又一个任务清单。它想解决的是：你已经写下了很多 Daily Notes，但这些记录很少真正反过来改变明天怎么做。

TideLog 会把你的计划、任务、情绪、复盘、周报、月报、Dashboard、日历热力图和 Kanban 尽量沉淀在你自己的 Markdown vault 中。AI 功能只在你主动触发时调用你配置的服务商。

免费版可以试用核心流程；Pro 解锁完整晚间复盘、周/月洞察、用户画像建议、Dashboard、日历热力图和 Kanban。

</details>
