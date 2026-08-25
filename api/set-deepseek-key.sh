#!/bin/bash
# 从剪贴板注入 DEEPSEEK_API_KEY 并自检。
# 用法：把 Key 复制到剪贴板，然后在 api/ 目录下跑 ./set-deepseek-key.sh
set -uo pipefail
cd "$(dirname "$0")"

KEY="$(pbpaste)"
KEY="${KEY//[$'\t\r\n ']/}"          # 去掉所有空白字符

if [ -z "$KEY" ]; then
  echo "❌ 剪贴板是空的"; exit 1
fi
if [[ "$KEY" != sk-* ]]; then
  echo "❌ 剪贴板内容不像 DeepSeek Key（应以 sk- 开头）"; exit 1
fi
echo "剪贴板 Key：长度 ${#KEY}，尾号 ****${KEY: -4}"

echo "→ 先直连 DeepSeek 验证这个 Key 本身是否有效…"
CODE=$(curl -s -o /dev/null -w '%{http_code}' https://api.deepseek.com/chat/completions \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"hi"}],"max_tokens":1}')
if [ "$CODE" != "200" ]; then
  echo "❌ DeepSeek 直连返回 $CODE —— 这个 Key 本身就不可用，别注入了。"
  echo "   401=Key 无效或已吊销  402=余额不足"
  exit 1
fi
echo "✅ 直连 200，Key 有效"

echo "→ 注入到 Cloudflare（名字固定为 DEEPSEEK_API_KEY，不会填错）…"
printf '%s' "$KEY" | npx wrangler secret put DEEPSEEK_API_KEY || { echo "❌ 注入失败"; exit 1; }

echo "→ 自检：检查有没有把 Key 存成了名字…"
BAD=$(npx wrangler secret list 2>/dev/null | grep -c '"name": "sk-')
if [ "$BAD" -gt 0 ]; then
  echo "⚠️  仍有 $BAD 个畸形 secret（名字是 Key），需要删除："
  npx wrangler secret list 2>/dev/null | grep '"name": "sk-'
else
  echo "✅ 无畸形 secret"
fi

echo "→ 验证线上 AI 链路…"
sleep 3
RESP=$(curl -s -X POST https://tidelog-api.mydreamchronicle.com/ai/generate \
  -H 'Content-Type: application/json' \
  -d "{\"feature\":\"daily_insight\",\"deviceId\":\"selfcheck-$(date +%s)\",\"stream\":false,\"messages\":[{\"role\":\"user\",\"content\":\"说一个字\"}]}")
if echo "$RESP" | grep -q '"error"'; then
  echo "❌ 线上仍失败：$(echo "$RESP" | head -c 200)"
else
  echo "✅ 线上 AI 链路已跑通！"
  echo "$RESP" | head -c 300
fi
