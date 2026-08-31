/**
 * First Insight Service
 *
 * Generates the first third-person profile report from normalized legacy notes.
 * It intentionally does not write user_profile.md until the user confirms.
 */

import { TFile, moment } from 'obsidian';
import type TideLogPlugin from '../main';
import { ChatMessage } from '../types';
import { getLanguage, t } from '../i18n';
import { replaceFile } from '../utils/vault-write';
import { classifyNetworkError, TideLogError } from '../utils/error-formatter';
import { stripExtractionTags } from '../utils/md';
import { formatFirstInsightReportDocument, formatProfileDocument } from '../utils/document-format';
import type { LegacyImportSession, NormalizedLegacyJournal } from './legacy-import-service';
import { FIRST_INSIGHT_MIN_VALID_ENTRIES } from '../constants';
import { CLIENT_INPUT_TOKEN_BUDGET, estimateTokens } from '../utils/token-estimate';
import { newAISessionId } from './ai-session';

export const AHA_MODULE_HEADINGS_ZH = [
    '过去记录里的三个高频主题',
    '一个反复出现的行为模式',
    '一个可能的盲点',
    '下周一个小实验',
    '引用证据',
] as const;

export const AHA_MODULE_HEADINGS_EN = [
    'Three recurring themes in past records',
    'One repeated behavior pattern',
    'One possible blind spot',
    'One small experiment for next week',
    'Evidence references',
] as const;

/** 既有画像会同时进入 system 与 user prompt；必须单独设上限，避免它挤穿总预算。 */
export const FIRST_INSIGHT_PROFILE_TOKEN_CAP = 4_000;
/** 首次画像无需顶满服务端 28K 输入预算；20K 足够支持一个月的近期模式判断。 */
export const FIRST_INSIGHT_INPUT_TOKEN_BUDGET = 20_000;

/**
 * 保留画像开头（通常含当前偏好与最近结论），并明确告诉模型内容已被截断。
 * 二分而不是按字符硬切，确保使用与服务端一致的 token 估算口径。
 */
export function boundFirstInsightCurrentProfile(currentProfile: string | null): string | null {
    if (!currentProfile || estimateTokens(currentProfile) <= FIRST_INSIGHT_PROFILE_TOKEN_CAP) return currentProfile;
    const suffix = getLanguage() === 'en'
        ? '\n\n[Existing profile truncated to fit the input limit.]'
        : '\n\n[既有画像已为满足输入上限而截断。]';
    let low = 0;
    let high = currentProfile.length;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (estimateTokens(currentProfile.slice(0, mid) + suffix) <= FIRST_INSIGHT_PROFILE_TOKEN_CAP) low = mid;
        else high = mid - 1;
    }
    return currentProfile.slice(0, low) + suffix;
}

export interface FirstInsightReportDraft {
    importId: string;
    generatedAt: string;
    report: string;
    profileUpdate: string;
    sourceFolderPath: string;
    normalizedFolderPath: string;
    validCount: number;
    dateRange: {
        start: string;
        end: string;
    };
}

export class FirstInsightService {
    constructor(private plugin: TideLogPlugin) { }

    async generateFirstInsight(
        session: LegacyImportSession,
        onChunk?: (chunk: string) => void,
    ): Promise<FirstInsightReportDraft> {
        if (session.normalizedEntries.length < FIRST_INSIGHT_MIN_VALID_ENTRIES) {
            throw new Error(t(
                'firstInsight.errorTooFewValid',
                String(session.normalizedEntries.length),
                String(FIRST_INSIGHT_MIN_VALID_ENTRIES),
            ));
        }

        const currentProfile = boundFirstInsightCurrentProfile(await this.plugin.vaultManager.getUserProfileContent());
        const systemPrompt = buildFirstInsightSystemPrompt(currentProfile);
        const prompt = buildFirstInsightPrompt({
            currentProfile,
            entries: session.normalizedEntries,
            importId: session.importId,
            dateRange: session.scan.dateRange,
            // 系统提示词与用户提示词共用同一个服务端上限，必须一起计入预算。
            reservedTokens: estimateTokens(systemPrompt),
        });
        const messages: ChatMessage[] = [
            { role: 'user', content: prompt, timestamp: Date.now() },
        ];

        try {
            const provider = this.plugin.getAIProvider();
            let fullResponse = '';
            const returnedResponse = await provider.sendMessage(
                messages,
                systemPrompt,
                (chunk) => {
                    fullResponse += chunk;
                    try {
                        onChunk?.(chunk);
                    } catch (error) {
                        console.warn('TideLog first insight stream callback failed:', error);
                    }
                },
                'profile',
                newAISessionId(),
                'buffered',
            );

            // 正常 SSE 会逐块调用 onChunk；缓冲回退或某些代理实现只返回最终字符串。
            // 只相信回调会把“已经生成完成”变成空草稿，最终在保存时才报一个无从诊断的失败。
            if (!fullResponse.trim() && typeof returnedResponse === 'string') {
                fullResponse = returnedResponse;
            }

            const extractedProfile = extractProfileUpdate(fullResponse);
            const visibleResponse = stripProfileTags(fullResponse).trim();
            const visibleReportSource = visibleResponse || withTopLevelTitle(
                extractedProfile,
                t('firstInsight.reportTitle'),
            );
            if (!visibleReportSource.trim()) {
                throw new Error(t('firstInsight.emptyResponse'));
            }

            const report = formatFirstInsightReportDocument(visibleReportSource);
            const profileSource = extractedProfile || withTopLevelTitle(
                report,
                getLanguage() === 'en' ? '# User Profile' : '# 用户画像',
            );
            const profileUpdate = formatProfileDocument(profileSource);

            return {
                importId: session.importId,
                generatedAt: moment().format('YYYY-MM-DD HH:mm'),
                report,
                profileUpdate,
                sourceFolderPath: session.sourceFolderPath,
                normalizedFolderPath: session.normalizedFolderPath,
                validCount: session.normalizedEntries.length,
                dateRange: session.scan.dateRange,
            };
        } catch (error) {
            // 保留 provider 已经做出的分类。原先这里把错误先格式化成文案、再包进
            // Error，调用方只能看到 TL-9001，也丢掉了 AbortError 等真实原因。
            console.error('TideLog first insight generation failed:', error);
            if (error instanceof TideLogError) throw error;
            throw classifyNetworkError(error);
        }
    }

    async saveInitialProfile(draft: FirstInsightReportDraft): Promise<{
        profileFile: TFile | null;
        reportFile: TFile | null;
    }> {
        await this.plugin.vaultManager.ensureInsightsFolder();
        const reportFile = await this.saveFirstInsightReport(draft);
        if (!reportFile) throw new Error(t('firstInsight.saveFailed'));
        const profileFile = await this.saveProfileUpdate(draft.profileUpdate);
        if (!profileFile) throw new Error(t('firstInsight.saveFailed'));
        this.plugin.settings.firstInsightCompleted = true;
        await this.plugin.saveSettings();
        return { profileFile, reportFile };
    }

    async saveFirstInsightReport(draft: FirstInsightReportDraft): Promise<TFile | null> {
        if (!draft.report.trim()) return null;

        const date = moment().format('YYYY-MM-DD');
        const filePath = `${this.plugin.settings.archiveFolder}/Insights/${t('firstInsight.reportFileName', date)}`;

        // Report-info callout (consistent with weekly/monthly/profile reports):
        // period · journal count · generated time.
        const sep = getLanguage() === 'en' ? '  ·  ' : '　·　';
        const metaParts = [
            `${t('insight.reportPeriodLabel')} ${draft.dateRange.start} – ${draft.dateRange.end}`,
            t('firstInsight.metaValidCount', String(draft.validCount)),
            `${t('insight.reportGeneratedLabel')} ${draft.generatedAt}`,
        ];
        const meta = `> [!tl-meta] ${t('insight.reportInfoTitle')}\n> ${metaParts.join(sep)}`;

        // The model already emits its own "# …" title. Insert the meta callout
        // right after that H1 instead of prepending a second title (which would
        // duplicate the heading).
        const formattedReport = formatFirstInsightReportDocument(draft.report.trim());
        const reportLines = formattedReport.split('\n');
        const h1Idx = reportLines.findIndex((l) => /^#\s+/.test(l));
        let composed: string;
        if (h1Idx >= 0) {
            reportLines.splice(h1Idx + 1, 0, '', meta);
            composed = reportLines.join('\n');
        } else {
            composed = `${t('firstInsight.reportTitle')}\n\n${meta}\n\n${formattedReport}`;
        }
        const body = `${composed}\n\n---\n\n${t('firstInsight.reportArchiveNote', draft.importId, draft.normalizedFolderPath)}\n`;

        const existing = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            await replaceFile(this.plugin.app, existing, body);
            return existing;
        }
        return await this.plugin.app.vault.create(filePath, body);
    }

    private async saveProfileUpdate(profileUpdate: string): Promise<TFile | null> {
        const content = formatProfileDocument(ensureProfileAhaStructure(profileUpdate.trim()));
        if (!content) return null;

        const profilePath = `${this.plugin.settings.archiveFolder}/user_profile.md`;
        const existing = this.plugin.app.vault.getAbstractFileByPath(profilePath);
        if (existing instanceof TFile) {
            await replaceFile(this.plugin.app, existing, content);
            return existing;
        }
        return await this.plugin.app.vault.create(profilePath, content);
    }
}

export function buildFirstInsightSystemPrompt(currentProfile: string | null): string {
    if (getLanguage() === 'en') {
        return `You are TideLog's first insight analyst.

Your job is to generate one evidence-bound third-person profile report from the user's imported journals. Do not write a generic AI summary. The useful moment is a concrete pattern the user recognizes from their own past records, with evidence and one next action.

Rules:
- Original notes are read-only; never suggest editing them.
- Stay evidence-bound and make uncertainty visible.
- Treat this as a recent-window profile. Do not infer stable personality or long-term trends beyond the supplied date range.
- Use source dates and file links in every important insight.
- Do not mention token usage, cost estimates, or internal implementation details.
- Reply in English.

${currentProfile ? `<current_profile>\n${currentProfile}\n</current_profile>` : ''}`;
    }

    return `你是 TideLog 的首次洞察分析师。

你的任务是根据用户导入的旧日记，生成一份有证据约束的第三视角画像报告。不要写普通 AI 总结。真正有价值的时刻，是让用户从自己的记录里看到一条具体、准确、带证据、能指导行动的模式。

规则：
- 原始笔记只读，永远不要建议改写原笔记。
- 必须受证据约束，不确定就写出不确定。
- 这是基于近期时间窗的画像。不要把这段时间里的表现夸大成稳定人格或长期趋势。
- 关键洞察必须带日期和文件链接。
- 不要提 token、费用估算或内部实现细节。
- 使用中文回复。

${currentProfile ? `<current_profile>\n${currentProfile}\n</current_profile>` : ''}`;
}

/** 摘录压缩的下限：再短就失去证据价值，此时应改为减少篇数。 */
const MIN_BODY_EXCERPT_LIMIT = 120;

/**
 * 按位置均匀抽样，保留首尾。
 *
 * 画像要看的是跨时间的模式，因此超预算时不能简单地"只留最近 N 篇"——
 * 那会让报告失去时间跨度，得出的结论也就不再是"长期模式"。
 */
export function sampleEvenly<T>(items: T[], keep: number): T[] {
    if (keep >= items.length) return items.slice();
    if (keep <= 1) return items.length > 0 ? [items[0]] : [];
    const step = (items.length - 1) / (keep - 1);
    const out: T[] = [];
    for (let i = 0; i < keep; i += 1) out.push(items[Math.round(i * step)]);
    return out;
}

export function buildFirstInsightPrompt(input: {
    currentProfile: string | null;
    entries: NormalizedLegacyJournal[];
    importId: string;
    dateRange: { start: string; end: string };
    /** 系统提示词等已占用的 token，从预算里先扣掉。 */
    reservedTokens?: number;
}): string {
    // 服务端对输入有 32K token 硬上限，超出直接 413。此前客户端不做总预算，
    // 只按篇数压缩单篇摘录长度，因此大 vault 反而更容易在用户最期待的动作上失败：
    // 100 篇 × 420 字中文正文就已约 42,000 token。
    const currentProfile = boundFirstInsightCurrentProfile(input.currentProfile);
    const boundedInput = { ...input, currentProfile };
    const budget = Math.min(CLIENT_INPUT_TOKEN_BUDGET, FIRST_INSIGHT_INPUT_TOKEN_BUDGET)
        - (input.reservedTokens ?? 0);
    if (budget <= 0) {
        throw new Error('首次画像的固定上下文已超过输入上限，未发送 AI 请求。');
    }

    let entries = input.entries;
    let bodyExcerptLimit = getFirstInsightBodyExcerptLimit(entries.length);
    const render = () => entries
        .map(entry => formatJournalForPrompt(entry, bodyExcerptLimit))
        .join('\n\n');

    let journalContext = render();

    // 预算必须对**整个提示词**生效，而不只是日记正文：固定模板（报告结构、
    // 质量要求、示例段落）本身也占用可观的 token，只测正文会低估总量。
    const overBudget = () => estimateTokens(buildBody(boundedInput, journalContext, entries)) > budget;

    // 先压缩每篇摘录，尽量保住篇数（篇数决定模式的可信度）。
    while (overBudget() && bodyExcerptLimit > MIN_BODY_EXCERPT_LIMIT) {
        bodyExcerptLimit = Math.max(MIN_BODY_EXCERPT_LIMIT, Math.floor(bodyExcerptLimit / 2));
        journalContext = render();
    }

    // 仍然超预算时才减少篇数，且均匀抽样以保留时间跨度。
    while (overBudget() && entries.length > FIRST_INSIGHT_MIN_VALID_ENTRIES) {
        const keep = Math.max(FIRST_INSIGHT_MIN_VALID_ENTRIES, Math.floor(entries.length / 2));
        if (keep === entries.length) break;
        entries = sampleEvenly(entries, keep);
        journalContext = render();
    }

    const prompt = buildBody(boundedInput, journalContext, entries);
    if (estimateTokens(prompt) > budget) {
        // 理论上只有固定模板或单条不可再分的元数据异常巨大时才会到这里；明确失败
        // 比把超过 32K 的请求交给服务端并得到 413 更可诊断，也不会消耗额度。
        throw new Error('首次画像输入无法在安全预算内构建，未发送 AI 请求。');
    }
    return prompt;
}

/** 组装最终提示词。抽出来是为了让预算判定能对完整文本生效。 */
function buildBody(
    input: { currentProfile: string | null; importId: string; dateRange: { start: string; end: string } },
    journalContext: string,
    entries: { length: number },
): string {

    if (getLanguage() === 'en') {
        return `<task>Generate the first TideLog profile insight report</task>

<import>
Import id: ${input.importId}
Date range: ${input.dateRange.start} to ${input.dateRange.end}
Valid journals: ${entries.length}
</import>

<current_profile>
${input.currentProfile || 'No existing profile.'}
</current_profile>

<normalized_journals>
${journalContext}
</normalized_journals>

<required_report_structure>
Write a visible report titled "# First Insight Profile Report". It must contain these five explicit modules:
1. ## Three recurring themes in past records
2. ## One repeated behavior pattern
3. ## One possible blind spot
4. ## One small experiment for next week
5. ## Evidence references
</required_report_structure>

<quality_bar>
- The report must feel like third-person feedback, not a summary.
- In "Three recurring themes", name exactly 3 high-frequency themes. Each theme must include 2-3 evidence references with date, source path, and a short excerpt or evidence note.
- In "One repeated behavior pattern", first state the exact pattern, then list the specific source dates/paths that show the repetition before interpreting the trigger conditions.
- In "One possible blind spot", cite the source dates/paths that support the judgment and label evidence strength as strong / medium / weak.
- In "One small experiment", recommend only one core experiment for the next 7 days, with at most 1-3 concrete actions, and explicitly connect the experiment to the cited evidence.
- In "Evidence references", map every key claim back to 2-3 original records using date, source path, and short evidence. Do not leave evidence only in the final section; each analytic section also needs citations.
- Prefer fewer, deeper claims over many shallow claims. Make the user feel "this found something I usually miss about myself."
- Use TideLog document callouts in the visible report and profile: > [!tl-report], > [!tl-profile], > [!tl-evidence], > [!tl-pattern], > [!tl-caution], > [!tl-experiment]. Use at most 1-2 emoji in section headings, never as bullet decoration.
</quality_bar>

<required_section_template>
Use this exact evidence-first pattern inside the visible report:

## Three recurring themes in past records
### 1. <specific theme, not a vague category>
- What this reveals: <one concrete third-person observation>
- Evidence:
  - <date> [[<source_path>]]: <short excerpt or precise paraphrase>
  - <date> [[<source_path>]]: <short excerpt or precise paraphrase>
- Why it matters: <what the user may not have noticed>

Repeat for themes 2 and 3.

## One repeated behavior pattern
- Pattern: <name the repeated action/emotion/decision pattern in one sentence>
- Where it repeats:
  - <date> [[<source_path>]]: <evidence>
  - <date> [[<source_path>]]: <evidence>
  - <date> [[<source_path>]]: <optional evidence>
- Third-person interpretation: <trigger condition + repeated blocker + consequence>

## One possible blind spot
- Blind spot: <one careful third-person judgment>
- Evidence strength: strong / medium / weak
- Supporting records:
  - <date> [[<source_path>]]: <evidence>
  - <date> [[<source_path>]]: <evidence>
- Why this may be invisible from the inside: <short explanation>

## One small experiment for next week
- Experiment: <one core experiment>
- Why this experiment: <connect to cited pattern/blind spot>
- Actions:
  1. <action>
  2. <action>
  3. <optional action>
- Success signal: <how the user will know it worked>

## Evidence references
- <claim> → <date/path/evidence list>
</required_section_template>

<profile_update_requirement>
After the visible report, output a complete merged user_profile.md inside <profile_update> tags.
The updated profile must preserve still-evidence-backed existing profile content, remove or downgrade unsupported/outdated/conflicting claims, and include the same five explicit Aha modules plus long-term dimensions: basic information, emotional traits, action patterns, thinking style, values, and growth boundaries.
</profile_update_requirement>

<output_format>
# First Insight Profile Report

> [!tl-quote]
> <one plain sentence capturing the single most important thing these records reveal>

...

<profile_update>
# User Profile

> [!tl-quote]
> <one plain, evidence-grounded sentence portraying who the user is right now>

...
</profile_update>
</output_format>`;
    }

    return `<task>生成 TideLog 首次洞察画像报告</task>

<import>
导入 ID：${input.importId}
日期范围：${input.dateRange.start} 至 ${input.dateRange.end}
有效日记数：${entries.length}
</import>

<current_profile>
${input.currentProfile || '暂无已有画像。'}
</current_profile>

<normalized_journals>
${journalContext}
</normalized_journals>

<required_report_structure>
请写一份可直接展示给用户的报告，标题为「# 首次洞察画像报告」。必须显式包含下面五个模块：
1. ## 过去记录里的三个高频主题
2. ## 一个反复出现的行为模式
3. ## 一个可能的盲点
4. ## 下周一个小实验
5. ## 引用证据
</required_report_structure>

<quality_bar>
- 报告必须像第三视角反馈，不要像普通 AI 总结。
- 在「过去记录里的三个高频主题」里，必须给出正好 3 个高频主题。每个主题都要附 2-3 条证据，包含日期、源文件路径和短摘录或证据说明。
- 在「一个反复出现的行为模式」里，先写清楚具体模式，再列出能观察到这个重复的具体日期/文件，最后再解释触发条件或卡点。
- 在「一个可能的盲点」里，必须列出支撑判断的具体日期/文件，并标注证据强度：强 / 中等 / 弱。
- 在「下周一个小实验」里，只推荐未来 7 天的 1 个核心实验，最多 1-3 条具体行动，并说明它如何回应前面的证据。
- 在「引用证据」里，把每个关键判断映射回 2-3 条原始记录，包含日期、源文件链接、短摘录或简短证据说明。不要只在最后列证据；每个分析模块内部也要有引用。
- 宁愿少写几个判断，也要把每个判断写深。目标是让用户产生“它发现了我平时没注意到的自己”的感觉。
- 可见报告和画像使用 TideLog 文档 callout：> [!tl-report]、> [!tl-profile]、> [!tl-evidence]、> [!tl-pattern]、> [!tl-caution]、> [!tl-experiment]。emoji 最多只放 1-2 个在分区标题里，不要把 emoji 当项目符号装饰。
</quality_bar>

<required_section_template>
可见报告里的每个模块必须按下面这种「观点 → 证据 → 解释」结构写：

## 过去记录里的三个高频主题
### 1. <具体主题，不要写成宽泛分类>
- 这说明什么：<一句具体的第三视角观察>
- 证据：
  - <日期> [[<源文件路径>]]：<短摘录或准确转述>
  - <日期> [[<源文件路径>]]：<短摘录或准确转述>
- 为什么重要：<用户自己可能没注意到的地方>

主题 2 和主题 3 也按同样格式写。

## 一个反复出现的行为模式
- 模式：<用一句话写清楚这个重复行动/情绪/决策模式>
- 它重复出现在哪些记录里：
  - <日期> [[<源文件路径>]]：<证据>
  - <日期> [[<源文件路径>]]：<证据>
  - <日期> [[<源文件路径>]]：<可选证据>
- 第三视角解释：<触发条件 + 重复卡点 + 造成的结果>

## 一个可能的盲点
- 盲点：<一个谨慎但具体的第三视角判断>
- 证据强度：强 / 中等 / 弱
- 支撑记录：
  - <日期> [[<源文件路径>]]：<证据>
  - <日期> [[<源文件路径>]]：<证据>
- 为什么身在其中时不容易看见：<简短解释>

## 下周一个小实验
- 实验：<一个核心实验>
- 为什么是这个实验：<说明它回应了上面的哪条模式/盲点证据>
- 行动：
  1. <行动>
  2. <行动>
  3. <可选行动>
- 成功信号：<用户如何判断这个实验有效>

## 引用证据
- <关键判断> → <日期/路径/证据列表>
</required_section_template>

<profile_update_requirement>
可见报告之后，请把完整合并后的 user_profile.md 放在 <profile_update> 标签内。
新画像必须保留原画像中仍有证据支持的内容；删除或降级没有证据支撑、过时或与新证据冲突的内容；并且显式包含同样五个 Aha Moment 模块，同时整合长期维度：基本信息、情绪特征、行动模式、思考方式、价值取向、成长边界。
</profile_update_requirement>

<output_format>
# 首次洞察画像报告

> [!tl-quote]
> <一句平实的话，概括这些记录揭示的最重要的一点>

...

<profile_update>
# 用户画像

> [!tl-quote]
> <一句平实、有证据支撑的话，描绘用户此刻是怎样的人>

...
</profile_update>
</output_format>`;
}

export function extractProfileUpdate(response: string): string {
    const match = response.match(/<profile_update>([\s\S]*?)<\/profile_update>/i);
    return match?.[1]?.trim() ?? '';
}

function withTopLevelTitle(content: string, title: string): string {
    const trimmed = content.trim();
    if (!trimmed) return '';
    if (/^#\s+.+$/m.test(trimmed)) {
        return trimmed.replace(/^#\s+.+$/m, title.trim());
    }
    return `${title.trim()}\n\n${trimmed}`;
}

export function stripProfileTags(response: string): string {
    return stripExtractionTags(response);
}

export function hasRequiredAhaModules(content: string): boolean {
    const headings = getLanguage() === 'en' ? AHA_MODULE_HEADINGS_EN : AHA_MODULE_HEADINGS_ZH;
    return headings.every(heading => content.includes(heading));
}

export function ensureProfileAhaStructure(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;

    const isChineseProfile = trimmed.includes('# 用户画像')
        || AHA_MODULE_HEADINGS_ZH.some(heading => trimmed.includes(heading));
    const headings = isChineseProfile ? AHA_MODULE_HEADINGS_ZH : AHA_MODULE_HEADINGS_EN;
    const missing = headings.filter(heading => !trimmed.includes(heading));
    if (missing.length === 0) return trimmed;

    const additions = missing.map(heading => `## ${heading}\n\n- ${isChineseProfile ? '待后续记录补充证据。' : 'Evidence pending from future records.'}`).join('\n\n');
    return `${trimmed}\n\n${additions}`.trim();
}

export function getFirstInsightBodyExcerptLimit(entryCount: number): number {
    if (entryCount >= 25) return 600;
    if (entryCount >= 15) return 700;
    if (entryCount >= 8) return 900;
    return 1200;
}

/**
 * `summary` 是正文的前 3 句（`summarizeLegacyJournal`，上限 240 字），
 * 而 `body_excerpt` 是正文的前 N 字。N ≥ 240 时前者被后者完整包含——
 * 同一段话在提示词里出现两次，白吃掉的预算本可以用来多读正文。
 */
const SUMMARY_MAX_CHARS = 240;

function formatJournalForPrompt(entry: NormalizedLegacyJournal, bodyExcerptLimit: number): string {
    const summaryLine = bodyExcerptLimit >= SUMMARY_MAX_CHARS ? '' : `summary: ${entry.summary}\n`;
    return `--- ${entry.date} · ${entry.sourcePath} ---
date: ${entry.date}
source_path: [[${entry.sourcePath}]]
normalized_path: [[${entry.normalizedPath}]]
source_mtime: ${entry.sourceMtime ? moment(entry.sourceMtime).format('YYYY-MM-DD HH:mm:ss') : 'unknown'}
date_source: ${entry.dateSource}
${summaryLine}candidate_topics: ${entry.candidateTopics.join(', ') || 'none'}
task_signals:
${formatPromptList(entry.signals.tasks)}
emotion_signals:
${formatPromptList(entry.signals.emotions)}
reflection_signals:
${formatPromptList(entry.signals.reflections)}

body_excerpt:
${entry.analyzableBody.slice(0, bodyExcerptLimit)}`;
}

function formatPromptList(items: string[]): string {
    return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- none';
}
