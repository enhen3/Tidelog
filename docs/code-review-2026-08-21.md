# TideLog 独立代码审查（2026-08-21）

审查范围：`git diff` 中的 `README.md`、`src/constants.ts`、`src/i18n/zh.ts`、`src/i18n/en.ts`、`src/services/first-insight-service.ts`、`src/services/legacy-import-service.ts`、`src/views/chat-view.ts`、`src/views/first-insight-modal.ts`、`styles.css`、`test-first-insight.mjs`。

结论：发现 2 类需要修复的问题（首次画像任务关闭后的生命周期、UI 测试为源码字符串检查），另有 1 项命名建议。门槛常量、持续画像独立规则、双语门槛文案、样式和 README 锚点未发现回归。

## 1. 常量是否真的统一

【通过】首次画像的两个门槛已经统一到 `src/constants.ts:16-17`：篇数为 3，单篇非空白字符为 60。

- 扫描准入使用 `FIRST_INSIGHT_MIN_VALID_ENTRIES`：`src/services/legacy-import-service.ts:205`。
- 单篇可分析判断使用 `FIRST_INSIGHT_MIN_ANALYZABLE_CHARS`：`src/services/legacy-import-service.ts:402-403`。
- 服务层二次校验使用同一个篇数常量：`src/services/first-insight-service.ts:56-61`。
- UI 的不足篇数提示也读取同一个常量：`src/views/first-insight-modal.ts:405-409`。

执行了：

```text
rg -n '\b7\b|\b120\b' src/constants.ts src/i18n/zh.ts src/i18n/en.ts \
  src/services/first-insight-service.ts src/services/legacy-import-service.ts \
  src/views/chat-view.ts src/views/first-insight-modal.ts styles.css \
  test-first-insight.mjs README.md
```

命中项逐类判断如下：

- `src/services/first-insight-service.ts:242,344` 的“未来 7 天”是报告中的实验周期，不是画像准入门槛。
- `src/views/first-insight-modal.ts:500,550` 的 `120` 分别是 120ms 滚动延时和 120 秒估时余量。
- `src/services/legacy-import-service.ts:589,646` 的 `1200`/`120` 分别是日期解析窗口和文件名截断上限，不是单篇字符门槛。
- `test-first-insight.mjs` 中剩余的 7 大多是代表性 7 篇夹具、测试序号或“未来 7 天”内容，不参与首次画像准入。
- `styles.css` 中的 7/120 是透明度、颜色通道、网格列数或位移，不是业务门槛。

持续画像的独立规则未被误伤：`src/services/insight-service.ts:261-274` 仍读取最近 14 天，并在日记少于 7 篇时拒绝生成；对应中英文案仍是至少 7 天（`src/i18n/zh.ts:484`、`src/i18n/en.ts:526`）。

## 2. 文案与常量是否同步

【通过】首次画像双语文案没有遗留写死的“7 篇”或 “At least 7”。

- 数量不足提示改为 `{1}`：`src/i18n/zh.ts:947`、`src/i18n/en.ts:945`。
- 服务层错误提示改为 `{1}`：`src/i18n/zh.ts:980`、`src/i18n/en.ts:978`。
- 两处调用都传入 `FIRST_INSIGHT_MIN_VALID_ENTRIES`：`src/views/first-insight-modal.ts:405-409`、`src/services/first-insight-service.ts:57-61`。
- 60 字门槛目前没有出现在用户文案中，因此不存在文案数字需要插值但仍写死的问题。

持续画像文案中的“至少 7 天”属于另一套规则，应保留；本次没有误改。

## 3. 落点改动的副作用

【建议】运行语义没有冲突，但 `shouldStartAtFirstInsight()` 的命名已经过时。

- 实际首页落点现在无条件是 Plan：`src/views/chat-view.ts:141-143`。
- `shouldStartAtFirstInsight()` 只在用户主动点击 Insights 顶级 tab 时决定默认子页是 Profile 还是 Weekly：`src/views/chat-view.ts:283-286,1075-1077`。

函数不再判断“应用是否从首次画像开始”，而是在判断“Insights 是否默认打开 Profile”。建议改名为 `shouldDefaultInsightsToProfile()` 或直接以内联的 `!firstInsightCompleted` 表达，避免以后把它误用回首页落点逻辑。

## 4. 新提示条与状态边界

【有问题】提示条本身不会重复挂载或形成长期事件监听泄漏，但首次画像弹窗关闭后的生成任务没有取消机制。

状态判断的正常路径是自洽的：

- 默认设置为 `false`，旧配置加载时会与默认值合并：`src/constants.ts:95-101`、`src/main.ts:241-284`。
- 生成到一半或生成出草稿时不会写完成状态；只有用户确认保存，且画像与报告都写入后，才将状态改为 `true` 并保存设置：`src/services/first-insight-service.ts:108-114`。因此中途关闭后继续显示提示条，符合“完成=已确认保存”的定义。
- Plan 每次切换都会先删除旧面板再创建新面板：`src/views/chat-view.ts:308-320`；提示按钮的监听器只挂在随面板销毁的 DOM 节点上（`src/views/chat-view.ts:1011-1024`），不会多次累积。

实际问题在 `src/views/first-insight-modal.ts:66-70,337-380,429-513`：`onClose()` 只卸载 Markdown component 并清空 DOM，没有中止标记或 `AbortController`。用户在扫描、复制或 AI 生成中关闭弹窗后，异步任务仍会继续，可能继续写归档/日记、消耗 AI 调用，并在请求结束前保留弹窗对象、DOM 引用和每秒定时器。定时器最终会在 promise 结束时清理，因此通常不是永久泄漏，但长请求或悬挂请求会造成明显的后台资源滞留和“关闭并不等于取消”的副作用。

建议：给本次生成建立可取消的生命周期；关闭时 abort，并在每个写入阶段及流式回调前检查 `closed/cancelled`。如果底层 provider 暂时不支持 abort，至少停止进度定时器、阻止关闭后的 DOM 更新，并明确告知用户关闭后任务是否仍继续。

另一个较小边界：`src/views/chat-view.ts:1012` 使用 truthy 判断而非严格 `=== false`。在当前类型和默认合并逻辑下正常数据只会是布尔值，不构成功能错误；若希望严格兑现“只对 false 显示”，可改为显式布尔判断并补异常持久化数据测试。

## 5. `styles.css` 新增样式

【通过】未发现类名冲突，深色模式下使用的颜色变量有对应覆盖。

- 三个新类只在 `styles.css:3575-3607` 和本次提示条 DOM 中出现，仓库内没有同名旧样式。
- 深色模式为 `--tl-insight`、surface、正文和边框变量提供覆盖：`styles.css:123-154`。提示文案使用主题的 `--text-muted`，按钮使用更亮的 `#9EA7FF`，背景混入 Obsidian 的深色 surface，代码层面可读性成立。
- flex 布局中正文允许收缩、按钮不收缩，没有明显的窄宽度溢出条件。

本项是静态代码审查结论，未做 Obsidian 第三方主题逐一截图验证；自定义主题仍可能通过覆盖 Obsidian token 改变对比度。

## 6. 测试有效性

【有问题】`test-first-insight.mjs:789-792` 的 4 条新增落点/提示条断言全部是源码字符串包含检查，不能证明行为正确。

具体漏检方式：

- 删除 `onOpen()` 中真正的 Plan 切换，只在注释或死分支保留 `await this.switchTab('kanban')`，第 789 行仍通过。
- 删除 `renderKanbanTab()` 对提示条的调用，只保留未使用的方法定义，第 790-791 行仍通过。
- 让按钮不再绑定 `openInsights('profile')`，但在其他位置留下同样字符串，第 790 行仍通过。
- 改坏 `shouldStartAtFirstInsight()` 的返回值，只要三元表达式字符串仍存在，第 792 行仍通过。

`test-first-insight.mjs:793-795` 的文案检查也偏弱：它依赖两个 `indexOf()` 切片边界，边界注释/键被改名时可能得到空片段而误通过；正则也只拦截中文 `7 篇` 和英文 `At least 7`，拦不住 `7 records`、`seven journals` 等写法。

建议用现有 mock DOM/harness 做行为测试：分别设置完成状态为 `false/true`，实际执行 ChatView 初始渲染，断言 active tab、提示条数量和按钮点击后的 `insightsMode`；再模拟重新渲染及完成状态变化，断言不重复且完成后消失。文案测试应直接调用 `t()` 并验证传入常量后的完整结果，或至少枚举首次画像键，而不是切源文件字符串。

补充：`test-first-insight.mjs:480-483` 的常量值和 59/60 字边界测试是真正执行函数的断言，强度足够；服务层少于 3 篇的校验也实际调用了 `generateFirstInsight()`（`test-first-insight.mjs:485-500`）。问题集中在新 UI 行为断言。

## 7. README 英文入口

【通过】没有破坏锚点或 Markdown 结构。

- 顶部显式中文锚点为 `README.md:1`，中文按钮指向 `#中文版本`：`README.md:3-6`。
- `## English version` 标题仍在 `README.md:156`，GitHub 生成的锚点仍为 `#english-version`；顶部和英文区按钮均指向该锚点：`README.md:5,160`。
- HTML 块与 Markdown 内容之间保留空行，没有吞掉后续标题、图片或段落；未发现重复 ID。

## 实际验证结果

### `npm run build`

```text
> tidelog@1.1.49 build
> npm run typecheck && node esbuild.config.mjs production

> tidelog@1.1.49 typecheck
> tsc --noEmit --skipLibCheck
```

退出码：`0`。构建成功。

### `node test-first-insight.mjs`

```text
=== Results: 167 passed, 0 failed ===
```

退出码：`0`。专项测试全部通过；第 6 项说明了其中 UI 断言仍可能产生假阳性。

附加检查：`git diff --check` 退出码为 `0`，没有空白错误。审查过程未修改被审源码，未执行 commit 或 push；`npm run build` 按项目脚本重生成了被 Git 忽略的 `main.js`。
