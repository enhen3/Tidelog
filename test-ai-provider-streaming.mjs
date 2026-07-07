/**
 * Regression tests for OpenAI-compatible streaming and extraction cleanup.
 */

import path from 'path';
import url from 'url';
import fs from 'fs';
import esbuild from 'esbuild';
import { createRequire } from 'module';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const mockPath = path.join(__dirname, 'obsidian-mock-ai-streaming.cjs');
let requestUrlCalls = [];
fs.writeFileSync(
    mockPath,
    `
let requestUrlCalls = [];
module.exports = {
    moment: require('moment'),
    requestUrl: async (options) => {
        requestUrlCalls.push(options);
        return {
            status: 200,
            text: JSON.stringify({ choices: [{ message: { content: 'fallback response' } }] }),
            json: { choices: [{ message: { content: 'fallback response' } }] },
        };
    },
    __getRequestUrlCalls: () => requestUrlCalls,
    __resetRequestUrlCalls: () => { requestUrlCalls = []; },
};
`,
);

const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, parent, ...rest) {
    if (req === 'obsidian') return mockPath;
    return origResolve.call(this, req, parent, ...rest);
};

const entryPath = path.join(__dirname, '.test-ai-provider-streaming-entry.ts');
fs.writeFileSync(entryPath, `
export { BaseAIProvider } from ${JSON.stringify(path.join(__dirname, 'src/ai/base-provider.ts'))};
export { stripExtractionTags } from ${JSON.stringify(path.join(__dirname, 'src/utils/md.ts'))};
`);

const bundled = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'cjs',
    target: 'es2020',
    external: ['obsidian'],
    platform: 'node',
    logLevel: 'silent',
});
const mod = { exports: {} };
new Function('module', 'exports', 'require', bundled.outputFiles[0].text)(mod, mod.exports, require);
const { BaseAIProvider, stripExtractionTags } = mod.exports;
const obsidianMock = require(mockPath);

global.window = { setTimeout };

class TestProvider extends BaseAIProvider {
    name = 'Test Provider';
    async sendMessage(messages, systemPrompt, onChunk) {
        return this.sendOpenAICompatible('https://example.test/chat/completions', { Authorization: 'Bearer test' }, messages, systemPrompt, onChunk);
    }
    async testConnection() { return true; }
}

let pass = 0;
let fail = 0;
function check(condition, label, extra = '') {
    if (condition) {
        console.log(`  PASS  ${label}`);
        pass++;
    } else {
        console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ''}`);
        fail++;
    }
}

function makeStream(chunks) {
    return new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

console.log('\n=== TIDELOG AI STREAMING TESTS ===\n');

{
    obsidianMock.__resetRequestUrlCalls();
    const provider = new TestProvider('test-key', 'test-model');
    const chunks = [];
    global.fetch = async () => new Response(makeStream([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}',
    ]), { status: 200 });

    const result = await provider.sendMessage([{ role: 'user', content: 'hi', timestamp: Date.now() }], '', chunk => chunks.push(chunk));
    check(result === 'Hello', 'stream parser consumes final SSE line without trailing newline', result);
    check(chunks.join('') === 'Hello', 'stream callback receives the complete parsed response', chunks.join(''));
    check(obsidianMock.__getRequestUrlCalls().length === 0, 'successful stream does not fall back to requestUrl');
}

{
    obsidianMock.__resetRequestUrlCalls();
    const provider = new TestProvider('test-key', 'test-model');
    const chunks = [];
    global.fetch = async () => new Response(makeStream([': keep-alive\n\n', 'data: [DONE]\n\n']), { status: 200 });

    const result = await provider.sendMessage([{ role: 'user', content: 'hi', timestamp: Date.now() }], '', chunk => chunks.push(chunk));
    requestUrlCalls = obsidianMock.__getRequestUrlCalls();
    check(result === 'fallback response', 'empty/keep-alive-only stream falls back to non-streaming requestUrl', result);
    check(chunks.join('') === 'fallback response', 'fallback still simulates streaming chunks', chunks.join(''));
    check(requestUrlCalls.length === 1, 'fallback path performs exactly one requestUrl call', String(requestUrlCalls.length));
    const fallbackBody = JSON.parse(requestUrlCalls[0]?.body ?? '{}');
    check(fallbackBody.stream === undefined, 'fallback request is non-streaming');
}

{
    const visible = stripExtractionTags('Visible report\n\n<extraction>\n<new_patterns>\n- hidden\n</new_patterns>\n</extraction>');
    check(visible === 'Visible report', 'stripExtractionTags removes outer extraction blocks', visible);

    const partial = stripExtractionTags('Visible report\n\n<profile_update>\n# hidden while streaming');
    check(partial === 'Visible report', 'stripExtractionTags hides unfinished machine-readable tail during streaming', partial);
}

console.log(`\nPassed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
