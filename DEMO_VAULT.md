# TideLog 演示 Vault

仓库内的 `TideLog-Demo-Vault` 是一套可直接用 Obsidian 打开的产品演示库。它同时承担三件事：

- 让第一次接触 TideLog 的人从一个完整故事理解 Plan → Review → Insights。
- 为产品介绍、录屏、截图和现场演示提供一致的示例数据。
- 用真实 Markdown 文件验证 TideLog 对日、周、月计划和长期资料的读取。

## 生成或刷新

```bash
npm run demo:vault
```

该命令会先生成当前插件构建，再把 `main.js`、`manifest.json`、`styles.css` 和演示内容同步到 Vault。示例日期会以运行命令当天为基准，因此在正式录屏或演示前建议重新执行一次。

只检查现有演示库：

```bash
npm run demo:check
```

## 打开

1. 在 Obsidian 中选择 **Open folder as vault**。
2. 打开仓库中的 `TideLog-Demo-Vault` 文件夹。
3. 若 Obsidian 显示第三方插件安全提示，确认信任该 Vault。
4. 打开 `00-从这里开始.md`，再点击左侧 TideLog 波浪图标。

演示 Vault 不包含真实用户数据或 Pro License。生成脚本会写入一个仅供本地截图使用、7 天内有效的演示 Pro 状态；它没有 License Key，也不会向授权服务器发起验证。正式演示前重新运行一次 `npm run demo:vault` 即可续期。

AI 能力由 TideLog 服务端统一提供，演示时无需配置任何 API Key。现场重新生成会消耗对应档位的配额。
