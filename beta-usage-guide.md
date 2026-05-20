# 🌊 TideLog 使用指南

安装并激活插件后，先别急着配置所有细节。TideLog 的最小路径是：

```text
Plan 写下今天任务 → Review 完成复盘闭环 → Insights 在达标后生成/更新报告 → 回到下一步行动
```

---

## 第一步：先完成一次 Plan → Review

1. 打开 Obsidian 左侧 TideLog 图标。
2. 在 **Plan** 里添加今天最重要的 1–3 个任务。
3. 白天勾选完成状态，临时想法放进「灵感」。
4. 晚上进入 **Review**，完成今日 Daily Review。
5. 如果漏掉某天，可以在 Review 的本月闭环里点历史日期补复盘。

> 先确认这个动作对你有用，再去调整文件夹、问题流、模型和 Pro 设置。

---

## 第二步：按需配置 AI 服务

TideLog 的基础记录和任务管理可以先使用；AI 功能需要你自己的 API Key。

AI 会在这些动作中被调用：

- 自由聊天。
- 测试连接。
- 生成或更新周报 / 月报 / AI 眼中的你。
- 完成复盘后刷新日 / 周 / 月计划建议。

### 推荐：硅基流动 SiliconFlow（国内最简单）

1. 访问 [siliconflow.cn](https://siliconflow.cn) → 注册账号。
2. 进入 **控制台 → API 密钥**。
3. 点击 **新建 API 密钥**，复制生成的 Key。
4. 回到 Obsidian → Settings → TideLog。
5. **AI provider** 选择 `SiliconFlow`。
6. 粘贴 API Key，使用默认推荐模型，点击 **测试连接**。

### 其他平台选择

| 平台 | 适合谁 | 设置中选择 | 获取 Key 地址 |
|------|--------|-----------|-------------|
| **SiliconFlow** | 国内用户 | SiliconFlow | [siliconflow.cn](https://siliconflow.cn) |
| **OpenRouter** | 想用多种模型 | OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Anthropic** | 想用 Claude | Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | 免费额度大 | Gemini | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **OpenAI** | 想用 GPT | OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| **自定义** | 自建 / 其他兼容 API | Custom | 按你的服务提供 |

不确定选哪个：国内用户先选 SiliconFlow，海外用户先选 OpenRouter。

---

## 第三步：看懂三个入口

### ☀️ Plan

你的下一步行动中心：

- 日 / 周 / 月任务。
- 灵感收集。
- 任务勾选、拖拽、编辑、子任务。
- 未完成任务顺延到今天。
- 复盘后刷新出来的日 / 周 / 月计划建议。

### 🌙 Review

你的闭环完成入口：

- 本月闭环徽章：蓝色半环代表有计划，金色半环代表完成复盘。
- 今天复盘：回答你设置里的 Daily Review 问题。
- 历史补复盘：点击过去日期即可补上。
- 问题流可在设置中编辑、排序、启停。

免费版只使用前 2 个已启用问题；Pro 使用完整问题流。

### 🧭 Insights

你的长期模式入口：

- 本周报告：至少 3 次闭环后可生成。
- 本月报告：至少 8 次闭环后可生成。
- AI 眼中的你：生成个人画像更新。
- 报告预览：已有报告会在插件页内显示摘要。
- 报告更新：有新增计划或复盘后，可以用新记录更新报告。

---

## 日常使用建议

```text
早上：Plan 写下今天要推进什么
白天：勾选任务，随时记录灵感
晚上：Review 完成复盘闭环
周末 / 月末：Insights 看报告，并把洞察带回下一步计划
```

---

## 常见问题

**Q: AI 没有回复 / 报错了？**
A: 先去 Settings → TideLog，点击「测试连接」。通常是 API Key、模型名或余额问题。

**Q: 可以换模型吗？**
A: 可以。设置里可以选择推荐模型，也可以手动输入模型名。

**Q: 日记和报告文件在哪？**
A: 默认使用设置里的 Daily / Plan / Archive 文件夹。你可以按自己的 vault 结构修改路径。

**Q: 数据安全吗？**
A: 记录默认保存在你的本地 vault。AI 只在你主动触发时调用；计划建议和洞察读取相关周期/文件范围。TideLog 不包含遥测或分析 SDK。

**Q: 我应该先买 Pro 吗？**
A: 不建议。先用免费版跑通 Plan → Review 的基础闭环。如果你确实需要完整 Review 问题流、周/月 Insights、AI 眼中的你和报告更新，再考虑 Pro。
