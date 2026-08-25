# TideLog 1.2.0

> **草稿，未发布。** 版本号尚未 bump，此文件仅供发版前审阅。

## ⚠️ 这是一次破坏性变更（请先读这一段）

**从本版起，TideLog 不再使用你自己的 AI API Key。** AI 能力改由 TideLog 统一提供。

**对现有用户意味着什么：**

- 你在设置里填写的 API Key **将不再被使用**，相关配置界面已移除
- AI 功能改为按档位配额：**免费档每月 3 次「今日洞察」**；周报、月报、画像与 AI 对话需要试用或 Pro
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
| 档位 | 今日洞察 | 周报 / 月报 / 画像 | AI 对话 |
|---|---|---|---|
| 免费 | 每月 3 次 | 不提供 | 不提供 |
| 试用（7 天） | 不限 | 不限 | 每日 20 次 |
| Pro | 不限 | 不限 | 每月 200 次 |

Pro 弹窗现在会显示实时剩余配额与重置时间。

### 试用不再需要任何前置配置
此前试用要求先配好 AI 才能开启。现在直接可以开始，无需绑定支付方式，不会自动续费。

### 新用户体验
- 首次打开落在**计划**页（此前是尚不可用的画像页）
- 新手引导重写为「今天就能用 / 有旧日记的话 / 想要长期洞察时」三步
- 首次画像门槛下调：**最少 3 篇日记**（原 7 篇）、**每篇 60 字以上**（原 120 字）

### 到期提醒
Pro 剩余有效期 ≤14 天时，会在 Pro 弹窗中提示并提供续购入口。

### 隐私变化（重要）
- 使用 AI 时，**该次生成所需的笔记片段会先发送到 TideLog 服务端**，再由服务端转发给大模型服务商
- 服务端**不存储**笔记正文，也**不存储** AI 返回的内容正文
- 服务端记录：Pro 用户的 License Key 与设备标识；免费/试用用户由设备标识与 IP 派生的哈希锚点（**原始 IP 不入库**）；以及调用时间、功能类型、计费周期、次数与 token 计数
- 依据大模型服务商要求，发往模型的内容会做一次关键词合规检查。该检查**仅在转发瞬间进行，不存储、不留档**，且**只针对明确违法类目**——不会对情绪、心理状态或人际内容做任何判断
- 完整说明见 [PRIVACY.md](./PRIVACY.md)

## 已知限制

- 爱发电平台不支持任何形式的自动扣费，因此 Pro 为**时长制**，到期自动降级为免费档，不会扣款
- 免费额度按设备与网络双重锚定；同一网络下的多个用户会共享一部分免费额度

---

# TideLog 1.2.0 (English)

> **Draft, not released.**

## ⚠️ Breaking change

**Starting with this release, TideLog no longer uses your own AI API key.** AI is now provided by TideLog.

**What this means for existing users:**

- The API key you configured **will no longer be used**; the configuration UI has been removed
- AI features are now quota-based: **Free tier gets 3 Daily Insights per month**; weekly/monthly reports, profiles and AI chat require Trial or Pro
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
- **Quotas**: Free 3 Daily Insights/month · Trial unlimited reports + 20 chats/day · Pro unlimited reports + 200 chats/month
- **Trial requires no setup**: no payment method, no auto-renewal, start it whenever you want
- **New users land on Plan** instead of an unavailable profile page; onboarding rewritten
- **Lower first-profile threshold**: 3 journals (was 7), 60 characters each (was 120)
- **Expiry reminder** appears when a Pro license has ≤14 days left
- **Privacy**: note excerpts now pass through TideLog's server before reaching the model provider.
  The server stores neither note bodies nor AI response bodies. Raw IP addresses are never stored.
  A keyword compliance check runs at forwarding time only — it targets clearly illegal categories
  and makes no judgment about emotional, psychological or interpersonal content.
  Full details in [PRIVACY.md](./PRIVACY.md).
