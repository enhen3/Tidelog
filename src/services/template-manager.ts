/**
 * Template Manager - Creates and manages template files
 */

import { App } from 'obsidian';
import { TideLogSettings } from '../types';
import { t } from '../i18n';

export class TemplateManager {
    private app: App;
    private settings: TideLogSettings;

    constructor(app: App, settings: TideLogSettings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Ensure all template files exist
     */
    async ensureTemplateFiles(): Promise<void> {
        await this.ensureUserProfile();
        await this.ensurePrinciples();
        await this.ensurePatterns();
    }

    /**
     * Create user_profile.md if it doesn't exist
     */
    private async ensureUserProfile(): Promise<void> {
        const path = `${this.settings.archiveFolder}/user_profile.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `${t('tmpl.userProfileTitle')}

${t('tmpl.basicInfo')}

${t('tmpl.basicInfoComment')}

- ${t('tmpl.ageRange')}: 
- ${t('tmpl.career')}: 
- ${t('tmpl.lifeStage')}: 

${t('tmpl.emotionTraits')}

${t('tmpl.anxietyTriggers')}
${t('tmpl.anxietyComment')}

- 

${t('tmpl.happinessTriggers')}
${t('tmpl.happinessComment')}

- 

${t('tmpl.energyPeriods')}
${t('tmpl.energyComment')}

- ${t('tmpl.highEnergy')}: 
- ${t('tmpl.lowEnergy')}: 

${t('tmpl.successPatterns')}

${t('tmpl.goodTaskTypes')}
${t('tmpl.goodTaskComment')}

- 

${t('tmpl.procrastination')}
${t('tmpl.procrastinationComment')}

- 

${t('tmpl.motivation')}
${t('tmpl.motivationComment')}

- 

${t('tmpl.thinkingStyle')}

${t('tmpl.thinkingComment')}

- 

${t('tmpl.coreValues')}

${t('tmpl.coreValuesComment')}

1. 
2. 
3. 

${t('tmpl.growthBoundary')}

${t('tmpl.comfortZone')}
${t('tmpl.comfortComment')}

- 

${t('tmpl.learningZone')}
${t('tmpl.learningComment')}

- 

${t('tmpl.panicZone')}
${t('tmpl.panicComment')}

- 

---

${t('tmpl.profileFooter')}
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Create principles.md if it doesn't exist
     */
    private async ensurePrinciples(): Promise<void> {
        const path = `${this.settings.archiveFolder}/principles.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `${t('tmpl.principlesTitle')}

${t('tmpl.principlesDesc')}

${t('tmpl.principleDecision')}

${t('tmpl.principleDecisionComment')}

- ${t('tmpl.principleDecisionExample')}

${t('tmpl.principleEmotion')}

${t('tmpl.principleEmotionComment')}

- ${t('tmpl.principleEmotionExample')}

${t('tmpl.principleEfficiency')}

${t('tmpl.principleEfficiencyComment')}

- ${t('tmpl.principleEfficiencyExample')}

${t('tmpl.principleRelationship')}

${t('tmpl.principleRelationshipComment')}

- ${t('tmpl.principleRelationshipExample')}

${t('tmpl.principleHealth')}

${t('tmpl.principleHealthComment')}

- ${t('tmpl.principleHealthExample')}

${t('tmpl.principleGeneral')}

${t('tmpl.principleGeneralComment')}

- 

---

${t('tmpl.principlesFooter')}
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Create patterns.md if it doesn't exist
     */
    private async ensurePatterns(): Promise<void> {
        const path = `${this.settings.archiveFolder}/patterns.md`;
        const exists = this.app.vault.getAbstractFileByPath(path);

        if (!exists) {
            const content = `${t('tmpl.patternsTitle')}

${t('tmpl.patternsDesc')}

${t('tmpl.patternEmotion')}

${t('tmpl.patternEmotionComment')}

- ${t('tmpl.patternEmotionExample')}

${t('tmpl.patternBehavior')}

${t('tmpl.patternBehaviorComment')}

- ${t('tmpl.patternBehaviorExample')}

${t('tmpl.patternThinking')}

${t('tmpl.patternThinkingComment')}

- ${t('tmpl.patternThinkingExample')}

${t('tmpl.patternCyclic')}

${t('tmpl.patternCyclicComment')}

- ${t('tmpl.patternCyclicExample')}

${t('tmpl.patternTrigger')}

${t('tmpl.patternTriggerComment')}

- ${t('tmpl.patternTriggerExample')}

${t('tmpl.patternSuccess')}

${t('tmpl.patternSuccessComment')}

- ${t('tmpl.patternSuccessExample')}

---

${t('tmpl.patternsFooter')}
`;
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Get weekly plan template
     */
    getWeeklyPlanTemplate(weekNumber: string, monthRef?: string): string {
        const mRef = monthRef || '';
        return `---
type: weekly
week_number: ${weekNumber}
monthly_ref: "${mRef ? `[[${mRef}]]` : ''}"
progress: 0
---

${t('tmpl.weeklyPlanTitle', weekNumber)}

${t('tmpl.weeklyGoals')}

${t('tmpl.weeklyGoalsComment')}

- [ ] 
- [ ] 
- [ ] 

${t('tmpl.weeklyReview')}

${t('tmpl.weeklyCompletion')}

- 

${t('tmpl.weeklyLearnings')}

- 

${t('tmpl.weeklyNextWeek')}

- 

---
`;
    }

    /**
     * Get monthly plan template
     */
    getMonthlyPlanTemplate(yearMonth: string): string {
        return `${t('tmpl.monthlyPlanTitle', yearMonth)}

${t('tmpl.monthlyTheme')}

${t('tmpl.monthlyThemeComment')}



${t('tmpl.monthlyGoals')}

${t('tmpl.monthlyGoalsComment')}

1. 
2. 
3. 

${t('tmpl.monthlyMilestones')}

${t('tmpl.monthlyMilestonesComment')}

- [ ] ${t('tmpl.monthlyMilestoneWeek', '1')}
- [ ] ${t('tmpl.monthlyMilestoneWeek', '2')}
- [ ] ${t('tmpl.monthlyMilestoneWeek', '3')}
- [ ] ${t('tmpl.monthlyMilestoneWeek', '4')}

${t('tmpl.monthlyGrowth')}

${t('tmpl.monthlyGrowthComment')}

- 

${t('tmpl.monthlyReview')}

${t('tmpl.monthlyGoalReview')}

- 

${t('tmpl.monthlyHighlights')}

- 

${t('tmpl.monthlyLessons')}

- 

${t('tmpl.monthlyOutlook')}

- 

---
`;
    }
}
