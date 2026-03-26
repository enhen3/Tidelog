/**
 * TideLog — Constants & Default Values
 * Separated from types.ts for cleaner module organization
 */
import { t } from './i18n';
// =============================================================================
// Default Evening Questions
// =============================================================================
export function getDefaultEveningQuestions() {
    return [
        {
            type: 'goal_alignment',
            sectionName: t('insight.sectionGoalAlign'),
            initialMessage: t('evening.q1'),
            required: true,
            enabled: true,
        },
        {
            type: 'success_diary',
            sectionName: t('insight.sectionSuccess'),
            initialMessage: t('evening.q2'),
            required: true,
            enabled: true,
        },
        {
            type: 'happiness_emotion',
            sectionName: t('insight.sectionJoyEmotion'),
            initialMessage: t('evening.q3'),
            required: true,
            enabled: true,
        },
        {
            type: 'anxiety_awareness',
            sectionName: t('insight.sectionAnxiety'),
            initialMessage: t('evening.q4'),
            required: true,
            enabled: true,
        },
        {
            type: 'tomorrow_plan',
            sectionName: t('insight.sectionTomorrow'),
            initialMessage: t('evening.q5'),
            required: true,
            enabled: true,
        },
        {
            type: 'deep_analysis',
            sectionName: t('insight.sectionDeep'),
            initialMessage: t('evening.q6'),
            required: false,
            enabled: false,
        },
        {
            type: 'reflection',
            sectionName: t('insight.sectionReflect'),
            initialMessage: t('evening.q7'),
            required: false,
            enabled: false,
        },
        {
            type: 'principle_extract',
            sectionName: t('insight.sectionPrinciple'),
            initialMessage: t('evening.q8'),
            required: false,
            enabled: false,
        },
        {
            type: 'free_writing',
            sectionName: t('insight.sectionFreeWrite'),
            initialMessage: t('evening.q9'),
            required: false,
            enabled: false,
        },
    ];
}
// =============================================================================
// Default Plugin Settings
// =============================================================================
export const DEFAULT_SETTINGS = {
    proLicense: { key: '', activated: false },
    language: 'zh',
    activeProvider: 'openrouter',
    providers: {
        openrouter: {
            apiKey: '',
            model: 'anthropic/claude-sonnet-4',
            enabled: true,
        },
        anthropic: {
            apiKey: '',
            model: 'claude-sonnet-4-20250514',
            enabled: false,
        },
        gemini: {
            apiKey: '',
            model: 'gemini-2.0-flash',
            enabled: false,
        },
        openai: {
            apiKey: '',
            model: 'gpt-4o',
            enabled: false,
        },
        siliconflow: {
            apiKey: '',
            model: 'deepseek-ai/DeepSeek-V3',
            enabled: false,
            baseUrl: 'https://api.siliconflow.cn/v1',
        },
        custom: {
            apiKey: '',
            model: '',
            enabled: false,
            baseUrl: 'https://api.deepseek.com/v1',
        },
    },
    dayBoundaryHour: 2,
    dailyFolder: '01-Daily',
    planFolder: '02-Plan',
    archiveFolder: '03-Archive',
    enableMorningSOP: true,
    enableEveningSOP: true,
    includeOptionalQuestions: true,
    eveningQuestions: [...getDefaultEveningQuestions()],
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RhbnRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY29uc3RhbnRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQU1ILE9BQU8sRUFBRSxDQUFDLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFFM0IsZ0ZBQWdGO0FBQ2hGLDRCQUE0QjtBQUM1QixnRkFBZ0Y7QUFFaEYsTUFBTSxVQUFVLDBCQUEwQjtJQUN0QyxPQUFPO1FBQ1A7WUFDSSxJQUFJLEVBQUUsZ0JBQWdCO1lBQ3RCLFdBQVcsRUFBRSxDQUFDLENBQUMsMEJBQTBCLENBQUM7WUFDMUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUM7WUFDL0IsUUFBUSxFQUFFLElBQUk7WUFDZCxPQUFPLEVBQUUsSUFBSTtTQUNoQjtRQUNEO1lBQ0ksSUFBSSxFQUFFLGVBQWU7WUFDckIsV0FBVyxFQUFFLENBQUMsQ0FBQyx3QkFBd0IsQ0FBQztZQUN4QyxjQUFjLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQztZQUMvQixRQUFRLEVBQUUsSUFBSTtZQUNkLE9BQU8sRUFBRSxJQUFJO1NBQ2hCO1FBQ0Q7WUFDSSxJQUFJLEVBQUUsbUJBQW1CO1lBQ3pCLFdBQVcsRUFBRSxDQUFDLENBQUMsMkJBQTJCLENBQUM7WUFDM0MsY0FBYyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUM7WUFDL0IsUUFBUSxFQUFFLElBQUk7WUFDZCxPQUFPLEVBQUUsSUFBSTtTQUNoQjtRQUNEO1lBQ0ksSUFBSSxFQUFFLG1CQUFtQjtZQUN6QixXQUFXLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QixDQUFDO1lBQ3hDLGNBQWMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDO1lBQy9CLFFBQVEsRUFBRSxJQUFJO1lBQ2QsT0FBTyxFQUFFLElBQUk7U0FDaEI7UUFDRDtZQUNJLElBQUksRUFBRSxlQUFlO1lBQ3JCLFdBQVcsRUFBRSxDQUFDLENBQUMseUJBQXlCLENBQUM7WUFDekMsY0FBYyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUM7WUFDL0IsUUFBUSxFQUFFLElBQUk7WUFDZCxPQUFPLEVBQUUsSUFBSTtTQUNoQjtRQUNEO1lBQ0ksSUFBSSxFQUFFLGVBQWU7WUFDckIsV0FBVyxFQUFFLENBQUMsQ0FBQyxxQkFBcUIsQ0FBQztZQUNyQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQztZQUMvQixRQUFRLEVBQUUsS0FBSztZQUNmLE9BQU8sRUFBRSxLQUFLO1NBQ2pCO1FBQ0Q7WUFDSSxJQUFJLEVBQUUsWUFBWTtZQUNsQixXQUFXLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QixDQUFDO1lBQ3hDLGNBQWMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDO1lBQy9CLFFBQVEsRUFBRSxLQUFLO1lBQ2YsT0FBTyxFQUFFLEtBQUs7U0FDakI7UUFDRDtZQUNJLElBQUksRUFBRSxtQkFBbUI7WUFDekIsV0FBVyxFQUFFLENBQUMsQ0FBQywwQkFBMEIsQ0FBQztZQUMxQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQztZQUMvQixRQUFRLEVBQUUsS0FBSztZQUNmLE9BQU8sRUFBRSxLQUFLO1NBQ2pCO1FBQ0Q7WUFDSSxJQUFJLEVBQUUsY0FBYztZQUNwQixXQUFXLEVBQUUsQ0FBQyxDQUFDLDBCQUEwQixDQUFDO1lBQzFDLGNBQWMsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDO1lBQy9CLFFBQVEsRUFBRSxLQUFLO1lBQ2YsT0FBTyxFQUFFLEtBQUs7U0FDakI7S0FDSixDQUFDO0FBQ0YsQ0FBQztBQUVELGdGQUFnRjtBQUNoRiwwQkFBMEI7QUFDMUIsZ0ZBQWdGO0FBRWhGLE1BQU0sQ0FBQyxNQUFNLGdCQUFnQixHQUFvQjtJQUM3QyxVQUFVLEVBQUUsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUU7SUFDekMsUUFBUSxFQUFFLElBQUk7SUFDZCxjQUFjLEVBQUUsWUFBWTtJQUM1QixTQUFTLEVBQUU7UUFDUCxVQUFVLEVBQUU7WUFDUixNQUFNLEVBQUUsRUFBRTtZQUNWLEtBQUssRUFBRSwyQkFBMkI7WUFDbEMsT0FBTyxFQUFFLElBQUk7U0FDaEI7UUFDRCxTQUFTLEVBQUU7WUFDUCxNQUFNLEVBQUUsRUFBRTtZQUNWLEtBQUssRUFBRSwwQkFBMEI7WUFDakMsT0FBTyxFQUFFLEtBQUs7U0FDakI7UUFDRCxNQUFNLEVBQUU7WUFDSixNQUFNLEVBQUUsRUFBRTtZQUNWLEtBQUssRUFBRSxrQkFBa0I7WUFDekIsT0FBTyxFQUFFLEtBQUs7U0FDakI7UUFDRCxNQUFNLEVBQUU7WUFDSixNQUFNLEVBQUUsRUFBRTtZQUNWLEtBQUssRUFBRSxRQUFRO1lBQ2YsT0FBTyxFQUFFLEtBQUs7U0FDakI7UUFDRCxXQUFXLEVBQUU7WUFDVCxNQUFNLEVBQUUsRUFBRTtZQUNWLEtBQUssRUFBRSx5QkFBeUI7WUFDaEMsT0FBTyxFQUFFLEtBQUs7WUFDZCxPQUFPLEVBQUUsK0JBQStCO1NBQzNDO1FBQ0QsTUFBTSxFQUFFO1lBQ0osTUFBTSxFQUFFLEVBQUU7WUFDVixLQUFLLEVBQUUsRUFBRTtZQUNULE9BQU8sRUFBRSxLQUFLO1lBQ2QsT0FBTyxFQUFFLDZCQUE2QjtTQUN6QztLQUNKO0lBQ0QsZUFBZSxFQUFFLENBQUM7SUFDbEIsV0FBVyxFQUFFLFVBQVU7SUFDdkIsVUFBVSxFQUFFLFNBQVM7SUFDckIsYUFBYSxFQUFFLFlBQVk7SUFDM0IsZ0JBQWdCLEVBQUUsSUFBSTtJQUN0QixnQkFBZ0IsRUFBRSxJQUFJO0lBQ3RCLHdCQUF3QixFQUFFLElBQUk7SUFDOUIsZ0JBQWdCLEVBQUUsQ0FBQyxHQUFHLDBCQUEwQixFQUFFLENBQUM7Q0FDdEQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogVGlkZUxvZyDigJQgQ29uc3RhbnRzICYgRGVmYXVsdCBWYWx1ZXNcbiAqIFNlcGFyYXRlZCBmcm9tIHR5cGVzLnRzIGZvciBjbGVhbmVyIG1vZHVsZSBvcmdhbml6YXRpb25cbiAqL1xuXG5pbXBvcnQge1xuICAgIEV2ZW5pbmdRdWVzdGlvbkNvbmZpZyxcbiAgICBUaWRlTG9nU2V0dGluZ3MsXG59IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHsgdCB9IGZyb20gJy4vaTE4bic7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBEZWZhdWx0IEV2ZW5pbmcgUXVlc3Rpb25zXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGVmYXVsdEV2ZW5pbmdRdWVzdGlvbnMoKTogRXZlbmluZ1F1ZXN0aW9uQ29uZmlnW10ge1xuICAgIHJldHVybiBbXG4gICAge1xuICAgICAgICB0eXBlOiAnZ29hbF9hbGlnbm1lbnQnLFxuICAgICAgICBzZWN0aW9uTmFtZTogdCgnaW5zaWdodC5zZWN0aW9uR29hbEFsaWduJyksXG4gICAgICAgIGluaXRpYWxNZXNzYWdlOiB0KCdldmVuaW5nLnExJyksXG4gICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgIH0sXG4gICAge1xuICAgICAgICB0eXBlOiAnc3VjY2Vzc19kaWFyeScsXG4gICAgICAgIHNlY3Rpb25OYW1lOiB0KCdpbnNpZ2h0LnNlY3Rpb25TdWNjZXNzJyksXG4gICAgICAgIGluaXRpYWxNZXNzYWdlOiB0KCdldmVuaW5nLnEyJyksXG4gICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgIH0sXG4gICAge1xuICAgICAgICB0eXBlOiAnaGFwcGluZXNzX2Vtb3Rpb24nLFxuICAgICAgICBzZWN0aW9uTmFtZTogdCgnaW5zaWdodC5zZWN0aW9uSm95RW1vdGlvbicpLFxuICAgICAgICBpbml0aWFsTWVzc2FnZTogdCgnZXZlbmluZy5xMycpLFxuICAgICAgICByZXF1aXJlZDogdHJ1ZSxcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdHlwZTogJ2FueGlldHlfYXdhcmVuZXNzJyxcbiAgICAgICAgc2VjdGlvbk5hbWU6IHQoJ2luc2lnaHQuc2VjdGlvbkFueGlldHknKSxcbiAgICAgICAgaW5pdGlhbE1lc3NhZ2U6IHQoJ2V2ZW5pbmcucTQnKSxcbiAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHR5cGU6ICd0b21vcnJvd19wbGFuJyxcbiAgICAgICAgc2VjdGlvbk5hbWU6IHQoJ2luc2lnaHQuc2VjdGlvblRvbW9ycm93JyksXG4gICAgICAgIGluaXRpYWxNZXNzYWdlOiB0KCdldmVuaW5nLnE1JyksXG4gICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgIH0sXG4gICAge1xuICAgICAgICB0eXBlOiAnZGVlcF9hbmFseXNpcycsXG4gICAgICAgIHNlY3Rpb25OYW1lOiB0KCdpbnNpZ2h0LnNlY3Rpb25EZWVwJyksXG4gICAgICAgIGluaXRpYWxNZXNzYWdlOiB0KCdldmVuaW5nLnE2JyksXG4gICAgICAgIHJlcXVpcmVkOiBmYWxzZSxcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgfSxcbiAgICB7XG4gICAgICAgIHR5cGU6ICdyZWZsZWN0aW9uJyxcbiAgICAgICAgc2VjdGlvbk5hbWU6IHQoJ2luc2lnaHQuc2VjdGlvblJlZmxlY3QnKSxcbiAgICAgICAgaW5pdGlhbE1lc3NhZ2U6IHQoJ2V2ZW5pbmcucTcnKSxcbiAgICAgICAgcmVxdWlyZWQ6IGZhbHNlLFxuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICB9LFxuICAgIHtcbiAgICAgICAgdHlwZTogJ3ByaW5jaXBsZV9leHRyYWN0JyxcbiAgICAgICAgc2VjdGlvbk5hbWU6IHQoJ2luc2lnaHQuc2VjdGlvblByaW5jaXBsZScpLFxuICAgICAgICBpbml0aWFsTWVzc2FnZTogdCgnZXZlbmluZy5xOCcpLFxuICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgIH0sXG4gICAge1xuICAgICAgICB0eXBlOiAnZnJlZV93cml0aW5nJyxcbiAgICAgICAgc2VjdGlvbk5hbWU6IHQoJ2luc2lnaHQuc2VjdGlvbkZyZWVXcml0ZScpLFxuICAgICAgICBpbml0aWFsTWVzc2FnZTogdCgnZXZlbmluZy5xOScpLFxuICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgIH0sXG5dO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRGVmYXVsdCBQbHVnaW4gU2V0dGluZ3Ncbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1NFVFRJTkdTOiBUaWRlTG9nU2V0dGluZ3MgPSB7XG4gICAgcHJvTGljZW5zZTogeyBrZXk6ICcnLCBhY3RpdmF0ZWQ6IGZhbHNlIH0sXG4gICAgbGFuZ3VhZ2U6ICd6aCcsXG4gICAgYWN0aXZlUHJvdmlkZXI6ICdvcGVucm91dGVyJyxcbiAgICBwcm92aWRlcnM6IHtcbiAgICAgICAgb3BlbnJvdXRlcjoge1xuICAgICAgICAgICAgYXBpS2V5OiAnJyxcbiAgICAgICAgICAgIG1vZGVsOiAnYW50aHJvcGljL2NsYXVkZS1zb25uZXQtNCcsXG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBhbnRocm9waWM6IHtcbiAgICAgICAgICAgIGFwaUtleTogJycsXG4gICAgICAgICAgICBtb2RlbDogJ2NsYXVkZS1zb25uZXQtNC0yMDI1MDUxNCcsXG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgZ2VtaW5pOiB7XG4gICAgICAgICAgICBhcGlLZXk6ICcnLFxuICAgICAgICAgICAgbW9kZWw6ICdnZW1pbmktMi4wLWZsYXNoJyxcbiAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBvcGVuYWk6IHtcbiAgICAgICAgICAgIGFwaUtleTogJycsXG4gICAgICAgICAgICBtb2RlbDogJ2dwdC00bycsXG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2lsaWNvbmZsb3c6IHtcbiAgICAgICAgICAgIGFwaUtleTogJycsXG4gICAgICAgICAgICBtb2RlbDogJ2RlZXBzZWVrLWFpL0RlZXBTZWVrLVYzJyxcbiAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgYmFzZVVybDogJ2h0dHBzOi8vYXBpLnNpbGljb25mbG93LmNuL3YxJyxcbiAgICAgICAgfSxcbiAgICAgICAgY3VzdG9tOiB7XG4gICAgICAgICAgICBhcGlLZXk6ICcnLFxuICAgICAgICAgICAgbW9kZWw6ICcnLFxuICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICBiYXNlVXJsOiAnaHR0cHM6Ly9hcGkuZGVlcHNlZWsuY29tL3YxJyxcbiAgICAgICAgfSxcbiAgICB9LFxuICAgIGRheUJvdW5kYXJ5SG91cjogMixcbiAgICBkYWlseUZvbGRlcjogJzAxLURhaWx5JyxcbiAgICBwbGFuRm9sZGVyOiAnMDItUGxhbicsXG4gICAgYXJjaGl2ZUZvbGRlcjogJzAzLUFyY2hpdmUnLFxuICAgIGVuYWJsZU1vcm5pbmdTT1A6IHRydWUsXG4gICAgZW5hYmxlRXZlbmluZ1NPUDogdHJ1ZSxcbiAgICBpbmNsdWRlT3B0aW9uYWxRdWVzdGlvbnM6IHRydWUsXG4gICAgZXZlbmluZ1F1ZXN0aW9uczogWy4uLmdldERlZmF1bHRFdmVuaW5nUXVlc3Rpb25zKCldLFxufTtcbiJdfQ==