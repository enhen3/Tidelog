/**
 * Dashboard Service - Generates a Dashboard.md with aggregated data and Dataview queries
 */

import { App, TFile } from 'obsidian';
import { AIFlowSettings } from '../types';

export class DashboardService {
    private app: App;
    private settings: AIFlowSettings;

    constructor(app: App, settings: AIFlowSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Generate or update the Dashboard.md file
     */
    async generateDashboard(): Promise<TFile> {
        const path = 'Dashboard.md';

        // Get dynamic content
        const principle = await this.getRandomPrinciple();
        const pattern = await this.getLatestPattern();

        const content = this.buildDashboardContent(principle, pattern);

        let file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            await this.app.vault.modify(file, content);
        } else {
            file = await this.app.vault.create(path, content);
        }

        return file as TFile;
    }

    /**
     * Refresh only the dynamic sections (principle + pattern)
     */
    async refreshDashboard(): Promise<void> {
        const path = 'Dashboard.md';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
            await this.generateDashboard();
            return;
        }

        const principle = await this.getRandomPrinciple();
        const pattern = await this.getLatestPattern();
        const content = this.buildDashboardContent(principle, pattern);
        await this.app.vault.modify(file, content);
    }

    /**
     * Build the full dashboard markdown
     */
    private buildDashboardContent(principle: string, pattern: string): string {
        return `---
type: dashboard
---

# 📊 Dashboard

## 本周任务进度

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "日期",
  status AS "状态",
  emotion_score AS "情绪"
FROM "${this.settings.dailyFolder}"
WHERE type = "daily" AND date >= date(sow)
SORT date ASC
\`\`\`

## 本周计划

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "计划",
  progress AS "进度 %"
FROM "${this.settings.planFolder}/Weekly"
WHERE type = "weekly"
SORT file.ctime DESC
LIMIT 1
\`\`\`

## 📈 情绪趋势 (近 7 天)

\`\`\`dataview
TABLE WITHOUT ID
  date AS "日期",
  emotion_score AS "评分"
FROM "${this.settings.dailyFolder}"
WHERE type = "daily" AND emotion_score != null
SORT date DESC
LIMIT 7
\`\`\`

## 💡 今日原则

> ${principle || '_暂无原则，完成晚间复盘后 AI 会帮助你提炼。_'}

## 🔍 活跃模式

> ${pattern || '_暂无活跃模式，使用一段时间后 AI 会分析你的行为模式。_'}

---

> _此页面由 Dailot 自动生成，可随时运行"刷新 Dashboard"命令更新。_
`;
    }

    /**
     * Get a random principle from principles.md
     */
    private async getRandomPrinciple(): Promise<string> {
        try {
            const path = `${this.settings.archiveFolder}/principles.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) return '';

            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Extract principle lines (start with "- " but not the example ones)
            const principles = lines
                .filter(l => l.startsWith('- ') && !l.includes('示例'))
                .map(l => l.substring(2).trim())
                .filter(l => l.length > 0);

            if (principles.length === 0) return '';

            const idx = Math.floor(Math.random() * principles.length);
            return principles[idx];
        } catch {
            return '';
        }
    }

    /**
     * Get the latest pattern from patterns.md
     */
    private async getLatestPattern(): Promise<string> {
        try {
            const path = `${this.settings.archiveFolder}/patterns.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) return '';

            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Extract pattern lines (start with "- " but not the example ones)
            const patterns = lines
                .filter(l => l.startsWith('- ') && !l.includes('示例'))
                .map(l => l.substring(2).trim())
                .filter(l => l.length > 0);

            if (patterns.length === 0) return '';

            // Return the last one (most recently added)
            return patterns[patterns.length - 1];
        } catch {
            return '';
        }
    }
}
