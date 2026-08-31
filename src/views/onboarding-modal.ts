/**
 * 首次使用引导。
 *
 * 这一版是重做，不是修补。上一版 932 字符、42 条文案、4 个按钮、需要滚动，
 * 其中「三个入口 / 三个步骤 / 方法卡」三组 19 条 454 字在讲同一件事的三个切面。
 * 三轮修补没有一轮把内容变短，只是让滚动条更明显。
 *
 * 现在先问一个会真正改变首用路径的问题：用户是否已有日记。
 * - 有旧日记：先说明隐私，再让用户确认文件夹，最后生成并保存画像。
 * - 没有旧日记：先说明「计划 → 复盘 → 洞察」如何从零开始，再由用户选择
 *   今天的计划或复盘；对应内容写入日记且收到 AI 反馈后才算完成。
 *
 * 试用的四条承诺（7 天 / 主动开启 / 不绑卡 / 不自动续费）**没有被删掉**，
 * 它们是产品合同，只是搬到了真正相关的地方——付费墙触发点（`pro-modal.ts`）。
 * 在用户还不知道产品做什么的时候谈试用条款，是在回答一个没人问的问题。
 */

import { App, Modal } from 'obsidian';
import { t } from '../i18n';
import type TideLogPlugin from '../main';
import { guessJournalFolder, importableFolderOptions, isFolderGuessFallback } from '../services/journal-folder-guess';

interface FolderTreeNode {
    name: string;
    path: string;
    children: FolderTreeNode[];
}

export class OnboardingModal extends Modal {
    private plugin: TideLogPlugin;
    private folderInputEl!: HTMLInputElement;

    constructor(app: App, plugin: TideLogPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('tl-onboarding-modal');
        contentEl.addClass('tl-onboarding-minimal');

        this.renderPathChoice();
    }

    private renderPathChoice(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { cls: 'tl-onboarding-title', text: t('onboarding.title') });
        contentEl.createEl('p', { cls: 'tl-onboarding-desc', text: t('onboarding.desc') });
        contentEl.createEl('h3', { cls: 'tl-onboarding-question', text: t('onboarding.journalQuestion') });

        const pathList = contentEl.createDiv('tl-onboarding-path-list');
        const existingButton = this.renderPathButton(
            pathList,
            'tl-onboarding-has-journals',
            t('onboarding.hasJournalsBtn'),
            t('onboarding.hasJournalsHint'),
        );
        existingButton.addEventListener('click', () => this.renderExistingJournalStep());

        const newButton = this.renderPathButton(
            pathList,
            'tl-onboarding-no-journals',
            t('onboarding.noJournalsBtn'),
        );
        newButton.addEventListener('click', () => this.renderNoJournalStep());

    }

    private renderNoJournalStep(): void {
        const { contentEl } = this;
        contentEl.empty();

        const backButton = contentEl.createEl('button', {
            cls: 'tl-onboarding-back',
            text: t('onboarding.backBtn'),
            attr: { type: 'button' },
        });
        backButton.addEventListener('click', () => this.renderPathChoice());

        contentEl.createEl('h2', { cls: 'tl-onboarding-title', text: t('onboarding.noJournalStepTitle') });
        contentEl.createEl('p', { cls: 'tl-onboarding-desc', text: t('onboarding.noJournalStepDesc') });

        const flowEl = contentEl.createDiv('tl-onboarding-start-flow');
        [
            ['plan', t('onboarding.noJournalPlanTitle'), t('onboarding.noJournalPlanDesc')],
            ['review', t('onboarding.noJournalReviewTitle'), t('onboarding.noJournalReviewDesc')],
            ['insights', t('onboarding.noJournalInsightTitle'), t('onboarding.noJournalInsightDesc')],
        ].forEach(([phase, title, description], index) => {
            const itemEl = flowEl.createDiv(`tl-onboarding-start-step is-${phase}`);
            itemEl.createSpan({ cls: 'tl-onboarding-start-number', text: String(index + 1) });
            const copyEl = itemEl.createDiv('tl-onboarding-start-copy');
            copyEl.createDiv({ cls: 'tl-onboarding-start-title', text: title });
            copyEl.createDiv({ cls: 'tl-onboarding-start-desc', text: description });
        });

        const buttonRow = contentEl.createDiv('tl-onboarding-buttons tl-onboarding-start-actions');
        const planButton = buttonRow.createEl('button', {
            cls: 'tl-onboarding-primary tl-onboarding-start-plan',
            text: t('onboarding.startPlanBtn'),
            attr: { type: 'button' },
        });
        planButton.addEventListener('click', () => this.startTodayFlow('morning'));

        const reviewButton = buttonRow.createEl('button', {
            cls: 'tl-onboarding-secondary tl-onboarding-start-review',
            text: t('onboarding.startReviewBtn'),
            attr: { type: 'button' },
        });
        reviewButton.addEventListener('click', () => this.startTodayFlow('evening'));
    }

    private startTodayFlow(type: 'morning' | 'evening'): void {
        this.close();
        const app = this.app as (App & { setting?: { close?: () => void } }) | undefined;
        app?.setting?.close?.();
        void this.plugin.activateChatView(type);
    }

    private renderPathButton(
        containerEl: HTMLElement,
        className: string,
        title: string,
        hint?: string,
    ): HTMLButtonElement {
        const button = containerEl.createEl('button', {
            cls: `tl-onboarding-path-button ${className}`,
            attr: { type: 'button' },
        });
        button.createSpan({ cls: 'tl-onboarding-path-title', text: title });
        if (hint?.trim()) {
            button.createSpan({ cls: 'tl-onboarding-path-hint', text: hint });
        }
        return button;
    }

    private renderExistingJournalStep(): void {
        const { contentEl } = this;
        contentEl.empty();

        const backButton = contentEl.createEl('button', {
            cls: 'tl-onboarding-back',
            text: t('onboarding.backBtn'),
            attr: { type: 'button' },
        });
        backButton.addEventListener('click', () => this.renderPathChoice());

        contentEl.createEl('h2', { cls: 'tl-onboarding-title', text: t('onboarding.folderStepTitle') });
        contentEl.createEl('p', { cls: 'tl-onboarding-desc', text: t('onboarding.folderStepDesc') });
        contentEl.createDiv({
            cls: 'tl-onboarding-privacy-note tl-onboarding-folder-privacy',
            text: t('onboarding.folderPrivacyNote'),
        });

        const hasFolders = this.renderFolderField(contentEl);

        const buttonRow = contentEl.createDiv('tl-onboarding-buttons');

        const profileButton = buttonRow.createEl('button', {
            cls: 'tl-onboarding-primary tl-onboarding-first-insight',
            text: t('onboarding.firstInsightReadyBtn'),
            attr: { type: 'button' },
        });
        profileButton.disabled = !hasFolders;
        profileButton.addEventListener('click', () => {
            const folder = this.folderInputEl.value.trim();
            this.close();
            void this.plugin.openFirstInsight(folder || undefined);
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }

    /** 读取当前 Vault 的目录树；路径只存在隐藏字段里，不要求用户手输。 */
    private renderFolderField(containerEl: HTMLElement): boolean {
        const fieldEl = containerEl.createDiv('tl-onboarding-folder-field');
        fieldEl.createEl('label', {
            cls: 'tl-onboarding-folder-label',
            text: t('onboarding.folderLabel'),
        });

        const context = {
            archiveFolder: this.plugin.settings.archiveFolder,
            dailyFolder: this.plugin.settings.dailyFolder,
        };
        const folderOptions = importableFolderOptions(
            this.plugin.legacyImportService.listVaultFolders(),
            context,
        );
        const guess = guessJournalFolder(folderOptions, context);

        this.folderInputEl = fieldEl.createEl('input', {
            cls: 'tl-onboarding-folder-value',
            attr: { type: 'hidden' },
        });

        if (folderOptions.length === 0) {
            fieldEl.createDiv({
                cls: 'tl-insights-notice tl-insights-notice-stale tl-onboarding-folder-empty',
                text: t('onboarding.folderEmpty'),
            });
            return false;
        }

        const selectedEl = fieldEl.createDiv('tl-first-insight-folder-selected');
        const treeEl = fieldEl.createDiv('tl-first-insight-folder-tree tl-onboarding-folder-tree');
        this.renderFolderTree(treeEl, folderOptions, guess, selectedEl);

        // 配置目录或明确的 Daily / 日记语义已经足够可信，不要用“这是猜测”
        // 反过来削弱用户对正确选中态的信心。只有退回字典序占位时才提示。
        if (isFolderGuessFallback(guess, folderOptions, context)) {
            fieldEl.createDiv({
                cls: 'tl-onboarding-folder-guess-hint',
                text: t('onboarding.folderGuessFallbackHint'),
            });
        }
        return true;
    }

    private renderFolderTree(
        containerEl: HTMLElement,
        folderOptions: string[],
        defaultFolder: string,
        selectedEl: HTMLElement,
    ): void {
        containerEl.setAttr('role', 'tree');
        containerEl.setAttr('aria-label', t('firstInsight.folderTreeLabel'));

        const nodeEls = new Map<string, HTMLElement>();
        const selectFolder = (folderPath: string) => {
            this.folderInputEl.value = folderPath;
            selectedEl.empty();
            selectedEl.createSpan({ cls: 'tl-first-insight-folder-selected-label', text: t('firstInsight.selectedFolderLabel') });
            selectedEl.createSpan({ cls: 'tl-first-insight-folder-selected-path', text: folderPath });
            nodeEls.forEach((nodeEl, path) => {
                nodeEl.classList.toggle('is-selected', path === folderPath);
                nodeEl.setAttr('aria-selected', path === folderPath ? 'true' : 'false');
            });
        };

        const renderNode = (node: FolderTreeNode, parentEl: HTMLElement, depth: number) => {
            const followsDefaultPath = defaultFolder === node.path || defaultFolder.startsWith(`${node.path}/`);
            if (node.children.length > 0) {
                const detailsEl = parentEl.createEl('details', {
                    cls: 'tl-first-insight-folder-branch',
                    attr: { 'data-folder-path': node.path },
                });
                if (followsDefaultPath) detailsEl.setAttr('open', 'true');
                const rowEl = detailsEl.createEl('summary', { cls: 'tl-first-insight-folder-row tl-first-insight-folder-summary' });
                rowEl.style.setProperty('--tl-first-insight-folder-depth', String(depth));
                const nodeEl = this.createFolderNode(rowEl, node, selectFolder, detailsEl);
                nodeEls.set(node.path, nodeEl);
                const childrenEl = detailsEl.createDiv('tl-first-insight-folder-children');
                node.children.forEach(child => renderNode(child, childrenEl, depth + 1));
                return;
            }

            const rowEl = parentEl.createDiv('tl-first-insight-folder-row tl-first-insight-folder-leaf');
            rowEl.style.setProperty('--tl-first-insight-folder-depth', String(depth));
            const nodeEl = this.createFolderNode(rowEl, node, selectFolder);
            nodeEls.set(node.path, nodeEl);
        };

        this.buildFolderTree(folderOptions).forEach(node => renderNode(node, containerEl, 0));
        selectFolder(defaultFolder);
    }

    private createFolderNode(
        rowEl: HTMLElement,
        node: FolderTreeNode,
        onSelect: (folderPath: string) => void,
        detailsEl?: HTMLDetailsElement,
    ): HTMLElement {
        if (detailsEl) {
            const toggleEl = rowEl.createEl('button', {
                cls: 'tl-first-insight-folder-toggle',
                attr: { type: 'button', 'aria-label': t('firstInsight.folderExpandLabel', node.path) },
            });
            toggleEl.createSpan({ cls: 'tl-first-insight-folder-chevron', text: '›' });
            toggleEl.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                detailsEl.open = !detailsEl.open;
            });
        } else {
            rowEl.createSpan({ cls: 'tl-first-insight-folder-spacer', attr: { 'aria-hidden': 'true' } });
        }

        const nodeEl = rowEl.createEl('button', {
            cls: 'tl-first-insight-folder-node',
            attr: {
                type: 'button',
                role: 'treeitem',
                'data-folder-path': node.path,
                'aria-selected': 'false',
            },
        });
        nodeEl.createSpan({ cls: 'tl-first-insight-folder-icon', attr: { 'aria-hidden': 'true' } });
        nodeEl.createSpan({ cls: 'tl-first-insight-folder-name', text: node.name });
        if (node.path !== node.name) {
            nodeEl.createSpan({ cls: 'tl-first-insight-folder-path', text: node.path });
        }
        nodeEl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (detailsEl) detailsEl.open = true;
            onSelect(node.path);
        });
        return nodeEl;
    }

    private buildFolderTree(folderOptions: string[]): FolderTreeNode[] {
        const rootNodes: FolderTreeNode[] = [];
        const nodes = new Map<string, FolderTreeNode>();

        for (const folderPath of folderOptions) {
            const parts = folderPath.split('/').filter(Boolean);
            let currentPath = '';
            let siblings = rootNodes;
            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                let node = nodes.get(currentPath);
                if (!node) {
                    node = { name: part, path: currentPath, children: [] };
                    nodes.set(currentPath, node);
                    siblings.push(node);
                    siblings.sort((a, b) => a.name.localeCompare(b.name));
                }
                siblings = node.children;
            }
        }
        return rootNodes;
    }
}
