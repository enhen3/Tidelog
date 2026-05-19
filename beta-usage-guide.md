# 🌊 TideLog 使用指南

安装并激活插件后，跟着这个指南完成设置，即可开始使用。

---

## 第一步：配置 AI 服务

TideLog 的核心功能依赖 AI，你需要先获取一个 API Key。

### 推荐：硅基流动 SiliconFlow（国内最简单）

1. 访问 [siliconflow.cn](https://siliconflow.cn) → 注册账号
2. 进入 **控制台** → 左侧菜单 **API 密钥**
3. 点击 **新建 API 密钥** → 复制生成的 Key（以 `sk-` 开头）
4. 回到 Obsidian → 设置 → TideLog
5. **AI provider** 选择 `SiliconFlow`
6. 粘贴你的 API Key
7. 点击 **测试连接**，看到 ✅ 表示配置成功

> 💡 SiliconFlow 新用户注册送额度，够你用很久。推荐模型 DeepSeek-V3（默认已选好）。

### 其他平台选择

| 平台 | 适合谁 | 设置中选择 | 获取 Key 地址 |
|------|--------|-----------|-------------|
| **SiliconFlow** | 国内用户 | SiliconFlow | [siliconflow.cn](https://siliconflow.cn) |
| **OpenRouter** | 想用多种模型 | OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Anthropic** | 想用 Claude | Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | 免费额度大 | Gemini | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **OpenAI** | 想用 GPT-4o | OpenAI | [platform.openai.com](https://platform.openai.com/api-keys) |
| **自定义** | 自建 / 其他兼容 API | Custom | 按你的服务提供 |

> 不确定选哪个？**国内用户选 SiliconFlow，海外用户选 OpenRouter。**

---

## 第二步：了解基本功能

TideLog 的主界面在左侧边栏，点击 🌊 图标打开。有三个标签页：

### ☀️ Plan（计划）

你的 To Do 中心，默认优先展示今天的任务。
- 在「日 / 周 / 月」之间切换，查看对应周期的任务
- 点击日期或周期标题时展开选择器，快速跳到其他日期、周或月份
- 在「灵感」中记录暂时没有安排到日期的想法
- 勾选完成、拖拽排序、编辑、添加子任务
- 未完成的任务会自动继承到下一天

### 🌙 Review（复盘）

这里会先显示本月闭环：蓝色半环表示当天有计划，金色半环表示当天完成了有效复盘。点击过去日期时，如果那天还没有复盘，可以补上那天的 Daily Review。

点击 **开始 Daily Review** 后进入 AI 引导的复盘流程，依次回答多个问题：

1. 🎯 目标对标 — 回顾今天任务完成情况
2. ✨ 成功日记 — 记录今天的成就
3. 😊 开心事与情绪 — 记录开心的事
4. 💭 焦虑觉察 — 觉察负面情绪
5. 📋 明日计划 — 规划明天最重要的事
6. 更多可选：深度分析、反思、原则提炼、自由随笔

每个环节 AI 都会给出温暖的回应，最后评估今日心情并保存到日记。

### 🌓 Insights（洞察）

包含三个板块：
- **本周报告** — 至少 3 次完整闭环，已有报告可预览；如果之后有新增记录，可以更新
- **本月报告** — 至少 8 次完整闭环，已有报告可预览；如果之后有新增记录，可以更新
- **AI 眼中的你** — 每月最多生成一次画像更新

如果当前周期已经生成过报告，Insights 会先在当前页展示简要预览，再提供打开完整文档的入口；只有在新增计划或复盘记录后，才会出现更新报告入口。

---

## 日常使用建议

```
早上 → 在 Plan 标签添加今天的任务
白天 → 在 Plan 里勾选完成的任务，随时记录灵感
晚上 → 点 Review 做每日复盘（5 分钟回顾一天）
周末 → 在 Insights 查看本周报告；月底查看本月报告
```

---

## ❓ 常见问题

**Q: AI 没有回复 / 报错了？**
A: 大概率是 API Key 没配对。去设置 → TideLog → 点「测试连接」检查一下。

**Q: 可以换模型吗？**
A: 可以！设置里有「Model」字段，可以输入你想用的模型名。比如 SiliconFlow 上可以用 `deepseek-ai/DeepSeek-V3`、`Qwen/Qwen2.5-72B-Instruct` 等。

**Q: 日记文件在哪？**
A: 默认在 Vault 的 `01-Daily/` 文件夹，可以在设置中自定义路径。

**Q: 数据安全吗？**
A: 所有日记数据都保存在你本地的 Obsidian Vault 中。只有当你主动对话、测试连接、生成/更新报告，或完成复盘后刷新计划建议时，相关内容才会发送到你选择的 AI 服务商。
