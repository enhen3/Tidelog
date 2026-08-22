<a id="中文版本"></a>

<p align="center">
  <a href="#中文版本"><img src="https://img.shields.io/badge/中文-2F8396?style=for-the-badge" alt="中文版"></a>
  <a href="#english-version"><img src="https://img.shields.io/badge/English-10252C?style=for-the-badge" alt="English version"></a>
</p>

<p align="center">
  <img src="assets/tidelog-logo.svg" alt="TideLog logo" width="88">
</p>

<h1 align="center">TideLog</h1>

<p align="center">
  <strong>让昨天的笔记，推动明天的行动。</strong>
</p>

<p align="center">
  在 Obsidian 里把 Daily Notes 连接成 Plan → Review → Insights 闭环。<br>
  <em>不是多写一点，而是让写下来的内容回到下一步。</em>
</p>

![TideLog 产品首图](assets/tidelog-hero.svg)

## TideLog 是什么

TideLog 是一个 Obsidian 插件，用来把你的 Daily Notes 从「记录存档」变成「行动反馈系统」。

很多人已经每天写日记、计划、复盘，但真正的问题不是没有记录，而是：

> 记录很多，行动很少改变。

昨天的计划、晚上的复盘、偶尔出现的洞察，常常散落在 vault 深处。写过了，但没有回来提醒你、校正你、推动你。

TideLog 帮你建立的是这个闭环：

```text
Plan 任务 → Review 闭环 → Insights 洞察 → 更新下一步
```

![TideLog 工作流闭环](assets/tidelog-loop.svg)

## 核心功能

![TideLog 功能总览](assets/tidelog-preview.svg)

### 🌅 Plan：把下一步放在最前面

Plan 优先展示今天的 To Do，并支持日 / 周 / 月三个周期：

- 添加、编辑、拖拽、勾选任务和子任务。
- 未完成任务可以顺延到今天。
- 点击日期、周、月标题切换目标周期。
- 用「灵感」收集暂时没有安排到日期的想法。
- 完成 Review 后，可刷新日 / 周 / 月计划建议，让复盘回到下一步行动。

### 🌙 Review：完成当天或历史日期的复盘闭环

Review 先显示本月闭环徽章：

- 蓝色半环表示当天有计划。
- 金色半环表示当天完成了有效复盘。
- 点击历史日期，可以补做那天的 Daily Review。
- Review 问题可以在设置里编辑、排序、启停。

免费版会使用前 2 个已启用问题；Pro 会使用完整问题流。

### 🧭 Insights：从足够多闭环里看见长期模式

Insights 不是随时乱读整个 vault 的总结按钮，而是基于足够多的 Plan / Review 闭环生成报告：

- 本周报告：至少 3 次闭环后可生成。
- 本月报告：至少 8 次闭环后可生成。
- AI 眼中的你：从长期记录里生成画像更新。
- 报告预览：已有报告会在插件页内显示摘要。
- 报告更新：如果报告生成后又新增计划或复盘，可以用新记录更新本周期报告。

### 🔐 本地优先，AI 由你触发

TideLog 默认把记录保存在你的 Obsidian vault 里。AI 只在你主动触发时调用：聊天、测试连接、生成/更新报告，或完成复盘后刷新计划建议。

计划建议和洞察会读取相关周期/文件范围，不包含客户端遥测、分析 SDK、动态广告或自动更新机制。

## 适合谁

TideLog 适合已经在 Obsidian 里生活，并且希望记录真的影响行动的人：

- 📝 每天写 Daily Notes，但希望它们影响明天的优先级。
- 🧑‍💻 自由职业者、独立开发者、学生、研究者，或正在转型期需要自我管理的人。
- 🧠 正在搭建第二大脑、个人操作系统、复盘系统或长期 AI 记忆工作流的人。
- 🔐 重视 Markdown 所有权，不希望把私人生活锁进另一个 SaaS 工具的人。

如果你只是想偶尔写一篇漂亮日记，TideLog 可能不是必要工具。它更适合想把复盘变成长期反馈系统的人。

## 安装与新手开始

1. 在 Obsidian 里打开 **Settings → Community plugins**，搜索 `TideLog`，安装并启用。
2. 打开 **Settings → TideLog**。先不要调太多参数，先完成一次 Plan → Review。
3. 如果需要 AI 功能，选择 AI provider，填入你自己的 API Key 和模型名，然后点击 **测试连接**。
4. 到 TideLog 主界面的 **Plan**，添加今天的 1–3 个任务，也可以把临时想法放进「灵感」。
5. 晚上到 **Review**，完成今日复盘；如果漏掉某天，可以点击历史日期补复盘。
6. 积累足够闭环后，再到 **Insights** 生成、预览或更新本周报告、本月报告和 AI 眼中的你。

最小使用节奏：

```text
早上：Plan 写下今天要推进什么
白天：勾选任务，随时收集灵感
晚上：Review 完成复盘闭环
周末 / 月末：Insights 看报告，并把洞察带回下一步计划
```

## 免费版与 Pro

TideLog 可以免费安装和试用。Pro 解锁完整的长期复盘系统。

| 功能 | 免费版 | Pro |
|---|---:|---:|
| Plan：日 / 周 / 月任务与灵感 | 支持 | 支持 |
| 使用自己的 AI API Key 对话 | 支持 | 支持 |
| 基础任务记录与 Markdown 写入 | 支持 | 支持 |
| Review 问题流 | 前 2 个已启用问题 | 完整问题流 |
| 历史日期补复盘 | 支持基础闭环 | 支持完整问题流 |
| Insights：本周报告 / 本月报告 / 新数据更新 | — | 支持 |
| AI 眼中的你 | — | 支持 |
| 复盘后的日 / 周 / 月计划建议 | 基础体验 | 更完整长期闭环 |
| 设备数 | — | 每个 License 3 台设备 |

- 年度版：**早期支持价 ¥39/年**（原价 ¥49）
- 终身版：**早期支持价 ¥78 一次性买断**（原价 ¥99）
- 购买地址：[购买 TideLog Pro](https://afdian.com/item/463307362c2f11f1b39d52540025c377)

购买后，在 **Settings → TideLog → Pro** 输入 TideLog License 即可激活。

## 隐私

TideLog 的原则很简单：**你的日常记录默认留在你的 vault 里。**

- 🔐 AI API Key 和 Pro License key 使用 Obsidian SecretStorage 保存。
- 🌐 只有当你主动对话、测试连接、生成/更新报告、完成复盘后刷新计划建议、激活 License 或打开购买/License portal 时，才会发起网络请求。
- 🔁 **有一个请求是自动的**：如果你已激活 TideLog Pro，插件会在 Obsidian 启动时于后台校验一次 License，只发送 License Key 和一个生成的设备标识。未激活 License 的用户，启动时不产生任何网络请求。
- 📝 AI 功能会把必要提示词和相关笔记内容发送给你自己配置的 AI 服务商。
- 📁 计划建议和洞察读取相关周期/文件范围，而不是无提示地扫描整个 vault。
- 🚫 TideLog 不包含客户端遥测、分析 SDK、动态广告或自动更新机制。

完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 支持与协议

- 问题反馈：通过 [TideLog GitHub Issues](https://github.com/enhen3/Tidelog/issues) 提交。
- 请不要在公开 issue 中粘贴 License Key、API Key 或私人笔记内容。
- 源码协议：GNU AGPL v3.0。Pro 授权与付费分发遵循商业产品条款，见 [LICENSE](./LICENSE)。

---

## English version

<p align="center">
  <a href="#中文版本"><img src="https://img.shields.io/badge/中文-2F8396?style=for-the-badge" alt="中文版"></a>
  <a href="#english-version"><img src="https://img.shields.io/badge/English-10252C?style=for-the-badge" alt="English version"></a>
</p>

![TideLog product hero](assets/tidelog-hero.svg)

**Make yesterday’s notes change tomorrow’s actions.**

TideLog is an Obsidian plugin that turns Daily Notes into a Plan → Review → Insights feedback loop.

### Why TideLog exists

Many people write daily notes, plans, and reflections. The harder problem is that the notes rarely return to change what they do next.

TideLog adds the missing loop:

```text
Plan tasks → Review loops → Insights → Update the next action
```

![TideLog feedback loop](assets/tidelog-loop.svg)

### What TideLog helps you do

- Use **Plan** for day / week / month tasks, idea capture, carry-forward tasks, and planning suggestions after reviews.
- Use **Review** to complete today’s review or catch up a past date from the monthly loop view.
- Use **Insights** to generate and preview weekly reports, monthly reports, and AI profile analysis after enough loops unlock.
- Update reports when new plans or reviews arrive after a report was generated.
- Keep your workflow Markdown-first and inside your own vault.

![TideLog feature overview](assets/tidelog-preview.svg)

### Install and start

1. Install TideLog from **Obsidian Community plugins**: search for `TideLog`, install, then enable it.
2. Open **Settings → TideLog**. Do not tune every setting first; complete one Plan → Review first.
3. If you want AI features, choose an AI provider, enter your own API key/model, and test the connection.
4. Use **Plan** to add 1–3 tasks for today and capture ideas.
5. Use **Review** for today’s review, or select a past date to catch up.
6. After enough loops unlock, open **Insights** to generate, preview, or update weekly reports, monthly reports, and AI view of you.

### Privacy

Your daily records stay in your vault by default. TideLog only sends network requests when you explicitly chat with AI, test a connection, generate/update reports, refresh planning suggestions after a review, activate a license, or open purchase/license links.

**One request is automatic:** if you have activated TideLog Pro, the plugin verifies your license in the background when Obsidian starts. That request sends only your license key and a generated device identifier. If you have not activated a license, TideLog makes no network request on startup.

TideLog stores AI API keys and Pro license keys with Obsidian SecretStorage. Suggestions and insights read the relevant period/file scope. TideLog does not include telemetry, analytics SDKs, dynamic ads, or a self-update mechanism.

Full details: [PRIVACY.md](./PRIVACY.md).

### Support and payment

- Bug reports and feature requests: [TideLog GitHub Issues](https://github.com/enhen3/Tidelog/issues)
- Please do not paste License keys, API keys, or private note content into public issues.
- International payment is being prepared. If you want TideLog Pro, please leave a note in GitHub Issues so I can prioritize the setup based on real demand.
