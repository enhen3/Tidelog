/**
 * Dashboard Service - Generates a Dashboard.md with aggregated data and Dataview queries
 */

import { App, TFile } from 'obsidian';
import { TideLogSettings } from '../types';
import { t } from '../i18n';

export class DashboardService {
    private app: App;
    private settings: TideLogSettings;

    constructor(app: App, settings: TideLogSettings) {
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

        if (!(file instanceof TFile)) {
            throw new Error('Expected TFile for Dashboard.md');
        }
        return file;
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

## ${t('dashSvc.weeklyProgress')}

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "${t('dashSvc.colDate')}",
  status AS "${t('dashSvc.colStatus')}",
  emotion_score AS "${t('dashSvc.colEmotion')}"
FROM "${this.settings.dailyFolder}"
WHERE type = "daily" AND date >= date(sow)
SORT date ASC
\`\`\`

## ${t('dashSvc.weeklyPlan')}

\`\`\`dataview
TABLE WITHOUT ID
  file.link AS "${t('dashSvc.colPlan')}",
  progress AS "${t('dashSvc.colProgress')}"
FROM "${this.settings.planFolder}/Weekly"
WHERE type = "weekly"
SORT file.ctime DESC
LIMIT 1
\`\`\`

## 📈 ${t('dashSvc.emotionTrend')}

\`\`\`dataview
TABLE WITHOUT ID
  date AS "${t('dashSvc.colDate')}",
  emotion_score AS "${t('dashSvc.colScore')}"
FROM "${this.settings.dailyFolder}"
WHERE type = "daily" AND emotion_score != null
SORT date DESC
LIMIT 7
\`\`\`

## 💡 ${t('dashSvc.todayPrinciple')}

> ${principle || t('dashSvc.noPrinciple')}

## 🔍 ${t('dashSvc.activePattern')}

> ${pattern || t('dashSvc.noPattern')}

---

> ${t('dashSvc.footer')}
`;
    }

    /**
     * Get a random principle from principles.md
     */
    async getRandomPrinciple(): Promise<string> {
        try {
            const path = `${this.settings.archiveFolder}/principles.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) return '';

            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');

            // Extract principle lines (start with "- " but not the example ones)
            const principles = lines
                .filter(l => l.startsWith('- ') && !l.includes('示例') && !l.includes('Example'))
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
    async getLatestPattern(): Promise<string> {
        try {
            const path = `${this.settings.archiveFolder}/patterns.md`;
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) return '';

            const content = await this.app.vault.cachedRead(file);
            const lines = content.split('\n');

            // Extract pattern lines (start with "- " but not the example ones)
            const patterns = lines
                .filter(l => l.startsWith('- ') && !l.includes('示例') && !l.includes('Example'))
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
