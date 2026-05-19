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

export function extractReviewContent(content: string): string {
    const reviewHeaders = ['## 复盘', '## Review'];
    for (const hdr of reviewHeaders) {
        const idx = content.indexOf(hdr);
        if (idx < 0) continue;
        let sectionText = content.substring(idx + hdr.length);
        const nextH = sectionText.search(/\n## /);
        if (nextH > 0) sectionText = sectionText.substring(0, nextH);
        const cleaned = sectionText
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/^---$/gm, '')
            .trim();
        if (cleaned.length > 0) return cleaned;
    }
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
            hasPlan: (content.includes('## 计划') || content.includes('## Plan')) && tasks.length > 0,
            hasReview: extractReviewContent(content).length > 0,
        };
    } catch {
        return null;
    }
}
