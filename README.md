# Dailot「小舵」— Obsidian 插件

> AI 驱动的每日计划与反思工具 — 你的个人成长领航员

Dailot 是一个 Obsidian 插件，通过 AI 引导的晨间计划和晚间复盘 SOP，帮助你建立持续的自我成长习惯。

---

## ✨ 核心功能

### 🌅 晨间计划 SOP

- 精力状态评估（1-10 分）
- 多任务输入（支持子任务）
- 自动写入当日日记
- 支持修改和更新已有计划

### 🌙 晚间复盘 SOP（5+4 问题流）

**必答 5 问：**

1. 目标对标 — 回顾任务完成情况
2. 成功日记 — 记录今日成就
3. 情绪记录 — 开心事与情绪评分
4. 焦虑觉察 — 负面情绪识别与分析
5. 明日计划 — 规划明天最重要的事

**选答 4 问：**
6. 深度分析 — 五个为什么追问
7. 反思 — 斯多葛三问
8. 原则提炼 — 提炼可复用的人生原则
9. 自由随笔 — 开放表达

### 📊 洞察报告

- **本周洞察** — 任务完成率、情绪曲线、成功模式、挑战分析
- **本月洞察** — 月度趋势、成长记录、模式深度分析
- **画像建议** — AI 分析日记数据，建议更新用户画像

### 💬 自由对话

- 随时与 AI 聊天讨论想法
- 智能检测「更新计划」意图
- 直接跳转到任务编辑界面

---

## 🔌 支持的 AI 提供商

| 提供商 | 状态 | 说明 |
|--------|------|------|
| OpenRouter | ✅ 推荐 | 支持多种模型，性价比高 |
| Anthropic Claude | ✅ | 直连 Claude API |
| Google Gemini | ✅ | Gemini 2.0 Flash |
| OpenAI | ✅ | GPT-4o |

---

## 📦 安装

### 手动安装

1. 下载 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Obsidian Vault 中创建 `.obsidian/plugins/dailot/`
3. 将上述文件复制到该目录
4. 重启 Obsidian，在设置 → 社区插件中启用 **Dailot**

### 开发模式

```bash
git clone https://github.com/enhen3/dailot.git
cd dailot
npm install
npm run dev  # 开发模式（watch）
npm run build  # 生产构建
```

---

## ⚙️ 配置

在 Obsidian 设置 → Dailot 中配置：

1. **AI 提供商** — 选择并配置 API Key
2. **日期边界** — 设置"一天"的起始时间（默认 6:00 AM）
3. **文件夹路径** — 自定义日记、计划、归档目录
4. **SOP 偏好** — 启用/禁用晨间/晚间 SOP，控制选答题

---

## 📂 文件结构

插件会自动创建和管理以下 Vault 结构：

```
your-vault/
├── 01-Daily/          # 每日日记
│   ├── 2026-02-08.md
│   └── ...
├── 02-Plan/           # 周/月计划
│   ├── 2026-W06.md
│   └── ...
└── 03-Archive/        # 归档 & 模板
    ├── user_profile.md    # 用户画像
    ├── principles.md      # 原则库
    ├── patterns.md        # 模式库
    └── Insights/          # 洞察报告
        ├── 2026-W06-周报.md
        └── 2026-02-月报.md
```

---

## 🛠 技术栈

- TypeScript + esbuild
- Obsidian API
- SSE streaming (AI 流式响应)
- Apple-style UI (SF Pro, 圆角卡片, 渐变按钮)

---

## 📋 命令

| 命令 | 说明 |
|------|------|
| `Dailot: Open Chat` | 打开聊天侧栏 |
| `Dailot: Start Morning Review` | 开始晨间计划 |
| `Dailot: Start Evening Review` | 开始晚间复盘 |
| `Dailot: Generate Weekly Insight` | 生成本周洞察 |
| `Dailot: Generate Monthly Insight` | 生成本月洞察 |

---

## License

MIT
