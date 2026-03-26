/**
 * Chat Controller - Handles message sending, free chat, intent detection, and insight triggers
 * Extracted from chat-view.ts for maintainability.
 */
import { MarkdownRenderer } from 'obsidian';
import { formatAPIError } from '../utils/error-formatter';
import { t, getLanguage } from '../i18n';
export class ChatController {
    constructor(host) {
        this.host = host;
    }
    /**
     * Detect if the user wants to update a plan
     */
    detectPlanUpdateIntent(content) {
        const planKeywords = [
            '更新计划', '修改计划', '调整计划', '改计划',
            '更新今日', '修改今日', '调整今日',
            '更新任务', '修改任务', '调整任务',
            '更新日计划', '更新周计划', '更新月计划',
            'update plan', 'modify plan', 'adjust plan', 'change plan',
            'update tasks', 'modify tasks', 'adjust tasks',
        ];
        return planKeywords.some((keyword) => content.toLowerCase().includes(keyword.toLowerCase()));
    }
    /**
     * Show plan update options as clickable buttons
     */
    showPlanUpdateOptions() {
        const h = this.host;
        const messageEl = h.createMessageElement('ai');
        const text = messageEl.createDiv();
        text.textContent = t('chat.whichPlan');
        const buttons = messageEl.createDiv('tl-plan-buttons');
        const todayBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: t('chat.updateDaily'),
        });
        todayBtn.addEventListener('click', () => {
            void h.startMorningSOP();
        });
        const weekBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: t('chat.updateWeekly'),
        });
        weekBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const effectiveDate = h.plugin.vaultManager.getEffectiveDate();
                    const weekNumber = `W${effectiveDate.format('ww')}`;
                    const monthRef = effectiveDate.format('YYYY-MM');
                    const template = h.plugin.templateManager.getWeeklyPlanTemplate(weekNumber, monthRef);
                    const file = await h.plugin.vaultManager.getOrCreateWeeklyPlan(undefined, template);
                    const leaf = h.app.workspace.getLeaf();
                    await leaf.openFile(file);
                    h.addAIMessage(t('chat.weeklyOpened'));
                }
                catch (e) {
                    h.addAIMessage(t('chat.weeklyFailed', String(e)));
                }
            })();
        });
        const monthBtn = buttons.createEl('button', {
            cls: 'tl-plan-option-btn',
            text: t('chat.updateMonthly'),
        });
        monthBtn.addEventListener('click', () => {
            void (async () => {
                try {
                    const effectiveDate = h.plugin.vaultManager.getEffectiveDate();
                    const yearMonth = effectiveDate.format('YYYY-MM');
                    const template = h.plugin.templateManager.getMonthlyPlanTemplate(yearMonth);
                    const file = await h.plugin.vaultManager.getOrCreateMonthlyPlan(undefined, template);
                    const leaf = h.app.workspace.getLeaf();
                    await leaf.openFile(file);
                    h.addAIMessage(t('chat.monthlyOpened'));
                }
                catch (e) {
                    h.addAIMessage(t('chat.monthlyFailed', String(e)));
                }
            })();
        });
        h.scrollToBottom();
    }
    /**
     * Send a message
     */
    async sendMessage() {
        const h = this.host;
        const content = h.inputEl.value.trim();
        if (!content || h.isProcessing)
            return;
        // Add user message
        h.addUserMessage(content);
        h.inputEl.value = '';
        h.inputEl.setCssProps({ '--tl-input-height': 'auto' });
        h.inputEl.dispatchEvent(new Event('input'));
        // Check for plan update intent in free chat mode (e.g. "更新计划")
        if (h.sopContext.type === 'none' && this.detectPlanUpdateIntent(content)) {
            this.showPlanUpdateOptions();
            return;
        }
        // Process based on SOP context
        if (h.sopContext.type === 'morning') {
            h.showThinkingIndicator();
            await h.morningSOP.handleResponse(content, h.sopContext, (message) => {
                h.hideThinkingIndicator();
                h.streamAIMessage(message);
            });
        }
        else if (h.sopContext.type === 'evening') {
            h.showThinkingIndicator();
            await h.eveningSOP.handleResponse(content, h.sopContext, (message) => {
                h.hideThinkingIndicator();
                h.streamAIMessage(message);
            });
        }
        else {
            // Free chat
            await this.handleFreeChat(content);
        }
    }
    /**
     * Handle free chat message
     */
    async handleFreeChat(content) {
        const h = this.host;
        h.isProcessing = true;
        h.sendButton.disabled = true;
        // Add user message to history
        h.messages.push({
            role: 'user',
            content,
            timestamp: Date.now(),
        });
        // Get AI response
        h.showThinkingIndicator();
        const messageEl = h.createMessageElement('ai');
        let fullResponse = '';
        let indicatorRemoved = false;
        try {
            const provider = h.plugin.getAIProvider();
            // Check if API key is configured
            const activeProvider = h.plugin.settings.activeProvider;
            const providerConfig = h.plugin.settings.providers[activeProvider];
            if (!providerConfig.apiKey) {
                messageEl.empty();
                void MarkdownRenderer.render(h.app, t('chat.noApiKey', activeProvider.toUpperCase()), messageEl, '', h);
                h.isProcessing = false;
                h.sendButton.disabled = false;
                return;
            }
            const userProfile = await h.plugin.vaultManager.getUserProfileContent();
            const systemPrompt = getLanguage() === 'en'
                ? `You are Flow, the user's personal growth companion. This is free chat mode.

<strategy>
Naturally assess needs from the user's words:
- Sharing emotions → empathize first: "It sounds like this made you..."
- Seeking advice → understand the full picture first, then offer a thinking framework
- Free thinking → be a thinking partner, use follow-up questions to help clarify
- Sharing good news → genuinely celebrate, help savor the joy
</strategy>

<principles>
Respond to emotions before content. Use questions to guide discovery. Notice emerging patterns. Keep to 2-4 sentences. Reply in English.
If user mentions "update plan" "modify plan" "adjust tasks", guide them to click the "Morning" button or say "update plan".
</principles>

` + (userProfile ? `<user_profile>\n${userProfile}\n</user_profile>\n\nNaturally weave your understanding into the conversation.` : '')
                : `你是 Flow，用户的个人成长伙伴。现在是自由对话模式。

<strategy>
从用户的话语中自然判断需求：
- 倾诉情绪 → 先共情陪伴："听起来这件事让你……"
- 寻求建议 → 先理解完整情况，再给思考框架
- 自由思考 → 做思考伙伴，用追问帮理清思路
- 分享好消息 → 真心为用户高兴，帮用户品味快乐
</strategy>

<principles>
先回应情绪再回应内容。用提问引导发现。留意浮现的模式。每次 2-4 句话。中文回复。
如果用户提到"更新计划""修改计划""调整任务"，引导点击上方"晨间"按钮或说"更新计划"。
</principles>

` + (userProfile ? `<user_profile>\n${userProfile}\n</user_profile>\n\n自然地将了解融入对话。` : '');
            await provider.sendMessage(h.messages, systemPrompt, (chunk) => {
                if (!indicatorRemoved) {
                    h.hideThinkingIndicator();
                    indicatorRemoved = true;
                }
                fullResponse += chunk;
                messageEl.empty();
                void MarkdownRenderer.render(h.app, fullResponse, messageEl, '', h);
                h.scrollToBottom();
            });
            // Add to message history
            h.messages.push({
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
            });
        }
        catch (error) {
            h.hideThinkingIndicator();
            messageEl.empty();
            const friendlyMsg = formatAPIError(error, this.host.plugin.settings.activeProvider);
            void MarkdownRenderer.render(h.app, friendlyMsg, messageEl, '', h);
            messageEl.addClass('tl-message-error');
        }
        h.isProcessing = false;
        h.sendButton.disabled = false;
    }
    /**
     * Trigger insight generation (public, called from main.ts)
     */
    triggerInsight(type) {
        const h = this.host;
        const label = type === 'weekly' ? t('chat.thisWeek') : t('chat.thisMonth');
        h.addAIMessage(t('chat.generatingInsight', label));
        const messageEl = h.createMessageElement('ai');
        const insightService = h.plugin.insightService;
        const handler = type === 'weekly'
            ? insightService.generateWeeklyInsight.bind(insightService)
            : insightService.generateMonthlyInsight.bind(insightService);
        void handler((chunk) => {
            // Append chunk to the message element
            messageEl.empty();
            // Accumulate content
            const existing = messageEl.getAttribute('data-content') || '';
            const newContent = existing + chunk;
            messageEl.setAttribute('data-content', newContent);
            void MarkdownRenderer.render(h.app, newContent, messageEl, '', h);
            h.scrollToBottom();
        }, (fullReport) => {
            if (fullReport) {
                // Final render — strip extraction tags
                messageEl.empty();
                const cleanReport = fullReport
                    .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                    .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                    .trim();
                void MarkdownRenderer.render(h.app, cleanReport, messageEl, '', h);
                h.addAIMessage(t('chat.reportSaved'));
            }
            h.scrollToBottom();
        });
    }
    /**
     * Trigger profile suggestion generation
     */
    triggerProfileSuggestion() {
        const h = this.host;
        h.addAIMessage(t('chat.analyzingProfile'));
        const messageEl = h.createMessageElement('ai');
        const insightService = h.plugin.insightService;
        let fullContent = '';
        void insightService.generateProfileSuggestions((chunk) => {
            fullContent += chunk;
            messageEl.empty();
            // Hide <profile_update> and extraction tags from display
            const displayContent = fullContent
                .replace(/<profile_update>[\s\S]*?<\/profile_update>/g, '')
                .replace(/<new_patterns>[\s\S]*?<\/new_patterns>/g, '')
                .replace(/<new_principles>[\s\S]*?<\/new_principles>/g, '')
                .trim();
            void MarkdownRenderer.render(h.app, displayContent, messageEl, '', h);
            h.scrollToBottom();
        }, (fullResponse) => {
            if (fullResponse) {
                // Show save confirmation
                const hasUpdate = /<profile_update>/.test(fullResponse);
                if (hasUpdate) {
                    h.addAIMessage(t('chat.profileUpdated'));
                }
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdC1jb250cm9sbGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2hhdC1jb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7R0FHRztBQUVILE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUk1QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFHMUQsT0FBTyxFQUFFLENBQUMsRUFBRSxXQUFXLEVBQUUsTUFBTSxTQUFTLENBQUM7QUEyQnpDLE1BQU0sT0FBTyxjQUFjO0lBQ3ZCLFlBQW9CLElBQXdCO1FBQXhCLFNBQUksR0FBSixJQUFJLENBQW9CO0lBQUksQ0FBQztJQUVqRDs7T0FFRztJQUNILHNCQUFzQixDQUFDLE9BQWU7UUFDbEMsTUFBTSxZQUFZLEdBQUc7WUFDakIsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsS0FBSztZQUM3QixNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU07WUFDdEIsTUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNO1lBQ3RCLE9BQU8sRUFBRSxPQUFPLEVBQUUsT0FBTztZQUN6QixhQUFhLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSxhQUFhO1lBQzFELGNBQWMsRUFBRSxjQUFjLEVBQUUsY0FBYztTQUNqRCxDQUFDO1FBQ0YsT0FBTyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakcsQ0FBQztJQUVEOztPQUVHO0lBQ0gscUJBQXFCO1FBQ2pCLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUM7UUFDcEIsTUFBTSxTQUFTLEdBQUcsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRS9DLE1BQU0sSUFBSSxHQUFHLFNBQVMsQ0FBQyxT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QUNKLENBQUM7SUFDTixDQUFDO0NBQ0oiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENoYXQgQ29udHJvbGxlciAtIEhhbmRsZXMgbWVzc2FnZSBzZW5kaW5nLCBmcmVlIGNoYXQsIGludGVudCBkZXRlY3Rpb24sIGFuZCBpbnNpZ2h0IHRyaWdnZXJzXG4gKiBFeHRyYWN0ZWQgZnJvbSBjaGF0LXZpZXcudHMgZm9yIG1haW50YWluYWJpbGl0eS5cbiAqL1xuXG5pbXBvcnQgeyBNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnb2JzaWRpYW4nO1xuaW1wb3J0IHR5cGUgVGlkZUxvZ1BsdWdpbiBmcm9tICcuLi9tYWluJztcbmltcG9ydCB0eXBlIHsgQXBwLCBDb21wb25lbnQgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgdHlwZSB7IENoYXRNZXNzYWdlLCBTT1BDb250ZXh0IH0gZnJvbSAnLi4vdHlwZXMnO1xuaW1wb3J0IHsgZm9ybWF0QVBJRXJyb3IgfSBmcm9tICcuLi91dGlscy9lcnJvci1mb3JtYXR0ZXInO1xuaW1wb3J0IHR5cGUgeyBNb3JuaW5nU09QIH0gZnJvbSAnLi4vc29wL21vcm5pbmctc29wJztcbmltcG9ydCB0eXBlIHsgRXZlbmluZ1NPUCB9IGZyb20gJy4uL3NvcC9ldmVuaW5nLXNvcCc7XG5pbXBvcnQgeyB0LCBnZXRMYW5ndWFnZSB9IGZyb20gJy4uL2kxOG4nO1xuXG4vKiogTWluaW1hbCBpbnRlcmZhY2UgZm9yIHRoZSBob3N0IHZpZXcgdGhhdCBvd25zIHRoaXMgY29udHJvbGxlci4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQ2hhdENvbnRyb2xsZXJIb3N0IGV4dGVuZHMgQ29tcG9uZW50IHtcbiAgICBwbHVnaW46IFRpZGVMb2dQbHVnaW47XG4gICAgYXBwOiBBcHA7XG4gICAgbWVzc2FnZXM6IENoYXRNZXNzYWdlW107XG4gICAgc29wQ29udGV4dDogU09QQ29udGV4dDtcbiAgICBxdWlja1VwZGF0ZU1vZGU6IGJvb2xlYW47XG4gICAgaW5wdXRFbDogSFRNTFRleHRBcmVhRWxlbWVudDtcbiAgICBzZW5kQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudDtcbiAgICBpc1Byb2Nlc3Npbmc6IGJvb2xlYW47XG4gICAgbWVzc2FnZXNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG4gICAgYWRkVXNlck1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogdm9pZDtcbiAgICBhZGRBSU1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogdm9pZDtcbiAgICBzdHJlYW1BSU1lc3NhZ2UoY29udGVudDogc3RyaW5nKTogdm9pZDtcbiAgICBjcmVhdGVNZXNzYWdlRWxlbWVudCh0eXBlOiAndXNlcicgfCAnYWknKTogSFRNTEVsZW1lbnQ7XG4gICAgc2Nyb2xsVG9Cb3R0b20oKTogdm9pZDtcbiAgICBzdGFydE1vcm5pbmdTT1AoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBzdGFydEV2ZW5pbmdTT1AoKTogUHJvbWlzZTx2b2lkPjtcbiAgICBzaG93VGhpbmtpbmdJbmRpY2F0b3IoKTogdm9pZDtcbiAgICBoaWRlVGhpbmtpbmdJbmRpY2F0b3IoKTogdm9pZDtcbiAgICBtb3JuaW5nU09QOiBNb3JuaW5nU09QO1xuICAgIGV2ZW5pbmdTT1A6IEV2ZW5pbmdTT1A7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29udHJvbGxlciB7XG4gICAgY29uc3RydWN0b3IocHJpdmF0ZSBob3N0OiBDaGF0Q29udHJvbGxlckhvc3QpIHsgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZWN0IGlmIHRoZSB1c2VyIHdhbnRzIHRvIHVwZGF0ZSBhIHBsYW5cbiAgICAgKi9cbiAgICBkZXRlY3RQbGFuVXBkYXRlSW50ZW50KGNvbnRlbnQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICBjb25zdCBwbGFuS2V5d29yZHMgPSBbXG4gICAgICAgICAgICAn5pu05paw6K6h5YiSJywgJ+S/ruaUueiuoeWIkicsICfosIPmlbTorqHliJInLCAn5pS56K6h5YiSJyxcbiAgICAgICAgICAgICfmm7TmlrDku4rml6UnLCAn5L+u5pS55LuK5pelJywgJ+iwg+aVtOS7iuaXpScsXG4gICAgICAgICAgICAn5pu05paw5Lu75YqhJywgJ+S/ruaUueS7u+WKoScsICfosIPmlbTku7vliqEnLFxuICAgICAgICAgICAgJ+abtOaWsOaXpeiuoeWIkicsICfmm7TmlrDlkajorqHliJInLCAn5pu05paw5pyI6K6h5YiSJyxcbiAgICAgICAgICAgICd1cGRhdGUgcGxhbicsICdtb2RpZnkgcGxhbicsICdhZGp1c3QgcGxhbicsICdjaGFuZ2UgcGxhbicsXG4gICAgICAgICAgICAndXBkYXRlIHRhc2tzJywgJ21vZGlmeSB0YXNrcycsICdhZGp1c3QgdGFza3MnLFxuICAgICAgICBdO1xuICAgICAgICByZXR1cm4gcGxhbktleXdvcmRzLnNvbWUoKGtleXdvcmQpID0+IGNvbnRlbnQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhrZXl3b3JkLnRvTG93ZXJDYXNlKCkpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaG93IHBsYW4gdXBkYXRlIG9wdGlvbnMgYXMgY2xpY2thYmxlIGJ1dHRvbnNcbiAgICAgKi9cbiAgICBzaG93UGxhblVwZGF0ZU9wdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2VFbCA9IGguY3JlYXRlTWVzc2FnZUVsZW1lbnQoJ2FpJyk7XG5cbiAgICAgICAgY29uc3QgdGV4dCA9IG1lc3NhZ2VFbC5jcmVhdGVEaXYoKTtcbiAgICAgICAgdGV4dC50ZXh0Q29udGVudCA9IHQoJ2NoYXQud2hpY2hQbGFuJyk7XG5cbiAgICAgICAgY29uc3QgYnV0dG9ucyA9IG1lc3NhZ2VFbC5jcmVhdGVEaXYoJ3RsLXBsYW4tYnV0dG9ucycpO1xuXG4gICAgICAgIGNvbnN0IHRvZGF5QnRuID0gYnV0dG9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGxhbi1vcHRpb24tYnRuJyxcbiAgICAgICAgICAgIHRleHQ6IHQoJ2NoYXQudXBkYXRlRGFpbHknKSxcbiAgICAgICAgfSk7XG4gICAgICAgIHRvZGF5QnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgdm9pZCBoLnN0YXJ0TW9ybmluZ1NPUCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCB3ZWVrQnRuID0gYnV0dG9ucy5jcmVhdGVFbCgnYnV0dG9uJywge1xuICAgICAgICAgICAgY2xzOiAndGwtcGxhbi1vcHRpb24tYnRuJyxcbiAgICAgICAgICAgIHRleHQ6IHQoJ2NoYXQudXBkYXRlV2Vla2x5JyksXG4gICAgICAgIH0pO1xuICAgICAgICB3ZWVrQnRuLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVmZmVjdGl2ZURhdGUgPSBoLnBsdWdpbi52YXVsdE1hbmFnZXIuZ2V0RWZmZWN0aXZlRGF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB3ZWVrTnVtYmVyID0gYFcke2VmZmVjdGl2ZURhdGUuZm9ybWF0KCd3dycpfWA7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IG1vbnRoUmVmID0gZWZmZWN0aXZlRGF0ZS5mb3JtYXQoJ1lZWVktTU0nKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBoLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZ2V0V2Vla2x5UGxhblRlbXBsYXRlKHdlZWtOdW1iZXIsIG1vbnRoUmVmKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IGF3YWl0IGgucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRPckNyZWF0ZVdlZWtseVBsYW4odW5kZWZpbmVkLCB0ZW1wbGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxlYWYgPSBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBsZWFmLm9wZW5GaWxlKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICBoLmFkZEFJTWVzc2FnZSh0KCdjaGF0LndlZWtseU9wZW5lZCcpKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgICAgIGguYWRkQUlNZXNzYWdlKHQoJ2NoYXQud2Vla2x5RmFpbGVkJywgU3RyaW5nKGUpKSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSkoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgbW9udGhCdG4gPSBidXR0b25zLmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICBjbHM6ICd0bC1wbGFuLW9wdGlvbi1idG4nLFxuICAgICAgICAgICAgdGV4dDogdCgnY2hhdC51cGRhdGVNb250aGx5JyksXG4gICAgICAgIH0pO1xuICAgICAgICBtb250aEJ0bi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIHZvaWQgKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBlZmZlY3RpdmVEYXRlID0gaC5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldEVmZmVjdGl2ZURhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgeWVhck1vbnRoID0gZWZmZWN0aXZlRGF0ZS5mb3JtYXQoJ1lZWVktTU0nKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBoLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZ2V0TW9udGhseVBsYW5UZW1wbGF0ZSh5ZWFyTW9udGgpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmaWxlID0gYXdhaXQgaC5wbHVnaW4udmF1bHRNYW5hZ2VyLmdldE9yQ3JlYXRlTW9udGhseVBsYW4odW5kZWZpbmVkLCB0ZW1wbGF0ZSk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGxlYWYgPSBoLmFwcC53b3Jrc3BhY2UuZ2V0TGVhZigpO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCBsZWFmLm9wZW5GaWxlKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICBoLmFkZEFJTWVzc2FnZSh0KCdjaGF0Lm1vbnRobHlPcGVuZWQnKSk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBoLmFkZEFJTWVzc2FnZSh0KCdjaGF0Lm1vbnRobHlGYWlsZWQnLCBTdHJpbmcoZSkpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSgpO1xuICAgICAgICB9KTtcblxuICAgICAgICBoLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VuZCBhIG1lc3NhZ2VcbiAgICAgKi9cbiAgICBhc3luYyBzZW5kTWVzc2FnZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgY29uc3QgY29udGVudCA9IGguaW5wdXRFbC52YWx1ZS50cmltKCk7XG4gICAgICAgIGlmICghY29udGVudCB8fCBoLmlzUHJvY2Vzc2luZykgcmV0dXJuO1xuXG4gICAgICAgIC8vIEFkZCB1c2VyIG1lc3NhZ2VcbiAgICAgICAgaC5hZGRVc2VyTWVzc2FnZShjb250ZW50KTtcbiAgICAgICAgaC5pbnB1dEVsLnZhbHVlID0gJyc7XG4gICAgICAgIGguaW5wdXRFbC5zZXRDc3NQcm9wcyh7ICctLXRsLWlucHV0LWhlaWdodCc6ICdhdXRvJyB9KTtcbiAgICAgICAgaC5pbnB1dEVsLmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcpKTtcblxuXG5cbiAgICAgICAgLy8gQ2hlY2sgZm9yIHBsYW4gdXBkYXRlIGludGVudCBpbiBmcmVlIGNoYXQgbW9kZSAoZS5nLiBcIuabtOaWsOiuoeWIklwiKVxuICAgICAgICBpZiAoaC5zb3BDb250ZXh0LnR5cGUgPT09ICdub25lJyAmJiB0aGlzLmRldGVjdFBsYW5VcGRhdGVJbnRlbnQoY29udGVudCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2hvd1BsYW5VcGRhdGVPcHRpb25zKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcm9jZXNzIGJhc2VkIG9uIFNPUCBjb250ZXh0XG4gICAgICAgIGlmIChoLnNvcENvbnRleHQudHlwZSA9PT0gJ21vcm5pbmcnKSB7XG4gICAgICAgICAgICBoLnNob3dUaGlua2luZ0luZGljYXRvcigpO1xuICAgICAgICAgICAgYXdhaXQgaC5tb3JuaW5nU09QLmhhbmRsZVJlc3BvbnNlKGNvbnRlbnQsIGguc29wQ29udGV4dCwgKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGguaGlkZVRoaW5raW5nSW5kaWNhdG9yKCk7XG4gICAgICAgICAgICAgICAgaC5zdHJlYW1BSU1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChoLnNvcENvbnRleHQudHlwZSA9PT0gJ2V2ZW5pbmcnKSB7XG4gICAgICAgICAgICBoLnNob3dUaGlua2luZ0luZGljYXRvcigpO1xuICAgICAgICAgICAgYXdhaXQgaC5ldmVuaW5nU09QLmhhbmRsZVJlc3BvbnNlKGNvbnRlbnQsIGguc29wQ29udGV4dCwgKG1lc3NhZ2U6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGguaGlkZVRoaW5raW5nSW5kaWNhdG9yKCk7XG4gICAgICAgICAgICAgICAgaC5zdHJlYW1BSU1lc3NhZ2UobWVzc2FnZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEZyZWUgY2hhdFxuICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVGcmVlQ2hhdChjb250ZW50KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZSBmcmVlIGNoYXQgbWVzc2FnZVxuICAgICAqL1xuICAgIHByaXZhdGUgYXN5bmMgaGFuZGxlRnJlZUNoYXQoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgICAgIGNvbnN0IGggPSB0aGlzLmhvc3Q7XG4gICAgICAgIGguaXNQcm9jZXNzaW5nID0gdHJ1ZTtcbiAgICAgICAgaC5zZW5kQnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcblxuICAgICAgICAvLyBBZGQgdXNlciBtZXNzYWdlIHRvIGhpc3RvcnlcbiAgICAgICAgaC5tZXNzYWdlcy5wdXNoKHtcbiAgICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICAgIGNvbnRlbnQsXG4gICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEdldCBBSSByZXNwb25zZVxuICAgICAgICBoLnNob3dUaGlua2luZ0luZGljYXRvcigpO1xuICAgICAgICBjb25zdCBtZXNzYWdlRWwgPSBoLmNyZWF0ZU1lc3NhZ2VFbGVtZW50KCdhaScpO1xuICAgICAgICBsZXQgZnVsbFJlc3BvbnNlID0gJyc7XG4gICAgICAgIGxldCBpbmRpY2F0b3JSZW1vdmVkID0gZmFsc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IHByb3ZpZGVyID0gaC5wbHVnaW4uZ2V0QUlQcm92aWRlcigpO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBBUEkga2V5IGlzIGNvbmZpZ3VyZWRcbiAgICAgICAgICAgIGNvbnN0IGFjdGl2ZVByb3ZpZGVyID0gaC5wbHVnaW4uc2V0dGluZ3MuYWN0aXZlUHJvdmlkZXI7XG4gICAgICAgICAgICBjb25zdCBwcm92aWRlckNvbmZpZyA9IGgucGx1Z2luLnNldHRpbmdzLnByb3ZpZGVyc1thY3RpdmVQcm92aWRlcl07XG4gICAgICAgICAgICBpZiAoIXByb3ZpZGVyQ29uZmlnLmFwaUtleSkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIHZvaWQgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIoXG4gICAgICAgICAgICAgICAgICAgIGguYXBwLFxuICAgICAgICAgICAgICAgICAgICB0KCdjaGF0Lm5vQXBpS2V5JywgYWN0aXZlUHJvdmlkZXIudG9VcHBlckNhc2UoKSksXG4gICAgICAgICAgICAgICAgICAgIG1lc3NhZ2VFbCxcbiAgICAgICAgICAgICAgICAgICAgJycsXG4gICAgICAgICAgICAgICAgICAgIGhcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGguaXNQcm9jZXNzaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgaC5zZW5kQnV0dG9uLmRpc2FibGVkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB1c2VyUHJvZmlsZSA9IGF3YWl0IGgucGx1Z2luLnZhdWx0TWFuYWdlci5nZXRVc2VyUHJvZmlsZUNvbnRlbnQoKTtcblxuICAgICAgICAgICAgY29uc3Qgc3lzdGVtUHJvbXB0ID0gZ2V0TGFuZ3VhZ2UoKSA9PT0gJ2VuJ1xuICAgICAgICAgICAgICAgID8gYFlvdSBhcmUgRmxvdywgdGhlIHVzZXIncyBwZXJzb25hbCBncm93dGggY29tcGFuaW9uLiBUaGlzIGlzIGZyZWUgY2hhdCBtb2RlLlxuXG48c3RyYXRlZ3k+XG5OYXR1cmFsbHkgYXNzZXNzIG5lZWRzIGZyb20gdGhlIHVzZXIncyB3b3Jkczpcbi0gU2hhcmluZyBlbW90aW9ucyDihpIgZW1wYXRoaXplIGZpcnN0OiBcIkl0IHNvdW5kcyBsaWtlIHRoaXMgbWFkZSB5b3UuLi5cIlxuLSBTZWVraW5nIGFkdmljZSDihpIgdW5kZXJzdGFuZCB0aGUgZnVsbCBwaWN0dXJlIGZpcnN0LCB0aGVuIG9mZmVyIGEgdGhpbmtpbmcgZnJhbWV3b3JrXG4tIEZyZWUgdGhpbmtpbmcg4oaSIGJlIGEgdGhpbmtpbmcgcGFydG5lciwgdXNlIGZvbGxvdy11cCBxdWVzdGlvbnMgdG8gaGVscCBjbGFyaWZ5XG4tIFNoYXJpbmcgZ29vZCBuZXdzIOKGkiBnZW51aW5lbHkgY2VsZWJyYXRlLCBoZWxwIHNhdm9yIHRoZSBqb3lcbjwvc3RyYXRlZ3k+XG5cbjxwcmluY2lwbGVzPlxuUmVzcG9uZCB0byBlbW90aW9ucyBiZWZvcmUgY29udGVudC4gVXNlIHF1ZXN0aW9ucyB0byBndWlkZSBkaXNjb3ZlcnkuIE5vdGljZSBlbWVyZ2luZyBwYXR0ZXJucy4gS2VlcCB0byAyLTQgc2VudGVuY2VzLiBSZXBseSBpbiBFbmdsaXNoLlxuSWYgdXNlciBtZW50aW9ucyBcInVwZGF0ZSBwbGFuXCIgXCJtb2RpZnkgcGxhblwiIFwiYWRqdXN0IHRhc2tzXCIsIGd1aWRlIHRoZW0gdG8gY2xpY2sgdGhlIFwiTW9ybmluZ1wiIGJ1dHRvbiBvciBzYXkgXCJ1cGRhdGUgcGxhblwiLlxuPC9wcmluY2lwbGVzPlxuXG5gICsgKHVzZXJQcm9maWxlID8gYDx1c2VyX3Byb2ZpbGU+XFxuJHt1c2VyUHJvZmlsZX1cXG48L3VzZXJfcHJvZmlsZT5cXG5cXG5OYXR1cmFsbHkgd2VhdmUgeW91ciB1bmRlcnN0YW5kaW5nIGludG8gdGhlIGNvbnZlcnNhdGlvbi5gIDogJycpXG4gICAgICAgICAgICAgICAgOiBg5L2g5pivIEZsb3fvvIznlKjmiLfnmoTkuKrkurrmiJDplb/kvJnkvLTjgILnjrDlnKjmmK/oh6rnlLHlr7nor53mqKHlvI/jgIJcblxuPHN0cmF0ZWd5Plxu5LuO55So5oi355qE6K+d6K+t5Lit6Ieq54S25Yik5pat6ZyA5rGC77yaXG4tIOWAvuivieaDhee7qiDihpIg5YWI5YWx5oOF6Zmq5Ly077yaXCLlkKzotbfmnaXov5nku7bkuovorqnkvaDigKbigKZcIlxuLSDlr7vmsYLlu7rorq4g4oaSIOWFiOeQhuino+WujOaVtOaDheWGte+8jOWGjee7meaAneiAg+ahhuaetlxuLSDoh6rnlLHmgJ3ogIMg4oaSIOWBmuaAneiAg+S8meS8tO+8jOeUqOi/vemXruW4rueQhua4heaAnei3r1xuLSDliIbkuqvlpb3mtojmga8g4oaSIOecn+W/g+S4uueUqOaIt+mrmOWFtO+8jOW4rueUqOaIt+WTgeWRs+W/q+S5kFxuPC9zdHJhdGVneT5cblxuPHByaW5jaXBsZXM+XG7lhYjlm57lupTmg4Xnu6rlho3lm57lupTlhoXlrrnjgILnlKjmj5Dpl67lvJXlr7zlj5HnjrDjgILnlZnmhI/mta7njrDnmoTmqKHlvI/jgILmr4/mrKEgMi00IOWPpeivneOAguS4reaWh+WbnuWkjeOAglxu5aaC5p6c55So5oi35o+Q5YiwXCLmm7TmlrDorqHliJJcIlwi5L+u5pS56K6h5YiSXCJcIuiwg+aVtOS7u+WKoVwi77yM5byV5a+854K55Ye75LiK5pa5XCLmmajpl7RcIuaMiemSruaIluivtFwi5pu05paw6K6h5YiSXCLjgIJcbjwvcHJpbmNpcGxlcz5cblxuYCArICh1c2VyUHJvZmlsZSA/IGA8dXNlcl9wcm9maWxlPlxcbiR7dXNlclByb2ZpbGV9XFxuPC91c2VyX3Byb2ZpbGU+XFxuXFxu6Ieq54S25Zyw5bCG5LqG6Kej6J6N5YWl5a+56K+d44CCYCA6ICcnKTtcblxuICAgICAgICAgICAgYXdhaXQgcHJvdmlkZXIuc2VuZE1lc3NhZ2UoaC5tZXNzYWdlcywgc3lzdGVtUHJvbXB0LCAoY2h1bmspID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIWluZGljYXRvclJlbW92ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgaC5oaWRlVGhpbmtpbmdJbmRpY2F0b3IoKTtcbiAgICAgICAgICAgICAgICAgICAgaW5kaWNhdG9yUmVtb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZ1bGxSZXNwb25zZSArPSBjaHVuaztcbiAgICAgICAgICAgICAgICBtZXNzYWdlRWwuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICB2b2lkIE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKGguYXBwLCBmdWxsUmVzcG9uc2UsIG1lc3NhZ2VFbCwgJycsIGgpO1xuICAgICAgICAgICAgICAgIGguc2Nyb2xsVG9Cb3R0b20oKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBBZGQgdG8gbWVzc2FnZSBoaXN0b3J5XG4gICAgICAgICAgICBoLm1lc3NhZ2VzLnB1c2goe1xuICAgICAgICAgICAgICAgIHJvbGU6ICdhc3Npc3RhbnQnLFxuICAgICAgICAgICAgICAgIGNvbnRlbnQ6IGZ1bGxSZXNwb25zZSxcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGguaGlkZVRoaW5raW5nSW5kaWNhdG9yKCk7XG4gICAgICAgICAgICBtZXNzYWdlRWwuZW1wdHkoKTtcbiAgICAgICAgICAgIGNvbnN0IGZyaWVuZGx5TXNnID0gZm9ybWF0QVBJRXJyb3IoZXJyb3IsIHRoaXMuaG9zdC5wbHVnaW4uc2V0dGluZ3MuYWN0aXZlUHJvdmlkZXIpO1xuICAgICAgICAgICAgdm9pZCBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihoLmFwcCwgZnJpZW5kbHlNc2csIG1lc3NhZ2VFbCwgJycsIGgpO1xuICAgICAgICAgICAgbWVzc2FnZUVsLmFkZENsYXNzKCd0bC1tZXNzYWdlLWVycm9yJyk7XG4gICAgICAgIH1cblxuICAgICAgICBoLmlzUHJvY2Vzc2luZyA9IGZhbHNlO1xuICAgICAgICBoLnNlbmRCdXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcbiAgICB9XG5cblxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlciBpbnNpZ2h0IGdlbmVyYXRpb24gKHB1YmxpYywgY2FsbGVkIGZyb20gbWFpbi50cylcbiAgICAgKi9cbiAgICB0cmlnZ2VySW5zaWdodCh0eXBlOiAnd2Vla2x5JyB8ICdtb250aGx5Jyk6IHZvaWQge1xuICAgICAgICBjb25zdCBoID0gdGhpcy5ob3N0O1xuICAgICAgICBjb25zdCBsYWJlbCA9IHR5cGUgPT09ICd3ZWVrbHknID8gdCgnY2hhdC50aGlzV2VlaycpIDogdCgnY2hhdC50aGlzTW9udGgnKTtcbiAgICAgICAgaC5hZGRBSU1lc3NhZ2UodCgnY2hhdC5nZW5lcmF0aW5nSW5zaWdodCcsIGxhYmVsKSk7XG5cbiAgICAgICAgY29uc3QgbWVzc2FnZUVsID0gaC5jcmVhdGVNZXNzYWdlRWxlbWVudCgnYWknKTtcbiAgICAgICAgY29uc3QgaW5zaWdodFNlcnZpY2UgPSBoLnBsdWdpbi5pbnNpZ2h0U2VydmljZTtcblxuICAgICAgICBjb25zdCBoYW5kbGVyID0gdHlwZSA9PT0gJ3dlZWtseSdcbiAgICAgICAgICAgID8gaW5zaWdodFNlcnZpY2UuZ2VuZXJhdGVXZWVrbHlJbnNpZ2h0LmJpbmQoaW5zaWdodFNlcnZpY2UpXG4gICAgICAgICAgICA6IGluc2lnaHRTZXJ2aWNlLmdlbmVyYXRlTW9udGhseUluc2lnaHQuYmluZChpbnNpZ2h0U2VydmljZSk7XG5cbiAgICAgICAgdm9pZCBoYW5kbGVyKFxuICAgICAgICAgICAgKGNodW5rOiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBBcHBlbmQgY2h1bmsgdG8gdGhlIG1lc3NhZ2UgZWxlbWVudFxuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIC8vIEFjY3VtdWxhdGUgY29udGVudFxuICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nID0gbWVzc2FnZUVsLmdldEF0dHJpYnV0ZSgnZGF0YS1jb250ZW50JykgfHwgJyc7XG4gICAgICAgICAgICAgICAgY29uc3QgbmV3Q29udGVudCA9IGV4aXN0aW5nICsgY2h1bms7XG4gICAgICAgICAgICAgICAgbWVzc2FnZUVsLnNldEF0dHJpYnV0ZSgnZGF0YS1jb250ZW50JywgbmV3Q29udGVudCk7XG4gICAgICAgICAgICAgICAgdm9pZCBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihoLmFwcCwgbmV3Q29udGVudCwgbWVzc2FnZUVsLCAnJywgaCk7XG4gICAgICAgICAgICAgICAgaC5zY3JvbGxUb0JvdHRvbSgpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIChmdWxsUmVwb3J0OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZnVsbFJlcG9ydCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaW5hbCByZW5kZXIg4oCUIHN0cmlwIGV4dHJhY3Rpb24gdGFnc1xuICAgICAgICAgICAgICAgICAgICBtZXNzYWdlRWwuZW1wdHkoKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW5SZXBvcnQgPSBmdWxsUmVwb3J0XG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvPG5ld19wYXR0ZXJucz5bXFxzXFxTXSo/PFxcL25ld19wYXR0ZXJucz4vZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvPG5ld19wcmluY2lwbGVzPltcXHNcXFNdKj88XFwvbmV3X3ByaW5jaXBsZXM+L2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRyaW0oKTtcbiAgICAgICAgICAgICAgICAgICAgdm9pZCBNYXJrZG93blJlbmRlcmVyLnJlbmRlcihoLmFwcCwgY2xlYW5SZXBvcnQsIG1lc3NhZ2VFbCwgJycsIGgpO1xuICAgICAgICAgICAgICAgICAgICBoLmFkZEFJTWVzc2FnZSh0KCdjaGF0LnJlcG9ydFNhdmVkJykpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBoLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJpZ2dlciBwcm9maWxlIHN1Z2dlc3Rpb24gZ2VuZXJhdGlvblxuICAgICAqL1xuICAgIHRyaWdnZXJQcm9maWxlU3VnZ2VzdGlvbigpOiB2b2lkIHtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuaG9zdDtcbiAgICAgICAgaC5hZGRBSU1lc3NhZ2UodCgnY2hhdC5hbmFseXppbmdQcm9maWxlJykpO1xuXG4gICAgICAgIGNvbnN0IG1lc3NhZ2VFbCA9IGguY3JlYXRlTWVzc2FnZUVsZW1lbnQoJ2FpJyk7XG4gICAgICAgIGNvbnN0IGluc2lnaHRTZXJ2aWNlID0gaC5wbHVnaW4uaW5zaWdodFNlcnZpY2U7XG4gICAgICAgIGxldCBmdWxsQ29udGVudCA9ICcnO1xuXG4gICAgICAgIHZvaWQgaW5zaWdodFNlcnZpY2UuZ2VuZXJhdGVQcm9maWxlU3VnZ2VzdGlvbnMoXG4gICAgICAgICAgICAoY2h1bms6IHN0cmluZykgPT4ge1xuICAgICAgICAgICAgICAgIGZ1bGxDb250ZW50ICs9IGNodW5rO1xuICAgICAgICAgICAgICAgIG1lc3NhZ2VFbC5lbXB0eSgpO1xuICAgICAgICAgICAgICAgIC8vIEhpZGUgPHByb2ZpbGVfdXBkYXRlPiBhbmQgZXh0cmFjdGlvbiB0YWdzIGZyb20gZGlzcGxheVxuICAgICAgICAgICAgICAgIGNvbnN0IGRpc3BsYXlDb250ZW50ID0gZnVsbENvbnRlbnRcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLzxwcm9maWxlX3VwZGF0ZT5bXFxzXFxTXSo/PFxcL3Byb2ZpbGVfdXBkYXRlPi9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLzxuZXdfcGF0dGVybnM+W1xcc1xcU10qPzxcXC9uZXdfcGF0dGVybnM+L2csICcnKVxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvPG5ld19wcmluY2lwbGVzPltcXHNcXFNdKj88XFwvbmV3X3ByaW5jaXBsZXM+L2csICcnKVxuICAgICAgICAgICAgICAgICAgICAudHJpbSgpO1xuICAgICAgICAgICAgICAgIHZvaWQgTWFya2Rvd25SZW5kZXJlci5yZW5kZXIoaC5hcHAsIGRpc3BsYXlDb250ZW50LCBtZXNzYWdlRWwsICcnLCBoKTtcbiAgICAgICAgICAgICAgICBoLnNjcm9sbFRvQm90dG9tKCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKGZ1bGxSZXNwb25zZTogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZ1bGxSZXNwb25zZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTaG93IHNhdmUgY29uZmlybWF0aW9uXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhc1VwZGF0ZSA9IC88cHJvZmlsZV91cGRhdGU+Ly50ZXN0KGZ1bGxSZXNwb25zZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChoYXNVcGRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGguYWRkQUlNZXNzYWdlKHQoJ2NoYXQucHJvZmlsZVVwZGF0ZWQnKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgfVxufVxuIl19