<p align="center">
  <img src="assets/tidelog-logo.svg" alt="TideLog logo" width="88">
</p>

<h1 align="center">TideLog</h1>

<p align="center">
  <strong>把 Obsidian Daily Notes 变成真正会影响行动的反馈系统。</strong>
</p>

<p align="center">
  晨间计划 · 晚间复盘 · AI 洞察 · Dashboard · Calendar · Kanban · Markdown-first<br>
  <em>不是多写一点，而是让你已经写下来的内容，真正回到明天的决策里。</em>
</p>

<p align="center">
  <a href="#english-version">English version</a>
</p>

![TideLog 产品首图](assets/tidelog-hero.svg)

## Daily Notes 不是系统，反馈闭环才是系统

很多人并不是缺一个新的日记模板。

真正的问题是：昨天写下来的记录，很少可靠地回到明天的行动里。计划是计划，复盘是复盘，洞察偶尔出现一次，然后又沉入 vault 深处。

**TideLog 在 Obsidian 里补上这个缺失的闭环：**

```text
晨间计划 → 晚间复盘 → AI 洞察 → 下一步行动
```

![TideLog 工作流闭环](assets/tidelog-loop.svg)

## TideLog 解决什么问题

| 如果你现在这样 | TideLog 会帮你这样做 |
|---|---|
| 每天都写 Daily Notes，但很少回看 | 用稳定的晨间/晚间结构，让每一天可以被比较、回顾和总结 |
| 晚上想复盘，却经常只写成流水账 | 用可编辑的复盘问题，引导你回看目标、成果、情绪、困难和明天行动 |
| 记录很多，但看不见长期模式 | 从你的笔记里生成周报/月报、情绪趋势、行为模式、原则和用户画像建议 |
| 想用 AI 理解自己，但不想把生活搬出 Obsidian | AI 只在你主动触发时工作，并尽量把结果写回你的 Markdown vault |
| 任务、情绪、计划、复盘分散在不同地方 | 用 Dashboard、日历热力图和 Kanban，把记录重新带回行动层 |

## 核心体验

![TideLog 功能总览](assets/tidelog-preview.svg)

### 1. 晨间计划：先让一天变清楚

用一个轻量 SOP 开始当天：评估精力、明确优先级、记录任务和子任务，并自动继承过去几天未完成的事项。

### 2. 晚间复盘：不用再面对空白页

使用可编辑、可排序、可启停的问题完成复盘。你可以用默认问题，也可以把它改成自己的方法论。

### 3. AI 洞察：从碎片里看见模式

基于你自己的笔记生成周报/月报：情绪变化、反复出现的困难、有效行为、用户画像建议和可复用原则。

### 4. 下一步行动：把洞察重新带回执行

通过 Dashboard、日历热力图和 Kanban 视图，把计划、任务、情绪、复盘和长期模式放到更容易回看的位置。

## 适合谁

TideLog 适合已经在 Obsidian 里生活，并且希望建立更强反馈系统的人：

- 每天写 Daily Notes，但希望记录真的影响明天的优先级。
- 自由职业者、独立开发者、学生、研究者，或正在转型期需要自我管理的人。
- 正在搭建第二大脑、个人操作系统、复盘系统或长期 AI 记忆工作流的人。
- 重视 Markdown 所有权，不希望把私人生活锁进另一个 SaaS 工具的人。

如果你只是想偶尔写一篇漂亮日记，TideLog 可能不是必要工具。它更适合想把复盘变成长期反馈系统的人。

## 安装与开始使用

1. 在 **Obsidian Community plugins** 里搜索 `TideLog`，安装并启用。
2. 打开 **Obsidian 设置 → TideLog**，如果需要 AI 功能，配置你的 AI 服务商和 API Key。
3. 运行 `TideLog: Start morning review`，开始晨间计划。
4. 运行 `TideLog: Start evening review`，完成晚间复盘。
5. 当积累足够记录后，使用 `TideLog: Generate weekly insight`、`TideLog: Generate monthly insight`、`TideLog: Open dashboard` 或 `TideLog: Open calendar heatmap` 查看长期模式。

## 免费版与 Pro

TideLog 可以免费安装和试用。TideLog Pro 解锁完整的长期复盘系统。

| 功能 | 免费版 | Pro |
|---|---:|---:|
| 晨间计划 SOP | 支持 | 支持 |
| 使用自己的 AI API Key 对话 | 支持 | 支持 |
| 基础任务记录与 Markdown 写入 | 支持 | 支持 |
| 晚间复盘问题 | 前 2 个 | 完整 5+4 流程 |
| 周报/月报洞察 | — | 支持 |
| 用户画像建议 | — | 支持 |
| Dashboard / 日历热力图 / Kanban | — | 支持 |
| 设备数 | — | 每个 License 3 台设备 |
| 离线宽限期 | — | 7 天 |

当前通过爱发电购买：

- 年度版：**¥49/年**
- 终身版：**¥99 一次性买断**
- 购买地址：<https://afdian.com/item/463307362c2f11f1b39d52540025c377>

购买后，爱发电会提供 TideLog License。请在 **Obsidian 设置 → TideLog → Pro** 中输入激活。如果找不到 License，可以使用设置页中的 License portal，凭购买邮箱和爱发电订单号查询。

## 数据、隐私与网络请求

TideLog 的默认原则是：**你的日常记录留在你的 vault 中；只有你主动触发需要网络的功能时，才会发起 HTTPS 请求。**

TideLog 只会在你配置的工作流范围内读取或写入 vault：

- 扫描你配置的日记、计划和归档文件夹，用于 Dashboard、日历热力图、Kanban、任务继承和周/月总结。
- 读取相关笔记，用于渲染视图，或准备你主动触发的 AI 提示词。
- 在你配置的文件夹中创建或更新晨间计划、晚间复盘、任务、洞察报告、模板和本地缓存文件。

TideLog 会通过 Obsidian SecretStorage 保存你输入的 AI API Key 和 TideLog Pro License key；普通插件设置只保存服务商、模型、文件夹路径、设备标识符和授权状态等非密钥信息。

TideLog 只在以下场景发起网络请求：

1. **AI API calls**：当你主动触发 AI 对话、晨间计划、晚间复盘或洞察生成时，请求你配置的 AI 服务商。
2. **Connection tests**：当你点击测试连接时，向所选 AI 服务商验证 API Key 和模型配置。
3. **License activation and verification**：通过 `https://tidelog-api.mydreamchronicle.com` 激活或验证 License，只发送 license key 和生成的设备标识符；授权请求不包含 vault 笔记内容。
4. **Purchase and License portal links**：购买页和 License portal 只会在你主动点击时打开。

TideLog 不包含客户端遥测、分析 SDK、动态广告或自动更新机制。TideLog 不访问 Obsidian vault 之外的文件。完整隐私说明见 [PRIVACY.md](./PRIVACY.md)。

## 支持

- GitHub issues: <https://github.com/enhen3/Tidelog/issues>
- License 激活问题：请附上爱发电订单号、License key 前缀、设备错误提示和 TideLog 版本。
- 不要在公开 issue 中粘贴完整 API Key、完整 License key 或私人日记内容。

## License

TideLog source code is licensed under the GNU Affero General Public License v3.0. TideLog Pro access, the official license service, and paid distribution terms remain commercial product terms. See [LICENSE](./LICENSE).

---

<details id="english-version">
<summary>English version</summary>

# TideLog

**Turn Obsidian Daily Notes into a feedback loop for planning, review, insight, and action.**

A Markdown-first daily operating system for people who want their notes to change what they do next.

## Daily notes are not the system. The loop is.

Most people do not fail at note-taking because they lack another template.

They fail because yesterday’s notes do not reliably return to tomorrow’s decisions. Plans stay separate from reviews. Reviews become diary fragments. Insights appear once, then disappear into the vault.

**TideLog adds the missing loop inside Obsidian:**

```text
Plan → Review → Insight → Action
```

## What TideLog helps you do

- Make Daily Notes comparable with a repeatable morning + evening structure.
- Review without staring at a blank page, using editable prompts.
- Generate weekly/monthly AI insight reports from your own notes.
- Keep your workflow Markdown-first and inside your vault.
- Use Dashboard, Calendar heatmap, and Kanban views to turn reflection back into action.

## Install and start

1. Install TideLog from **Obsidian Community plugins**: search for `TideLog`, install, then enable it.
2. Open **Obsidian Settings → TideLog** and configure your AI provider and API key if you want AI features.
3. Run `TideLog: Start morning review` to plan the day.
4. Run `TideLog: Start evening review` to review the evening.
5. When you have enough notes, run `TideLog: Generate weekly insight`, `TideLog: Generate monthly insight`, `TideLog: Open dashboard`, or `TideLog: Open calendar heatmap`.

## Privacy

TideLog is designed around a simple principle: your daily records stay in your vault unless you explicitly trigger a feature that needs a network request.

TideLog stores AI API keys and TideLog Pro license keys with Obsidian SecretStorage. It does not include client-side telemetry, analytics SDKs, dynamic ads, or any self-update mechanism.

</details>
