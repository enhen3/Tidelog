#!/usr/bin/env bash
# 生成并注入匿名化盐值 ANCHOR_SALT。
#
# 由你本人运行。盐值在本机随机生成后直接交给 wrangler，
# 不经过任何对话、不写入任何文件、不进入 shell 历史。
#
#   cd api && ./set-anchor-salt.sh
#
# 注意：更换盐值会使所有既有锚点失效——免费额度计数与试用记录归零。
# 首次设置时这正是预期行为（旧锚点本就是可反解的写法）。

set -euo pipefail
cd "$(dirname "$0")"

if command -v wrangler >/dev/null 2>&1; then
	wrangler_cmd="$(command -v wrangler)"
elif [ -x "../node_modules/.bin/wrangler" ]; then
	wrangler_cmd="../node_modules/.bin/wrangler"
else
	echo "✗ 未找到 Wrangler 4.x。请先在仓库根目录运行 npm install。" >&2
	exit 1
fi

secret_list_stderr="$(mktemp -t tidelog-secret-list.XXXXXX)"
trap 'rm -f "$secret_list_stderr"' EXIT
if ! secret_list="$("$wrangler_cmd" secret list 2>"$secret_list_stderr")"; then
	echo "✗ 无法读取现有 Worker secrets；已中止，未覆盖 ANCHOR_SALT。" >&2
	echo "  请检查 wrangler 登录、网络和 Worker 权限后重试。" >&2
	cat "$secret_list_stderr" >&2
	exit 1
fi
rm -f "$secret_list_stderr"
trap - EXIT

# 只有能解析为 Wrangler 返回的 JSON 列表，才能把“没有该 secret”当作已确认事实。
if ! anchor_salt_exists="$(printf '%s' "$secret_list" | node -e '
let value = "";
process.stdin.on("data", chunk => { value += chunk; });
process.stdin.on("end", () => {
  try {
    const list = JSON.parse(value);
    if (!Array.isArray(list)) throw new Error("not an array");
    process.stdout.write(list.some(item => item && item.name === "ANCHOR_SALT") ? "yes" : "no");
  } catch {
    process.exitCode = 1;
  }
});
')"; then
	echo "✗ wrangler secret list 返回了无法验证的结果；已中止，未覆盖 ANCHOR_SALT。" >&2
	echo "  请检查登录、网络和 wrangler 输出格式后重试。" >&2
	exit 1
fi

# Secret 的“名称”会出现在 Wrangler 元数据和审计输出里，不能放凭证本体。
# 只报告数量，不回显疑似密钥字符串，避免二次泄露。
if ! suspicious_secret_count="$(printf '%s' "$secret_list" | node -e '
let value = "";
process.stdin.on("data", chunk => { value += chunk; });
process.stdin.on("end", () => {
  try {
    const list = JSON.parse(value);
    if (!Array.isArray(list)) throw new Error("not an array");
    const count = list.filter(item => item && typeof item.name === "string"
      && /^sk-[A-Za-z0-9_-]{20,}$/.test(item.name)).length;
    process.stdout.write(String(count));
  } catch {
    process.exitCode = 1;
  }
});
')"; then
	echo "✗ 无法审计现有 secret 名称；已中止，未覆盖 ANCHOR_SALT。" >&2
	exit 1
fi

if [ "$suspicious_secret_count" -gt 0 ]; then
	echo "✗ 发现 $suspicious_secret_count 个名称疑似包含完整 API Key 的 Worker secret。" >&2
	echo "  Secret 名称不是保密字段。请先在上游吊销/轮换对应 Key，并删除错误绑定；本脚本不会回显这些名称。" >&2
	echo "  已中止，未写入 ANCHOR_SALT。" >&2
	exit 1
fi

if [ "$anchor_salt_exists" = "yes" ]; then
	echo "⚠ ANCHOR_SALT 已存在。"
	echo "  继续会覆盖它，导致所有免费额度计数与试用记录归零。"
	read -r -p "  确定要覆盖吗？输入 yes 继续：" confirm
	[ "$confirm" = "yes" ] || { echo "已取消。"; exit 0; }
fi

# 32 字节随机数，十六进制。openssl 在 macOS 自带。
salt="$(openssl rand -hex 32)"
if [ "${#salt}" -ne 64 ]; then
	echo "✗ 盐值生成失败（长度 ${#salt}，应为 64）。已中止，未做任何修改。" >&2
	exit 1
fi

printf '%s' "$salt" | "$wrangler_cmd" secret put ANCHOR_SALT
unset salt

echo
echo "✓ ANCHOR_SALT 已注入。"
echo
echo "接下来（顺序不能反）："
echo "  1. 确认 v5 / v6 数据库迁移已经完成"
echo "  2. npm run deploy"
echo
echo "验证：部署后调用 /ai/quota，若返回 503 anchor_salt_not_configured，说明盐未生效。"
