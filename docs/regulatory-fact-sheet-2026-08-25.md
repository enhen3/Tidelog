# TideLog 监管事实清单

**日期**：2026-08-26
**性质**：**仅陈述代码事实，不含任何法律结论。** 每条给出文件与行号，供律师判断用。

---

## 1. 请求链路：谁在调用模型

```
用户（Obsidian 插件）
  → POST https://tidelog-api.mydreamchronicle.com/ai/generate     [src/ai/tidelog-provider.ts:16]
    → Cloudflare Worker 校验身份与配额、执行内容检查
      → POST https://api.deepseek.com/chat/completions            [api/src/ai.ts:14]
```

**用户的请求不直接到达 DeepSeek**，全部经由开发者的服务端中转。

## 2. 用谁的凭证

- API Key 从 Worker 环境变量读取：`env.DEEPSEEK_API_KEY`（`api/src/ai.ts:218`）
- **Key 属于开发者本人**，存于 Cloudflare Secret
- **用户看不到、也无法替换**——插件端已无任何 provider / Key 配置界面（`src/settings/settings-tab.ts`，相关 UI 已于 5fa7dfe 移除）

## 3. 面向谁：是否不特定公众

- 插件在 Obsidian 官方社区商店免费分发，任何人可安装
- **免费档无需注册、无需登录、无需 License**：`licenseKey` 为可选参数，缺省即按免费档处理（`api/src/ai.ts:125`）
- 免费档主体由 `deviceId` 的加盐 HMAC 锚定；IP 只生成独立的加盐 HMAC 成本护栏，不参与主体身份，因此换网络不会重置一次性权益
- → **无任何准入门槛**

## 4. 是否收费

- 订阅制（按时长购买，无自动续费）：月 ¥19 / 年 ¥168。AI 由服务端托管、成本持续发生，故不设买断档
- 免费档每月 3 次「今日洞察」并提供 1 次首次画像；其余 AI 功能不提供
- **收费与 AI 用量挂钩**（配额按档位区分）
- 跨功能总量护栏：免费档每月 25 万输入 / 10 万输出 token；7 天试用共 75 万 / 25 万；Pro 每月 400 万 / 80 万；单次输出最多 4096 token
- 该护栏不信任客户端上报的 `feature`，按服务端主体跨功能累计并在同一条条件 INSERT 中原子预占，防止伪造类型或并发请求绕过成本边界

## 5. 内容如何流转、留存什么

> **本节已于 2026-08-26 随服务端配额与试用改造更新。** 下列为改造后的现状。

**写入 `ai_usage` 表的字段**（`api/src/ai.ts:398-401`）：
```
id, subject_type, subject_id, feature, period, created_at,
input_tokens, output_tokens, session_id, ip_anchor
```
`session_id` 是客户端生成的随机分组键（标识"一次用户动作"），不含任何用户信息。
`ip_anchor` 为 IP 的二次哈希派生值。

**仍然不含笔记正文，不含 AI 响应正文。** `messages` 从未出现在任何 INSERT 或 bind 中
（已用 `grep -n "bind(" api/src/ai.ts | grep -i messages` 复核，无结果）。

**写入 `device_trials` 表**（2026-08-26 新增，`api/src/ai.ts:201-203`）：
```
anchor（= hmac(salt, 'trial:' + deviceId)）, ip_hash, started_at, expires_at
```
用于把 7 天试用的起止时间保存在服务端，避免客户端自报试用。

**`free_quota` 表仍存在，但已退出配额决策路径**——配额消耗现由 `ai_usage` 的行推导。

**原始 IP 不入库。**

### IP 与设备锚点的匿名化处理（2026-08-26 已修）

存入数据库的所有 IP / deviceId 派生值均为 **HMAC-SHA256(ANCHOR_SALT, …)**：

| 用途 | 派生式 | 位置 |
|---|---|---|
| 免费额度设备锚点 | `hmac(salt, 'free:' + deviceId)` | `api/src/ai.ts` |
| 免费额度 IP 锚点 | `hmac(salt, 'ip:' + IP)` | `api/src/ai.ts` |
| 试用设备锚点 | `hmac(salt, 'trial:' + deviceId)` | `api/src/ai.ts` |
| `device_trials.ip_hash` | 同 IP 锚点 | `api/src/ai.ts` |
| 路由 IP 限流键 | `hmac(salt, 'ratelimit:' + scope + ':' + IP + ':' + window)` | `api/src/index.ts` |
| Portal 身份限流键 | `hmac(salt, 'ratelimit:' + scope + ':' + normalizedEmail + ':' + window)` | `api/src/index.ts` |

`ANCHOR_SALT` 为 32 字节随机值，存于 Cloudflare Secret，不在代码库中。

**为什么必须加盐**：IPv4 地址空间仅 2³²，**无盐 SHA-256 可在普通硬件上穷举反解**。
本次改造前的写法即为无盐哈希（`git show HEAD:api/src/ai.ts:108,114`），
技术上可还原为原始 IP，属于「去标识化」而非「匿名化」——
在《个人信息保护法》下，去标识化数据**仍属个人信息**，匿名化数据则不属于。

加盐后，未持有 `ANCHOR_SALT` 者无法从锚点反推 IP 或 deviceId。
测试见 `api/test-anchor.mjs`「锚点必须不可穷举反解」一组。

**缺盐时服务端拒绝 AI、试用、License 与 Portal 的所有限流路由**
（503 `anchor_salt_not_configured`，`api/src/ai.ts`、`api/src/index.ts`），
不静默退回可反解的写法——静默降级会让隐私控制在无人察觉的情况下失效。

> **仍需律师确认**：加盐 HMAC 是否足以构成《个人信息保护法》第七十三条意义上的
> 「匿名化」（即"无法识别特定自然人且不能复原"）。开发者持有盐值这一事实，
> 是否影响该认定，需要法律判断而非技术判断。

## 6. 是否对生成内容做干预

已实现关键词过滤（`api/src/moderation.ts:36-40`），**只拦五个明确违法类目**：

| 类目 | 代码位置 |
|---|---|
| 毒品 drugs | `moderation.ts:36` |
| 赌博 gambling | `moderation.ts:37` |
| 诈骗 fraud | `moderation.ts:38` |
| 枪爆 weapons | `moderation.ts:39` |
| 未成年人色情 sexual_minors | `moderation.ts:40` |

**有意不含**情绪、心理状态、人际冲突、辱骂类词汇——该产品为日记复盘工具，误伤此类内容会破坏核心场景。
检查在转发瞬间进行，命中只返回类目、不返回具体词，**不存储、不留档**。
拦截发生在配额扣减之前，被拦请求不消耗用户额度。

## 7. 是否具备监管要求的技术能力

| 能力 | 是否具备 | 依据 |
|---|---|---|
| 定位到具体用户 | Pro 用户可（License Key + deviceId）；免费用户仅有加盐 HMAC 锚点，**无盐无法反解**（见第 5 节）；但开发者持有盐值，该事实对法律认定的影响需律师判断 | `licenses` / `license_devices` / `ai_usage` / `device_trials` 表 |
| 停止对特定用户提供服务 | 可（吊销 License；免费用户可按锚点封禁） | `licenses.status = 'revoked'` |
| 追溯一次生成 | 部分可——有时间、功能类型、token 计数，**无内容留存** | `ai_usage` 表 |

## 8. 规模

- 活跃安装约 100–130（估算依据：`20_Content/…/TideLog/analytics-audit-2026-08.md`）
- 付费用户 **1** 位
- 免费额度：每月 3 次「今日洞察」+ 终身 1 次首次画像；单 IP 月度使用护栏 10 个动作；单 IP 月度试用开启硬上限 12 个设备
- Token 护栏：除主体上限外，免费主体所在 IP 每月 100 万输入 / 40 万输出 token，试用主体所在 IP 每月 400 万 / 100 万，用于限制轮换客户端身份的批量滥用

## 9. 输出去向（对「舆论属性」判断最关键）

**AI 生成结果仅写入用户本地 Obsidian vault 的 Markdown 文件。**

产品**不具备**以下任一功能：发布、分享、用户间互动、公开展示、评论、社区、订阅流。
其他用户无法看到任何人的生成内容。

**唯一涉及交互的功能是「AI 对话」，为用户与模型的一对一私密交互，内容不对外可见。**

---

## 需要 Soren 补充的经营事实（代码无法证明）

- [ ] 是否持有营业执照 / 个体工商户登记
- [ ] 服务器与数据存储的实际地理位置（Cloudflare 边缘节点分布）
- [ ] 是否已就本服务向属地网信办做过任何咨询或报备
- [ ] 用户地域构成（境内 / 境外比例）—— 影响《暂行办法》「向境内公众提供」的适用判断
- [x] IP 哈希已于 2026-08-26 改为 HMAC 加盐；免费额度计数一次性归零已获同意

## 局限

- 本清单覆盖 2026-08-28 当前待发布工作树；正式发版后应补充对应 commit
- 「活跃安装量」为估算值，非精确统计
- 不含任何法律定性
