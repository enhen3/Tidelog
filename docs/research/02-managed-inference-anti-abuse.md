# 调研报告 #2：托管推理（managed inference）的反薅羊毛监管

> 你问："我有点纠结。我会担心如果有人来薅我的 API，后面会不会不好监管。"
> 我答：**可控，但需要先建好 3 道护栏**。下面是这 3 道护栏 + 实操难度评估 + 真实成本测算。

---

## TL;DR

| 维度 | 结论 |
|---|---|
| **技术难度** | 中（CF Workers + KV + D1 一周内可搞定 MVP） |
| **运营难度** | 中-高（**真正难的是异常账户的人工处置**，不是代码） |
| **风险敞口（最坏情况）** | 单个滥用账户一晚上可能薅 ¥50–500（取决于护栏严密度） |
| **是否值得做** | **值得，但建议作为 Pro 之上的"Pro Plus"附加包**，而不是 Pro 标配 |

**核心建议**：不要让 Pro 用户"免费用你的 API"。让他们额外付费换 token 配额，定价覆盖成本 + 30% 安全垫。

---

## 1. 滥用威胁模型（按你担心的顺序）

### 威胁 A：单个用户疯狂调用（"薅羊毛"）
**场景**：买了 ¥49 年费，绑了 3 台机器，在脚本里每 10 秒发一个洞察生成请求。
**理论损失**：Claude Sonnet 4 一次洞察约 ¥0.15 → 10 秒一次 = 1 天 8640 次 = **¥1296/天**。

**护栏**：硬配额 + 速率限制。

### 威胁 B：账户共享（一个 key 给一堆朋友）
**场景**：买一个终身 key，把激活码发到群里 100 人共用。
**理论损失**：你做了 3 设备限制（已经在 license 系统里），所以最多 3 人共享。
**护栏**：你已经做了 ✅（`max_devices = 3`）。

### 威胁 C：自动化机器人（bots / 脚本爬虫）
**场景**：有人写脚本批量测试你的 endpoint，发垃圾请求耗光额度。
**护栏**：每个请求必须带有有效 license key + device_id，没 key 直接 reject。

### 威胁 D：极端情况——零日抢购 + 大量退款
**场景**：你做促销 ¥9 限时年费，1000 人买了，集中刷 API，然后退款。
**护栏**：退款后立刻 revoke license。

### 威胁 E：你自己 API key 泄露
**场景**：上游 OpenRouter key 被人扒出（你写在代码里、commit 到 GitHub）。
**护栏**：key 只在 Worker 环境变量里，永远不上传代码库。

---

## 2. 三道护栏（按优先级）

### 🛡️ 护栏 1：硬配额（必做）

**做法**：每个 license key 在 KV 或 D1 里有个 `monthly_tokens_used` 计数器。每次代理转发请求时：

```ts
// pseudo
const used = await env.KV.get(`quota:${licenseKey}:${currentMonth}`);
if (used > QUOTA_PER_TIER[licenseType]) {
  return 429;  // 配额用完，前端展示"本月配额已满，下月重置"
}
```

**建议初始配额**（按模型 token 量预估）：

| Plan | 月度配额 | 等价大概 |
|---|---|---|
| 免费用户走自己 key | 0 | （不开放托管） |
| Pro 年度 ¥49 | 不含托管 | 走自己 key |
| Pro 终身 ¥99 | 不含托管 | 走自己 key |
| **Pro Plus 月度 ¥29**（**新档**）| 1M token / 月 | 约 20 次完整洞察 + 200 次自由对话 |
| **Pro Plus 季度 ¥79** | 4M token / 季 | 同上 × 3 |

**关键**：不要让基础 Pro 用户能用托管推理。基础 Pro 用户必须用自己的 API key。**只有付额外费的 Pro Plus 才用托管**。

理由：
1. 把"是否值得托管"的选择权交给用户
2. ¥49 终身的用户单月烧 ¥10 就把你赚的钱亏完了
3. 多一档付费，转化漏斗多一层

### 🛡️ 护栏 2：速率限制（必做）

Cloudflare Workers 提供两种实现：

**方案 A（推荐）**：用 [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)。免费版每秒 10 个请求/IP 的限制就够。

**方案 B**：用 KV/D1 自己实现滑动窗口。代码 < 30 行。

```ts
const window = Math.floor(Date.now() / 60_000);  // 1-min window
const key = `rl:${licenseKey}:${window}`;
const count = parseInt(await env.KV.get(key) ?? '0') + 1;
await env.KV.put(key, String(count), { expirationTtl: 120 });
if (count > 20) return new Response('Rate limit', { status: 429 });
```

**建议初始限制**：
- 每个 license key 每分钟最多 20 次请求
- 每个 IP 每分钟最多 60 次请求（防 IP 池滥用）

### 🛡️ 护栏 3：异常检测 + 自动 freeze（建议做）

如果上面两道护栏被突破（如有人买了 50 个 license 同时刷），加一道异常检测：

**机制**：
- 每个 license key 累计成本 > 单笔订单金额的 80% 时，**暂停** key 并发通知给你
- 通知方式：发邮件、Telegram、推送到飞书 webhook（最简单）

**实现复杂度**：低。在每次成本入库后 query 一下：
```sql
SELECT SUM(cost) FROM usage_log
WHERE license_key = ? AND received_at > unixepoch() - 30*86400
```

---

## 3. 实际架构（一周可上线）

复用你现有的 Cloudflare Worker：

```
Plugin 客户端
  ↓ POST /proxy/chat (带 license key + device_id + payload)
Cloudflare Worker (复用 tidelog-api.mydreamchronicle.com)
  ├─ check license valid? (现有 /license/verify 逻辑)
  ├─ check device_id bound?
  ├─ rate limit (KV 滑动窗口)
  ├─ quota check (D1 月度计数)
  ├─ forward to OpenRouter (用你后台 key)
  ├─ stream response back
  └─ async: log token usage to D1 usage_log
```

**新增表**：

```sql
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY,
  license_key TEXT,
  model TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_cents INTEGER,        -- 以分计成本，避免浮点
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_usage_license_month ON usage_log(license_key, created_at);
```

**新增 KV namespace**：`RATE_LIMIT`（仅用于滑动窗口计数，自动过期）

---

## 4. 真实成本测算（你最关心的）

假设你卖出 100 个 Pro Plus 月度（¥29），每个用户用满 1M token / 月：

| 项 | 数值 |
|---|---|
| 收入 | 100 × ¥29 = **¥2,900** |
| 上游成本（OpenRouter，按 Claude Sonnet 4 + Haiku 混合估）| 100 × 1M × ¥0.012/1K = **¥1,200** |
| Cloudflare Workers + D1 + KV（100 用户 × 1000 调用/月 = 100K req/月）| **¥0**（完全免费额度内）|
| 支付通道（爱发电 5% + 微信 0.6%）| **¥160** |
| **毛利** | **¥1,540 / 月 / 100 用户** |
| **毛利率** | **53%** |

**结论**：商业模型可行。但**前提是配额管控严密**——如果有 1 个用户烧 5x 配额，毛利就被吃光。

---

## 5. 实际运营难度（代码不是难点）

代码 1 周。**真正难的是这些**：

| 运营事件 | 难度 | 频率预期 |
|---|---|---|
| 用户买了 Pro Plus，问"为啥模型变慢了"（其实是上游 OpenRouter 抖动） | 中 | 每周 1-2 次 |
| 用户配额用完了，问"为啥不能用了" | 低 | 每月 5-10 次 |
| 用户找你退款，但配额已用大半 | 高 | 每季 1-2 次（要不要按比例退？写清楚条款） |
| 上游 API 涨价 / 模型下架 | 中 | 每季 1-2 次（要不要同步涨价/迁移？） |
| 有用户怀疑你滥用他们的数据（即使你完全没有） | 高 | 每年 1-2 次（隐私政策要写清，最好开源 Worker 代码让用户验证） |
| 个别用户超额，要不要"友情送一点"？ | 中 | 每月 1-2 次（要有原则） |

**核心建议**：**先不要做托管推理，先把现有 BYOK 模型跑起来，看转化数据**。等你有 200+ 付费用户、明确知道哪些用户嫌 BYOK 麻烦，再开 Pro Plus 档。

---

## 6. 我的最终建议

### 短期（v1.2 ~ v1.4，0-3 个月）

**不做托管推理。** 专注让 BYOK 流程足够丝滑：
- ✅ Onboarding 向导（已完成）
- ✅ 一键测试连接（已有）
- ⏳ 在 README + 设置页直接给"OpenRouter 注册链接 + 第一次充值教程"
- ⏳ 加一段视频教学（5 分钟内学会用 OpenRouter）

### 中期（v1.5 ~ v1.7，3-6 个月）

如果遥测数据告诉你"30% 的用户卡在 onboarding 第 3 步（粘贴 key）"，再考虑托管推理。

**先做最小托管 MVP**：
- 仅支持 1 个模型（Claude Haiku，便宜）
- 仅给 Pro Plus 月度订阅（¥29/月）
- 配额硬上限 500K token/月（很保守）
- 一发现单个账户异常立即暂停

### 长期（v2.0+，6 个月以上）

如果托管推理在 100 个用户身上跑了 3 个月没出大事，再扩展模型 + 提配额 + 加年度 Plus 档。

### 不要做的事

- ❌ 不要"为了体面"把托管推理塞进 ¥99 终身版作为送给前 100 名的福利 — 终身合同 + 持续运营成本 = 财务地雷
- ❌ 不要在内测期间就开放给所有 Pro — 等付费用户基数稳定后再开放

---

## 7. 给你的 1 行决策

> **现在不要做托管推理。先把 v1.2 ship 出去，收 100 个付费用户 + 1 个月遥测数据，再决定。**

如果到时候数据显示需要做，按本报告 §3 的架构 1 周可上线 MVP。监管难度可控，前提是先开 Pro Plus 单独档、把配额和速率护栏建好。
