# TideLog 隐私政策 / Privacy Policy

最后更新 / Last updated: 2026-08-25

## 中文版本

TideLog 以本地优先为设计原则，在您的 Obsidian vault 内运行。插件不包含客户端遥测、分析 SDK、动态广告或自动更新机制。

### 本地保存的数据

TideLog 会在您的 Obsidian vault 或插件数据中保存：

- 插件创建或更新的日记、计划、复盘、仪表盘文件、洞察报告、原则、模式与画像笔记。
- 文件夹路径、复盘问题自定义项、语言、试用状态及 Pro License 激活状态等插件设置。
- 用于 AI 配额和 Pro License 激活的 TideLog 设备标识。

TideLog 使用 Obsidian SecretStorage 保存已激活的 Pro License Key。AI 功能无需您自行申请或配置第三方 API Key。

除非您主动使用下述 AI 或联网功能，否则您的 vault 内容保留在本地。

### AI 请求与数据流

当您主动触发 AI 功能时，插件会将**该次生成所必需的提示词和笔记内容**发送至 TideLog 服务端 `https://tidelog-api.mydreamchronicle.com/ai/generate`，再由服务端转发给大模型服务商（当前为 DeepSeek）处理，并将结果返回给您。

TideLog 服务端不存储您的提示词、笔记正文或 AI 响应正文。请求处理完毕后即丢弃，不落库、不留档。TideLog 不会将您的内容用于模型训练。

大模型服务商与基础设施服务商对传输内容、日志和留存的处理适用其自身的服务条款与隐私政策；TideLog 对自身服务端作出的不存储承诺不代表第三方作出相同承诺。

### 内容合规检查

依据大模型服务商的要求，我们需对发往模型的内容进行必要的合规检查。**该检查仅在请求转发的瞬间进行，不存储、不留档、不用于任何其他目的。**

检查在 TideLog 服务端转发请求之前完成；命中规则的请求不会转发给大模型服务商。TideLog 不保存请求正文、命中词或检查记录，只向插件返回命中类别。

### AI 服务运行记录

仅记录服务运行所必需的信息，**不包含笔记正文，也不包含 AI 返回的内容正文**：

- **Pro 用户**：您的 License Key、激活的设备标识
- **免费 / 试用用户**：由设备标识与您的 IP 地址派生的哈希锚点（**原始 IP 不入库**）
- **所有用户**：调用时间、功能类型、计费周期、调用次数、token 计数

上述信息仅用于配额核算、防滥用与故障排查。

### License 校验

如果您激活 TideLog Pro，插件会连接 `https://tidelog-api.mydreamchronicle.com`：

- 激活、停用 License 或打开 License Portal 时会按您的操作发起请求。
- 已激活 License 的用户每次启动 Obsidian 时，插件会在后台自动校验一次；未激活 License 的用户不会在启动时发起该请求。
- 校验因网络原因失败时，插件保留 7 天离线宽限期，期间 Pro 功能仍可使用。

License 服务会接收 License Key、设备标识及相关请求时间；当您使用 License 查询或生成服务时，还会接收您主动提供的购买邮箱和爱发电订单号。这些数据用于验证购买、执行每个 License 最多 3 台设备的限制、提供 License 查询与设备解绑、处理激活问题、防止滥用，以及处理退款或撤销。

### 购买链接

TideLog 使用爱发电提供购买服务。打开购买页面后，您与爱发电的交互适用爱发电自身的条款与隐私政策。

### 服务端基础设施

TideLog 的 AI 与 License API 托管在 Cloudflare Workers。Cloudflare 在运营和保护服务时可能处理 IP 地址、User-Agent、请求时间、路径和响应状态等标准请求元数据。原始 IP 不写入 TideLog 数据库；用于免费 / 试用配额与防滥用的标识按上文所述以派生哈希形式记录。

### 数据共享

TideLog 开发者不出售用户数据。为提供 AI 功能，该次请求所必需的内容会经 TideLog 服务端转发给当前大模型服务商 DeepSeek；Cloudflare 处理运行服务所必需的基础设施数据；爱发电处理购买环节的数据。除此之外，仅会在履行法律义务、处理欺诈或滥用，或提供您主动请求的支持时共享必要数据。

### 数据删除

如需删除可通过您提供的信息识别的 License、AI 使用量或配额记录，请通过 `README.md` 中列出的支持渠道联系开发者。请勿在公开 issue 中提交完整 License Key、购买信息或私人笔记内容。部分记录可能因购买验证、退款、防欺诈、会计或法律义务而需要保留。

### 安全提示

请勿在公开 GitHub issue 中发布完整 License Key、私人笔记内容、购买信息或其他敏感信息。

TideLog 是 Obsidian 社区插件，与其他插件一样会在 Obsidian 内运行并访问您的 vault。请审查源代码，并仅从官方发布渠道安装。

---

## English version

TideLog is designed for local-first use inside your Obsidian vault. The plugin does not include client-side telemetry, analytics SDKs, dynamic ads, or a self-update mechanism.

### Data stored locally

TideLog stores the following in your Obsidian vault or plugin data:

- Daily notes, plans, reviews, dashboard files, insight reports, principles, patterns, and profile notes that the plugin creates or updates.
- Plugin settings such as folder paths, review question customizations, language, trial state, and Pro License activation state.
- A TideLog device identifier used for AI quotas and Pro License activation.

TideLog stores an activated Pro License Key through Obsidian SecretStorage. You do not need to obtain or configure a third-party AI API key.

Your vault content remains local unless you explicitly use an AI feature or another network-connected feature described below.

### AI requests and data flow

When you explicitly trigger an AI feature, the plugin sends the prompts and note content necessary for that request to the TideLog server at `https://tidelog-api.mydreamchronicle.com/ai/generate`. The server forwards the request to the current model provider, DeepSeek, and returns the result to you.

The TideLog server does not store your prompts, note bodies, or AI response bodies. They are discarded after the request is processed and are not written to the database or archived. TideLog does not use your content to train models.

Model and infrastructure providers process transmitted content, logs, and retention under their own terms and privacy policies. TideLog's no-storage commitment for its own server does not constitute the same commitment by a third party.

### Content compliance checks

As required by the model provider, TideLog performs a necessary compliance check on content submitted for forwarding. **The check occurs only at the moment the request is forwarded. It is not stored, archived, or used for any other purpose.**

The check runs on the TideLog server before forwarding. A request that matches a rule is not forwarded to the model provider. TideLog does not save the request body, matched keywords, or a check record; it returns only the matched category to the plugin.

### AI service operational records

TideLog records only the information necessary to operate the service. **These records do not contain note bodies or AI response bodies:**

- **Pro users:** the License Key and activated device identifier.
- **Free / trial users:** a hashed anchor derived from the device identifier and IP address. **The original IP address is not stored in the TideLog database.**
- **All users:** request time, feature type, billing period, request count, and token counts.

This information is used only for quota accounting, abuse prevention, and troubleshooting.

### License verification

If you activate TideLog Pro, the plugin connects to `https://tidelog-api.mydreamchronicle.com`:

- Requests are made when you activate or deactivate a License or open the License Portal.
- For users with an activated License, the plugin automatically verifies it in the background whenever Obsidian starts. No startup verification request is made when no License is activated.
- If verification fails because of a network problem, a seven-day offline grace period applies and Pro features remain available during that period.

The License service receives the License Key, device identifier, and relevant request times. It also receives a purchase email and Afdian order ID when you submit them for License lookup or generation. This data is used to verify purchases, enforce the three-device limit for each License, provide License lookup and device unbinding, resolve activation issues, prevent abuse, and process refunds or revocations.

### Purchase links

TideLog uses Afdian for purchases. When you open the purchase page, your interaction with Afdian is governed by Afdian's own terms and privacy policy.

### Server infrastructure

TideLog's AI and License APIs are hosted on Cloudflare Workers. Cloudflare may process standard request metadata such as IP address, user agent, request time, path, and response status to operate and secure the service. TideLog does not write raw IP addresses to its database; identifiers used for free / trial quotas and abuse prevention are stored as derived hashes as described above.

### Data sharing

The TideLog developer does not sell user data. To provide AI features, content necessary for the request is forwarded through the TideLog server to the current model provider, DeepSeek. Cloudflare processes infrastructure data necessary to operate the service, and Afdian processes purchase data. Other sharing is limited to complying with law, addressing fraud or abuse, or providing support that you request.

### Data deletion

To request deletion of License, AI usage, or quota records that can be identified from information you provide, contact the developer through the support channel listed in `README.md`. Do not submit a full License Key, purchase information, or private note content in a public issue. Some records may need to be retained for purchase verification, refunds, fraud prevention, accounting, or legal compliance.

### Security notes

Do not post a full License Key, private journal content, purchase information, or other sensitive information in a public GitHub issue.

TideLog is an Obsidian community plugin. Like other plugins, it runs inside Obsidian with access to your vault. Review the source code and install only from official releases.
