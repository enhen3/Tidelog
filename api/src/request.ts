export type JsonReadResult =
	| { ok: true; value: unknown }
	| { ok: false; error: 'invalid_json' | 'body_too_large' };

/**
 * 在解析前限制实际读取的字节数。
 *
 * 只检查 Content-Length 不够：攻击者可以用 chunked body 绕过。逐块读取并在越界时
 * cancel，才能避免一个巨大 JSON 在 `request.json()` 阶段先占满 Worker 内存。
 */
export async function readJsonWithLimit(request: Request, maxBytes: number): Promise<JsonReadResult> {
	const contentLength = request.headers.get('Content-Length');
	if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
		return { ok: false, error: 'body_too_large' };
	}
	if (!request.body) return { ok: false, error: 'invalid_json' };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maxBytes) {
				await reader.cancel().catch(() => undefined);
				return { ok: false, error: 'body_too_large' };
			}
			chunks.push(value);
		}
	} catch {
		return { ok: false, error: 'invalid_json' };
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return {
			ok: true,
			value: JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)),
		};
	} catch {
		return { ok: false, error: 'invalid_json' };
	}
}
