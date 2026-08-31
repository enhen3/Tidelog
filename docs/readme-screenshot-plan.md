# TideLog README 真实截图清单

目标：让 GitHub 访客在安装前确认 TideLog 是真实可用的 Obsidian 插件，并看懂 `Plan → Review → Insights → 下一步行动` 的实际界面。所有截图只使用：

`/Users/soren/10_Projects/Tidelog/TideLog-Demo-Vault`

不要使用个人 Vault，不要生成、拼接或重绘产品界面。

## 截图前准备

1. 在仓库根目录运行 `npm run demo:vault`，让演示日期、周报、月报、AI 画像和本地 Demo Pro 状态与截图当天对齐；再运行 `npm run demo:check`。
2. 用 Obsidian 打开 `TideLog-Demo-Vault`，确认 TideLog 已启用，界面语言设为中文，`tidelog-demo` CSS snippet 已启用。
3. 将 Obsidian 窗口设为约 `1600 × 1000 px`，界面缩放保持 100%。保留左侧文件树和 TideLog 主界面，收起右侧栏；不要截入桌面、Dock、通知或其他应用。
4. 四张图统一使用浅色模式和 PNG。浅色模式更利于阅读任务、报告与画像正文，也能避免同一 README 内视觉跳变。
5. Demo Vault 是虚构数据，正常不需要打码。截图前仍要检查窗口标题、状态栏和侧栏；如果出现真实姓名、同步账号、本机绝对路径、API Key 或 License，先隐藏对应区域，不要只靠模糊处理。

## 截图清单（按装机说服力排序）

### 1. Plan：今天真正要推进什么

- 界面与状态：打开 **TideLog → Plan → 日**。选择最近一个有 3 条任务、同时包含已完成和未完成状态的工作日；让顶部 `Plan / Review / Insights` 导航、日期、原生 checkbox、周/月目标上下文和计划建议尽量同时可见。
- 说服点：第一眼证明它不是概念图，而是可直接操作、会读写 Daily Note 的任务界面。
- Vault：`TideLog-Demo-Vault`，使用最近一次 `npm run demo:vault` 生成的 Daily Note。
- 文件：`assets/screenshots/tidelog-plan-day.png`
- 尺寸 / 模式：`1600 × 1000 px`，浅色模式，PNG。
- 打码：不需要；只允许出现虚构人物“林澈”和 Demo 内容。

### 2. Review：一个月的闭环证据

- 界面与状态：打开 **TideLog → Review**，停在闭环数量最多的月份；选择一个同时有计划与复盘的历史日期。画面要同时看到月度闭环、蓝色计划半环、金色复盘半环，以及“这天已完成闭环”的选中状态。
- 说服点：直接展示 TideLog 相比普通待办插件的核心差异——计划和复盘形成可追踪闭环，并支持补做历史复盘。
- Vault：`TideLog-Demo-Vault`，使用最近生成月份的连续 Daily Notes。
- 文件：`assets/screenshots/tidelog-review-loops.png`
- 尺寸 / 模式：`1600 × 1000 px`，浅色模式，PNG。
- 打码：不需要；不要展开任何非 Demo 文件。

### 3. Insights：月报不是一句 AI 总结

- 界面与状态：打开 **TideLog → Insights → 月**，选择已有报告预览的月份。画面至少要看到解锁进度、月报标题、报告预览，以及包含事实或模式判断的一段正文；不要停在加载中、空状态或生成按钮页。
- 说服点：证明 Insights 有数据门槛、有报告预览，并把多日闭环提炼成可核对的长期模式。
- Vault：`TideLog-Demo-Vault`，使用 `03-Archive/Insights` 中最近生成的月报。
- 文件：`assets/screenshots/tidelog-insights-monthly.png`
- 尺寸 / 模式：`1600 × 1000 px`，浅色模式，PNG。
- 打码：不需要；不要实时调用 AI，直接使用 Demo Vault 已有报告。

### 4. AI 眼中的你：结论、证据、下一步同时出现

- 界面与状态：打开 **TideLog → Insights → AI 眼中的你**。截取已有画像预览，优先让“核心画像”“证据”与“未来 7 天的小实验”中的至少两项进入同一画面；不要只截标题或空白入口。
- 说服点：把“AI 画像”从功能名变成具体产物，并证明结论会落到一个可执行实验，而不是停在性格标签。
- Vault：`TideLog-Demo-Vault`，使用 `03-Archive/Insights` 中最近生成的画像更新。
- 文件：`assets/screenshots/tidelog-ai-profile.png`
- 尺寸 / 模式：`1600 × 1000 px`，浅色模式，PNG。
- 打码：不需要；不要露出 License 页面或私人笔记内容。

## README 替换位置

以下行号以本清单创建后的 `README.md` 为准；实际替换时同时核对原始图片路径，避免后续行号变化导致误改。

1. 第 23 行与第 163 行：把 `assets/tidelog-hero.svg` 替换为 `assets/screenshots/tidelog-plan-day.png`，保留中英文各自的 alt 文本。
2. 第 41 行与第 179 行：把 `assets/tidelog-loop.svg` 替换为 `assets/screenshots/tidelog-review-loops.png`，保留中英文各自的 alt 文本。
3. 第 45 行与第 189 行：把 `assets/tidelog-preview.svg` 替换为 `assets/screenshots/tidelog-insights-monthly.png`，保留中英文各自的 alt 文本。
4. AI 画像没有对应 SVG：在中文第 76 行“报告更新”列表之后、英文第 187 行 “Keep your workflow Markdown-first...” 之后，各新增一次 `assets/screenshots/tidelog-ai-profile.png`。插入第一处后，英文段落行号会顺延，因此应以这两句正文作为定位锚点。

`assets/tidelog-logo.svg` 继续保留。它是品牌标识，不承担产品界面证明，因此不应被截图替换。

## 交付前检查

- 四张图都来自同一次 Demo Vault 刷新，日期、主题、窗口尺寸一致。
- 在 GitHub README 的实际显示宽度下，任务文字、闭环状态和报告标题仍可辨认。
- 图片没有鼠标悬停提示、加载动画、空状态、通知红点或无关窗口。
- 中英文段落引用同一组真实截图，所有图片路径区分大小写并能在 GitHub 正常加载。
- `git diff -- README.md docs/readme-screenshot-plan.md` 只包含预期文档改动。
