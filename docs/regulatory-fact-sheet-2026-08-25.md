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
- 免费档身份由 `deviceId + IP 哈希` 锚定，不涉及真实身份
- → **无任何准入门槛**

## 4. 是否收费

- 订阅制：月 ¥19 / 年 ¥148
- 免费档每月 3 次「今日洞察」，其余 AI 功能不提供
- **收费与 AI 用量挂钩**（配额按档位区分）

## 5. 内容如何流转、留存什么

**写入 `ai_usage` 表的字段**（`api/src/ai.ts:340-342`）：
```
id, subject_type, subject_id, feature, period, created_at, input_tokens, output_tokens
```
**不含笔记正文，不含 AI 响应正文。** `messages` 从未出现在任何 INSERT 或 bind 中。

**写入 `free_quota` 表**：`anchor`（由 deviceId + IP 哈希派生）、`period`、`used_count`、时间戳。
**原始 IP 不入库**，仅存 SHA-256 哈希。

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
| 定位到具体用户 | Pro 用户可（License Key + deviceId）；免费用户仅有哈希锚点，**无法定位真实身份** | `licenses` / `license_devices` / `free_quota` 表 |
| 停止对特定用户提供服务 | 可（吊销 License；免费用户可按锚点封禁） | `licenses.status = 'revoked'` |
| 追溯一次生成 | 部分可——有时间、功能类型、token 计数，**无内容留存** | `ai_usage` 表 |

## 8. 规模

- 活跃安装约 100–130（估算依据：`20_Content/…/TideLog/analytics-audit-2026-08.md`）
- 付费用户 **1** 位
- 免费额度：每月 3 次；单 IP 月度上限 10 次

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

## 局限

- 本清单仅覆盖当前 main 分支（`5b7908c`）的实现，未来改动需同步更新
- 「活跃安装量」为估算值，非精确统计
- 不含任何法律定性
