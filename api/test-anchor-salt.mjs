/** set-anchor-salt 必须在无法列出 secrets 时 fail closed，绝不能继续 put 覆盖。 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tidelog-anchor-salt-'));
const log = path.join(temp, 'calls.log');
const wrangler = path.join(temp, 'wrangler');
fs.writeFileSync(wrangler, `#!/usr/bin/env bash
if [ "$1" = secret ] && [ "$2" = list ]; then
  echo 'simulated login failure' >&2
  exit 1
fi
echo "$*" >> "$TEST_LOG"
`, { mode: 0o755 });

const result = spawnSync('bash', ['set-anchor-salt.sh'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, TEST_LOG: log },
    encoding: 'utf8',
});

assert.equal(result.status, 1, 'wrangler secret list 失败时脚本必须失败退出');
assert.match(result.stderr, /无法读取现有 Worker secrets/, '失败原因必须明确说明无法确认现有 secret');
assert.equal(fs.existsSync(log), false, 'list 失败后不得调用 secret put 覆盖盐值');
fs.rmSync(temp, { recursive: true, force: true });
console.log('  PASS  secret list 失败时 fail closed，且不调用 secret put');

const suspiciousTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'tidelog-anchor-salt-suspicious-'));
const suspiciousLog = path.join(suspiciousTemp, 'calls.log');
const suspiciousWrangler = path.join(suspiciousTemp, 'wrangler');
fs.writeFileSync(suspiciousWrangler, `#!/usr/bin/env bash
if [ "$1" = secret ] && [ "$2" = list ]; then
  echo '[{"name":"ADMIN_TOKEN","type":"secret_text"},{"name":"sk-examplecredential1234567890","type":"secret_text"}]'
  exit 0
fi
echo "$*" >> "$TEST_LOG"
`, { mode: 0o755 });

const suspiciousResult = spawnSync('bash', ['set-anchor-salt.sh'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, PATH: `${suspiciousTemp}:${process.env.PATH}`, TEST_LOG: suspiciousLog },
    encoding: 'utf8',
});

assert.equal(suspiciousResult.status, 1, '疑似密钥出现在 secret 名称时必须失败退出');
assert.match(suspiciousResult.stderr, /发现 1 个名称疑似包含完整 API Key/, '只报告风险数量与处置方向');
assert.doesNotMatch(suspiciousResult.stderr, /sk-examplecredential/, '错误信息不得二次回显疑似密钥');
assert.equal(fs.existsSync(suspiciousLog), false, '发现疑似泄露后不得调用 secret put');
fs.rmSync(suspiciousTemp, { recursive: true, force: true });
console.log('  PASS  疑似密钥被用作 secret 名称时 fail closed，且不回显凭证');
