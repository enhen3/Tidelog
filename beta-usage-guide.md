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

### ☀️ Plan（计划标签）

这是你的**任务看板**，展示今日 / 本周 / 本月的任务。
- 在这里查看和管理各级计划
- 可以勾选完成、拖拽排序、编辑任务
- 未完成的任务会自动继承到下一天

### 🌙 Review（复盘标签）

这里做**晨间计划**和**晚间复盘**。

**晨间计划**（上方 Review 按钮 → Morning Plan 命令）：
1. 评估今日精力状态（1-10 分）
2. 输入今天要做的任务
3. AI 自动写入日记

**晚间复盘**（点击 🌙 Review 按钮）：
1. 🎯 目标对标 — 回顾今天任务完成情况
2. ✨ 成功日记 — 记录今天的成就
3. 😊 开心事与情绪 — 记录开心的事 + 情绪评分
4. 💭 焦虑觉察 — 觉察负面情绪
5. 📋 明日计划 — 规划明天最重要的事
6. 更多可选：深度分析、反思、原则提炼、自由随笔

> 每个环节 AI 都会给出温暖的回应和引导。

### 🌓 Insights（洞察标签）

点击 💡 Insight 按钮进入对话，可以：
- 📊 **生成周报** — AI 分析你一周的任务完成率、情绪趋势
- 📈 **生成月报** — 月度成长总结
- 👤 **画像建议** — AI 根据你的日记建议更新个人画像
- 也可以直接和 AI 自由聊天

---

## 其他功能入口

| 功能 | 打开方式 |
|------|---------|
| 📊 仪表盘 | 命令面板 → `TideLog: Open dashboard` |
| 🗓️ 日历 | 命令面板 → `TideLog: Open calendar` |
| ⚙️ 设置 | Obsidian 设置 → TideLog |

> 命令面板快捷键：Mac `Cmd+P`，Windows `Ctrl+P`

---

## 日常使用建议

```
早上 → 打开 TideLog → 做晨间计划（记录精力 + 列任务）
白天 → 在 Plan 看板上勾选完成的任务
晚上 → 点 Review 做晚间复盘（5 分钟回顾一天）
周末 → 生成周报，看看这周的模式和趋势
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
A: 所有日记数据都保存在你本地的 Obsidian Vault 中，不会上传到任何服务器。AI 对话内容只会发送到你选择的 AI 服务商。
