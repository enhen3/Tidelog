/**
 * 匿名化锚点派生（共享给 ai.ts 与 index.ts）
 *
 * 独立成模块的原因：上一轮只改了 `ai.ts` 的锚点，`index.ts` 的限流表继续写入
 * 无盐 SHA-256，于是「全部改为 HMAC」这个声明并不成立。把派生与缺盐判定放在
 * 一处，新增派生路径时不容易再漏。
 */

/** 缺盐时统一使用的错误码，客户端据此区分「服务未配置」与「配额用尽」。 */
export const ANCHOR_SALT_MISSING = 'anchor_salt_not_configured';

/**
 * 带密钥的 HMAC-SHA256。
 *
 * 用于 IP / deviceId 的锚点派生。**不能用无盐哈希**：IPv4 只有 2^32 个取值，
 * 攻击者拿到数据库即可穷举反解出原始 IP。HMAC 在没有密钥时无法穷举。
 */
export async function hmacHex(salt: string, input: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw', encoder.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * 读取盐值。缺失时返回 null，由调用方 **fail closed**。
 *
 * 绝不退回无盐哈希：静默降级会让一个隐私控制在无人察觉的情况下失效。
 */
export function readAnchorSalt(env: { ANCHOR_SALT?: string }): string | null {
	const salt = env.ANCHOR_SALT?.trim();
	return salt ? salt : null;
}
