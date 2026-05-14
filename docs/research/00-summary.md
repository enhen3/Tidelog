# TideLog v1.2 — 实施 + 调研总结

> 本次任务的一站式索引。先看这个文件就够。

---

## 你交代的 9 件事 + 完成情况

### ✅ 已实现并通过测试（5 件）

| # | 任务 | 实现位置 |
|---|---|---|
| 2 | 免费/Pro 功能矩阵 | `README.md`（中英两份），写在 `## 💎 Free vs Pro` 段 |
| 3 | 首次运行 Onboarding 向导（4 步） | `src/views/onboarding-modal.ts`，由 `src/main.ts` 在 `onLayoutReady` 中触发 |
| 6 | 价格透明化 | `src/views/pro-modal.ts` + `src/constants.ts` 里的 `PRICING` 常量（¥49 年费 / ¥99 终身）|
| 7 | 「和过去对话」Pro 功能 | `src/services/insight-service.ts` 新增 `buildPastContext()`；`src/views/chat-view.ts` 新增按钮 + `startChatWithPast()`；附带修复 Anthropic / Gemini provider 的 system-message bug |
| 9 | 遥测（telemetry）| `src/services/telemetry.ts`（client）+ `api/src/index.ts` 的 `/events` endpoint + `api/migration-v3.sql`（events 表）+ 设置页隐私开关 |

### 📝 调研报告（3 件，无代码改动）

| # | 任务 | 报告位置 |
|---|---|---|
| 1 | Obsidian 官方插件目录 PR 状态 + 加速 | `docs/research/01-obsidian-plugin-submission.md` |
| 4 | 托管推理反薅羊毛监管难度 | `docs/research/02-managed-inference-anti-abuse.md` |
| 5 | 自助 dashboard / 收款方案 | `docs/research/03-payment-and-dashboard.md` |

### ⚠️ 部分完成（1 件）

| # | 任务 | 状态 |
|---|---|---|
| 8 | Demo GIF / 视频 | **我无法亲手录** — Claude 沙盒无屏幕、无浏览器。提供了完整的录制脚本 + 分镜表 + 工具推荐：`DEMO_SCRIPT.md`。你或团队照着 30-60 分钟可录完。 |

---

## 三件你必须看的事

### 1. 🚨 Obsidian PR 的真相

你两三个月没动静，是因为 **PR 从来没真正发出**。
- `obsidianmd/obsidian-releases` 里搜不到任何 `author:enhen3` 的 PR
- `community-plugins.json` 里也没有 `tidelog` 条目
- 你 fork 了官方仓库（2026-04-02），之后从未提交跨仓库 PR

修复路径在 [调研报告 #1](./01-obsidian-plugin-submission.md)。**30 分钟可重新提交**。

### 2. 💰 关于托管推理（你的纠结点）

短答：**v1.2 不要做**。

完整答案在 [调研报告 #2](./02-managed-inference-anti-abuse.md)。
核心结论：技术不难（一周可上线），**真正难的是运营**。建议先把 BYOK 跑顺，等收到 200+ 付费用户 + 1 个月遥测数据再考虑。如果要做，建议另开 "Pro Plus" 档（¥29/月或 ¥79/季），不要并入 ¥49 / ¥99 的 Pro。

### 3. 🌐 关于自建 dashboard（你的另一个纠结点）

短答：**先不要自建。在现有 Worker 上加一个 `/portal` 查询页就够**。

完整答案在 [调研报告 #3](./03-payment-and-dashboard.md)。
五个方案 A-E 按规模分层；你现在该在 A 升级到 B（爱发电 + 自助查询页），1 天可完成。**不要跳到方案 E（完整自建 dashboard）—— 5000+ 付费用户之前都不需要**。

---

## 本次代码改动一览

### 新增文件（10 个）

```
src/services/telemetry.ts                   # 客户端遥测
src/views/onboarding-modal.ts               # 首次运行向导
api/migration-v3.sql                        # events 表 schema
RELEASE_NOTES_1.2.0.md                      # 版本说明
DEMO_SCRIPT.md                              # 录制脚本（替代我无法录的视频）
docs/research/00-summary.md                 # 本文件
docs/research/01-obsidian-plugin-submission.md
docs/research/02-managed-inference-anti-abuse.md
docs/research/03-payment-and-dashboard.md
```

### 修改文件（11 个）

```
manifest.json                  # 版本 1.1.14 → 1.2.0
package.json                   # 同步版本 + 加 jsdom devDep
versions.json                  # 加 1.2.0 条目
README.md                      # 加免费/Pro 矩阵 + 定价 + chat-with-past + 隐私说明（中英）
styles.css                     # 加 pricing card + onboarding wizard CSS（约 280 行）
src/types.ts                   # settings 类型加 onboarding + telemetry 字段
src/constants.ts               # 加 PRICING 常量 + default settings 加新字段
src/settings-migration.ts      # 加 v2 migration（已存在用户跳过 onboarding）
src/i18n/zh.ts                 # 加 30+ 新 key（pricing / onboard / telemetry / chat.past）
src/i18n/en.ts                 # 同上英文版
src/main.ts                    # 初始化 telemetry + 首次运行触发 onboarding
src/views/pro-modal.ts         # 加价格对比卡片 + 7 个功能 + 信任条
src/views/chat-view.ts         # 加 chat-with-past 按钮 + SOP telemetry tracking
src/services/insight-service.ts  # 加 buildPastContext() + 周报/月报 telemetry
src/services/license-manager.ts  # license 激活时 telemetry tracking
src/settings/settings-tab.ts   # 加隐私 section + telemetry 开关
src/ai/anthropic-provider.ts   # 修复 system 消息处理（让 chat-with-past 在 Claude 上工作）
src/ai/gemini-provider.ts      # 修复同上（让 chat-with-past 在 Gemini 上工作）
api/src/index.ts               # 加 /events POST 和 /admin/events GET endpoint
test-settings-ui.mjs           # 加 addToggle mock（避免测试因新增隐私开关而失败）
```

### 质量门

| 检查 | 结果 |
|---|---|
| `tsc -noEmit -skipLibCheck` | ✅ 通过 |
| `eslint --config eslint.config.review.mjs src/` | ✅ 0 errors, 0 warnings |
| `node test-bug-repro.mjs` | ✅ 13/13 |
| `node test-evening-sop.mjs` | ✅ 16/16 |
| `node test-save-load.mjs` | ✅ 12/12 |
| `node test-settings-ui.mjs` | ✅ 24/24 |
| `node esbuild.config.mjs production` | ✅ 320K main.js |

**测试限制**：我无法在 Obsidian 里实际启动插件 + 点 UI。需要你自己最后过一遍：
1. **新装一个 vault** 并启用插件 → 验证 onboarding 弹出
2. 跑完 onboarding 4 步 → 验证 key 测试通过 → 验证完成后不再弹
3. 进设置页 → 看到 Privacy 段 + 遥测开关
4. 点 Pro 功能（如月报）→ ProModal 弹出 → 看到价格卡片
5. 用 Claude 模型跑一次「和过去对话」（需要至少 1 天日记数据）

---

## 你 v1.2 ship 之后该做的事（按优先级）

1. **[本周]** 按 [调研 #1](./01-obsidian-plugin-submission.md) 重新发 Obsidian PR（30 分钟）
2. **[本周]** 拍 demo GIF/视频（用 `DEMO_SCRIPT.md` 里的脚本，1 小时）
3. **[本周]** 把 demo GIF 加到 README 顶部 + 发小红书 / 即刻第一波
4. **[本周]** 应用 v3 migration：`wrangler d1 execute tidelog-license-db --remote --file=api/migration-v3.sql`
5. **[本周]** 部署 Worker v3：`cd api && wrangler deploy`（更新到含 /events endpoint 的版本）
6. **[下周]** 实现 [调研 #3 方案 B](./03-payment-and-dashboard.md) — 在 Worker 上加 `/portal/lookup` 和 `/portal/unbind` + 一个简单 HTML 自助查询页
7. **[1 个月]** 看遥测数据，决定是否做托管推理（见 [调研 #2](./02-managed-inference-anti-abuse.md)）

---

## 一句话总结

> v1.2 把转化漏斗的"看见价格 → 上手 → 体验杀手锏 → 付费"链路全打通了；
> 还差临门一脚是：**真正发出 Obsidian PR + 录 demo GIF**。这两件你 1 小时就能做完。
