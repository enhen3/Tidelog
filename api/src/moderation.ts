/**
 * TideLog 内容合规检查（方案一：最小关键词表）
 *
 * 为什么存在：
 *   DeepSeek 开放平台服务协议 3.4 条要求开发者「对终端用户的输入和输出进行审查，
 *   建立关键词表、违法内容特征库、分类模型等风险识别、过滤机制」。
 *   不实现即构成对服务商违约。
 *
 * 设计约束（与产品的隐私承诺共存）：
 *   1. 只在请求转发的瞬间做检查，**不存储、不留档、不上报任何笔记内容**
 *   2. **只拦明确违法类目**，不对情绪、心理状态、人际冲突、负面表达做任何判断
 *      —— 用户在日记里写抑郁、愤怒、自我怀疑是本产品的核心场景，绝不能误伤
 *   3. 命中时只返回类目，不返回命中的具体词，避免日志泄露用户内容
 *
 * 局限（必须知悉）：
 *   关键词表无法覆盖变体、拼音、拆字、谐音等规避手段，只能履行形式义务。
 *   如需更强的合规强度，需接入第三方内容安全 API（阿里云约 ¥15/万次、
 *   腾讯云约 ¥25/万次），代价是笔记内容要经过第三方。
 *   本表应定期人工复核与扩充。
 */

export type ModerationCategory = 'drugs' | 'gambling' | 'fraud' | 'weapons' | 'sexual_minors';

export interface ModerationResult {
	allowed: boolean;
	/** 命中的类目。不含命中的具体词，避免泄露用户内容。 */
	categories: ModerationCategory[];
}

/**
 * 最小关键词种子表。**仅覆盖明确违法类目。**
 * 有意不包含：政治类（易误伤且需专业判断）、情绪/心理类（本产品核心场景）、
 * 辱骂类（不违法）。扩充前请评估误伤风险。
 */
const RULES: ReadonlyArray<{ category: ModerationCategory; terms: readonly string[] }> = [
	{ category: 'drugs', terms: ['冰毒', '海洛因', '甲基苯丙胺', '摇头丸', '大麻交易', '毒品交易'] },
	{ category: 'gambling', terms: ['赌博网站', '博彩平台', '开设赌场', '境外赌场', '网络赌盘'] },
	{ category: 'fraud', terms: ['电信诈骗', '洗钱通道', '刷单返利', '办理假证', '假发票'] },
	{ category: 'weapons', terms: ['制造枪支', '买卖枪支', '自制炸药', '爆炸装置制作'] },
	{ category: 'sexual_minors', terms: ['幼女色情', '儿童色情'] },
];

/** 归一化：去空白、转小写，降低最简单的规避（空格插入、大小写）。 */
function normalize(text: string): string {
	return text.replace(/[\s　]+/g, '').toLowerCase();
}

/**
 * 检查一段文本。命中任一违法类目即拒绝。
 * 纯函数，无 IO，无副作用，不记录任何内容。
 */
export function moderateText(text: string): ModerationResult {
	const haystack = normalize(text);
	const hit = new Set<ModerationCategory>();
	for (const rule of RULES) {
		for (const term of rule.terms) {
			if (haystack.includes(normalize(term))) {
				hit.add(rule.category);
				break;
			}
		}
	}
	return { allowed: hit.size === 0, categories: [...hit] };
}

/** 检查一组对话消息（发往模型前调用）。 */
export function moderateMessages(messages: ReadonlyArray<{ content?: unknown }>): ModerationResult {
	const hit = new Set<ModerationCategory>();
	for (const m of messages) {
		if (typeof m?.content !== 'string') continue;
		for (const c of moderateText(m.content).categories) hit.add(c);
	}
	return { allowed: hit.size === 0, categories: [...hit] };
}
