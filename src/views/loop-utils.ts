import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { TideLogSettings } from '../types';

export interface DayLoopData {
    date: string;
    filePath: string;
    tasks: { text: string; done: boolean }[];
    hasPlan: boolean;
    hasReview: boolean;
}

function normalizeLoopSectionTitle(line: string): string {
    return line
        .replace(/^##\s+/, '')
        .replace(/^[^\p{L}\p{N}]+/u, '')
        .trim()
        .toLowerCase();
}

function hasLoopSection(content: string, names: string[]): boolean {
    const accepted = new Set(names.map(name => name.toLowerCase()));
    return content
        .split(/\r?\n/)
        .some(line => line.startsWith('## ') && accepted.has(normalizeLoopSectionTitle(line)));
}

export function extractReviewContent(content: string): string {
    const lines = content.split(/\r?\n/);
    const start = lines.findIndex(line =>
        line.startsWith('## ')
        && ['复盘', 'review'].includes(normalizeLoopSectionTitle(line))
    );
    if (start < 0) return '';

    const section: string[] = [];
    for (let index = start + 1; index < lines.length; index++) {
        if (lines[index].startsWith('## ')) break;
        section.push(lines[index]);
    }

    const cleaned = section
        .join('\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/^---$/gm, '')
        .trim();
    if (cleaned.length > 0) return cleaned;
    return '';
}

export function parseTaskLines(content: string): { text: string; done: boolean }[] {
    const tasks: { text: string; done: boolean }[] = [];
    for (const line of content.split('\n')) {
        const m = line.match(/^\s*- \[([ x])\] (.+)$/);
        if (m) tasks.push({ done: m[1] === 'x', text: m[2].trim() });
    }
    return tasks;
}

export async function loadDayLoopData(
    app: App,
    settings: TideLogSettings,
    dateStr: string,
): Promise<DayLoopData | null> {
    const path = `${settings.dailyFolder}/${dateStr}.md`;
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;

    try {
        const content = await app.vault.read(file);
        const tasks = parseTaskLines(content);
        return {
            date: dateStr,
            filePath: file.path,
            tasks,
            hasPlan: hasLoopSection(content, ['计划', 'plan']) && tasks.length > 0,
            hasReview: extractReviewContent(content).length > 0,
        };
    } catch {
        return null;
    }
}
