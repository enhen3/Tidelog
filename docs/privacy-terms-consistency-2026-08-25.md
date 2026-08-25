# TideLog 隐私政策与用户协议一致性核对

核对日期：2026-08-25  
核对对象：`PRIVACY.md`（现行、线上生效）、`docs/TERMS-draft.md`（草案、未生效）、`api/src/ai.ts`（内置 AI 服务端实现）  
源码基线：Git `8f93a6f`

## 结论

两份文档目前不自洽，不能把 `docs/TERMS-draft.md` 按现状转为生效协议。5 项核对结果为：2 项【冲突】、3 项【缺口】，没有【一致】项。最严重的问题是：现行隐私政策仍描述 BYOK 直连第三方，而协议草案及 AI 服务端实现描述并实现了“笔记内容先到 TideLog 服务端，再转发给 DeepSeek”。

实现核对还发现：`api/src/ai.ts` 没有把笔记正文或 AI 响应正文写入 D1，但会记录比协议 5.4 所列更细的标识和配额数据，包括 Pro 用户的原始 License Key、免费/试用用户由设备标识与 IP 哈希派生的锚点、IP 锚点、计费周期和计数。故“不存储笔记内容”有源码支持，“仅记录……”的字段清单则不准确。

发布边界：仓库当前客户端 `src/` 仍保留 BYOK provider、API Key 和直连 provider 的路径（`src/types.ts:31-36`、`src/main.ts:423-449`），而 `api/src/ai.ts` 已具备托管 AI 代理。新版 `PRIVACY.md` 不能早于插件改版发布；否则会从“旧政策描述旧客户端”变成“新政策提前描述尚未发布的客户端”。下文以协议草案和 `api/src/ai.ts` 所代表的改版目标形态为准判断最终自洽性。

## 1. 发送什么内容给谁：【冲突】

`PRIVACY.md` 描述为插件将 prompt 和相关日记内容直接发送给用户在设置中选择的 AI provider：

> “When you use AI-powered features, TideLog sends prompts and relevant journal content to the AI provider configured in settings. Supported providers include OpenRouter, Anthropic, Google Gemini, OpenAI, SiliconFlow, and custom OpenAI-compatible endpoints.”（`PRIVACY.md:24`）
>
> “No AI request is made until you configure an API key or endpoint and trigger an AI feature or connection test.”（`PRIVACY.md:28`）

`docs/TERMS-draft.md` 5.2 描述为插件先把该次生成所需的笔记内容发送到 TideLog 服务端，再由 TideLog 转发给大模型服务商：

> “当您主动触发 AI 功能时，插件会将**该次生成所必需的笔记内容**发送至我们的服务端，再由我们转发给大模型服务商处理，并将结果返回给您。”（`docs/TERMS-draft.md:74-76`）

这是实质冲突，不是措辞差异。两条数据路径中的数据接收方、API Key 控制方、服务责任和用户预期均不同。

`api/src/ai.ts` 支持协议草案所述路径：服务端接收 `messages`（`api/src/ai.ts:500-509`），以 TideLog 持有的 `DEEPSEEK_API_KEY` 调用 DeepSeek（`api/src/ai.ts:194-220`），并把完整 `messages` 放入上游请求体（`api/src/ai.ts:205-210`、`api/src/ai.ts:560-563`）。

结论：最终发布形态应以“插件 → TideLog 服务端 → DeepSeek”为唯一主路径重写隐私政策；若仍保留可选 BYOK，则必须把两条路径分别披露，不能合并成一句。

## 2. “不存储笔记内容”与实际写入字段：【缺口】

`PRIVACY.md` 没有对内置 AI 服务作出“收到后不存储”的完整承诺。最接近的表述只限定了 **license service 不接收**内容：

> “The license service does not receive vault note content, AI prompts, AI responses, or AI provider API keys.”（`PRIVACY.md:44`）

`docs/TERMS-draft.md` 则明确承诺 TideLog 服务端会接收但不保存：

> “**不存储**您的笔记内容。请求处理完毕后即丢弃，不落库、不留档。”（`docs/TERMS-draft.md:78-80`）
>
> “仅记录服务运行所必需的信息：License Key、设备标识、调用时间、功能类型、token 计数。**不包含笔记正文。**”（`docs/TERMS-draft.md:83-85`）

两份文档并非同一承诺：一份说某个旧形态的 license service “不接收”，另一份说新版 TideLog AI 服务端“接收但不存储”。现行隐私政策缺少新版服务端的数据保存与丢弃说明。

### 与 `api/src/ai.ts` 的核对

“不把笔记正文或 AI 响应正文写入 D1”与当前实现相符：

- 请求正文被解析为内存中的 `messages`（`api/src/ai.ts:500-509`），随后传给 DeepSeek（`api/src/ai.ts:560-563`）。
- `ai_usage` 的写入字段为 `id`、`subject_type`、`subject_id`、`feature`、`period`、`created_at`、`input_tokens`、`output_tokens`，没有 message、prompt、笔记正文或响应正文字段（`api/src/ai.ts:336-358`）。
- 流式和非流式请求结束后只更新 input/output token 数（`api/src/ai.ts:405-408`、`api/src/ai.ts:595-603`）。

但协议 5.4 的字段清单与实现不完全相符：

- Pro：`subject_id` 是标准化后的**原始 License Key**，不是哈希（`api/src/ai.ts:125-149`）。
- 免费/试用：`subject_id` 是 `deviceId + IP 哈希` 的派生哈希，同时另存仅由 IP 派生的 `ipAnchor`（`api/src/ai.ts:102-159`）。
- 免费配额还写入 `anchor`、`period`、`used_count`、`created_at`、`updated_at`（`api/src/ai.ts:280-318`）；AI 路由进入处理前还会写入由 scope、IP 和窗口结束时间派生的限流哈希、计数与重置时间（`api/src/index.ts:84-119`、`api/src/index.ts:972-980`）。
- 因而“记录设备标识”不够精确：AI usage 表并不为免费/试用用户保存原始 deviceId，而是保存含 IP 因素的派生标识；协议又遗漏了 IP 派生标识、计费周期和配额计数。

结论：不应改弱“不存储笔记正文”的承诺；应在 `PRIVACY.md` 中补齐它，并把运行记录按实际实现准确列出。若不希望披露或长期保存原始 License Key，应先改代码为不可逆派生标识，再按最终实现定稿政策。

限定说明：源码核对只能证明 TideLog 应用代码没有把正文写入所见 D1 表；DeepSeek 和 Cloudflare 对传输内容、日志、留存及训练的处理仍须按其实际条款单独披露，不能由这份源码推出“所有第三方均不留存”。

## 3. 内容合规检查：【缺口】

`docs/TERMS-draft.md` 5.5 明确披露会检查发往模型的内容：

> “依据大模型服务商的要求，我们需对发往模型的内容进行必要的合规检查。**该检查仅在请求转发的瞬间进行，不存储、不留档、不用于任何其他目的。**”（`docs/TERMS-draft.md:87-89`）

`PRIVACY.md` 的 AI 请求章节只说明内容发给所选 provider 及适用第三方政策，没有说明 TideLog 会读取、扫描或阻断请求：

> “When you use AI-powered features, TideLog sends prompts and relevant journal content to the AI provider configured in settings.”（`PRIVACY.md:22-24`）
>
> “TideLog does not control those providers. Their handling of API keys, prompts, responses, logs, retention, and billing is governed by their own terms and privacy policies.”（`PRIVACY.md:26`）

现行隐私政策不存在与 5.5 对应的披露，属于明确缺口。

实现与协议基本相符：`moderateMessages(messages)` 在配额扣减和 DeepSeek 转发前运行；命中时只返回类目（`api/src/ai.ts:517-525`）。检查函数是无 IO 的纯函数，只在内存中处理正文并返回类目（`api/src/moderation.ts:43-73`）。

但协议的“发往模型的内容”容易让人理解为仅检查最终成功转发的请求；实际上，被判定不合规的内容会在转发前被检查并阻断。隐私政策应明确“所有提交给内置 AI 的消息先在 TideLog 服务端做规则检查；命中则不转发；当前代码不把正文或命中词写入 D1，只向客户端返回命中类目”。

## 4. License：设备数、离线宽限、启动校验：【缺口】

两份文档对 3 台设备没有冲突：

> “License data is used only to … enforce the 3-device limit …”（`PRIVACY.md:46`）
>
> “每个 License 最多可在 **3 台设备**上激活。您可通过 License Portal 自助解绑。”（`docs/TERMS-draft.md:47-48`）

但另外两项分别只出现在一份文档中：

- 自动校验仅见于 `PRIVACY.md`：  
  > “automatically in the background each time Obsidian starts … Startup verification runs only for users who have already activated a license”（`PRIVACY.md:32-34`）
- 7 天离线宽限仅见于协议草案：  
  > “License 校验失败时，插件保留 **7 天离线宽限期**，期间 Pro 功能仍可使用。”（`docs/TERMS-draft.md:100-101`）

因此三项规则本身不矛盾，但两份面向用户的文档都不完整：隐私政策没有说明校验失败后的 7 天处理；协议没有说明已激活 License 会在每次 Obsidian 启动时后台自动校验。

当前实现同时支持三项规则：7 天宽限常量及访问判断见 `src/services/license-manager.ts:12-13,75-94`；启动校验见 `src/services/license-manager.ts:219-250`，调用点见 `src/main.ts:97-102`；服务端按 License 的 `max_devices` 执行设备上限（`api/src/index.ts:193-197`）。

结论：`PRIVACY.md` 至少应补充 7 天离线宽限；协议若要完整说明服务行为，应补充启动时自动校验及发送字段。设备数继续统一为 3。

## 5. 改版后失效的 BYOK 表述：【冲突】

协议草案明确是内置 AI、用户无需 Key：

> “我们通过第三方大模型服务商（当前为 DeepSeek）为您提供 AI 生成能力，包括计划建议、今日洞察、周报、月报、画像分析等。**您无需自行申请或配置 API Key。**”（`docs/TERMS-draft.md:23-25`）

`PRIVACY.md` 中下列内容只适用于 BYOK，改版后会失效：

1. 本地设置包含用户选择的 provider 和模型：  
   > “Plugin settings, including selected AI provider, model names …”（`PRIVACY.md:9-13`）
2. SecretStorage 保存用户输入的第三方 API Key：  
   > “API keys that you enter for your selected AI provider.”（`PRIVACY.md:15-18`）
3. 用户配置 provider，插件直连 OpenRouter、Anthropic、Gemini、OpenAI、SiliconFlow 或自定义端点：  
   > “TideLog sends prompts and relevant journal content to the AI provider configured in settings. Supported providers include …”（`PRIVACY.md:22-24`）
4. 配置 Key 或 endpoint 是发出 AI 请求的前提：  
   > “No AI request is made until you configure an API key or endpoint …”（`PRIVACY.md:28`）
5. license service 不接收 AI prompt/response/API Key：  
   > “The license service does not receive vault note content, AI prompts, AI responses, or AI provider API keys.”（`PRIVACY.md:44`）  
   新版 `/ai/generate` 与 license 路由由同一个 Worker 分发（`api/src/index.ts:968-983`）。即使把“license service”狭义解释为 license 路由，这句话也会掩盖同域 TideLog AI 服务端实际接收 prompt 的事实。
6. Server logs 和 data sharing 仅围绕 license service：  
   > “The license API is hosted on Cloudflare Workers.”（`PRIVACY.md:52-56`）  
   > “Data may be shared only when required to operate the license service …”（`PRIVACY.md:58-60`）  
   新版还需要 Cloudflare Worker 处理 AI 请求并向 DeepSeek 共享消息内容，因此 “only” 不再成立。
7. 安全提示要求用户不要公开第三方 API Key：  
   > “Do not post full API keys …”（`PRIVACY.md:66-68`）  
   取消 BYOK 后不再存在由用户配置的 AI provider API Key；可保留对 License Key、个人笔记及其他凭证的提醒。

此外，协议 5.6 的链接 `[PRIVACY.md](./PRIVACY.md)` 从 `docs/TERMS-draft.md` 解析时指向不存在的 `docs/PRIVACY.md`；实际文件位于仓库根目录，应改为 `../PRIVACY.md`。这不是隐私内容冲突，但会让“完整数据说明”链接失效。

## PRIVACY.md 需要改哪几处（按必要性排序）

1. **P0｜必须与插件改版同版本发布**：整段替换 `AI provider requests`（现第 22-28 行），明确内置 AI 的真实链路：用户主动触发后，所需 prompt/笔记内容先发送至 TideLog 的 Cloudflare Worker，经服务端合规检查后再转发给当前大模型服务商 DeepSeek；用户无需提供 API Key。若保留 BYOK，必须把两种模式及各自接收方分开披露。
2. **P0｜必须与插件改版同版本发布**：新增“AI 内容处理与保存”章节，承诺 TideLog 不把笔记正文、prompt、AI 响应正文和命中词写入 D1，并明确请求只在处理期间存在；同时避免把该承诺扩张到 DeepSeek/Cloudflare，第三方留存、日志和训练规则须按核实后的实际政策说明。
3. **P0｜必须与插件改版同版本发布**：新增“内容合规检查”披露，说明检查发生在 TideLog 服务端、早于转发，命中会阻断请求；当前实现不落库正文或命中词，只向客户端返回命中类目。
4. **P0｜必须与插件改版同版本发布**：重写 AI 运行数据清单。至少覆盖 `subject_type`、Pro 的 License Key 或其最终替代标识、免费/试用的设备与 IP 派生哈希、IP 限额锚点、功能类型、计费周期、调用/更新时间、input/output token 数、配额计数和短期限流哈希；补充各类数据的用途、保留期与删除方式。“short-lived”或“periodically expired”只能在代码确实实施清理后保留。
5. **P0｜必须与插件改版同版本发布**：重写 `Server logs` 与 `Data sharing`（现第 52-60 行），覆盖 AI API、Cloudflare 的基础设施处理以及向 DeepSeek 转发内容；删除“仅为 license service 共享”的排他性表述。
6. **P0｜必须与插件改版同版本发布**：删除或改写 BYOK 专属字段和提示（现第 12、15-17、24-28、44、68 行），包括 provider/model 设置、用户 API Key、连接测试和第三方 Key 安全提示。应与插件中 provider 设置、SecretStorage 迁移和旧 Key 清理策略同步，避免旧 Key 留在本地却完全不披露。
7. **P1｜可先修，但应在新版协议生效前完成**：在 License 章节补充“校验网络失败后保留 7 天离线宽限”；保留 3 台设备及启动时后台自动校验，并说明仅已激活 License 执行启动校验。
8. **P1｜应在新版协议生效前完成**：扩展 `Data deletion`，覆盖 AI usage、免费/试用派生标识、配额及限流记录，而不只覆盖 purchase email/order ID；给出明确保留期或判断标准。
9. **P1｜应在新版协议生效前完成**：更新 `Last updated`，确认开发者主体、联系渠道、DeepSeek/Cloudflare 的政策链接及适用版本；同时修正协议草案指向根目录 `PRIVACY.md` 的相对链接。

其中第 1-6 项描述内置 AI 改版的真实数据流，必须与实际承载该数据流的插件版本一起发布；不得只先改政策，也不得先发布内置 AI 后继续保留旧 BYOK 政策。第 7-9 项不依赖 AI 路由切换，但最迟应在用户协议生效前完成。

> 本报告是文档与源码一致性核对，不构成法律意见。用户协议转为生效文本前，仍应由熟悉适用地区数据与消费者保护规则的专业人士审阅。
