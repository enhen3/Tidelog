/**
 * Small markdown heading helpers.
 *
 * TideLog decorates generated section headings with a leading emoji (e.g.
 * "## ☀️ 计划"). These helpers let the parsers/writers keep matching sections
 * by their plain name, so the decoration never breaks task/section logic.
 */

/**
 * Return a heading's plain name: strip leading #'s and any leading emoji /
 * symbol / whitespace decoration. "## ☀️ 计划" → "计划".
 */
export function headingName(line: string): string {
    return line
        .replace(/^\s*#{1,6}\s*/, '')
        .replace(/^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u, '')
        .trim();
}

/**
 * True when `line` is a level-2 (`## `) heading whose plain name equals or
 * contains any of `names`. Emoji/decoration on the heading is ignored.
 */
export function isSectionHeading(line: string, ...names: string[]): boolean {
    const trimmed = line.trim();
    if (!trimmed.startsWith('## ')) return false;
    const name = headingName(trimmed);
    return names.some((n) => n.length > 0 && (name === n || name.includes(n)));
}

/**
 * Remove machine-readable extraction blocks before showing generated markdown.
 * During streaming, a block may have opened but not closed yet; hide the
 * unfinished tail so preview content cannot later appear to "disappear".
 */
export function stripExtractionTags(content: string): string {
    return content
        .replace(/<(extraction|profile_update|new_patterns|new_principles)>[\s\S]*?(?:<\/\1>|$)/gi, '')
        .trim();
}

/**
 * Extract short, human-readable items from a generated insight report.
 *
 * Current TideLog reports use typed callouts, while older reports use plain
 * Markdown headings. Prefer the concise callout titles, then fall back to
 * readable body lines so a format migration can never leave an empty summary
 * shell in the UI.
 */
export function extractInsightSummaryItems(content: string, maxItems = 3): string[] {
    const limit = Math.max(1, Math.min(5, maxItems));
    const clean = stripExtractionTags(content)
        .replace(/^---\s*\n[\s\S]*?\n---\s*/m, '')
        .trim();
    if (!clean) return [];

    const items: string[] = [];
    const add = (value: string): void => {
        const normalized = normalizeInsightSummaryLine(value);
        if (!normalized || items.includes(normalized)) return;
        items.push(normalized);
    };

    const calloutTitles = new Map<string, string>();
    for (const match of clean.matchAll(/^>\s*\[!(tl-(?:report|profile|pattern|experiment|caution))\][+-]?\s*(.*?)\s*$/gim)) {
        const type = match[1].toLowerCase();
        if (!calloutTitles.has(type) && match[2].trim()) {
            calloutTitles.set(type, match[2]);
        }
    }
    for (const type of ['tl-report', 'tl-profile', 'tl-pattern', 'tl-experiment', 'tl-caution']) {
        const title = calloutTitles.get(type);
        if (title) add(title);
        if (items.length >= limit) return items.slice(0, limit);
    }

    let insideMetaCallout = false;
    for (const line of clean.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (/^>\s*\[!tl-meta\]/i.test(trimmed)) {
            insideMetaCallout = true;
            continue;
        }
        if (insideMetaCallout && trimmed.startsWith('>')) continue;
        if (insideMetaCallout) insideMetaCallout = false;

        add(trimmed);
        if (items.length >= limit) break;
    }

    return items.slice(0, limit);
}

function normalizeInsightSummaryLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed
        || /^#{1,6}\s+/.test(trimmed)
        || /^>\s*\[![^\]]+\]/.test(trimmed)
        || /^(?:```|~~~|<!--|---$)/.test(trimmed)
        || /^\|?\s*:?-{3,}/.test(trimmed)) {
        return '';
    }

    const text = trimmed
        .replace(/^>\s?/, '')
        .replace(/^[-*+]\s+(?:\[[ xX]\]\s*)?/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim();
    if (!text) return '';
    return text.length > 120 ? `${text.slice(0, 119).trimEnd()}…` : text;
}
