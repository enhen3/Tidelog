/**
 * Batch License Key Generator
 *
 * Usage:
 *   node scripts/generate-keys.mjs [count]
 *
 * Generates license keys and prints them one per line.
 * Pipe to a file for 面包多 upload:
 *   node scripts/generate-keys.mjs 100 > keys.txt
 *
 * Or use the API directly:
 *   curl -X POST https://your-worker.workers.dev/admin/generate \
 *     -H "Authorization: Bearer YOUR_TOKEN" \
 *     -H "Content-Type: application/json" \
 *     -d '{"count": 50}'
 */

import { randomBytes } from 'crypto';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKey() {
    const segment = () => {
        const bytes = randomBytes(4);
        let s = '';
        for (let i = 0; i < 4; i++) {
            s += CHARS[bytes[i] % CHARS.length];
        }
        return s;
    };
    return `TL-${segment()}-${segment()}-${segment()}`;
}

const count = parseInt(process.argv[2] || '10', 10);
const keys = new Set();

while (keys.size < count) {
    keys.add(generateKey());
}

for (const key of keys) {
    console.log(key);
}

process.stderr.write(`\n✅ Generated ${count} unique keys\n`);
