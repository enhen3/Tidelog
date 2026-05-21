/**
 * First-run onboarding modal.
 */

import { App, Modal } from 'obsidian';
import { t } from '../i18n';
import type TideLogPlugin from '../main';

export class OnboardingModal extends Modal {
    private plugin: TideLogPlugin;

    constructor(app: App, plugin: TideLogPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('tl-onboarding-modal');

        const heroEl = contentEl.createDiv('tl-onboarding-hero');
        const brandEl = heroEl.createDiv('tl-onboarding-brand');
        const markEl = brandEl.createDiv('tl-onboarding-mark');
        markEl.createSpan('tl-onboarding-mark-line');
        markEl.createSpan('tl-onboarding-mark-dot');
        const brandCopyEl = brandEl.createDiv('tl-onboarding-brand-copy');
        brandCopyEl.createDiv({ cls: 'tl-onboarding-eyebrow', text: t('onboarding.brandEyebrow') });
        brandCopyEl.createDiv({ cls: 'tl-onboarding-brand-subtitle', text: t('onboarding.brandSubtitle') });

        heroEl.createEl('h2', {
            cls: 'tl-onboarding-title',
            text: t('onboarding.title'),
        });
        heroEl.createEl('p', {
            cls: 'tl-onboarding-desc',
            text: t('onboarding.desc'),
        });

        const productEl = contentEl.createDiv('tl-onboarding-product-card');
        const productHeaderEl = productEl.createDiv('tl-onboarding-product-header');
        productHeaderEl.createSpan({ cls: 'tl-onboarding-product-dot tl-onboarding-product-dot-plan' });
        productHeaderEl.createSpan({ cls: 'tl-onboarding-product-dot tl-onboarding-product-dot-review' });
        productHeaderEl.createSpan({ cls: 'tl-onboarding-product-dot tl-onboarding-product-dot-action' });
        productHeaderEl.createSpan({ cls: 'tl-onboarding-product-label', text: t('onboarding.productLabel') });
        const loopEl = productEl.createDiv('tl-onboarding-loop');
        [t('onboarding.loopPlan'), t('onboarding.loopReview'), t('onboarding.loopInsights'), t('onboarding.loopNextAction')].forEach((label) => {
            loopEl.createSpan({ cls: 'tl-onboarding-loop-pill', text: label });
        });
        productEl.createDiv({ cls: 'tl-onboarding-product-caption', text: t('onboarding.productCaption') });

        const methodEl = contentEl.createDiv('tl-onboarding-method-grid');
        this.renderMethodCard(
            methodEl,
            t('onboarding.methodPhilosophyTitle'),
            t('onboarding.methodPhilosophyDesc'),
        );
        this.renderMethodCard(
            methodEl,
            t('onboarding.methodWorkflowTitle'),
            t('onboarding.methodWorkflowDesc'),
        );
        this.renderMethodCard(
            methodEl,
            t('onboarding.methodProTitle'),
            t('onboarding.methodProDesc'),
        );

        const detailsEl = contentEl.createDiv('tl-onboarding-detail-list');
        detailsEl.createDiv({ cls: 'tl-onboarding-section-kicker', text: t('onboarding.detailKicker') });
        this.renderDetail(
            detailsEl,
            t('onboarding.detailPlanTitle'),
            t('onboarding.detailPlanDesc'),
        );
        this.renderDetail(
            detailsEl,
            t('onboarding.detailReviewTitle'),
            t('onboarding.detailReviewDesc'),
        );
        this.renderDetail(
            detailsEl,
            t('onboarding.detailInsightsTitle'),
            t('onboarding.detailInsightsDesc'),
        );

        const stepsEl = contentEl.createDiv('tl-onboarding-steps');
        this.renderStep(
            stepsEl,
            '1',
            t('onboarding.stepAiTitle'),
            t('onboarding.stepAiDesc'),
        );
        this.renderStep(
            stepsEl,
            '2',
            t('onboarding.stepReviewTitle'),
            t('onboarding.stepReviewDesc'),
        );
        this.renderStep(
            stepsEl,
            '3',
            t('onboarding.stepProTitle'),
            t('onboarding.stepProDesc'),
        );

        const buttonRow = contentEl.createDiv('tl-onboarding-buttons');

        const setupButton = buttonRow.createEl('button', {
            cls: 'tl-onboarding-primary',
            text: t('onboarding.setupBtn'),
        });
        setupButton.addEventListener('click', () => {
            void this.plugin.completeOnboarding();
            this.close();
            this.openSettings();
        });

        const reviewButton = buttonRow.createEl('button', {
            cls: 'tl-onboarding-secondary',
            text: t('onboarding.reviewBtn'),
        });
        reviewButton.addEventListener('click', () => {
            void this.plugin.completeOnboarding();
            this.close();
            void this.plugin.activateChatView('evening');
        });

        const proFooter = contentEl.createDiv('tl-onboarding-pro-footer');
        proFooter.createSpan({ cls: 'tl-onboarding-pro-copy', text: t('onboarding.proFooterText') });
        const buyLink = proFooter.createEl('a', {
            cls: 'tl-onboarding-pro-link',
            text: t('onboarding.buyLink'),
            href: this.plugin.licenseManager.getPurchaseUrl(),
        });
        buyLink.setAttr('target', '_blank');
        buyLink.addEventListener('click', () => {
            void this.plugin.completeOnboarding();
        });

        const laterButton = contentEl.createEl('button', {
            cls: 'tl-onboarding-later',
            text: t('onboarding.laterBtn'),
        });
        laterButton.addEventListener('click', () => {
            void this.plugin.completeOnboarding();
            this.close();
        });
    }

    onClose(): void {
        void this.plugin.completeOnboarding();
        this.contentEl.empty();
    }

    private renderStep(containerEl: HTMLElement, numberText: string, title: string, desc: string): void {
        const stepEl = containerEl.createDiv('tl-onboarding-step');
        stepEl.createDiv({ cls: 'tl-onboarding-step-number', text: numberText });
        const copyEl = stepEl.createDiv('tl-onboarding-step-copy');
        copyEl.createDiv({ cls: 'tl-onboarding-step-title', text: title });
        copyEl.createDiv({ cls: 'tl-onboarding-step-desc', text: desc });
    }

    private renderMethodCard(containerEl: HTMLElement, title: string, desc: string): void {
        const cardEl = containerEl.createDiv('tl-onboarding-method-card');
        cardEl.createDiv({ cls: 'tl-onboarding-method-title', text: title });
        cardEl.createDiv({ cls: 'tl-onboarding-method-desc', text: desc });
    }

    private renderDetail(containerEl: HTMLElement, title: string, desc: string): void {
        const detailEl = containerEl.createDiv('tl-onboarding-detail-item');
        detailEl.createDiv('tl-onboarding-detail-rail');
        const copyEl = detailEl.createDiv('tl-onboarding-detail-copy');
        copyEl.createDiv({ cls: 'tl-onboarding-detail-title', text: title });
        copyEl.createDiv({ cls: 'tl-onboarding-detail-desc', text: desc });
    }

    private openSettings(): void {
        const setting = (this.app as unknown as {
            setting?: { open?: () => void; openTabById?: (id: string) => void };
        }).setting;
        setting?.open?.();
        setting?.openTabById?.(this.plugin.manifest.id);
    }
}
