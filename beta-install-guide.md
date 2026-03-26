# 🌊 TideLog 内测安装指南

欢迎加入 TideLog 内测！以下是两种安装方式，任选其一即可。

---

## 方式一：BRAT 安装（推荐 ⭐）

> BRAT 是 Obsidian 社区专用的内测插件管理工具，安装后可以自动接收更新。

### 第 1 步：安装 BRAT 插件

1. 打开 Obsidian → 设置 → 第三方插件 → 关闭安全模式
2. 点击 **浏览** → 搜索 `BRAT` → 找到 **Obsidian42 - BRAT** → 点击 **安装**
3. 安装完成后点击 **启用**

### 第 2 步：通过 BRAT 添加 TideLog

1. 打开 Obsidian 设置 → 左侧找到 **BRAT**
2. 点击 **Add Beta plugin**
3. 输入仓库地址：`enhen3/Tidelog`
4. 点击 **Add Plugin**
5. 等待下载完成，BRAT 会自动安装

### 第 3 步：启用插件

1. 打开 设置 → 第三方插件
2. 找到 **TideLog** → 打开开关启用
3. 🎉 安装完成！

---

## 方式二：手动安装

> 适合不想安装额外插件的用户，步骤稍多但也很简单。

### 第 1 步：下载安装包

访问 [TideLog Beta Release 下载页](https://github.com/enhen3/Tidelog/releases/tag/1.1.0-beta.1)，下载以下 **3 个文件**：

- `main.js`
- `manifest.json`
- `styles.css`

### 第 2 步：找到你的 Vault 插件目录

**Mac 用户：**
1. 打开 Finder
2. 进入你的 Obsidian Vault 文件夹
3. 按 `Cmd + Shift + .` 显示隐藏文件
4. 进入 `.obsidian/plugins/` 目录
5. 新建一个文件夹，命名为 `tidelog`

**Windows 用户：**
1. 打开文件资源管理器
2. 进入你的 Obsidian Vault 文件夹
3. 点击 **查看** → 勾选 **隐藏的项目**
4. 进入 `.obsidian\plugins\` 目录
5. 新建一个文件夹，命名为 `tidelog`

**找不到 Vault 文件夹？**
打开 Obsidian → 左下角点击 ⚙️ → 关于 → 查看「仓库路径」即可看到位置。

### 第 3 步：放入文件

将下载的 3 个文件（`main.js`、`manifest.json`、`styles.css`）复制到刚刚创建的 `tidelog` 文件夹中。

最终目录结构：
```
你的Vault/
└── .obsidian/
    └── plugins/
        └── tidelog/
            ├── main.js
            ├── manifest.json
            └── styles.css
```

### 第 4 步：启用插件

1. **完全关闭并重新打开 Obsidian**
2. 打开 设置 → 第三方插件 → 关闭安全模式（如果还没关）
3. 找到 **TideLog** → 打开开关启用
4. 🎉 安装完成！

---

## 🔑 激活码使用

1. 启用插件后，左侧边栏会出现 TideLog 图标 🌊
2. 点击打开 → 进入设置
3. 找到 **License** 部分 → 输入你收到的激活码
4. 点击激活 → 完成！

---

## ❓ 常见问题

**Q: 安装后看不到插件？**
A: 请确保完全关闭并重新打开 Obsidian，不是只关闭窗口。Mac 上需要 `Cmd + Q` 彻底退出。

**Q: 提示「无法加载插件」？**
A: 检查 `tidelog` 文件夹内是否有 3 个文件，文件名必须完全匹配（`main.js`、`manifest.json`、`styles.css`）。

**Q: 手机上能用吗？**
A: 支持！手机上推荐用 BRAT 方式安装。如果手动安装，需要使用文件管理器访问 Vault 的插件目录。

**Q: 如何更新到新版本？**
A: BRAT 用户会自动更新。手动安装的用户需要重新下载 3 个文件并覆盖替换。

---

## 📬 遇到问题？

直接私信告诉我你遇到的问题，附上以下信息帮助我定位：
- 你的系统（Mac / Windows / iOS / Android）
- Obsidian 版本号（设置 → 关于 → 当前版本）
- 出了什么问题（截图更好）
