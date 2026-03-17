/**
 * User-friendly error message formatter for AI API errors.
 * Detects common HTTP status codes and error patterns across all providers.
 */

export function formatAPIError(error: unknown, providerName: string): string {
    const errMsg = String(error).toLowerCase();
    const label = providerName.charAt(0).toUpperCase() + providerName.slice(1);

    if (errMsg.includes('402') || errMsg.includes('credits') || errMsg.includes('balance') || errMsg.includes('quota') || errMsg.includes('billing') || errMsg.includes('payment')) {
        return `💳 **API 额度不足**\n\n你的 ${label} 账户余额不足或已用完。\n\n**解决方法：**\n- 登录 ${label} 后台充值或购买额度\n- 或在 TideLog 设置中切换到其他 AI 提供商`;
    }

    if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('unauthorized') || errMsg.includes('permission')) {
        return `🔑 **API Key 无效或已过期**\n\n请检查 Obsidian 设置 → TideLog 中的 ${label} API Key 是否正确。`;
    }

    if (errMsg.includes('429') || errMsg.includes('rate') || errMsg.includes('too many')) {
        return `⏳ **请求过于频繁**\n\n${label} 的速率限制已达上限，请稍后再试。`;
    }

    if (errMsg.includes('404') || errMsg.includes('model not found')) {
        return `🔍 **模型不可用**\n\n当前配置的 AI 模型无法访问。请在 TideLog 设置中检查模型名称是否正确。`;
    }

    if (errMsg.includes('500') || errMsg.includes('502') || errMsg.includes('503') || errMsg.includes('internal')) {
        return `🔧 **AI 服务暂时不可用**\n\n${label} 服务端出现问题，请稍后重试。`;
    }

    if (errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('failed to fetch') || errMsg.includes('econnrefused') || errMsg.includes('timeout')) {
        return `🌐 **网络连接失败**\n\n请检查网络连接后重试。如果使用代理，请确认代理设置正确。`;
    }

    return `⚠️ **发生了意外错误**\n\n请检查 ${label} 的 API 设置是否正确，或尝试切换到其他 AI 提供商。\n\n如果问题持续，请重启 Obsidian 后重试。`;
}
