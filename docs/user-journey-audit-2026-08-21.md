# TideLog 用户旅程代码审计（2026-08-21）

## 审计口径

- 范围只包括当前仓库的 `src/` 与 `api/`。本文把能由代码直接证明的内容标为【代码事实】，把阻力、价值和流失风险判断标为【审计推断】。
- “硬闸门”指目标路径的代码条件不满足就不能得到该结果；“软摩擦”指仍能继续，但需要额外操作、跨平台、等待，或会经历明显的错误/困惑。闸门是**相对于目标功能**而言，不代表整个插件完全不可用。
- “第一次获得真实价值”不是代码变量。【审计推断】本文把它定义为 TideLog onboarding 自己强调的差异化结果——“带证据的初始画像”，而不是普通任务列表或把文字写入 Markdown。这个定义的依据是 onboarding 把“从旧日记建立初始画像”列为第一步，并把输出描述为带证据的第三视角报告（`src/views/onboarding-modal.ts:96-116`；`src/i18n/zh.ts:141-165`）。文末同时给出“第一次基础可用价值”的较低门槛，避免混淆。

## 结论

【审计推断】核心问题确实是使用阻力，但不是三个嫌疑点权重相同：

1. **最大的前置闸门是 BYOK AI。** 默认 API Key 为空；试用要求当前 provider 的 Key 非空；自由聊天、AI 计划反馈、AI 建议和所有新生成的洞察都要调用外部模型（`src/constants.ts:88-127`；`src/main.ts:423-426`；`src/services/license-manager.ts:121-142`）。
2. **“导入旧日记”不是全产品必填，却是代码默认推荐的首次价值路径。** 新用户第一次打开 TideLog 主视图会直接落到“画像”页；立即生成画像又要求至少 7 篇每篇清洗后不少于 120 个非空白字符的 Markdown 日记（`src/views/chat-view.ts:119-148,1063-1065`；`src/services/legacy-import-service.ts:90,117-204`）。所以它对基础 Plan/Review 是可选项，对“立刻看见差异化价值”是硬闸门。
3. **爱发电是付费软摩擦，但仓库内还有更严重的交付断点。** 插件只打开爱发电商品 URL；`api/` 没有支付 webhook、订单回调、爱发电验签或邮件发送路由，只有管理员生成 Key、License 激活/验证和自助查询（`src/services/license-manager.ts:18-20,278-283`；`api/src/index.ts:6-14,301-338,945-1016`）。因此“购买后自动收到 License Key”只是一条界面文案，不能由本仓库代码证明（`src/i18n/zh.ts:763-765`）。

## 完整链条表：安装 → 首次价值 → 试用 → 付费

| 步骤 | 用户要做什么 / 代码实际发生什么 | 性质 | 代码依据 | 【审计推断】流失风险 |
|---|---|---|---|---|
| 1. 启用插件 | 插件注册视图、加载默认设置和服务；裸加载不创建 Vault 文件。Obsidian layout ready 后，若 `onboardingCompleted=false` 就打开 onboarding。 | 软摩擦 | `src/main.ts:71-102,220-232`；`src/constants.ts:88-94` | 低。没有隐式写文件或立即联网生成内容，但用户还没有得到产出。 |
| 2. 看 onboarding | 看到一个长单页介绍，其中有 3 个**推荐步骤**：旧日记画像、今日闭环、需要时再看 Pro。它不是三页表单，也没有必填字段。 | 可完全跳过 | `src/views/onboarding-modal.ts:17-118` | 中。信息量大，而且视觉顺序先强调旧日记与 AI 画像，可能让用户误判“先导日记、先配 AI 才能用”。 |
| 3. 结束 onboarding | 可点“打开设置”“开始每日复盘”“稍后再说”“先配置 API/从旧日记生成画像”，也可直接关闭。所有路径和关闭动作都会把 onboarding 标成完成。 | 软摩擦；不是闸门 | `src/views/onboarding-modal.ts:120-151,177-203`；`src/main.ts:428-432` | 低到中。能跳过是优点；但“完成”只表示弹窗被关掉，不表示任何配置或首次成功。 |
| 4. 第一次打开 TideLog 主视图 | 只要 `firstInsightCompleted=false`，主视图默认不是 Plan，而是 Insights → Profile；未配置 AI 时显示“先配置 API”。 | 软摩擦；对被引导的首次画像路径形成前置导流 | `src/views/chat-view.ts:119-148,248-269,1063-1065`；`src/views/insights-renderer.ts:46-71,479-506` | 高。代码把“可立刻使用的无 AI Plan/Review”放在次要路径，把新用户先送到尚未满足条件的功能。 |
| 5. 获取 AI Key | 默认路径要求离开 Obsidian，打开硅基流动 Key 页面、登录、创建并复制 Key。只有硅基流动提供了代码内的申请链接；其他 provider 没有各自的申请链接。 | **硬闸门：AI 生成与正常试用路径**；基础功能不受影响 | `src/settings/settings-tab.ts:120-142`；`src/i18n/zh.ts:107-117` | 很高。跨平台、注册/登录、理解计费与余额都发生在首次价值之前。 |
| 6. 配置 AI | 设置页可选 provider，粘贴 Key，使用默认或选择模型，再点“测试连接”。默认 provider 是硅基流动，默认模型已填，Key 为空；provider 与模型选择不是最短路径必做，测试也不是代码硬条件。 | Key 非空是**硬闸门**；选 provider/模型、测试连接是软摩擦 | `src/settings/settings-tab.ts:62-117,398-521`；`src/constants.ts:94-127`；`src/main.ts:423-426` | 很高。UI 推荐 3 步，但代码只检查字符串非空；填入无效 Key 也会被当作“已配置”，直到真正请求时失败。 |
| 7A. 使用基础 Plan | 可在日/周/月计划中新增、勾选、编辑、删除、排序任务，也可用 Quick Capture；这些操作直接读写 Markdown，不调用 AI，主 Plan 页也没有 Pro gate。 | 无 AI、无 License 闸门 | `src/views/chat-view.ts:189-245,323-325,390-435`；`src/views/periodic-renderer.ts:198-233,390-420,1562-1682` | 低。但它不是新用户默认落点，价值容易被第 4 步遮蔽。 |
| 7B. 使用基础 Review | Free 用户只走前 2 个已启用问题。回答会先写入日记，再请求 AI 回应；AI 失败后仍会显示错误并进入下一问，最终用静态收尾，所以不配 AI 也能完成并保存复盘。 | 无 AI **可完成**；AI 回应是软依赖；完整问题流有 Pro gate | `src/sop/evening-sop.ts:59-75,180-223,259-298,383-421,483-544` | 中到高。功能不会被卡死，但每一问都可能显示 API 错误；“能完成”不等于“体验正常”。 |
| 8. 开启 7 天试用 | 必须同时满足：此前没启动过试用、没有已激活/曾激活 License、当前 active provider 的 Key 字符串非空。安装、打开 onboarding、完成复盘都不会自动开始；用户必须显式点击开始。 | **硬闸门：试用** | `src/services/license-manager.ts:121-142`；`src/settings/settings-tab.ts:1060-1092`；`src/i18n/zh.ts:169-173` | 高。未配 AI 的安装用户不能开始试用，也就不能用试用体验完整 Review、Insights、看板/热力图/仪表盘；填入无效 Key 虽能启动计时，但 AI 价值仍不可用。 |
| 9. 选择旧日记文件夹 | 首次画像界面要求一个文件夹；会递归扫描 Markdown。选择整个首次画像流程是可选的，但进入该流程后文件夹不可空。 | **硬闸门：首次画像**；对全产品可选 | `src/views/first-insight-modal.ts:71-123,336-360`；`src/services/legacy-import-service.ts:117-133,309-321` | 高。用户要理解文件夹范围与隐私；默认选择算法可能代选一个 legacy/journal/diary/daily 文件夹，但不保证里面有足够数据（`src/views/first-insight-modal.ts:141-174`）。 |
| 10. 满足首次画像数据量 | 每篇日记需能识别日期，且清洗后至少 120 个非空白字符；至少 7 篇有效记录才允许生成。 | **硬闸门：首次画像** | `src/services/legacy-import-service.ts:90,146-204,368-401`；`src/services/first-insight-service.ts:51-57` | 很高。少于 7 篇的新用户只能看到“数据不足”，不能得到画像。 |
| 11. 复制/导入旧日记 | 点击生成后，系统一定会把有效原文复制到 `Archive/Imports/.../source`，并生成 normalized 副本；“同时纳入 TideLog 日记库”复选框默认未勾选，只有勾选后才会复制/追加到日期日记。原始文件不改。 | 内部复制是生成路径必做；纳入日期日记是可选软摩擦 | `src/views/first-insight-modal.ts:103-123,458-470`；`src/services/legacy-import-service.ts:207-266,269-306` | 中。作者怀疑的“必须把日记导进来”只对了一半：用户不必导入日期日记库，但首次画像必然制造归档副本和规范化副本。 |
| 12. 生成并保存首次画像 | 调用 active provider 生成报告；先显示草稿预览，再由用户点“保存这份画像”。保存后才设置 `firstInsightCompleted=true`。第一次允许 Free 用户做；完成后再次打开首次画像，Free 用户会遇到 Pro gate。 | **硬闸门：可用 AI 请求成功**；保存是确认步骤 | `src/services/first-insight-service.ts:51-109`；`src/views/first-insight-modal.ts:424-509,585-615`；`src/main.ts:400-406` | 很高。估时算法给出约 4–15 分钟区间，且要求页面保持打开；长等待发生在首次结果之前（`src/views/first-insight-modal.ts:533-582`）。 |
| 13. 没有历史数据时积累新数据 | 当天可先做 Plan 和 Free Review；但周报 UI 要 3 次完整“Plan + Review”闭环，月报要 8 次闭环；持续画像要求最近 14 天内至少 7 篇日记。周日/月末状态只影响当前周期与上一周期的选择，真正的生成按钮只按闭环数解锁。 | **数据量硬闸门：相应洞察** | `src/views/insights-renderer.ts:112-133,153-203,521-575,624-666`；`src/services/insight-service.ts:260-277` | 高。新用户今天能记录，但今天看不到这些多日洞察；7 天试用刚好只能触及 7 篇画像门槛，却无法从零完成需要 8 次闭环的月报。 |
| 14. 看到升级提示 | 访问 Pro 功能或完成首次画像/Free Review 后会出现 trial/Pro modal；Free 状态优先给“开始试用”，也允许直接购买。 | 软摩擦 | `src/views/pro-modal.ts:27-123`；`src/sop/evening-sop.ts:533-557`；`src/views/first-insight-modal.ts:599-610` | 中。提示出现位置合理，但无 AI 用户会先被送回设置，增加往返。 |
| 15. 前往爱发电 | 点击购买 CTA 打开固定的爱发电商品 URL。界面文案提示需登录/注册，并宣称购买后自动收到 License Key。 | 跨平台软摩擦；若外部平台强制登录，则对购买是外部硬闸门 | `src/services/license-manager.ts:18-20,278-283`；`src/views/pro-modal.ts:117-142`；`src/settings/settings-tab.ts:1095-1098`；`src/i18n/zh.ts:763-765` | 高。离开 Obsidian、登录/注册、完成支付后还必须回到插件；爱发电真实结账行为不在本仓库，不能进一步由代码验证。 |
| 16. 支付后签发/交付 License | **本仓库链条中断。** API 只能通过带 Admin Token 的 `/admin/generate` 创建 Key；路由表没有爱发电 webhook、订单回调、支付验签或邮件交付。 | **硬闸门：License 必须先在仓库外被创建并送达** | `api/src/index.ts:301-338,945-1016`；`api/schema.sql:3-18` | 极高。若仓库外自动化不存在或失败，已付款用户也拿不到可激活 Key。界面“自动收到”的承诺不能由当前代码支持。 |
| 17. 回 Obsidian 激活 | 用户在设置中粘贴 License 并点击激活；插件生成 device ID，调用 TideLog API `/license/activate`。API 校验 Key、到期状态和最多 3 台设备，绑定成功后本地记录激活状态。 | **硬闸门：付费 Pro 可用**；网络与有效 Key 必须满足 | `src/settings/settings-tab.ts:1100-1127`；`src/services/license-manager.ts:183-217,289-307`；`api/src/index.ts:144-218` | 中到高。支付不是终点，还要复制、返回、粘贴、联网激活。找不到 Key 时还要去 Portal，用购买邮箱 + 爱发电订单号查询（`api/src/index.ts:372-413,481-520`）。 |

## 1. 首启与 onboarding：到底有几步

【代码事实】首启只有 **1 个可关闭的单页 modal**，不是强制的多页向导。页面文案列了 3 个推荐步骤，但没有任何必填输入：

1. 从旧日记建立初始画像。
2. 从今天开始记录 Plan + Review。
3. 需要持续洞察时再看 Pro。

代码在 `src/views/onboarding-modal.ts:96-116` 渲染这三条；四类按钮路径与直接关闭都会调用 `completeOnboarding()`（`src/views/onboarding-modal.ts:120-151,177-203`）。默认值是 `onboardingCompleted=false`，所以只出现一次；一旦关闭就写成 `true`（`src/constants.ts:88-94`；`src/main.ts:428-432`）。

【代码事实】首启默认值还包括：中文、硅基流动、`DeepSeek-V3.2`、空 Key、日/计划/归档三个默认目录、Morning/Evening SOP 开启、5 个默认必问题但 Free 实际只执行前 2 个（`src/constants.ts:16-81,88-136`；`src/sop/evening-sop.ts:59-75`）。

【审计推断】所以 onboarding 自身不是硬闸门；真正的问题是它把“首次画像”放在第一步，而随后主视图也把未完成画像的新用户直接送到 Profile 页，两处共同塑造了“必须先配 AI + 导日记”的认知（`src/i18n/zh.ts:143-165`；`src/views/chat-view.ts:141-148`）。

## 2. 不配置 AI，哪些功能能用

| 功能 | AI 条件 | License 条件 | 代码事实 |
|---|---|---|---|
| 日/周/月任务计划：新增、勾选、编辑、删除、排序、跨周期安排 | 【无需 AI】 | Free 可用 | 主 Plan 页直接操作 Markdown，没有 `isPro()` 或 provider 调用（`src/views/chat-view.ts:189-245,390-435`；`src/views/periodic-renderer.ts:198-233,1562-1682`）。 |
| Quick Capture：记录、编辑、删除、安排到日/周/月 | 【无需 AI】 | Free 可用 | `src/views/periodic-renderer.ts:390-505`。 |
| Morning Plan 的任务写入 | 【无需 AI 可完成】；AI 只负责计划可行性反馈 | Free 可用 | AI 调用失败后仍进入确认步骤，确认后写入日记并同步看板（`src/sop/morning-sop.ts:94-143,146-200`）。 |
| Evening Review 前 2 个问题、心情分、Markdown 保存 | 【无需 AI 可完成】；AI 回应失败时会报错并继续，结尾有静态 fallback | Free 只执行前 2 个启用问题；Trial/Pro 执行全部启用问题 | `src/sop/evening-sop.ts:59-75,180-223,259-298,483-544`。 |
| Review 月历、Plan/Review 闭环计数 | 【无需 AI】 | 主视图内 Free 可看 | 主 Review home 读取 Markdown 判断 `hasPlan/hasReview`（`src/views/chat-view.ts:781-946`；`src/views/loop-utils.ts:28-82`）。 |
| 独立 Kanban View、Calendar Heatmap、Dashboard | 【无需 AI】 | **需要 Trial/Pro** | 三个独立 View 都只检查 `isPro()`，其后是本地数据渲染（`src/views/kanban-view.ts:52-65`；`src/views/calendar-view.ts:42-55`；`src/views/dashboard-view.ts:40-52`）。但无 Key 用户不能启动 Trial。 |
| 完整 Review 问题流 | 【无需 AI 可写完】，AI 个性化回应会缺失 | **需要 Trial/Pro** | `isPro()` 决定问题数，不决定是否写入（`src/sop/evening-sop.ts:59-75,215-223`）。 |
| 自由聊天 | 【需要 AI】 | Free 可用，但必须有有效 Key | 没 Key 时直接返回“未配置 API Key”（`src/views/chat-controller.ts:179-215`）。 |
| AI 计划评估、复盘回应、个性化收尾 | 【需要 AI】；失败有不同程度 fallback | Free/Pro 均可调用 | `src/sop/morning-sop.ts:94-143`；`src/sop/evening-sop.ts:228-298,483-521`。 |
| 日/周/月 AI 计划建议 | 【需要 AI】 | 代码无单独 Pro gate | 生成服务直接调用 provider；没有上下文则返回空（`src/services/plan-suggestion-service.ts:39-64`）。 |
| 首次旧日记画像 | 【需要 AI】 | 第一次 Free；再次生成需 Trial/Pro | `src/main.ts:400-406`；`src/services/first-insight-service.ts:51-100`。 |
| 周报、月报、持续画像与更新 | 【需要 AI】 | **需要 Trial/Pro**，另有数据量门槛 | Insights 页先做 `isPro()` gate，生成服务再调用 provider（`src/views/insights-renderer.ts:46-65,112-133`；`src/services/insight-service.ts:93-118,183-208,271-320`）。 |
| 购买、License 查询与激活 | 【无需 AI】 | 用于获得 Pro | `src/views/pro-modal.ts:117-170`；`src/services/license-manager.ts:183-217`。 |

【审计推断】“不配 AI 就完全不能用 TideLog”不符合代码；更准确的说法是：**可用的是本地任务管理和一个会降级报错的两问复盘，不能用的是所有 AI 反馈与新洞察；并且不能通过试用解锁非 AI 的 Pro 功能。** 这会造成一种反直觉状态：功能技术上可用，但新手路径和错误体验让它看起来像不可用。

## 3. AI 配置具体流程

【代码事实】支持 6 个 provider：OpenRouter、Anthropic Claude、Google Gemini、OpenAI、硅基流动、自定义 OpenAI-compatible；工厂按 active provider 创建相应客户端（`src/types.ts:31-38,52-61`；`src/ai/ai-provider.ts:18-48`）。

| Provider | 默认值 / 额外输入 | 申请 Key 引导 |
|---|---|---|
| 硅基流动 | **默认 active**；模型 `deepseek-ai/DeepSeek-V3.2`；base URL `https://api.siliconflow.cn/v1` | 唯一有申请链接：`https://cloud.siliconflow.cn/account/ak`（`src/constants.ts:94,116-121`；`src/settings/settings-tab.ts:135-142`）。 |
| OpenRouter | 默认模型 `anthropic/claude-sonnet-4.6` | 代码没有 Key 申请链接；只实现 API endpoint（`src/constants.ts:96-100`；`src/ai/openrouter-provider.ts:9-37`）。 |
| Anthropic | 默认模型 `claude-sonnet-4-6` | 代码没有 Key 申请链接；只实现 API endpoint（`src/constants.ts:101-105`；`src/ai/anthropic-provider.ts:9-37`）。 |
| Google Gemini | 默认模型 `gemini-2.5-flash` | 代码没有 Key 申请链接；只实现 API endpoint（`src/constants.ts:106-110`；`src/ai/gemini-provider.ts:9-35`）。 |
| OpenAI | 默认模型 `gpt-5.4-mini` | 代码没有 Key 申请链接；只实现 API endpoint（`src/constants.ts:111-115`；`src/ai/openai-provider.ts:9-24`）。 |
| Custom | Key、模型、base URL；提供 SiliconFlow / DeepSeek / Groq / Ollama URL 预设 | 用户自行准备 endpoint、模型和必要凭据（`src/settings/settings-tab.ts:402-445,508-519`；`src/ai/custom-provider.ts:10-57`）。 |

【代码事实】设置页给用户展示 3 步：“默认硅基流动 → 粘贴 API Key → 测试连接”；帮助卡进一步拆成“打开硅基流动并登录 → 新建并复制 Key → 回 TideLog 粘贴并测试”（`src/settings/settings-tab.ts:88-142`；`src/i18n/zh.ts:107-117`）。

【代码事实】最短必做动作其实只有两组：① 在外部服务获得一个 Key；② 回设置页把非空字符串粘到当前 provider。模型已有默认值，provider 不必切换，测试连接也不参与 `hasConfiguredAI()` 或 `startTrial()` 判断（`src/constants.ts:94-121`；`src/main.ts:423-426`；`src/services/license-manager.ts:132-142`）。

【审计推断】这是“形式门槛”和“真实门槛”错位：形式上只要填任意非空字符串就能开始试用；真实获得 AI 价值还要求 Key 有效、账户可调用、模型存在、网络可达。测试按钮能提前发现问题，但它是可跳过的软摩擦，不是保护试用时钟的硬校验（`src/settings/settings-tab.ts:525-560`）。

## 4. 七天试用

【代码事实】`startTrial()` 的全部前置条件是：

1. `trial.startedAt` 不存在；
2. 当前 License 没有 `activated`，也从未留下 `activatedAt`；
3. 当前 active provider 的 `apiKey.trim()` 非空。

满足后才写入 `startedAt=now`、`expiresAt=now+7天`；试用和付费 License 都通过 `isPro()` 解锁同一批 Pro gate（`src/services/license-manager.ts:97-142`）。

【代码事实】因此：

- 装了插件但没配 AI：**不能开始试用**（`src/services/license-manager.ts:128-133`）。
- 只填一个无效的非空 Key：**可以开始并消耗试用**，但 AI 请求仍会失败，因为启动前不执行连接测试（`src/main.ts:423-426`；`src/settings/settings-tab.ts:1068-1091`）。
- 没配 AI 但直接购买并激活 License：可以获得 `isPro()`，使用完整 Review、Kanban、Calendar、Dashboard 等非 AI Pro 功能；AI 报告仍不可生成（`src/services/license-manager.ts:79-110,183-206`）。

【审计推断】“无 AI 用户能否体验 Pro 价值”的答案是：**不能通过试用体验；可以付费后体验其中的非 AI 部分。** 这等于在付费前把一些本来不依赖 AI 的 Pro 价值也绑到了 BYOK 门槛上。

## 5. 历史日记导入与无历史数据的新用户

【代码事实】存在完整导入功能，但要分成三层：

1. **整个首次画像可选。** 用户可跳过 onboarding、直接使用 Plan/Review（`src/views/onboarding-modal.ts:130-151`）。
2. **选择首次画像后，内部归档复制与 normalization 必做。** 生成前会复制原文并创建分析副本，原文件不改（`src/services/legacy-import-service.ts:207-266`）。
3. **复制到 TideLog 日期日记库可选。** checkbox 默认未勾选，只有勾选后才新建/追加 `01-Daily/YYYY-MM-DD.md`（`src/views/first-insight-modal.ts:103-123,461-467`；`src/services/legacy-import-service.ts:269-306`）。

【代码事实】首次画像的有效数据标准是：递归扫描 `.md`；日期可来自 frontmatter、文件名/路径、正文或 mtime；清洗后至少 120 个非空白字符；有效记录至少 7 篇（`src/services/legacy-import-service.ts:117-204,309-321,368-401`）。

【代码事实】没有历史数据的新用户当天可以：建立日/周/月计划、Quick Capture、完成 Free 两问复盘并保存 Markdown；不能当天生成首次画像或持续画像。周报按钮要求 3 次完整闭环，月报按钮要求 8 次完整闭环，持续画像要求最近 14 天至少 7 篇日记。虽然代码计算周日/月末的 `timeReached`，生成按钮的 `isUnlocked` 实际只检查闭环数是否达标（`src/views/periodic-renderer.ts:198-233,390-420`；`src/sop/evening-sop.ts:59-75`；`src/views/insights-renderer.ts:112-133,153-203,521-575,658-666`；`src/services/insight-service.ts:260-277`）。

【审计推断】因此“必须导入旧日记”不是全局事实；准确判断是：**想在安装当天看到 TideLog 最差异化的画像价值，就必须已有 7 篇合格记录；否则只能先体验基础记录，最快的持续画像要等到第 7 篇。**

## 6. 付费流程：几步、跨几个平台

【代码事实】从升级提示到插件内 Pro 生效，仓库可见的最短用户任务是：

1. 在 Pro modal / 设置页点击购买。
2. 浏览器打开爱发电商品页。
3. 按插件文案所述登录/注册爱发电并付款；外部页面真实步骤不在本仓库，无法代码验证。
4. 获得并复制 License Key；**生成和交付机制不在本仓库**。
5. 返回 Obsidian → TideLog 设置，粘贴 Key。
6. 点击激活，等待 TideLog License API 在线校验并绑定设备。

入口与外链见 `src/views/pro-modal.ts:84-142`、`src/settings/settings-tab.ts:1095-1127`；激活链见 `src/services/license-manager.ts:183-217`、`api/src/index.ts:144-218`。

【代码事实】用户可见至少跨 **2 个平台/界面环境**：Obsidian/TideLog 与爱发电；技术上跨 **3 个系统**：Obsidian 插件、爱发电、TideLog Cloudflare Worker + D1。若 Key 丢失，还要打开 TideLog License Portal，形成第三个用户可见 Web 界面，并输入购买邮箱与爱发电订单号（`src/views/pro-modal.ts:163-170`；`api/src/index.ts:372-413,478-520`）。

【审计推断】如果把“拿到可用 License”定义为 `isPro()` 已生效，那么最短是上述 **6 个用户任务**；但第 4 步是代码断点，所以当前仓库不能证明付款后一定能走到第 5、6 步。爱发电不是唯一风险，**支付到 Key 签发/交付的不可审计性更接近硬闸门**。

## 7. 从安装到第一次真实价值：最少几步、几个硬闸门

### 差异化价值口径：首次带证据画像

【审计推断】假设用户已经有至少 7 篇合格日记，按“一个需要用户理解并完成的任务”为一步，当前最短路径是 **7 步**：

1. 首启 onboarding 选择进入设置。
2. 去硅基流动登录并创建/复制 Key。
3. 回 TideLog 粘贴 Key；连接测试可跳过。
4. 打开“从旧日记生成画像”。
5. 选择/确认旧日记文件夹。
6. 点击生成并等待 API 返回报告草稿。
7. 点击“保存这份画像”。

这 7 步中有 **3 个结果级硬闸门**：① 有可工作的 AI 服务；② 有至少 7 篇合格日记；③ 生成请求成功返回。代码的表面预检只覆盖“Key 字符串非空”和“有效日记数 ≥7”，不能提前保证第三项（`src/main.ts:423-426`；`src/services/legacy-import-service.ts:196-204`；`src/services/first-insight-service.ts:51-100`）。

如果把“获取 Key”和“粘贴 Key”合并成一个“配置 AI”任务，则是 **6 步**，硬闸门数量不变。本文保留 7 步，因为用户确实发生了一次外部平台往返。

### 基础可用价值口径：保存第一份计划或复盘

【审计推断】如果把“真实价值”降到普通本地计划，首启后可约 **4 个用户任务**获得：结束 onboarding → 打开 TideLog → 从默认 Profile 切到 Plan → 新增任务，**0 个 AI/License 硬闸门**；若走 onboarding 的“开始每日复盘”，需要点击入口、回答 2 个 Free 问题、填写心情分，同样约 **4 个任务**，仍无 AI/License 硬闸门，但每问可能出现 API 错误（`src/views/onboarding-modal.ts:130-138`；`src/views/chat-view.ts:119-148,189-203`；`src/sop/evening-sop.ts:59-75,180-223,259-298`）。

这说明转化矛盾不是“插件装完完全不能用”，而是“低门槛功能不是差异化卖点，差异化卖点又有高门槛”。

## 8. 去掉“自己配 API Key”后，链条会短多少

【审计推断】若 TideLog 提供内置可用 AI，并同步移除首次画像/试用入口对 `hasConfiguredAI()` 的跳转，那么：

- 差异化首次价值从 **7 步缩到 5 步**，减少 **2 个必做任务**：外部注册/创建 Key、返回插件粘贴 Key；同时去掉一次跨平台往返。
- 如果按当前设置页推荐流程把“测试连接”也算一步，则是从 **8 步缩到 5 步**，减少 3 步。
- 结果级硬闸门从 3 个降到 2 个：仍要有足够数据，且托管 AI 生成仍要成功；只是用户不再自行承担 provider、Key、余额、模型和连接配置。

剩余阻力按优先级是：

1. **至少 7 篇合格历史记录。** 没历史数据仍无法当天得到画像（`src/services/legacy-import-service.ts:196-204`）。
2. **首次画像等待时间。** 当前估时约 4–15 分钟，并要求页面保持打开（`src/views/first-insight-modal.ts:533-582`）。
3. **价值数据门槛。** 周报 3 次完整闭环；月报 8 次完整闭环；持续画像 7 篇。当前代码虽计算周日/月末状态，但按钮只按闭环数解锁（`src/views/insights-renderer.ts:112-133,153-203,521-575`；`src/services/insight-service.ts:271-277`）。
4. **付费与 License 交付。** 仍需离开 Obsidian 去爱发电、登录/付款、取得 Key、回插件激活，而且付款到 Key 交付没有仓库内代码闭环（`src/views/pro-modal.ts:117-170`；`api/src/index.ts:301-338,945-1016`）。

## 最终判断

【审计推断】作者的三个怀疑应重排为：

1. **第一优先：BYOK + 首次历史数据门槛被串联。** 两者不是独立摩擦，而是同时压在默认首次价值路径上。
2. **第二优先：新用户默认落点错误。** 代码明明有无需 AI 的 Plan 和 Free Review，却把未完成画像的用户先送到 Profile 页。
3. **第三优先：支付后交付链不可由仓库证明。** 爱发电登录是可见软摩擦；支付 → License 签发/送达的代码缺口才是潜在硬闸门。

所以，只去掉 API Key 会明显缩短链条，但不会单独解决转化：**没有 7 篇历史日记的用户仍无法立刻看见画像价值；有历史数据的用户仍要等待长生成；决定购买后仍有跨平台支付、Key 交付和手动激活。**
