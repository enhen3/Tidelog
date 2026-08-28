-- Migration v5: 服务端权威试用 + 按用户动作计量的配额
--
-- 注意：不要直接以 --file 执行本文件。SQLite/D1 没有 ADD COLUMN IF NOT EXISTS；
-- 请运行 `npm run db:migrate:v5`，它会先读 PRAGMA table_info，再只补缺失列，
-- 因而在任一 ALTER 后中断也能安全重跑。本文件保留完整 DDL 作为审计清单。

-- 1. 服务端保存试用起止，客户端不再是权威。
CREATE TABLE IF NOT EXISTS device_trials (
  anchor      TEXT PRIMARY KEY,   -- HMAC-SHA256(ANCHOR_SALT, 'trial:' || deviceId)：跨网络稳定，用户换 WiFi 试用不会重置
  ip_hash     TEXT NOT NULL,      -- HMAC-SHA256(ANCHOR_SALT, 'ip:' || IP)，仅用于限制"换 deviceId 刷试用"
  started_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_trials_ip_started
  ON device_trials(ip_hash, started_at);

-- 2. 配额改为按"用户动作"计量（由 scripts/migrate-v5.mjs 按需执行）。
--    一次复盘会发出多次 AI 请求（每题一次 + 收尾一次 + 3 条计划建议），
--    按请求计数会让免费用户一次复盘就用光整月额度。
--    同一 session_id 的多次请求只计一个单位。
-- ALTER TABLE ai_usage ADD COLUMN session_id TEXT;

-- 3. IP 级上限同样要按动作计量，否则护栏会误伤正常用户。
-- ALTER TABLE ai_usage ADD COLUMN ip_anchor TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_usage_session
  ON ai_usage(subject_id, feature, period, session_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_ip_period
  ON ai_usage(ip_anchor, period);
