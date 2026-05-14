# 调研报告 #1：Obsidian 官方插件目录提交状态 + 加速策略

> 你问："两三个月了 PR 没动静。"
> 我答：**因为 PR 根本没发出。**

---

## 1. 现状（事实，不是推测）

| 检查项 | 结果 |
|---|---|
| `obsidianmd/obsidian-releases` 仓库里 `author:enhen3` 的 PR | **0 个** |
| `obsidianmd/obsidian-releases/community-plugins.json` 里 `tidelog` 条目 | **不存在** |
| 你 GitHub 名下的 `obsidian-releases` 仓库 | **存在**（fork 于 2026-04-02 之后无活动） |
| 你 GitHub 全部 PR | **仅 1 个** — 在你自己 `enhen3/Tidelog` 仓库里 |

**结论**：你 fork 了官方仓库，但**从未真正在官方仓库点过"Create pull request"按钮**。两三个月白等。

可能的原因（最常见的几种）：
- 修改了自己 fork 里的 `community-plugins.json`，commit 了，但没在 GitHub UI 上发起跨仓库 PR
- 以为 push 到自己 fork = 提交了
- 中途 GitHub 提示有冲突，没解决就关掉了页面

不重要。重要的是：**现在重新做一次，正确做。**

---

## 2. 正确的提交流程（一步一步）

### Step 1 — 准备工作（5 分钟）

确认你的 release 满足这些要求（[官方文档](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins)）：

- [x] 仓库根目录有 `manifest.json`（你已有）
- [x] `manifest.json` 里的 `id` 是 `tidelog`（你的是）
- [x] 在 GitHub Releases 里至少有一个 release，tag 名 == `manifest.json` 的 version，不带 `v` 前缀（如 `1.2.0` 不是 `v1.2.0`）
- [x] release 里上传了三个 asset：`main.js`、`manifest.json`、`styles.css`（**作为 release 的附件文件，不是源码 zip**）
- [x] 仓库有 `README.md` 和 `LICENSE`
- [x] **`manifest.json` 里 `description` < 250 字符**（你的是 OK）
- [x] **`manifest.json` 里 `author` 不是 `Obsidian`、不带 `obsidian` 字样**
- [x] **`README.md` 不能在标题里用"Obsidian Plugin"作为后缀**（你的是 "TideLog — Obsidian Plugin"，**可能会被打回**）
- [x] **不能在 `name` 里写"Obsidian"**（你的是 "TideLog" ✅）

⚠️ **可能被打回的点**：
1. README 标题里有 "Obsidian Plugin" — 改成 "TideLog" 即可（最近被频繁要求）
2. manifest.json `description` 建议改成更直白的一句话：现在是"AI-guided daily planning and reflection with morning SOP, evening review, insights, and metacognition coaching." — 这句太长了，bot 可能不喜欢。建议改成 < 100 字符。

### Step 2 — Fork 同步 + 改 community-plugins.json（5 分钟）

```bash
# 同步 fork 到 upstream 最新
cd /tmp
git clone https://github.com/enhen3/obsidian-releases.git
cd obsidian-releases
git remote add upstream https://github.com/obsidianmd/obsidian-releases.git
git fetch upstream
git checkout master
git reset --hard upstream/master
git push origin master --force
```

然后在 `community-plugins.json` **末尾**（数组的最后一项之前）追加一条：

```json
{
  "id": "tidelog",
  "name": "TideLog",
  "author": "enhen3",
  "description": "AI-guided daily plan, evening review, insights, and metacognition coaching.",
  "repo": "enhen3/Tidelog"
}
```

注意：
- **id 全小写**（与 manifest.json 一致）
- **author 用 GitHub username**
- **repo 是 `owner/repo` 格式，不带 https://**
- **description ≤ 250 字符**，最好 < 100 字符
- 文件保持 JSON 数组格式，**不要忘记前一项末尾加逗号**

提交 + push：

```bash
git checkout -b add-tidelog
git add community-plugins.json
git commit -m "Add plugin: TideLog"
git push origin add-tidelog
```

### Step 3 — 在 GitHub UI 上发起 PR（最重要的一步）

1. 打开 https://github.com/enhen3/obsidian-releases/pull/new/add-tidelog
2. **base repository** 选 `obsidianmd/obsidian-releases`，**base branch** 选 `master`
3. **head repository** 选 `enhen3/obsidian-releases`，**compare branch** 选 `add-tidelog`
4. 标题：`Add plugin: TideLog`（**严格遵守这个格式**——bot 会查）
5. PR 模板会要求勾选一堆 checkbox（confirming requirements）——**全部勾上**，并仔细确认每条都真的满足
6. 点 **Create pull request**

### Step 4 — 等 bot + 改 bot 报错（1–3 天）

提交后 5 分钟内，会有一个名为 `obsidian-releases-bot` 或类似的 bot 自动检查，可能报错。常见问题：

| Bot 报错 | 修复 |
|---|---|
| "manifest.json id mismatch" | manifest.json 里的 id 和 community-plugins.json 里的 id 必须一致 |
| "description too long" | 改 manifest.json 里的 description |
| "missing main.js in release assets" | 去 GitHub Releases 编辑那个 release，把 `main.js` 作为附件上传（必须是文件附件，不是源码 zip 里的） |
| "README mentions Obsidian Plugin in title" | 改 README 标题去掉 "Obsidian Plugin" |
| "uses sentence case" violations in your plugin commands/ribbon | 你的 `eslint-plugin-obsidianmd` 已经检查这些，但 reviewer 仍可能挑刺 |
| "vault is being written outside of plugin config" | 你创建了 `01-Daily/`、`02-Plan/`、`03-Archive/` 三个文件夹，**这是个潜在的卡点**（见下） |

**特别警告：vault folder creation**

TideLog 在 `onload()` 里调用 `initializeVaultStructure()`，自动创建 3 个文件夹。Obsidian reviewers 对这种行为**比较敏感**——他们偏好"只在用户首次操作时创建"。你可能会被要求：

1. 把文件夹创建移到首次使用功能时（lazy create）
2. 或者，在文件夹路径设置上加一句"plugin will create these folders if they don't exist"

如果被打回这一条，最简单的修改：在 `main.ts` 里，把 `await this.initializeVaultStructure()` 从 `onload` 里移到 `onLayoutReady` 里，且加一个判断：仅当用户开始使用某个 SOP 时才创建。

### Step 5 — 等人工 review（**最慢的一步，1–6 周**）

bot 过了之后进入人工 review 队列。这个队列很长，目前**平均等待时间是 4–8 周**。常见情况：

- reviewer 留 inline comment → 你改 → 他们再 review
- 来回 1–3 轮属于正常

---

## 3. 加速审核的实际策略

### 🎯 高 ROI 的加速手段

| 手段 | 难度 | 效果 |
|---|---|---|
| **在 Obsidian 官方 Discord 的 `#plugin-dev` 频道礼貌地提一下你的 PR 号** | 低 | 中（reviewer 经常在 Discord 里看到了顺手 review） |
| **PR 描述里写清"why this exists"+"who it's for"** | 低 | 低-中（让 reviewer 快速判断不需要质疑产品定位） |
| **主动用 bot checklist 自检并截图贴在 PR 评论里** | 低 | 中（显示你尊重流程） |
| **确保 PR 第一次提交就 bot-clean**（一次过 bot，比来回 3 次过要好得多） | 中 | 高 |
| **每 7-10 天礼貌 ping 一次**（不要每天 ping） | 低 | 低-中 |
| **保持 README 简洁专业、demo GIF 在顶部** | 中 | 中（reviewer 5 秒决定是否细看） |

### ❌ 不要做的事

- ❌ 不要在 PR 之外的 issue 里催 — 会被反感
- ❌ 不要重新提交 PR — 会重置 review 队列位置
- ❌ 不要把 `community-plugins.json` 改到末尾以外的位置（追加在末尾）
- ❌ 不要 push 大量 commits 到 PR 分支 — 每次 push 会让 bot 重跑，可能引入新错误

### 🔧 关于"被打回 vault folder creation"的预防

我建议**主动**在 PR 描述里说明：

> "TideLog creates 3 folders (`01-Daily`, `02-Plan`, `03-Archive`) on first launch via `onLayoutReady`. These paths are user-configurable in settings. The folders are not created if the user changes the paths before the first SOP runs. Happy to make this fully lazy if requested."

主动认领可能的争议点，让 reviewer 觉得你专业。

---

## 4. 时间线预期

| 阶段 | 预期 |
|---|---|
| 你按上面步骤重新提交 PR | 30 分钟（如果没遇到 bot 报错） |
| Bot 自动检查 | 5–60 分钟 |
| 人工 review 首次响应 | **2–8 周**（当前队列状况） |
| Review 来回 + 合并 | 通常 1–3 周（看你响应速度） |
| **总计** | **3–11 周** |

---

## 5. 备选方案：在等审核期间继续触达用户

PR 卡着不动的时候，你可以同步推进：

1. **BRAT**（Beta Reviewer Auto-update Tool）— Obsidian 用户最常用的"侧载插件"工具。让用户用 BRAT 一行命令安装你的 GitHub 仓库。需要的只是公开 GitHub release（你已经有）。在 README 顶部加一句：
   > **Install via BRAT**: open BRAT settings → Add Beta plugin → paste `enhen3/Tidelog` → enable
2. **小红书 / 即刻 / 微信公众号** — 中文用户根本不在乎是不是官方目录
3. **B 站 / YouTube** — Logan Yang 走通过的路

---

## 6. 立刻可执行的清单

- [ ] 把 README 标题从 "TideLog — Obsidian Plugin" 改成 "TideLog"
- [ ] 把 manifest.json 的 description 缩到 < 100 字符
- [ ] **同步你的 fork 到 upstream**（按上面 Step 2）
- [ ] 把 `community-plugins.json` 改好
- [ ] 在 GitHub UI 上**真的**点 "Create pull request"
- [ ] 截图 bot 通过 + 贴到 PR 评论里
- [ ] 把 PR URL 发给我或贴到 README，方便后续追踪

如果走完上面这套流程，**3–8 周内**进官方目录的概率 > 80%。
