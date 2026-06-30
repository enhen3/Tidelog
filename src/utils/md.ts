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
