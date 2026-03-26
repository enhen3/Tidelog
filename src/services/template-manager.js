/**
 * Template Manager - Creates and manages template files
 */
import { t } from '../i18n';
export class TemplateManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }
    /**
     * Ensure all template files exist
     */
    async ensureTemplateFiles() {
        await this.ensureUserProfile();
        await this.ensurePrinciples();
        await this.ensurePatterns();
    }
    /**
     * Create user_profile.md if it doesn't exist
     */
    async ensureUserProfile() {
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
    async ensurePrinciples() {
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
    async ensurePatterns() {
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
    getWeeklyPlanTemplate(weekNumber, monthRef) {
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
    getMonthlyPlanTemplate(yearMonth) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcGxhdGUtbWFuYWdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRlbXBsYXRlLW1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0dBRUc7QUFJSCxPQUFPLEVBQUUsQ0FBQyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBRTVCLE1BQU0sT0FBTyxlQUFlO0lBSXhCLFlBQVksR0FBUSxFQUFFLFFBQXlCO1FBQzNDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7SUFDN0IsQ0FBQztJQUVEOztPQUVHO0lBQ0gsS0FBSyxDQUFDLG1CQUFtQjtRQUNyQixNQUFNLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQy9CLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7UUFDOUIsTUFBTSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDaEMsQ0FBQztJQUVEOztPQUVHO0lBQ0ssS0FBSyxDQUFDLGlCQUFpQjtRQUMzQixNQUFNLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxrQkFBa0IsQ0FBQztRQUM5RCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUUxRCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDVixNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQzs7RUFFdkQsQ0FBQyxDQUFDLGdCQUFnQixDQUFDOztFQUVuQixDQUFDLENBQUMsdUJBQXVCLENBQUM7O0lBRXhCLENBQUMsQ0FBQyxlQUFlLENBQUM7SUFDbEIsQ0FBQyxDQUFDLGFBQWEsQ0FBQztJQUNoQixDQUFDLENBQUMsZ0JBQWdCLENBQUM7O0VBRXJCLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQzs7RUFFdkIsQ0FBQyxDQUFDLHNCQUFzQixDQUFD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Q0FBQywyQkFBMkIsQ0FBQzs7OztFQUk5QixDQUFDLENBQUMsb0JBQW9CLENBQUM7O0VBRXZCLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQzs7OztFQUkzQixDQUFDLENBQUMsd0JBQXdCLENBQUM7Ozs7RUFJM0IsQ0FBQyxDQUFDLHFCQUFxQixDQUFDOzs7O0VBSXhCLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQzs7Ozs7Q0FLekIsQ0FBQztJQUNFLENBQUM7Q0FDSiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGVtcGxhdGUgTWFuYWdlciAtIENyZWF0ZXMgYW5kIG1hbmFnZXMgdGVtcGxhdGUgZmlsZXNcbiAqL1xuXG5pbXBvcnQgeyBBcHAgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgeyBUaWRlTG9nU2V0dGluZ3MgfSBmcm9tICcuLi90eXBlcyc7XG5pbXBvcnQgeyB0IH0gZnJvbSAnLi4vaTE4bic7XG5cbmV4cG9ydCBjbGFzcyBUZW1wbGF0ZU1hbmFnZXIge1xuICAgIHByaXZhdGUgYXBwOiBBcHA7XG4gICAgcHJpdmF0ZSBzZXR0aW5nczogVGlkZUxvZ1NldHRpbmdzO1xuXG4gICAgY29uc3RydWN0b3IoYXBwOiBBcHAsIHNldHRpbmdzOiBUaWRlTG9nU2V0dGluZ3MpIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbnN1cmUgYWxsIHRlbXBsYXRlIGZpbGVzIGV4aXN0XG4gICAgICovXG4gICAgYXN5bmMgZW5zdXJlVGVtcGxhdGVGaWxlcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVVc2VyUHJvZmlsZSgpO1xuICAgICAgICBhd2FpdCB0aGlzLmVuc3VyZVByaW5jaXBsZXMoKTtcbiAgICAgICAgYXdhaXQgdGhpcy5lbnN1cmVQYXR0ZXJucygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSB1c2VyX3Byb2ZpbGUubWQgaWYgaXQgZG9lc24ndCBleGlzdFxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgZW5zdXJlVXNlclByb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBgJHt0aGlzLnNldHRpbmdzLmFyY2hpdmVGb2xkZXJ9L3VzZXJfcHJvZmlsZS5tZGA7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAke3QoJ3RtcGwudXNlclByb2ZpbGVUaXRsZScpfVxuXG4ke3QoJ3RtcGwuYmFzaWNJbmZvJyl9XG5cbiR7dCgndG1wbC5iYXNpY0luZm9Db21tZW50Jyl9XG5cbi0gJHt0KCd0bXBsLmFnZVJhbmdlJyl9OiBcbi0gJHt0KCd0bXBsLmNhcmVlcicpfTogXG4tICR7dCgndG1wbC5saWZlU3RhZ2UnKX06IFxuXG4ke3QoJ3RtcGwuZW1vdGlvblRyYWl0cycpfVxuXG4ke3QoJ3RtcGwuYW54aWV0eVRyaWdnZXJzJyl9XG4ke3QoJ3RtcGwuYW54aWV0eUNvbW1lbnQnKX1cblxuLSBcblxuJHt0KCd0bXBsLmhhcHBpbmVzc1RyaWdnZXJzJyl9XG4ke3QoJ3RtcGwuaGFwcGluZXNzQ29tbWVudCcpfVxuXG4tIFxuXG4ke3QoJ3RtcGwuZW5lcmd5UGVyaW9kcycpfVxuJHt0KCd0bXBsLmVuZXJneUNvbW1lbnQnKX1cblxuLSAke3QoJ3RtcGwuaGlnaEVuZXJneScpfTogXG4tICR7dCgndG1wbC5sb3dFbmVyZ3knKX06IFxuXG4ke3QoJ3RtcGwuc3VjY2Vzc1BhdHRlcm5zJyl9XG5cbiR7dCgndG1wbC5nb29kVGFza1R5cGVzJyl9XG4ke3QoJ3RtcGwuZ29vZFRhc2tDb21tZW50Jyl9XG5cbi0gXG5cbiR7dCgndG1wbC5wcm9jcmFzdGluYXRpb24nKX1cbiR7dCgndG1wbC5wcm9jcmFzdGluYXRpb25Db21tZW50Jyl9XG5cbi0gXG5cbiR7dCgndG1wbC5tb3RpdmF0aW9uJyl9XG4ke3QoJ3RtcGwubW90aXZhdGlvbkNvbW1lbnQnKX1cblxuLSBcblxuJHt0KCd0bXBsLnRoaW5raW5nU3R5bGUnKX1cblxuJHt0KCd0bXBsLnRoaW5raW5nQ29tbWVudCcpfVxuXG4tIFxuXG4ke3QoJ3RtcGwuY29yZVZhbHVlcycpfVxuXG4ke3QoJ3RtcGwuY29yZVZhbHVlc0NvbW1lbnQnKX1cblxuMS4gXG4yLiBcbjMuIFxuXG4ke3QoJ3RtcGwuZ3Jvd3RoQm91bmRhcnknKX1cblxuJHt0KCd0bXBsLmNvbWZvcnRab25lJyl9XG4ke3QoJ3RtcGwuY29tZm9ydENvbW1lbnQnKX1cblxuLSBcblxuJHt0KCd0bXBsLmxlYXJuaW5nWm9uZScpfVxuJHt0KCd0bXBsLmxlYXJuaW5nQ29tbWVudCcpfVxuXG4tIFxuXG4ke3QoJ3RtcGwucGFuaWNab25lJyl9XG4ke3QoJ3RtcGwucGFuaWNDb21tZW50Jyl9XG5cbi0gXG5cbi0tLVxuXG4ke3QoJ3RtcGwucHJvZmlsZUZvb3RlcicpfVxuYDtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShwYXRoLCBjb250ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBwcmluY2lwbGVzLm1kIGlmIGl0IGRvZXNuJ3QgZXhpc3RcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGVuc3VyZVByaW5jaXBsZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBgJHt0aGlzLnNldHRpbmdzLmFyY2hpdmVGb2xkZXJ9L3ByaW5jaXBsZXMubWRgO1xuICAgICAgICBjb25zdCBleGlzdHMgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocGF0aCk7XG5cbiAgICAgICAgaWYgKCFleGlzdHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBgJHt0KCd0bXBsLnByaW5jaXBsZXNUaXRsZScpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlc0Rlc2MnKX1cblxuJHt0KCd0bXBsLnByaW5jaXBsZURlY2lzaW9uJyl9XG5cbiR7dCgndG1wbC5wcmluY2lwbGVEZWNpc2lvbkNvbW1lbnQnKX1cblxuLSAke3QoJ3RtcGwucHJpbmNpcGxlRGVjaXNpb25FeGFtcGxlJyl9XG5cbiR7dCgndG1wbC5wcmluY2lwbGVFbW90aW9uJyl9XG5cbiR7dCgndG1wbC5wcmluY2lwbGVFbW90aW9uQ29tbWVudCcpfVxuXG4tICR7dCgndG1wbC5wcmluY2lwbGVFbW90aW9uRXhhbXBsZScpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlRWZmaWNpZW5jeScpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlRWZmaWNpZW5jeUNvbW1lbnQnKX1cblxuLSAke3QoJ3RtcGwucHJpbmNpcGxlRWZmaWNpZW5jeUV4YW1wbGUnKX1cblxuJHt0KCd0bXBsLnByaW5jaXBsZVJlbGF0aW9uc2hpcCcpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlUmVsYXRpb25zaGlwQ29tbWVudCcpfVxuXG4tICR7dCgndG1wbC5wcmluY2lwbGVSZWxhdGlvbnNoaXBFeGFtcGxlJyl9XG5cbiR7dCgndG1wbC5wcmluY2lwbGVIZWFsdGgnKX1cblxuJHt0KCd0bXBsLnByaW5jaXBsZUhlYWx0aENvbW1lbnQnKX1cblxuLSAke3QoJ3RtcGwucHJpbmNpcGxlSGVhbHRoRXhhbXBsZScpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlR2VuZXJhbCcpfVxuXG4ke3QoJ3RtcGwucHJpbmNpcGxlR2VuZXJhbENvbW1lbnQnKX1cblxuLSBcblxuLS0tXG5cbiR7dCgndG1wbC5wcmluY2lwbGVzRm9vdGVyJyl9XG5gO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKHBhdGgsIGNvbnRlbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlIHBhdHRlcm5zLm1kIGlmIGl0IGRvZXNuJ3QgZXhpc3RcbiAgICAgKi9cbiAgICBwcml2YXRlIGFzeW5jIGVuc3VyZVBhdHRlcm5zKCk6IFByb21pc2U8dm9pZD4ge1xuICAgICAgICBjb25zdCBwYXRoID0gYCR7dGhpcy5zZXR0aW5ncy5hcmNoaXZlRm9sZGVyfS9wYXR0ZXJucy5tZGA7XG4gICAgICAgIGNvbnN0IGV4aXN0cyA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChwYXRoKTtcblxuICAgICAgICBpZiAoIWV4aXN0cykge1xuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGAke3QoJ3RtcGwucGF0dGVybnNUaXRsZScpfVxuXG4ke3QoJ3RtcGwucGF0dGVybnNEZXNjJyl9XG5cbiR7dCgndG1wbC5wYXR0ZXJuRW1vdGlvbicpfVxuXG4ke3QoJ3RtcGwucGF0dGVybkVtb3Rpb25Db21tZW50Jyl9XG5cbi0gJHt0KCd0bXBsLnBhdHRlcm5FbW90aW9uRXhhbXBsZScpfVxuXG4ke3QoJ3RtcGwucGF0dGVybkJlaGF2aW9yJyl9XG5cbiR7dCgndG1wbC5wYXR0ZXJuQmVoYXZpb3JDb21tZW50Jyl9XG5cbi0gJHt0KCd0bXBsLnBhdHRlcm5CZWhhdmlvckV4YW1wbGUnKX1cblxuJHt0KCd0bXBsLnBhdHRlcm5UaGlua2luZycpfVxuXG4ke3QoJ3RtcGwucGF0dGVyblRoaW5raW5nQ29tbWVudCcpfVxuXG4tICR7dCgndG1wbC5wYXR0ZXJuVGhpbmtpbmdFeGFtcGxlJyl9XG5cbiR7dCgndG1wbC5wYXR0ZXJuQ3ljbGljJyl9XG5cbiR7dCgndG1wbC5wYXR0ZXJuQ3ljbGljQ29tbWVudCcpfVxuXG4tICR7dCgndG1wbC5wYXR0ZXJuQ3ljbGljRXhhbXBsZScpfVxuXG4ke3QoJ3RtcGwucGF0dGVyblRyaWdnZXInKX1cblxuJHt0KCd0bXBsLnBhdHRlcm5UcmlnZ2VyQ29tbWVudCcpfVxuXG4tICR7dCgndG1wbC5wYXR0ZXJuVHJpZ2dlckV4YW1wbGUnKX1cblxuJHt0KCd0bXBsLnBhdHRlcm5TdWNjZXNzJyl9XG5cbiR7dCgndG1wbC5wYXR0ZXJuU3VjY2Vzc0NvbW1lbnQnKX1cblxuLSAke3QoJ3RtcGwucGF0dGVyblN1Y2Nlc3NFeGFtcGxlJyl9XG5cbi0tLVxuXG4ke3QoJ3RtcGwucGF0dGVybnNGb290ZXInKX1cbmA7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUocGF0aCwgY29udGVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgd2Vla2x5IHBsYW4gdGVtcGxhdGVcbiAgICAgKi9cbiAgICBnZXRXZWVrbHlQbGFuVGVtcGxhdGUod2Vla051bWJlcjogc3RyaW5nLCBtb250aFJlZj86IHN0cmluZyk6IHN0cmluZyB7XG4gICAgICAgIGNvbnN0IG1SZWYgPSBtb250aFJlZiB8fCAnJztcbiAgICAgICAgcmV0dXJuIGAtLS1cbnR5cGU6IHdlZWtseVxud2Vla19udW1iZXI6ICR7d2Vla051bWJlcn1cbm1vbnRobHlfcmVmOiBcIiR7bVJlZiA/IGBbWyR7bVJlZn1dXWAgOiAnJ31cIlxucHJvZ3Jlc3M6IDBcbi0tLVxuXG4ke3QoJ3RtcGwud2Vla2x5UGxhblRpdGxlJywgd2Vla051bWJlcil9XG5cbiR7dCgndG1wbC53ZWVrbHlHb2FscycpfVxuXG4ke3QoJ3RtcGwud2Vla2x5R29hbHNDb21tZW50Jyl9XG5cbi0gWyBdIFxuLSBbIF0gXG4tIFsgXSBcblxuJHt0KCd0bXBsLndlZWtseVJldmlldycpfVxuXG4ke3QoJ3RtcGwud2Vla2x5Q29tcGxldGlvbicpfVxuXG4tIFxuXG4ke3QoJ3RtcGwud2Vla2x5TGVhcm5pbmdzJyl9XG5cbi0gXG5cbiR7dCgndG1wbC53ZWVrbHlOZXh0V2VlaycpfVxuXG4tIFxuXG4tLS1cbmA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IG1vbnRobHkgcGxhbiB0ZW1wbGF0ZVxuICAgICAqL1xuICAgIGdldE1vbnRobHlQbGFuVGVtcGxhdGUoeWVhck1vbnRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gYCR7dCgndG1wbC5tb250aGx5UGxhblRpdGxlJywgeWVhck1vbnRoKX1cblxuJHt0KCd0bXBsLm1vbnRobHlUaGVtZScpfVxuXG4ke3QoJ3RtcGwubW9udGhseVRoZW1lQ29tbWVudCcpfVxuXG5cblxuJHt0KCd0bXBsLm1vbnRobHlHb2FscycpfVxuXG4ke3QoJ3RtcGwubW9udGhseUdvYWxzQ29tbWVudCcpfVxuXG4xLiBcbjIuIFxuMy4gXG5cbiR7dCgndG1wbC5tb250aGx5TWlsZXN0b25lcycpfVxuXG4ke3QoJ3RtcGwubW9udGhseU1pbGVzdG9uZXNDb21tZW50Jyl9XG5cbi0gWyBdICR7dCgndG1wbC5tb250aGx5TWlsZXN0b25lV2VlaycsICcxJyl9XG4tIFsgXSAke3QoJ3RtcGwubW9udGhseU1pbGVzdG9uZVdlZWsnLCAnMicpfVxuLSBbIF0gJHt0KCd0bXBsLm1vbnRobHlNaWxlc3RvbmVXZWVrJywgJzMnKX1cbi0gWyBdICR7dCgndG1wbC5tb250aGx5TWlsZXN0b25lV2VlaycsICc0Jyl9XG5cbiR7dCgndG1wbC5tb250aGx5R3Jvd3RoJyl9XG5cbiR7dCgndG1wbC5tb250aGx5R3Jvd3RoQ29tbWVudCcpfVxuXG4tIFxuXG4ke3QoJ3RtcGwubW9udGhseVJldmlldycpfVxuXG4ke3QoJ3RtcGwubW9udGhseUdvYWxSZXZpZXcnKX1cblxuLSBcblxuJHt0KCd0bXBsLm1vbnRobHlIaWdobGlnaHRzJyl9XG5cbi0gXG5cbiR7dCgndG1wbC5tb250aGx5TGVzc29ucycpfVxuXG4tIFxuXG4ke3QoJ3RtcGwubW9udGhseU91dGxvb2snKX1cblxuLSBcblxuLS0tXG5gO1xuICAgIH1cbn1cbiJdfQ==