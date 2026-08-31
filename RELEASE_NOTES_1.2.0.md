# TideLog 1.2.0

## ⚠️ 这是一次破坏性变更（请先读这一段）

**从本版起，TideLog 不再使用你自己的 AI API Key。** AI 能力改由 TideLog 统一提供。

**对现有用户意味着什么：**

- 你在设置里填写的 API Key **将不再被使用**，相关配置界面已移除
- AI 功能改为按档位配额：**免费档每月 3 次「今日洞察」，并可生成 1 次首次画像**；周报、月报、画像更新与 AI 对话需要试用或 Pro
- **计划与复盘的本地功能不受影响，永久免费**——任务管理、复盘记录、闭环日历、历史补复盘照常
- 你的笔记仍然留在自己的 vault 里；数据流向有变化，详见下方隐私说明

如果你更希望继续使用自己的 API Key，请**不要升级到 1.2.0**，保留在 1.1.49。

---

## 为什么做这个改动

此前新用户要用上 AI 功能，必须先离开 Obsidian、注册第三方平台、创建 API Key、复制回来粘贴、再测试连接。
这是一道硬门槛——没跨过去的人，连七天试用都无法开始。

现在装上即用，不需要任何配置。

## 主要变化

### AI 由 TideLog 提供
- 移除设置页的服务商选择、API Key 输入、模型选择、Base URL 与测试连接
- 所有 AI 调用统一走 TideLog 服务端

### 配额
| 档位 | 今日洞察 | 周报 / 月报 | 画像 | AI 对话 |
|---|---|---|---|---|
| 免费 | 每月 3 次 | 不提供 | 首次画像 1 次 | 不提供 |
| 试用（7 天） | 不单独限次* | 不单独限次* | 不单独限次* | 每日 20 次 |
| Pro | 不单独限次* | 不单独限次* | 不单独限次* | 每月 200 次 |

\* “不单独限次”仍受跨功能防滥用总量护栏约束：免费档每月 25 万输入 / 10 万输出 token；7 天试用共 75 万输入 / 25 万输出 token；Pro 每月 400 万输入 / 80 万输出 token。单次输出最多 4096 token。正常重度 Pro 使用量估算约 127 万输入 / 21 万输出 token，当前护栏保留了约 3 倍余量；达到后会明确显示重置时间。

Pro 弹窗现在会显示实时剩余配额与重置时间。

### 试用不再需要任何前置配置
此前试用要求先配好 AI 才能开启。现在由你点击后直接开始，起止时间由服务端保存；无需绑定支付方式，不会自动续费，也不能通过重置本地设置延长。

### 新用户体验
- 首次打开先回答是否已有旧日记；有旧日记可直接生成首次画像，没有则从今天的计划或复盘开始
- 新手引导结束后会进入**计划**页，不再停在尚不可用的画像页
- 首次画像门槛下调：**最少 3 篇日记**（原 7 篇）、**每篇 60 字以上**（原 120 字）

### 到期提醒
Pro 剩余有效期 ≤14 天时，会在 Pro 弹窗中提示并提供续购入口。

### 隐私变化（重要）
- 使用 AI 时，**该次生成所需的笔记片段会先发送到 TideLog 服务端**，再由服务端转发给大模型服务商
- 服务端**不存储**笔记正文，也**不存储** AI 返回的内容正文
- 服务端记录：Pro 用户的 License Key 与设备标识；免费/试用用户的设备标识与 IP 会分别派生为不同用途的加盐 HMAC 锚点（**原始设备标识和 IP 不入库**）；以及调用时间、功能类型、计费周期、次数与 token 计数
- 依据大模型服务商要求，发往模型的内容会做一次关键词合规检查。该检查**仅在转发瞬间进行，不存储、不留档**，且**只针对明确违法类目**——不会对情绪、心理状态或人际内容做任何判断
- 完整说明见 [PRIVACY.md](./PRIVACY.md)

## 已知限制

- 爱发电平台不支持任何形式的自动扣费，因此 Pro 为**时长制**，到期自动降级为免费档，不会扣款
- 免费额度以设备锚点识别主体，并用独立的网络锚点限制批量滥用；原始设备标识与 IP 不入库

---

# TideLog 1.2.0 (English)

## ⚠️ Breaking change

**Starting with this release, TideLog no longer uses your own AI API key.** AI is now provided by TideLog.

**What this means for existing users:**

- The API key you configured **will no longer be used**; the configuration UI has been removed
- AI features are now quota-based: **Free gets 3 Daily Insights per month and one first profile**; weekly/monthly reports, profile updates, and AI chat require Trial or Pro
- **Local planning and review features are unaffected and remain free forever**
- Your notes still live in your own vault, but the data flow has changed — see privacy notes below

If you prefer to keep using your own API key, **do not upgrade to 1.2.0**; stay on 1.1.49.

## Why

Previously, using any AI feature required leaving Obsidian, registering with a third-party provider,
creating an API key, pasting it back, and testing the connection. That was a hard gate —
users who did not get past it could not even start the 7-day trial.

Now it works out of the box.

## Highlights

- **Managed AI**: provider/key/model/base-URL/test-connection settings removed; all calls go through TideLog's server
- **Quotas**: Free 3 Daily Insights/month + one first profile · Trial reports are not separately metered + 20 chats/day · Pro reports are not separately metered + 200 chats/month
- **Fair-use guardrail**: cross-feature limits prevent automated abuse and forged feature labels. Free: 250K input / 100K output tokens per month; 7-day Trial: 750K / 250K; Pro: 4M / 800K per month. Each response is capped at 4,096 output tokens. Normal heavy Pro usage is estimated at about 1.27M input / 206K output tokens.
- **Trial requires no setup**: you start it explicitly; the server preserves the one-time 7-day window; no payment method and no auto-renewal
- **Onboarding starts with a useful choice**: build a first profile from existing journals, or begin with today's plan/review; it then lands on Plan instead of an unavailable profile page
- **Lower first-profile threshold**: 3 journals (was 7), 60 characters each (was 120)
- **Expiry reminder** appears when a Pro license has ≤14 days left
- **Privacy**: note excerpts now pass through TideLog's server before reaching the model provider.
  The server stores neither note bodies nor AI response bodies. Raw IP addresses are never stored.
  A keyword compliance check runs at forwarding time only — it targets clearly illegal categories
  and makes no judgment about emotional, psychological or interpersonal content.
  Full details in [PRIVACY.md](./PRIVACY.md).
