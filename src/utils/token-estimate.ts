/**
 * 输入 token 估算。
 *
 * **必须与服务端 `api/src/ai.ts` 的 estimateInputTokens 保持一致**，
 * 否则客户端自认为没超限、服务端却返回 413，用户在最期待的动作上白等一场。
 * ASCII 约 4 字符 1 token，非 ASCII（中日韩）按 1 字符 1 token 计。
 */
export function estimateTokens(text: string): number {
    let ascii = 0;
    let nonAscii = 0;
    for (const char of text) {
        if (char.codePointAt(0)! <= 0x7f) ascii += 1;
        else nonAscii += 1;
    }
    return Math.ceil(ascii / 4) + nonAscii;
}

/** 服务端上限（api/src/ai.ts MAX_INPUT_TOKENS）。 */
export const SERVER_MAX_INPUT_TOKENS = 32_000;

/**
 * 客户端预算：留出安全余量。
 * 服务端会把 role 名等也计入，且估算与真实分词存在偏差，贴着上限发很容易被拒。
 */
export const CLIENT_INPUT_TOKEN_BUDGET = 28_000;
