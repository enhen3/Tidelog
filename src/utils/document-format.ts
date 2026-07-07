import { getLanguage } from '../i18n';

interface Section {
    title: string;
    body: string;
}

interface SectionSpec {
    type: string;
    title: string;
    candidates: string[];
}

type LibraryKind = 'principles' | 'patterns';
type PlanSuggestionScope = 'day' | 'week' | 'month';

const PROFILE_AHA_ZH: SectionSpec[] = [
    { type: 'tl-profile', title: '过去记录里的三个高频主题', candidates: ['过去记录里的三个高频主题'] },
    { type: 'tl-pattern', title: '一个反复出现的行为模式', candidates: ['一个反复出现的行为模式'] },
    { type: 'tl-caution', title: '一个可能的盲点', candidates: ['一个可能的盲点'] },
    { type: 'tl-experiment', title: '下周一个小实验', candidates: ['下周一个小实验'] },
    { type: 'tl-evidence', title: '引用证据', candidates: ['引用证据'] },
];

const PROFILE_LONG_TERM_ZH: SectionSpec[] = [
    { type: 'tl-report', title: '基本信息', candidates: ['基本信息'] },
    { type: 'tl-profile', title: '情绪特征', candidates: ['情绪特征'] },
    { type: 'tl-pattern', title: '行动模式', candidates: ['行动模式'] },
    { type: 'tl-report', title: '思考方式', candidates: ['思考方式'] },
    { type: 'tl-profile', title: '价值取向', candidates: ['价值取向'] },
    { type: 'tl-caution', title: '成长边界', candidates: ['成长边界'] },
];

const PROFILE_AHA_EN: SectionSpec[] = [
    { type: 'tl-profile', title: 'Three recurring themes in past records', candidates: ['Three recurring themes in past records'] },
    { type: 'tl-pattern', title: 'One repeated behavior pattern', candidates: ['One repeated behavior pattern'] },
    { type: 'tl-caution', title: 'One possible blind spot', candidates: ['One possible blind spot'] },
    { type: 'tl-experiment', title: 'One small experiment for next week', candidates: ['One small experiment for next week'] },
    { type: 'tl-evidence', title: 'Evidence references', candidates: ['Evidence references'] },
];

const PROFILE_LONG_TERM_EN: SectionSpec[] = [
    { type: 'tl-report', title: 'Basic information', candidates: ['Basic information'] },
    { type: 'tl-profile', title: 'Emotional traits', candidates: ['Emotional traits'] },
    { type: 'tl-pattern', title: 'Action patterns', candidates: ['Action patterns'] },
    { type: 'tl-report', title: 'Thinking style', candidates: ['Thinking style'] },
    { type: 'tl-profile', title: 'Values', candidates: ['Values'] },
    { type: 'tl-caution', title: 'Growth boundaries', candidates: ['Growth boundaries'] },
];

export function formatProfileDocument(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    if (isOptimizedTideLogDocument(trimmed)) return decorateFirstHeading(cleanOptimizedCalloutTitles(trimmed), '🧭');

    const title = decorateTitleLine(firstHeading(trimmed) || (getLanguage() === 'en' ? '# User Profile' : '# 用户画像'), '🧭');
    const quote = extractFirstCallout(trimmed, 'tl-quote');
    const sections = splitSections(trimmed);
    const isEnglish = getLanguage() === 'en';
    const aha = isEnglish ? PROFILE_AHA_EN : PROFILE_AHA_ZH;
    const longTerm = isEnglish ? PROFILE_LONG_TERM_EN : PROFILE_LONG_TERM_ZH;

    const output = [
        title,
        '',
        quote || callout('tl-profile', isEnglish ? 'Current portrait' : '此刻画像', ''),
        '',
        isEnglish ? '## 🧭 Aha Moment' : '## 🧭 Aha Moment',
        '',
        ...formatSectionGroup(sections, aha),
        '',
        isEnglish ? '## 🌊 Long-term Profile' : '## 🌊 长期画像维度',
        '',
        ...formatSectionGroup(sections, longTerm),
    ].filter((part, index, parts) => !(part === '' && parts[index - 1] === ''));

    return `${output.join('\n').trim()}\n`;
}

export function formatFirstInsightReportDocument(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    if (isOptimizedTideLogDocument(trimmed)) return decorateFirstHeading(cleanOptimizedCalloutTitles(trimmed), '🧭');

    const title = decorateTitleLine(firstHeading(trimmed) || (getLanguage() === 'en' ? '# First Insight Profile Report' : '# 首次洞察画像报告'), '🧭');
    const quote = extractFirstCallout(trimmed, 'tl-quote');
    const sections = splitSections(trimmed);
    const specs = getLanguage() === 'en' ? PROFILE_AHA_EN : PROFILE_AHA_ZH;

    const output = [
        title,
        '',
        quote || callout('tl-report', getLanguage() === 'en' ? 'Main report insight' : '报告主判断', ''),
        '',
        getLanguage() === 'en' ? '## 🧭 Core Insight' : '## 🧭 核心洞察',
        '',
        ...formatSectionGroup(sections, specs),
    ].filter((part, index, parts) => !(part === '' && parts[index - 1] === ''));

    return `${output.join('\n').trim()}\n`;
}

export function formatGeneratedInsightDocument(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    if (isOptimizedTideLogDocument(trimmed)) return decorateFirstHeading(cleanOptimizedCalloutTitles(trimmed), '🧭');

    const quote = extractFirstCallout(trimmed, 'tl-quote');
    const sections = splitSections(trimmed, /^#{2,3}\s+/);
    const blocks: string[] = [];

    for (const section of sections) {
        const spec = generatedInsightSpecFor(section.title);
        if (!spec) continue;
        blocks.push(callout(spec.type, cleanCalloutTitle(section.title), section.body), '');
    }

    if (blocks.length === 0) return trimmed;

    const output = [
        quote,
        quote ? '' : '',
        getLanguage() === 'en' ? '## 🧭 Insight Structure' : '## 🧭 洞察结构',
        '',
        ...blocks,
    ].filter((part, index, parts) => part !== '' || parts[index - 1] !== '');

    return `${output.join('\n').trim()}\n`;
}

export function formatDailyNoteDocument(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;

    const parts = splitFrontmatterBlock(trimmed);
    const lines = parts.body.split(/\r?\n/);
    const isEnglish = getLanguage() === 'en';

    let titleIndex = lines.findIndex(line => /^#\s+/.test(line.trim()));
    if (titleIndex < 0) {
        lines.unshift(isEnglish ? '# Daily Note' : '# 日记录');
        titleIndex = 0;
    }
    lines[titleIndex] = decorateTitleLine(lines[titleIndex], '🌊');

    insertCalloutAfterLine(
        lines,
        titleIndex,
        'tl-day',
        isEnglish ? 'Daily loop' : '今日闭环',
        isEnglish
            ? 'Plan the day, review what happened, and keep the record useful for later insight.'
            : '这里沉淀今天的计划、复盘和后续洞察依据。',
        { stopAtHeadingLevel: 2 },
    );

    insertSectionIntro(
        lines,
        ['计划', 'Plan'],
        'tl-plan',
        isEnglish ? 'Plan' : '今日计划',
        isEnglish ? 'Keep tasks concrete and small enough to move today.' : '把今天真正要推进的事写清楚，任务保持可执行。',
    );
    insertSectionIntro(
        lines,
        ['复盘', 'Review'],
        'tl-review',
        isEnglish ? 'Review' : '今日复盘',
        isEnglish ? 'Capture facts, emotions, patterns, and one useful next adjustment.' : '记录事实、情绪、模式和一个可执行的调整。',
    );

    return joinFrontmatter(parts.frontmatter, `${lines.join('\n').trim()}\n`);
}

export function formatDailyReviewEntry(title: string, body: string): string {
    return `${callout('tl-review', cleanCalloutTitle(title), body)}\n`;
}

export function formatWeeklyPlanDocument(content: string): string {
    return formatPlanningDocument(content, 'week');
}

export function formatMonthlyPlanDocument(content: string): string {
    return formatPlanningDocument(content, 'month');
}

export function formatPrinciplesDocument(content: string): string {
    return formatLibraryDocument(content, 'principles');
}

export function formatPatternsDocument(content: string): string {
    return formatLibraryDocument(content, 'patterns');
}

export function formatQuickCaptureDocument(items: string[]): string {
    const isEnglish = getLanguage() === 'en';
    const title = isEnglish ? '# 💡 Quick Capture' : '# 💡 灵感收集';
    const intro = callout(
        'tl-capture',
        isEnglish ? 'Idea inbox' : '灵感入口',
        isEnglish
            ? 'Drop loose ideas here first. Promote the useful ones into a day, week, or month plan.'
            : '先把零散想法放在这里，之后再推进到日、周或月计划。',
    );
    const body = items.map(item => `- ${item}`).join('\n');
    return `${[title, '', intro, '', body].filter(Boolean).join('\n').trim()}\n`;
}

export function formatPlanSuggestionsDocument(input: {
    scope: PlanSuggestionScope;
    target: string;
    updated: string;
    source: string;
    lines: string[];
}): string {
    const isEnglish = getLanguage() === 'en';
    const scopeLabel = input.scope === 'day'
        ? (isEnglish ? 'Daily plan suggestions' : '日计划建议')
        : input.scope === 'week'
            ? (isEnglish ? 'Weekly plan suggestions' : '周计划建议')
            : (isEnglish ? 'Monthly plan suggestions' : '月计划建议');
    const title = `# 💡 ${input.target} ${scopeLabel}`;
    const body = input.lines.map(line => `- ${line}`).join('\n');

    return [
        '---',
        `scope: ${input.scope}`,
        `target: ${input.target}`,
        `updated: ${input.updated}`,
        `source: ${input.source}`,
        '---',
        '',
        title,
        '',
        callout('tl-experiment', isEnglish ? 'Suggested next moves' : '可执行建议', body),
        '',
    ].join('\n');
}

export function formatTideLogCallout(type: string, title: string, body: string): string {
    return callout(type, title, body);
}

export function formatTideLogTitle(title: string, emoji = '🧭'): string {
    return decorateTitleLine(title, emoji);
}

function isOptimizedTideLogDocument(content: string): boolean {
    return /> \[!tl-(?:profile|report|pattern|evidence|experiment|caution|plan|review|day|capture)\]/.test(content);
}

function firstHeading(content: string): string | null {
    return content.split(/\r?\n/).find(line => /^#\s+/.test(line.trim()))?.trim() ?? null;
}

function decorateFirstHeading(content: string, emoji: string): string {
    const lines = content.split(/\r?\n/);
    const idx = lines.findIndex(line => /^#\s+/.test(line.trim()));
    if (idx < 0) return content.endsWith('\n') ? content : `${content}\n`;
    lines[idx] = decorateTitleLine(lines[idx], emoji);
    return `${lines.join('\n').trim()}\n`;
}

function decorateTitleLine(line: string, emoji: string): string {
    const match = line.match(/^(#\s+)(.+)$/);
    if (!match) return line;
    const title = match[2].trim();
    if (/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u.test(title)) return `${match[1]}${title}`;
    return `${match[1]}${emoji} ${title}`;
}

function splitSections(content: string, headingPattern = /^##\s+/): Section[] {
    const sections: Section[] = [];
    let current: Section | null = null;

    for (const rawLine of content.split(/\r?\n/)) {
        if (headingPattern.test(rawLine)) {
            if (current) sections.push(current);
            current = {
                title: rawLine.replace(/^#{2,3}\s+/, '').trim(),
                body: '',
            };
            continue;
        }

        if (current) {
            current.body += `${rawLine}\n`;
        }
    }

    if (current) sections.push(current);
    return sections.map(section => ({ ...section, body: section.body.trim() }));
}

function generatedInsightSpecFor(title: string): SectionSpec | null {
    const specs: SectionSpec[] = [
        {
            type: 'tl-report',
            title,
            candidates: [
                'This Week In One Sentence',
                'Month Theme',
                'Dashboard Summary',
                '最重要的洞察',
                '本周深度洞察',
                '本周洞察报告',
                '本周概览',
                '一句话总结',
                '本周一句话',
                '月度主题',
                '仪表盘摘要',
            ],
        },
        {
            type: 'tl-evidence',
            title,
            candidates: [
                'What Actually Happened',
                'The Month As A Story Of Evidence',
                '这一周实际发生了什么',
                '这个月的事实故事',
                '事实证据',
                '效率更高',
                '执行力分析',
                '关键成就',
                '本周闭环',
                '高效窗口',
            ],
        },
        {
            type: 'tl-pattern',
            title,
            candidates: [
                'Patterns Worth Noticing',
                'Cross-Week Pattern Analysis',
                '模式判断',
                '值得注意的模式',
                '跨周模式分析',
                '行为节律地图',
                '行为模式识别',
                '成功模式',
                '模式发现',
                '一眼看见的本周模式',
                'AI 观察',
            ],
        },
        {
            type: 'tl-caution',
            title,
            candidates: [
                'Friction And Missed Loops',
                'Growth And Cost',
                '阻力与未闭环',
                '成长与代价',
                '容易拖延',
                '注意信号',
                '拖延窗口',
                '挑战与阻碍',
            ],
        },
        {
            type: 'tl-experiment',
            title,
            candidates: [
                'Next Week Plan Advice',
                'Next Month Operating System',
                '下一步',
                '下周计划建议',
                '下月行动系统',
                '怎么改计划',
                '下周建议',
                'TideLog 给出的调整',
            ],
        },
        {
            type: 'tl-profile',
            title,
            candidates: [
                'Profile Update Analysis',
                'Profile Update Notes',
                '画像更新分析',
                '用户画像更新提示',
                '用户画像',
                '情绪分析',
                '情绪曲线',
                '画像更新建议',
            ],
        },
    ];

    return specs.find(spec => spec.candidates.some(candidate => title.includes(candidate))) ?? null;
}

function formatSectionGroup(sections: Section[], specs: SectionSpec[]): string[] {
    const blocks: string[] = [];
    for (const spec of specs) {
        const body = findSectionBody(sections, spec.candidates);
        if (!body) continue;
        blocks.push(callout(spec.type, spec.title, body), '');
    }
    return blocks;
}

function findSectionBody(sections: Section[], candidates: string[]): string {
    const section = sections.find(item => candidates.some(candidate => item.title.includes(candidate)));
    return section?.body.trim() ?? '';
}

function extractFirstCallout(content: string, type: string): string {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex(line => line.trim().startsWith(`> [!${type}]`));
    if (start < 0) return '';

    const block: string[] = [];
    for (let i = start; i < lines.length; i++) {
        if (!lines[i].startsWith('>')) break;
        block.push(lines[i]);
    }
    return block.join('\n').trim();
}

function cleanCalloutTitle(title: string): string {
    return title
        .replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '')
        .trim();
}

function cleanOptimizedCalloutTitles(content: string): string {
    return content.replace(
        /^(> \[!tl-[^\]]+\]\s+)[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/gmu,
        '$1',
    );
}

function callout(type: string, title: string, body: string): string {
    const lines = [`> [!${type}] ${title}`];
    const trimmed = body.trim();
    if (!trimmed) return lines.join('\n');

    for (const line of trimmed.split(/\r?\n/)) {
        lines.push(line ? `> ${line}` : '>');
    }
    return lines.join('\n');
}

function formatPlanningDocument(content: string, kind: 'week' | 'month'): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    const parts = splitFrontmatterBlock(trimmed);
    const lines = parts.body.split(/\r?\n/);
    const isEnglish = getLanguage() === 'en';
    const titleIndex = lines.findIndex(line => /^#\s+/.test(line.trim()));
    if (titleIndex >= 0) {
        lines[titleIndex] = decorateTitleLine(lines[titleIndex], '🧭');
    }

    const specs = kind === 'week'
        ? [
            {
                candidates: ['本周目标', 'Weekly goals'],
                type: 'tl-plan',
                title: isEnglish ? 'Weekly goals' : '本周主线',
                body: isEnglish ? 'Choose the few tasks that make this week count.' : '只保留真正决定本周质量的目标和关键任务。',
            },
            {
                candidates: ['回顾', 'Review'],
                type: 'tl-review',
                title: isEnglish ? 'Weekend review' : '周末回顾',
                body: isEnglish ? 'Close the loop with evidence, learning, and one next adjustment.' : '用事实、收获和下周调整完成闭环。',
            },
            {
                candidates: ['完成情况', 'completion status'],
                type: 'tl-evidence',
                title: isEnglish ? 'Completion evidence' : '完成证据',
                body: '',
            },
            {
                candidates: ['收获与感悟', 'learnings and insights'],
                type: 'tl-pattern',
                title: isEnglish ? 'Learning pattern' : '收获与模式',
                body: '',
            },
            {
                candidates: ['下周调整', 'next week adjustments'],
                type: 'tl-experiment',
                title: isEnglish ? 'Next week adjustment' : '下周调整',
                body: '',
            },
        ]
        : [
            {
                candidates: ['本月主题', 'Monthly theme'],
                type: 'tl-plan',
                title: isEnglish ? 'Monthly theme' : '本月主线',
                body: isEnglish ? 'Name the direction before filling the month with tasks.' : '先写清楚本月方向，再安排目标和里程碑。',
            },
            {
                candidates: ['月度目标', 'Monthly goals'],
                type: 'tl-plan',
                title: isEnglish ? 'Monthly goals' : '月度目标',
                body: isEnglish ? 'Keep the month focused on three to five meaningful outcomes.' : '把本月收束到 3-5 个真正重要的结果。',
            },
            {
                candidates: ['关键里程碑', 'Key milestones'],
                type: 'tl-evidence',
                title: isEnglish ? 'Milestones' : '关键里程碑',
                body: isEnglish ? 'Use milestones to make progress visible week by week.' : '用里程碑让每周进展可见。',
            },
            {
                candidates: ['成长重点', 'Growth focus'],
                type: 'tl-experiment',
                title: isEnglish ? 'Growth focus' : '成长实验',
                body: isEnglish ? 'Pick one capability or operating habit to deliberately practice.' : '选择一个能力或行动习惯，在本月刻意练习。',
            },
            {
                candidates: ['月度回顾', 'Monthly review'],
                type: 'tl-review',
                title: isEnglish ? 'Monthly review' : '月度回顾',
                body: isEnglish ? 'Review outcomes, highlights, lessons, and the next month without generic summaries.' : '月底用结果、亮点、教训和下月展望完成闭环。',
            },
            {
                candidates: ['目标完成情况', 'goal completion'],
                type: 'tl-evidence',
                title: isEnglish ? 'Outcome evidence' : '目标完成证据',
                body: '',
            },
            {
                candidates: ['本月亮点', 'monthly highlights'],
                type: 'tl-report',
                title: isEnglish ? 'Highlights' : '本月亮点',
                body: '',
            },
            {
                candidates: ['经验教训', 'lessons learned'],
                type: 'tl-pattern',
                title: isEnglish ? 'Lessons learned' : '经验模式',
                body: '',
            },
            {
                candidates: ['下月展望', 'next month outlook'],
                type: 'tl-experiment',
                title: isEnglish ? 'Next month adjustment' : '下月调整',
                body: '',
            },
        ];

    for (const spec of specs) {
        insertSectionIntro(lines, spec.candidates, spec.type, spec.title, spec.body);
    }

    return joinFrontmatter(parts.frontmatter, `${lines.join('\n').trim()}\n`);
}

function formatLibraryDocument(content: string, kind: LibraryKind): string {
    const trimmed = content.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes('> [!tl-')) {
        const emoji = kind === 'principles' ? '🧩' : '🔁';
        return decorateFirstHeading(cleanOptimizedCalloutTitles(trimmed), emoji);
    }

    const parts = splitFrontmatterBlock(trimmed);
    const title = decorateTitleLine(firstHeading(parts.body) || (kind === 'principles'
        ? (getLanguage() === 'en' ? '# Principles' : '# 原则库')
        : (getLanguage() === 'en' ? '# Patterns' : '# 模式库')), kind === 'principles' ? '🧩' : '🔁');
    const sections = splitSections(parts.body);
    const intro = extractIntroBeforeFirstSection(parts.body);
    const blocks: string[] = [title, ''];
    if (intro) {
        blocks.push(callout(
            kind === 'principles' ? 'tl-experiment' : 'tl-pattern',
            getLanguage() === 'en' ? 'How to use' : '使用方式',
            stripMarkdownQuote(intro),
        ), '');
    }

    for (const section of sections) {
        const cleanedBody = section.body.replace(/<!--[\s\S]*?-->/g, '').trim();
        blocks.push(`## ${cleanCalloutTitle(section.title)}`);
        blocks.push('');
        blocks.push(callout(libraryCalloutType(kind, section.title), cleanCalloutTitle(section.title), cleanedBody));
        blocks.push('');
    }

    return joinFrontmatter(parts.frontmatter, `${blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`);
}

function libraryCalloutType(kind: LibraryKind, title: string): string {
    const t = title.toLowerCase();
    if (kind === 'patterns') {
        if (includesAny(t, ['情绪', 'emotional'])) return 'tl-profile';
        if (includesAny(t, ['触发', 'trigger'])) return 'tl-caution';
        if (includesAny(t, ['成功', 'success'])) return 'tl-evidence';
        return 'tl-pattern';
    }
    if (includesAny(t, ['情绪', 'emotion', '健康', 'health'])) return 'tl-profile';
    if (includesAny(t, ['效率', 'efficiency'])) return 'tl-pattern';
    if (includesAny(t, ['人际', 'relationship'])) return 'tl-evidence';
    if (includesAny(t, ['通用', 'general', '决策', 'decision'])) return 'tl-experiment';
    return 'tl-report';
}

function splitFrontmatterBlock(content: string): { frontmatter: string; body: string } {
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') return { frontmatter: '', body: content.trim() };
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (end < 0) return { frontmatter: '', body: content.trim() };
    return {
        frontmatter: lines.slice(0, end + 1).join('\n'),
        body: lines.slice(end + 1).join('\n').trim(),
    };
}

function joinFrontmatter(frontmatter: string, body: string): string {
    return frontmatter ? `${frontmatter}\n\n${body.trim()}\n` : `${body.trim()}\n`;
}

function insertSectionIntro(lines: string[], candidates: string[], type: string, title: string, body: string): void {
    const headingIndex = lines.findIndex(line => isHeadingFor(line, candidates));
    if (headingIndex < 0) return;
    insertCalloutAfterLine(lines, headingIndex, type, title, body, { stopAtHeadingLevel: headingLevel(lines[headingIndex]) });
}

function insertCalloutAfterLine(
    lines: string[],
    anchorIndex: number,
    type: string,
    title: string,
    body: string,
    options: { stopAtHeadingLevel: number },
): void {
    let end = findSectionEnd(lines, anchorIndex + 1, options.stopAtHeadingLevel);
    const section = lines.slice(anchorIndex + 1, end).join('\n');
    if (section.includes(`> [!${type}]`)) return;

    let insertIndex = anchorIndex + 1;
    while (insertIndex < end && lines[insertIndex].trim() === '') insertIndex++;
    while (insertIndex < end && lines[insertIndex] !== undefined && /^<!--[\s\S]*-->$/.test(lines[insertIndex].trim())) {
        lines.splice(insertIndex, 1);
        end--;
    }
    lines.splice(insertIndex, 0, '', callout(type, title, body), '');
}

function findSectionEnd(lines: string[], startIndex: number, level: number): number {
    for (let i = startIndex; i < lines.length; i++) {
        const currentLevel = headingLevel(lines[i]);
        if (currentLevel > 0 && currentLevel <= level) return i;
    }
    return lines.length;
}

function isHeadingFor(line: string, candidates: string[]): boolean {
    if (!/^#{1,6}\s+/.test(line.trim())) return false;
    const title = cleanCalloutTitle(line.replace(/^#{1,6}\s+/, '').trim()).toLowerCase();
    return candidates.some(candidate => title.includes(candidate.toLowerCase()));
}

function headingLevel(line: string): number {
    const match = line.match(/^(#{1,6})\s+/);
    return match ? match[1].length : 0;
}

function extractIntroBeforeFirstSection(content: string): string {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex(line => /^#\s+/.test(line.trim()));
    const firstSection = lines.findIndex(line => /^##\s+/.test(line.trim()));
    const from = start >= 0 ? start + 1 : 0;
    const to = firstSection >= 0 ? firstSection : lines.length;
    return lines.slice(from, to).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function stripMarkdownQuote(content: string): string {
    return content
        .split(/\r?\n/)
        .map(line => line.replace(/^>\s?/, ''))
        .join('\n')
        .trim();
}

function includesAny(value: string, candidates: string[]): boolean {
    return candidates.some(candidate => value.includes(candidate.toLowerCase()));
}
