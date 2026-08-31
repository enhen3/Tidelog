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
let requestUrlResponse = {
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: 'fallback response' } }] }),
    json: { choices: [{ message: { content: 'fallback response' } }] },
};
module.exports = {
    moment: require('moment'),
    requestUrl: async (options) => {
        requestUrlCalls.push(options);
        return requestUrlResponse;
    },
    __getRequestUrlCalls: () => requestUrlCalls,
    __resetRequestUrlCalls: () => { requestUrlCalls = []; },
    __setRequestUrlResponse: (response) => { requestUrlResponse = response; },
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
export { TideLogProvider, classifyTideLogProxyError } from ${JSON.stringify(path.join(__dirname, 'src/ai/tidelog-provider.ts'))};
export { formatAPIError, formatAPIErrorPlainText } from ${JSON.stringify(path.join(__dirname, 'src/utils/error-formatter.ts'))};
export { setLanguage } from ${JSON.stringify(path.join(__dirname, 'src/i18n/index.ts'))};
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
const {
    TideLogProvider,
    classifyTideLogProxyError,
    formatAPIError,
    formatAPIErrorPlainText,
    setLanguage,
    stripExtractionTags,
} = mod.exports;
const obsidianMock = require(mockPath);

global.window = { setTimeout, fetch: (...args) => global.fetch(...args) };


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

{
    obsidianMock.__resetRequestUrlCalls();
    obsidianMock.__setRequestUrlResponse({
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: '完整画像' } }] }),
        json: { choices: [{ message: { content: '完整画像' } }] },
    });
    const plugin = {
        settings: { proLicense: { key: '', deviceId: 'dev-buffered' } },
        licenseManager: { getOrCreateDeviceId: () => 'dev-buffered' },
    };
    let fetchCalled = false;
    global.fetch = async () => {
        fetchCalled = true;
        throw new Error('buffered profile must not use browser fetch');
    };
    const chunks = [];
    const result = await new TideLogProvider(plugin).sendMessage(
        [{ role: 'user', content: '生成画像', timestamp: Date.now() }],
        'system',
        chunk => chunks.push(chunk),
        'profile',
        'profile-session',
        'buffered',
    );
    const call = obsidianMock.__getRequestUrlCalls()[0];
    const body = JSON.parse(call?.body ?? '{}');
    check(!fetchCalled, 'buffered profile bypasses the fragile browser response stream');
    check(result === '完整画像' && chunks.join('') === '完整画像', 'buffered profile returns and emits the complete response');
    check(body.stream === false && call?.headers?.Accept === 'application/json', 'buffered profile asks the proxy for JSON instead of SSE');
}

{
    const plugin = {
        settings: { proLicense: { key: '', deviceId: 'dev-abort' } },
        licenseManager: { getOrCreateDeviceId: () => 'dev-abort' },
    };
    let readCount = 0;
    global.fetch = async () => new Response(new ReadableStream({
        pull(controller) {
            if (readCount++ === 0) {
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'));
                return;
            }
            controller.error(new DOMException('The operation was aborted', 'AbortError'));
        },
    }), { status: 200 });
    let caught;
    try {
        await new TideLogProvider(plugin).sendMessage(
            [{ role: 'user', content: 'hello', timestamp: Date.now() }],
            'system',
            () => {},
            'weekly',
        );
    } catch (error) {
        caught = error;
    }
    check(caught?.code === 'TL-3001', 'an aborted response stream is classified as a network failure', caught?.code);
    const plain = formatAPIErrorPlainText(caught, 'TideLog AI');
    check(plain.includes('TL-3001') && !plain.includes('**') && !plain.includes('`'), 'plain error surfaces do not leak Markdown markers', plain);
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
    const plugin = {
        settings: { proLicense: { key: 'TL-TEST', deviceId: 'dev-test' } },
        licenseManager: { getOrCreateDeviceId: () => 'dev-generated', isTrialActive: () => false },
    };
    const provider = new TideLogProvider(plugin);
    const chunks = [];
    let requestUrl = '';
    let requestInit;
    global.fetch = async (target, init) => {
        requestUrl = String(target);
        requestInit = init;
        return new Response(makeStream([
            'data: {"choices":[{"delta":{"content":"Tide"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"Log"}}]}',
        ]), { status: 200 });
    };

    const result = await provider.sendMessage(
        [{ role: 'user', content: 'hello', timestamp: Date.now() }],
        'system prompt',
        chunk => chunks.push(chunk),
        'weekly',
    );
    const requestBody = JSON.parse(requestInit?.body ?? '{}');
    check(requestUrl.endsWith('/ai/generate'), 'TideLog provider posts to managed AI endpoint', requestUrl);
    check(result === 'TideLog' && chunks.join('') === 'TideLog', 'TideLog provider streams SSE chunks', result);
    check(requestBody.feature === 'weekly' && requestBody.stream === true, 'managed request includes feature and stream=true');
    check(requestBody.deviceId === 'dev-test' && requestBody.licenseKey === 'TL-TEST', 'managed request includes device and optional license');
    check(requestBody.messages?.[0]?.role === 'system' && requestBody.messages?.[1]?.role === 'user', 'system prompt is the first proxy message');
}

{
    const cases = [
        [422, { error: 'content_blocked' }, 'TL-7001', '该请求暂时无法处理', 'This request cannot be processed'],
        [429, { error: 'quota_exceeded', used: 3, limit: 3, resets_at: 1788134400 }, 'TL-4003', '已用：3 / 3', 'Used: 3 / 3'],
        [429, { error: 'fair_use_limit_reached', resets_at: 1788134400 }, 'TL-4003', '防滥用上限', 'anti-abuse limit'],
        [403, { error: 'feature_not_available' }, 'TL-7002', '需要试用或订阅', 'needs a trial or subscription'],
        [502, { error: 'provider_error' }, 'TL-5002', 'AI 服务暂时不可用', 'AI service temporarily unavailable'],
        [502, { error: 'provider_unavailable' }, 'TL-5002', 'AI 服务暂时不可用', 'AI service temporarily unavailable'],
        [502, { error: 'provider_empty_response' }, 'TL-5002', 'AI 服务暂时不可用', 'AI service temporarily unavailable'],
    ];

    for (const [status, body, code, zhText, enText] of cases) {
        setLanguage('zh');
        const zhMessage = formatAPIError(classifyTideLogProxyError(status, JSON.stringify(body)), 'TideLog AI');
        check(zhMessage.includes(code) && zhMessage.includes(zhText), `${status} proxy error maps to Chinese i18n copy`, zhMessage);

        setLanguage('en');
        const enMessage = formatAPIError(classifyTideLogProxyError(status, JSON.stringify(body)), 'TideLog AI');
        check(enMessage.includes(code) && enMessage.includes(enText), `${status} proxy error maps to English i18n copy`, enMessage);
    }
    setLanguage('zh');

    // TL-7002 曾经说的是「你当前的 TideLog **版本**不包含这项 AI 功能」。
    // 用户据此去更新插件，更新完还是一样——原因说错了，补救动作也就跟着错。
    // 锁住这条：档位问题不许再被表述成版本问题。
    const zh7002 = formatAPIError(classifyTideLogProxyError(403, JSON.stringify({ error: 'feature_not_available' })), 'TideLog AI');
    check(!zh7002.includes('版本不包含'), 'TL-7002 no longer blames the plugin version');
    check(zh7002.includes('7 天试用'), 'TL-7002 names the step the user can actually take', zh7002);
}

{
    obsidianMock.__resetRequestUrlCalls();
    obsidianMock.__setRequestUrlResponse({ status: 200, text: '{}', json: {} });
    const plugin = {
        settings: { proLicense: { key: 'TL A+B', deviceId: 'dev test' } },
        licenseManager: { getOrCreateDeviceId: () => 'dev-generated', isTrialActive: () => false },
    };
    const connected = await new TideLogProvider(plugin).testConnection();
    const quotaCall = obsidianMock.__getRequestUrlCalls()[0];
    check(connected, 'quota HTTP 200 is treated as connected');
    check(quotaCall?.url?.includes('/ai/quota?deviceId=dev+test&licenseKey=TL+A%2BB'), 'quota request includes encoded device and license', quotaCall?.url);
}

{
    const visible = stripExtractionTags('Visible report\n\n<extraction>\n<new_patterns>\n- hidden\n</new_patterns>\n</extraction>');
    check(visible === 'Visible report', 'stripExtractionTags removes outer extraction blocks', visible);

    const partial = stripExtractionTags('Visible report\n\n<profile_update>\n# hidden while streaming');
    check(partial === 'Visible report', 'stripExtractionTags hides unfinished machine-readable tail during streaming', partial);
}


// ---------------------------------------------------------------------------
// 回归：请求体不得自报试用，只携带服务端可核验的设备与配额单位标识。
//
// 试用已改为 /trial/start 在 D1 建立权威记录。若普通生成仍发送 trial:true，
// 未来一次误用就可能重新引入“客户端自行声明付费档位”的漏洞。
// ---------------------------------------------------------------------------
async function captureRequestBody({ trialActive, feature, sessionId }) {
    const plugin = {
        settings: { proLicense: { key: '', deviceId: 'dev-test' } },
        licenseManager: {
            getOrCreateDeviceId: () => 'dev-test',
            isTrialActive: () => trialActive,
        },
    };
    const provider = new TideLogProvider(plugin);
    let init;
    global.fetch = async (_target, options) => {
        init = options;
        return new Response(makeStream(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']), { status: 200 });
    };
    await provider.sendMessage(
        [{ role: 'user', content: 'hi', timestamp: Date.now() }],
        'system',
        () => {},
        feature,
        sessionId,
    );
    return JSON.parse(init?.body ?? '{}');
}

{
    const body = await captureRequestBody({ trialActive: true, feature: 'profile', sessionId: 'sess-1' });
    check(body.trial === undefined, '试用中的用户也不得在普通生成请求里自报 trial');
    check(body.feature === 'profile', '首次画像使用 profile feature');
    check(body.sessionId === 'sess-1', '请求体携带配额单位标识');
}

{
    const body = await captureRequestBody({ trialActive: false, feature: 'daily_insight', sessionId: 'sess-2' });
    check(body.trial === undefined, '非试用用户不得自报 trial');
    check(body.sessionId === 'sess-2', '非试用用户同样携带配额单位标识');
}

{
    const body = await captureRequestBody({ trialActive: false, feature: 'chat', sessionId: undefined });
    check(body.sessionId === undefined, '未提供 sessionId 时不发送该字段（退化为按请求计量）');
}

{
    // 一次复盘的多次调用必须共用同一个 sessionId，否则免费用户一次复盘就用光整月额度。
    const a = await captureRequestBody({ trialActive: false, feature: 'daily_insight', sessionId: 'same' });
    const b = await captureRequestBody({ trialActive: false, feature: 'daily_insight', sessionId: 'same' });
    check(a.sessionId === b.sessionId && a.sessionId === 'same', '同一动作的多次调用共用一个配额单位标识');
}

console.log(`\nPassed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
