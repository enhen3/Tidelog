/**
 * Legacy Import Service
 *
 * Imports non-TideLog journal files without touching the original notes.
 * Source files are copied into TideLog's archive, then normalized copies are
 * generated for first-insight/profile analysis.
 */

import { TFile, TFolder, moment } from 'obsidian';
import type TideLogPlugin from '../main';
import { t, getLanguage } from '../i18n';
import {
    FIRST_INSIGHT_MIN_ANALYZABLE_CHARS,
    FIRST_INSIGHT_MIN_VALID_ENTRIES,
} from '../constants';
import { formatDailyNoteDocument, formatTideLogCallout } from '../utils/document-format';

export type LegacyDateSource = 'frontmatter' | 'filename' | 'body' | 'mtime';
export type LegacyExclusionReason = 'outside_range' | 'missing_date' | 'too_short' | 'read_error';

export interface LegacyImportDateRange {
    start: string;
    end: string;
}

export interface LegacyJournalSignals {
    tasks: string[];
    emotions: string[];
    reflections: string[];
}

export interface LegacyJournalCandidate {
    file: TFile;
    date: string;
    dateSource: LegacyDateSource;
    sourcePath: string;
    sourceMtime: number;
    originalContent: string;
    analyzableBody: string;
    summary: string;
    candidateTopics: string[];
    signals: LegacyJournalSignals;
}

export interface LegacyJournalExclusion {
    path: string;
    reason: LegacyExclusionReason;
    detail: string;
    date?: string;
}

export interface LegacyImportScanResult {
    folderPath: string;
    dateRange: LegacyImportDateRange;
    candidateCount: number;
    validCount: number;
    validEntries: LegacyJournalCandidate[];
    excludedEntries: LegacyJournalExclusion[];
    canGenerate: boolean;
}

/** 日记不多时全部分析；超过 30 篇才限制为最近 30 天，且最多选择 30 篇。 */
export const FIRST_INSIGHT_RECENT_WINDOW_DAYS = 30;
export const FIRST_INSIGHT_MAX_SELECTED_ENTRIES = 30;

export interface FirstInsightScanSelection {
    scan: LegacyImportScanResult;
    detectedCount: number;
    selectedCount: number;
    windowStart: string;
    windowEnd: string;
}

/**
 * 从完整扫描结果中选出首次画像真正会发送给 AI 的记录。
 *
 * 30 篇以内完整读取，不能为了一个对小库没有意义的“近期”概念丢掉用户交给
 * TideLog 的记录。只有总数超过上限时，窗口才锚定在最新一篇可分析日记；
 * 窗口内仍超过 30 篇时均匀取样，避免多篇同日记录挤掉其他日期。
 */
export function selectRecentFirstInsightScan(
    source: LegacyImportScanResult,
    windowDays = FIRST_INSIGHT_RECENT_WINDOW_DAYS,
    maxEntries = FIRST_INSIGHT_MAX_SELECTED_ENTRIES,
): FirstInsightScanSelection {
    const ordered = source.validEntries
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || a.sourcePath.localeCompare(b.sourcePath));
    if (ordered.length === 0) {
        return {
            scan: source,
            detectedCount: source.candidateCount,
            selectedCount: 0,
            windowStart: source.dateRange.start,
            windowEnd: source.dateRange.end,
        };
    }

    const safeMaxEntries = Math.max(1, Math.floor(maxEntries));
    if (ordered.length <= safeMaxEntries) {
        const selectedScan: LegacyImportScanResult = {
            ...source,
            dateRange: {
                start: ordered[0].date,
                end: ordered[ordered.length - 1].date,
            },
            candidateCount: ordered.length,
            validCount: ordered.length,
            validEntries: ordered,
            canGenerate: ordered.length >= FIRST_INSIGHT_MIN_VALID_ENTRIES,
        };
        return {
            scan: selectedScan,
            detectedCount: source.candidateCount,
            selectedCount: ordered.length,
            windowStart: selectedScan.dateRange.start,
            windowEnd: selectedScan.dateRange.end,
        };
    }

    const latest = moment(ordered[ordered.length - 1].date, 'YYYY-MM-DD', true);
    const windowStart = latest.clone().subtract(Math.max(1, windowDays) - 1, 'days').format('YYYY-MM-DD');
    const windowEnd = latest.format('YYYY-MM-DD');
    const inWindow = ordered.filter(entry => entry.date >= windowStart && entry.date <= windowEnd);

    let selected = inWindow;
    if (selected.length > safeMaxEntries) {
        if (safeMaxEntries === 1) {
            selected = selected.slice(-1);
        } else {
            const step = (selected.length - 1) / (safeMaxEntries - 1);
            selected = Array.from({ length: safeMaxEntries }, (_, index) => selected[Math.round(index * step)]);
        }
    }

    const selectedScan: LegacyImportScanResult = {
        ...source,
        dateRange: {
            start: selected[0]?.date ?? windowStart,
            end: selected[selected.length - 1]?.date ?? windowEnd,
        },
        candidateCount: inWindow.length,
        validCount: selected.length,
        validEntries: selected,
        canGenerate: selected.length >= FIRST_INSIGHT_MIN_VALID_ENTRIES,
    };

    return {
        scan: selectedScan,
        detectedCount: source.candidateCount,
        selectedCount: selected.length,
        windowStart,
        windowEnd,
    };
}

export interface NormalizedLegacyJournal {
    date: string;
    sourcePath: string;
    sourceCopyPath: string;
    normalizedPath: string;
    sourceMtime: number;
    dateSource: LegacyDateSource;
    summary: string;
    analyzableBody: string;
    candidateTopics: string[];
    signals: LegacyJournalSignals;
}

export interface LegacyImportSession {
    importId: string;
    sourceFolderPath: string;
    normalizedFolderPath: string;
    scan: LegacyImportScanResult;
    normalizedEntries: NormalizedLegacyJournal[];
}

export interface LegacyDailyImportResult {
    createdPaths: string[];
    appendedPaths: string[];
    skippedPaths: string[];
}

export interface ExtractedLegacyDate {
    date: string;
    source: LegacyDateSource;
}

export class LegacyImportService {
    constructor(private plugin: TideLogPlugin) { }

    getDefaultDateRange(today = moment()): LegacyImportDateRange {
        return {
            start: today.clone().subtract(29, 'days').format('YYYY-MM-DD'),
            end: today.clone().format('YYYY-MM-DD'),
        };
    }

    listVaultFolders(): string[] {
        const root = this.plugin.app.vault.getRoot?.();
        if (!root) return [];

        const folders: string[] = [];
        const walk = (folder: TFolder) => {
            if (folder.path) folders.push(folder.path);
            for (const child of folder.children ?? []) {
                if (child instanceof TFolder) walk(child);
            }
        };
        walk(root);
        return folders.sort((a, b) => a.localeCompare(b));
    }

    async scanFolder(folderPath: string, dateRange?: LegacyImportDateRange): Promise<LegacyImportScanResult> {
        const folder = this.plugin.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) {
            throw new Error(`Folder not found: ${folderPath}`);
        }

        const start = dateRange ? moment(dateRange.start, 'YYYY-MM-DD', true).startOf('day') : null;
        const end = dateRange ? moment(dateRange.end, 'YYYY-MM-DD', true).endOf('day') : null;
        if (dateRange && (!start?.isValid() || !end?.isValid())) {
            throw new Error('Invalid date range');
        }

        const validEntries: LegacyJournalCandidate[] = [];
        const excludedEntries: LegacyJournalExclusion[] = [];
        let candidateCount = 0;

        for (const file of this.collectMarkdownFilesInFolder(folder)) {
            let content = '';
            try {
                content = await this.plugin.app.vault.cachedRead(file);
            } catch {
                excludedEntries.push({
                    path: file.path,
                    reason: 'read_error',
                    detail: 'Could not read this file.',
                });
                continue;
            }

            const extractedDate = extractLegacyJournalDate(content, file.path, file.stat?.mtime ?? 0);
            if (!extractedDate) {
                excludedEntries.push({
                    path: file.path,
                    reason: 'missing_date',
                    detail: 'No date could be recognized from frontmatter, filename, body, or mtime.',
                });
                continue;
            }

            const date = moment(extractedDate.date, 'YYYY-MM-DD', true);
            if (start && end && !date.isBetween(start, end, 'day', '[]')) {
                excludedEntries.push({
                    path: file.path,
                    reason: 'outside_range',
                    detail: `${extractedDate.date} is outside the selected date range.`,
                    date: extractedDate.date,
                });
                continue;
            }

            candidateCount++;
            const analyzableBody = cleanJournalContent(content);
            if (!isLegacyJournalAnalyzable(analyzableBody)) {
                excludedEntries.push({
                    path: file.path,
                    reason: 'too_short',
                    detail: 'Cleaned body is too short for reliable profile analysis.',
                    date: extractedDate.date,
                });
                continue;
            }

            validEntries.push({
                file,
                date: extractedDate.date,
                dateSource: extractedDate.source,
                sourcePath: file.path,
                sourceMtime: file.stat?.mtime ?? 0,
                originalContent: content,
                analyzableBody,
                summary: summarizeLegacyJournal(analyzableBody),
                candidateTopics: extractCandidateTopics(analyzableBody),
                signals: extractLegacySignals(analyzableBody),
            });
        }

        validEntries.sort((a, b) => a.date.localeCompare(b.date) || a.sourcePath.localeCompare(b.sourcePath));
        const effectiveDateRange = dateRange ?? this.getDetectedDateRange(validEntries, excludedEntries);

        return {
            folderPath,
            dateRange: effectiveDateRange,
            candidateCount,
            validCount: validEntries.length,
            validEntries,
            excludedEntries,
            canGenerate: validEntries.length >= FIRST_INSIGHT_MIN_VALID_ENTRIES,
        };
    }

    async createImport(scan: LegacyImportScanResult): Promise<LegacyImportSession> {
        if (scan.validEntries.length === 0) {
            throw new Error('No valid legacy journals to import.');
        }

        const importId = `legacy-${moment().format('YYYYMMDD-HHmmss-SSS')}`;
        const importRoot = `${this.plugin.settings.archiveFolder}/Imports/${importId}`;
        const sourceFolderPath = `${importRoot}/source`;
        const normalizedFolderPath = `${importRoot}/normalized`;

        await this.ensureFolder(sourceFolderPath);
        await this.ensureFolder(normalizedFolderPath);

        const normalizedEntries: NormalizedLegacyJournal[] = [];
        const usedNames = new Set<string>();

        for (let index = 0; index < scan.validEntries.length; index++) {
            const entry = scan.validEntries[index];
            const baseName = this.buildImportFileName(entry, index + 1, usedNames);
            const sourceCopyPath = `${sourceFolderPath}/${baseName}`;
            const normalizedPath = `${normalizedFolderPath}/${baseName}`;

            await this.plugin.app.vault.create(sourceCopyPath, entry.originalContent);
            await this.plugin.app.vault.create(
                normalizedPath,
                buildNormalizedLegacyJournal({
                    importId,
                    date: entry.date,
                    dateSource: entry.dateSource,
                    sourcePath: entry.sourcePath,
                    sourceMtime: entry.sourceMtime,
                    sourceCopyPath,
                    summary: entry.summary,
                    analyzableBody: entry.analyzableBody,
                    candidateTopics: entry.candidateTopics,
                    signals: entry.signals,
                }),
            );

            normalizedEntries.push({
                date: entry.date,
                sourcePath: entry.sourcePath,
                sourceCopyPath,
                normalizedPath,
                sourceMtime: entry.sourceMtime,
                dateSource: entry.dateSource,
                summary: entry.summary,
                analyzableBody: entry.analyzableBody,
                candidateTopics: entry.candidateTopics,
                signals: entry.signals,
            });
        }

        return {
            importId,
            sourceFolderPath,
            normalizedFolderPath,
            scan,
            normalizedEntries,
        };
    }

    async importSessionToDailyNotes(session: LegacyImportSession): Promise<LegacyDailyImportResult> {
        await this.ensureFolder(this.plugin.settings.dailyFolder);

        const result: LegacyDailyImportResult = {
            createdPaths: [],
            appendedPaths: [],
            skippedPaths: [],
        };

        for (const entry of session.normalizedEntries) {
            const dailyPath = `${this.plugin.settings.dailyFolder}/${entry.date}.md`;
            const existing = this.plugin.app.vault.getAbstractFileByPath(dailyPath);

            // 用户选中的源文件夹可能就是 TideLog 的 dailyFolder。把一篇日记导入
            // 它自己，只会在文末复制出一整份重复正文，并在下次画像时再次被读取。
            if (entry.sourcePath === dailyPath) {
                result.skippedPaths.push(dailyPath);
                continue;
            }

            if (!existing) {
                await this.plugin.app.vault.create(dailyPath, buildSystemDailyNoteFromLegacy(entry));
                result.createdPaths.push(dailyPath);
                continue;
            }

            if (existing instanceof TFile) {
                const current = await this.plugin.app.vault.cachedRead(existing);
                if (current.includes(`legacy_import_source: "${escapeYaml(entry.sourcePath)}"`)
                    || current.includes(`Source path: [[${entry.sourcePath}]]`)
                    || current.includes(`来源路径: [[${entry.sourcePath}]]`)
                    || current.includes(`来源路径：[[${entry.sourcePath}]]`)) {
                    result.skippedPaths.push(dailyPath);
                    continue;
                }

                await this.plugin.app.vault.modify(existing, `${current.trimEnd()}\n\n${buildSystemDailyImportSection(entry)}`);
                result.appendedPaths.push(dailyPath);
                continue;
            }

            result.skippedPaths.push(dailyPath);
        }

        return result;
    }

    private collectMarkdownFilesInFolder(folder: TFolder): TFile[] {
        const files: TFile[] = [];
        const walk = (node: TFolder) => {
            for (const child of node.children ?? []) {
                if (child instanceof TFolder) {
                    walk(child);
                } else if (child instanceof TFile && child.extension === 'md') {
                    files.push(child);
                }
            }
        };
        walk(folder);
        return files.sort((a, b) => a.path.localeCompare(b.path));
    }

    private getDetectedDateRange(
        validEntries: LegacyJournalCandidate[],
        excludedEntries: LegacyJournalExclusion[],
    ): LegacyImportDateRange {
        const dates = [
            ...validEntries.map(entry => entry.date),
            ...excludedEntries.map(entry => entry.date).filter((date): date is string => Boolean(date)),
        ].sort((a, b) => a.localeCompare(b));

        if (dates.length === 0) {
            return this.getDefaultDateRange();
        }

        return {
            start: dates[0],
            end: dates[dates.length - 1],
        };
    }

    private async ensureFolder(path: string): Promise<void> {
        const parts = path.split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!this.plugin.app.vault.getAbstractFileByPath(current)) {
                await this.plugin.app.vault.createFolder(current);
            }
        }
    }

    private buildImportFileName(entry: LegacyJournalCandidate, index: number, usedNames: Set<string>): string {
        const originalName = entry.file.name.replace(/\.md$/i, '');
        const stem = sanitizeFileName(`${String(index).padStart(2, '0')}-${entry.date}-${originalName}`);
        let candidate = `${stem}.md`;
        let suffix = 2;
        while (usedNames.has(candidate)) {
            candidate = `${stem}-${suffix}.md`;
            suffix++;
        }
        usedNames.add(candidate);
        return candidate;
    }
}

export function extractLegacyJournalDate(content: string, sourcePath: string, sourceMtime = 0): ExtractedLegacyDate | null {
    const frontmatterDate = parseFrontmatterDate(content);
    if (frontmatterDate) return { date: frontmatterDate, source: 'frontmatter' };

    const filenameDate = parseDateFromText(sourcePath.split('/').pop() ?? '');
    if (filenameDate) return { date: filenameDate, source: 'filename' };

    const pathDate = parseDateFromText(sourcePath);
    if (pathDate) return { date: pathDate, source: 'filename' };

    const bodyDate = parseBodyDate(content);
    if (bodyDate) return { date: bodyDate, source: 'body' };

    if (sourceMtime > 0) {
        return { date: moment(sourceMtime).format('YYYY-MM-DD'), source: 'mtime' };
    }

    return null;
}

export function cleanJournalContent(content: string): string {
    const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*/m, '');
    return stripLegacyImportSections(withoutFrontmatter)
        .replace(/```[\s\S]*?```/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
        .replace(/\s+/g, ' ')
        .trim();
}

/** 去掉 TideLog 自己追加的旧日记导入区，避免导入副本被当作第二份原始证据。 */
function stripLegacyImportSections(content: string): string {
    const lines = content.split(/\r?\n/);
    const kept: string[] = [];
    let skippedHeadingLevel = 0;

    for (const line of lines) {
        const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (heading) {
            const level = heading[1].length;
            const title = heading[2].trim().toLowerCase();
            if (title === '旧日记导入' || title === 'legacy journal import') {
                skippedHeadingLevel = level;
                continue;
            }
            if (skippedHeadingLevel > 0 && level <= skippedHeadingLevel) {
                skippedHeadingLevel = 0;
            }
        }
        if (skippedHeadingLevel === 0) kept.push(line);
    }

    return kept.join('\n');
}

export function isLegacyJournalAnalyzable(content: string): boolean {
    return content.replace(/\s/g, '').length >= FIRST_INSIGHT_MIN_ANALYZABLE_CHARS;
}

export function summarizeLegacyJournal(content: string, maxLength = 240): string {
    const sentences = splitLegacyTextSegments(content)
        .map(s => s.trim())
        .filter(Boolean);
    const summary = sentences.slice(0, 3).join(' ');
    return truncate(summary || content, maxLength);
}

export function extractCandidateTopics(content: string): string[] {
    const normalized = content.toLowerCase();
    const rawTokens = normalized.match(/[\p{Script=Han}]{2,6}|[a-z][a-z0-9_-]{2,}/gu) ?? [];
    const stopwords = new Set([
        '今天', '昨天', '明天', '觉得', '感觉', '还是', '因为', '所以', '但是', '一个', '这个', '那个', '可以', '没有',
        'about', 'after', 'again', 'also', 'because', 'before', 'today', 'tomorrow', 'yesterday', 'with', 'that', 'this',
    ]);
    const counts = new Map<string, number>();
    for (const token of rawTokens) {
        if (stopwords.has(token) || token.length < 2) continue;
        counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 8)
        .map(([token]) => token);
}

export function extractLegacySignals(content: string): LegacyJournalSignals {
    const lines = splitLegacyTextSegments(content)
        .map(line => line.trim())
        .filter(Boolean);

    return {
        tasks: pickSignalLines(lines, [/^- \[[ x]\]/i, /任务|计划|完成|推进|todo|done|finish|task/i]),
        emotions: pickSignalLines(lines, [/焦虑|开心|难过|兴奋|疲惫|压力|害怕|平静|生气|anxious|happy|sad|excited|tired|stress|calm/i]),
        reflections: pickSignalLines(lines, [/反思|意识到|发现|复盘|原因|模式|下次|learned|realized|noticed|reflect/i]),
    };
}

function splitLegacyTextSegments(content: string): string[] {
    const segments: string[] = [];
    let buffer = '';
    for (const char of content) {
        buffer += char;
        if (char === '\n' || char === '\r' || '。！？.!?'.includes(char)) {
            const segment = buffer.trim();
            if (segment) segments.push(segment);
            buffer = '';
        }
    }
    const tail = buffer.trim();
    if (tail) segments.push(tail);
    return segments;
}

export function buildNormalizedLegacyJournal(input: {
    importId: string;
    date: string;
    dateSource: LegacyDateSource;
    sourcePath: string;
    sourceMtime: number;
    sourceCopyPath: string;
    summary: string;
    analyzableBody: string;
    candidateTopics: string[];
    signals: LegacyJournalSignals;
}): string {
    const mtimeText = input.sourceMtime > 0 ? moment(input.sourceMtime).format('YYYY-MM-DD HH:mm:ss') : '';
    return `---
type: legacy_import_normalized
import_id: ${input.importId}
date: ${input.date}
date_source: ${input.dateSource}
source_path: "${escapeYaml(input.sourcePath)}"
source_mtime: "${escapeYaml(mtimeText)}"
source_copy: "${escapeYaml(input.sourceCopyPath)}"
---

# Normalized legacy journal · ${input.date}

## Source metadata

- Source path: [[${input.sourcePath}]]
- Source modified time: ${mtimeText || 'unknown'}
- Date source: ${input.dateSource}

## Original summary

${input.summary || 'No summary extracted.'}

## Analyzable body

${input.analyzableBody}

## Candidate topics

${formatBulletList(input.candidateTopics)}

## Task signals

${formatBulletList(input.signals.tasks)}

## Emotion signals

${formatBulletList(input.signals.emotions)}

## Reflection signals

${formatBulletList(input.signals.reflections)}
`;
}

export function buildSystemDailyNoteFromLegacy(entry: NormalizedLegacyJournal): string {
    const date = moment(entry.date, 'YYYY-MM-DD', true);
    const weekday = date.isValid() ? date.format('dddd') : '';
    const weekRef = date.isValid() ? `${date.format('YYYY')}-W${date.format('ww')}` : '';
    const monthRef = date.isValid() ? date.format('YYYY-MM') : '';
    const titleText = date.isValid()
        ? (getLanguage() === 'en' ? date.format('dddd, MMMM D, YYYY') : `${date.format('YYYY年M月D日')} ${weekday}`)
        : entry.date;

    const rawContent = `---
type: daily
date: ${entry.date}
weekday: ${weekday}
tags:
  - daily
  - legacy-import
emotion_score:
status: imported
tasks_total: 0
tasks_done: 0
weekly_ref: "[[${weekRef}]]"
monthly_ref: "[[${monthRef}]]"
legacy_import_source: "${escapeYaml(entry.sourcePath)}"
legacy_import_normalized: "${escapeYaml(entry.normalizedPath)}"
---

${t('vault.dailyNoteTitle', titleText)}

## ☀️ ${t('vault.sectionPlan')}

${t('legacyImport.systemPlanPlaceholder')}

## 🌙 ${t('vault.sectionReview')}

${buildSystemDailyImportSection(entry)}
`;
    return formatDailyNoteDocument(rawContent);
}

export function buildSystemDailyImportSection(entry: NormalizedLegacyJournal): string {
    const mtimeText = entry.sourceMtime > 0 ? moment(entry.sourceMtime).format('YYYY-MM-DD HH:mm:ss') : t('legacyImport.unknownMtime');
    const metadata = [
        `- ${t('legacyImport.systemDate')}: ${entry.date}`,
        `- ${t('legacyImport.systemSource')}: [[${entry.sourcePath}]]`,
        `- ${t('legacyImport.systemSourceMtime')}: ${mtimeText}`,
        `- ${t('legacyImport.systemNormalized')}: [[${entry.normalizedPath}]]`,
    ].join('\n');

    return [
        `### ${t('legacyImport.systemSection')}`,
        '',
        formatTideLogCallout('tl-meta', t('legacyImport.systemSection'), metadata),
        '',
        formatTideLogCallout('tl-report', t('legacyImport.systemSummary'), entry.summary || t('legacyImport.emptySummary')),
        '',
        formatTideLogCallout('tl-evidence', t('legacyImport.systemBody'), entry.analyzableBody),
        '',
        formatTideLogCallout('tl-pattern', t('legacyImport.systemTopics'), formatBulletList(entry.candidateTopics)),
        '',
    ].join('\n');
}

function parseFrontmatterDate(content: string): string | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/m);
    if (!match) return null;
    const frontmatter = match[1];
    const dateMatch = frontmatter.match(/^date\s*:\s*["']?([^"'\n]+)["']?\s*$/im)
        ?? frontmatter.match(/^created\s*:\s*["']?([^"'\n]+)["']?\s*$/im);
    return dateMatch ? normalizeDateString(dateMatch[1]) : null;
}

function parseBodyDate(content: string): string | null {
    const firstBlock = content.slice(0, 1200);
    const labeled = firstBlock.match(/(?:日期|date|created|记录时间)\s*[:：]\s*([^\n]+)/i);
    if (labeled) {
        const parsed = normalizeDateString(labeled[1]);
        if (parsed) return parsed;
    }
    return parseDateFromText(firstBlock);
}

function parseDateFromText(text: string): string | null {
    const numeric = text.match(/(20\d{2})[年./_-]?\s*(1[0-2]|0?[1-9])[月./_-]?\s*([12]\d|3[01]|0?[1-9])(?:日)?(?!\d)/);
    if (numeric) return normalizeDateParts(numeric[1], numeric[2], numeric[3]);

    const monthName = text.match(/(20\d{2})[-_/\s]+([A-Za-z]{3,9})[-_/\s]+([12]\d|3[01]|0?[1-9])(?!\d)/);
    if (monthName) {
        const parsed = moment(`${monthName[1]}-${monthName[2]}-${monthName[3]}`, ['YYYY-MMM-D', 'YYYY-MMMM-D'], true);
        return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
    }

    return null;
}

function normalizeDateString(value: string): string | null {
    const direct = parseDateFromText(value);
    if (direct) return direct;
    const parsed = moment(value.trim(), ['YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY.MM.DD', moment.ISO_8601], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function normalizeDateParts(year: string, month: string, day: string): string | null {
    const parsed = moment(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`, 'YYYY-MM-DD', true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

function pickSignalLines(lines: string[], patterns: RegExp[], max = 5): string[] {
    const found: string[] = [];
    for (const line of lines) {
        if (found.length >= max) break;
        if (patterns.some(pattern => pattern.test(line))) {
            found.push(truncate(line, 140));
        }
    }
    return found;
}

function truncate(text: string, maxLength: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength - 1).trim()}...`;
}

function sanitizeFileName(input: string): string {
    return input
        .replace(/[\\/:*?"<>|#^[\]]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120);
}

function escapeYaml(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatBulletList(items: string[]): string {
    return items.length > 0 ? items.map(item => `- ${item}`).join('\n') : '- None found';
}
