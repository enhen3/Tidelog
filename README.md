# 🌊 TideLog「潮记」— Obsidian Plugin

> AI-guided daily tide — plan, log, reflect

TideLog 是一个 Obsidian 插件，通过 AI 引导的 **计划 → 日记 → 复盘 → 洞察** 正循环，帮助你建立元认知能力，更深刻地了解自己的思维和行动模式。

---

## ✨ 核心理念

```
制定计划 → 记录日记 → AI 分析 → 对话洞察 → 元认知提升 → 更好的行动
    ↑                                                          ↓
    └──────────────────── 正向循环 ──────────────────────────────┘
```

像和心理咨询师聊天一样，发现平时看不到的自己。

---

## 🚀 功能一览

### 🌅 晨间计划 SOP

- 精力状态评估（1-10 分）
- 多任务输入（支持子任务嵌套）
- 自动写入当日日记 `## 晨间计划`
- 未完成任务自动继承（过去 3 天的待办自动出现，一键继承）

### 🌙 晚间复盘 SOP（5+4 问题流）

**必答 5 问：**

1. 🎯 目标对标 — 回顾任务完成情况
2. ✨ 成功日记 — 记录今日成就
3. 😊 情绪记录 — 开心事与情绪评分
4. 💭 焦虑觉察 — 负面情绪识别与分析
5. 📋 明日计划 — 规划明天最重要的事

**选答 4 问：**
6. 🔍 深度分析 — 五个为什么追问
7. 🪞 反思 — 斯多葛三问
8. 💎 原则提炼 — 提炼可复用的人生原则
9. ✍️ 自由随笔 — 开放表达

### 📊 洞察系统

- **本周洞察** — 任务完成率、情绪曲线、成功模式、挑战分析
- **本月洞察** — 月度趋势、成长记录、模式深度分析
- **画像建议** — AI 基于日记数据，建议更新用户画像

### 📅 日历与看板

- **Review 日历** — 情绪热力图 + hover tooltip（情绪分/任务完成率）+ 点击跳转日记
- **Kanban 看板** — 月/周/日三级金字塔视图
- **任务继承** — 未完成任务自动显示，一键继承到今天

### 📈 仪表盘

- **🎯 今日聚焦** — 当日任务清单 + 精力状态 + 待继承任务提示
- **📋 本周进度** — 任务完成率进度条
- **💭 情绪趋势** — 本周 7 天情绪柱状图
- **💡 洞察卡片** — 随机原则 + 活跃模式

### 💬 自由对话

- 随时与 AI 聊天讨论想法
- 智能检测「更新计划」意图，直接跳转编辑
- 像心理咨询师一样帮你看到盲点

---

## 🔌 AI 提供商

| 提供商 | 状态 | 说明 |
|--------|------|------|
| OpenRouter | ✅ 推荐 | 支持多种模型，性价比高 |
| Anthropic Claude | ✅ | 直连 Claude API |
| Google Gemini | ✅ | Gemini 2.0 Flash |
| OpenAI | ✅ | GPT-4o |
| 自定义 API | ✅ | 任何 OpenAI 兼容接口 |

支持自定义模型名称 + 连接测试按钮。

---

## 📦 安装

### 手动安装

1. 下载最新 Release 中的 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Vault 中创建 `.obsidian/plugins/tidelog/`
3. 将文件复制到该目录
4. 重启 Obsidian → 设置 → 社区插件 → 启用 **TideLog**

### 开发模式

```bash
git clone https://github.com/enhen3/Tidelog.git
cd Tidelog
npm install
npm run dev    # 开发模式（watch）
npm run build  # 生产构建 + 自动部署
```

---

## ⚙️ 配置

在 Obsidian 设置 → TideLog 中：

1. **AI 提供商** — 选择提供商、配置 API Key、自定义模型名称
2. **连接测试** — 一键测试 API 连接是否正常
3. **日期边界** — 设置"一天"的起始时间（默认 6:00 AM）
4. **文件夹路径** — 自定义日记、计划、归档目录
5. **复盘问题** — 启用/禁用每个问题，自定义问题顺序

---

## 📂 Vault 结构

插件自动创建和管理：

```
your-vault/
├── 01-Daily/              # 每日日记
│   ├── 2026-03-06.md
│   └── ...
├── 02-Plan/               # 计划
│   ├── Weekly/
│   │   └── 2026-W10.md
│   └── Monthly/
│       └── 2026-03.md
└── 03-Archive/            # 归档
    ├── user_profile.md    # 用户画像
    ├── principles.md      # 原则库
    ├── patterns.md        # 模式库
    └── Insights/          # 洞察报告
        ├── 2026-W10-周报.md
        └── 2026-03-月报.md
```

---

## 📋 命令

| 命令 | 说明 |
|------|------|
| `TideLog: Open Chat` | 打开聊天侧栏 |
| `TideLog: Morning Plan` | 开始晨间计划 |
| `TideLog: Evening Review` | 开始晚间复盘 |
| `TideLog: Open Dashboard` | 打开仪表盘 |
| `TideLog: Open Kanban` | 打开看板 |
| `TideLog: Open Calendar` | 打开日历 |

---

## 🛠 技术栈

- TypeScript + esbuild
- Obsidian API（零外部依赖）
- SSE streaming（AI 流式响应）
- 深层设置合并（providers deep merge）

---

## License

MIT
