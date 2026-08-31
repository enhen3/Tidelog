/**
 * AI 配额单位标识。
 *
 * 服务端按"一次用户动作"计量配额，而不是按 AI 请求数。一次晚间复盘会发出
 * 多次请求（每个问题一次、收尾一次，以及随后并发生成的三条计划建议），
 * 若按请求计数，免费用户一次复盘就会用光整月额度并立刻连续报错。
 *
 * 同一次用户动作内的所有请求共用一个 sessionId，服务端据此只扣一个单位。
 *
 * 注意：这个值由客户端生成，**服务端不能假设它诚实**。服务端对单个
 * session 能庇护的请求数设有上限（见 api/src/ai.ts MAX_REQUESTS_PER_SESSION），
 * 否则固定复用同一个 sessionId 就能绕过配额。
 */
export function newAISessionId(): string {
    // 不使用 crypto：Obsidian 插件 lint 禁止 globalThis，且这里不需要密码学强度——
    // 服务端把它当作不可信的分组键，滥用由服务端的每 session 请求上限兜底。
    const rand = () => Math.random().toString(36).slice(2, 10);
    return `s-${Date.now().toString(36)}-${rand()}${rand()}`;
}
