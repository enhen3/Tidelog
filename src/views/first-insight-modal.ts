/**
 * First Insight Modal
 *
 * User-facing path for importing old journals and generating the first
 * evidence-backed profile insight report.
 */

import { Modal, Notice, TFolder } from 'obsidian';
import type TideLogPlugin from '../main';
import { t } from '../i18n';
import type { LegacyImportScanResult } from '../services/legacy-import-service';
import {
    FIRST_INSIGHT_MAX_SELECTED_ENTRIES,
    FIRST_INSIGHT_RECENT_WINDOW_DAYS,
    selectRecentFirstInsightScan,
} from '../services/legacy-import-service';
import type { FirstInsightReportDraft } from '../services/first-insight-service';
import { FIRST_INSIGHT_MIN_ANALYZABLE_CHARS, FIRST_INSIGHT_MIN_VALID_ENTRIES } from '../constants';
import { guessJournalFolder, importableFolderOptions, isFolderGuessFallback } from '../services/journal-folder-guess';
import { ErrorCode, formatAPIErrorPlainText, TideLogError } from '../utils/error-formatter';
import type { LegacyImportSession } from '../services/legacy-import-service';

/**
 * 路径 A 走不通时，到底差什么。
 *
 * 这四种情况的补救动作完全不同：前三种是「你选错了文件夹」，只有最后一种才是
 * 「你的日记还不够多」。以前它们统一渲染成 `tooFewNotice`——一个把选错目录的人
 * 告知「你写得不够多」的提示，指错了方向，用户没有可执行的下一步。
 */
export type FirstInsightBlockReason =
    | 'folder_missing'
    | 'no_markdown'
    | 'no_dates'
    | 'too_short'
    | 'too_few';

export interface FirstInsightBlockContext {
    folderPath: string;
    /** 文件夹里读到的 Markdown 文件总数。0 就是文件夹本身不对。 */
    markdownCount: number;
    /** 其中成功识别出日期的篇数。 */
    candidateCount: number;
    /** 其中正文长度也够分析的篇数。 */
    validCount: number;
    /** 认出了日期、但正文太短被排除的篇数。 */
    tooShortCount: number;
}

export function firstInsightBlockContext(scan: LegacyImportScanResult): FirstInsightBlockContext {
    const tooShortCount = scan.excludedEntries.filter(entry => entry.reason === 'too_short').length;
    return {
        folderPath: scan.folderPath,
        // too_short 的文件已经计入 candidateCount，再加一次会把总数说多。
        markdownCount: scan.candidateCount + (scan.excludedEntries.length - tooShortCount),
        candidateCount: scan.candidateCount,
        validCount: scan.validCount,
        tooShortCount,
    };
}

export function diagnoseFirstInsightBlock(context: FirstInsightBlockContext): FirstInsightBlockReason {
    if (context.markdownCount === 0) return 'no_markdown';
    // candidateCount 只统计「日期识别成功」的文件。它为 0 说明这个文件夹里没有日记，
    // 而不是日记不够多——此时报「篇数不够」等于把选错目录说成用户写得太少。
    if (context.candidateCount === 0) return 'no_dates';
    const shortfall = FIRST_INSIGHT_MIN_VALID_ENTRIES - context.validCount;
    // 补齐缺口所需的日记全都卡在字数上：他有日记，只是太短。这两件事的补救动作不同。
    if (context.tooShortCount > 0 && context.tooShortCount >= shortfall) return 'too_short';
    return 'too_few';
}

export function firstInsightBlockCopy(
    reason: FirstInsightBlockReason,
    context: FirstInsightBlockContext,
): { title: string; action: string } {
    const shortfall = String(Math.max(1, FIRST_INSIGHT_MIN_VALID_ENTRIES - context.validCount));
    switch (reason) {
        case 'folder_missing':
            return {
                title: t('firstInsight.blockFolderMissingTitle', context.folderPath),
                action: t('firstInsight.blockFolderMissingAction'),
            };
        case 'no_markdown':
            return {
                title: t('firstInsight.blockNoMarkdownTitle', context.folderPath),
                action: t('firstInsight.blockNoMarkdownAction'),
            };
        case 'no_dates':
            return {
                title: t('firstInsight.blockNoDatesTitle', context.folderPath, String(context.markdownCount)),
                action: t('firstInsight.blockNoDatesAction'),
            };
        case 'too_short':
            return {
                title: t(
                    'firstInsight.blockTooShortTitle',
                    context.folderPath,
                    String(context.candidateCount),
                    String(context.tooShortCount),
                    String(FIRST_INSIGHT_MIN_ANALYZABLE_CHARS),
                ),
                action: t('firstInsight.blockTooShortAction', String(context.validCount), shortfall),
            };
        default:
            return {
                title: t(
                    'firstInsight.tooFewNotice',
                    String(context.validCount),
                    String(FIRST_INSIGHT_MIN_VALID_ENTRIES),
                ),
                action: t('firstInsight.blockTooFewAction', shortfall, String(FIRST_INSIGHT_MIN_VALID_ENTRIES)),
            };
    }
}

interface FolderTreeNode {
    name: string;
    path: string;
    children: FolderTreeNode[];
}

export class FirstInsightModal extends Modal {
    private folderInputEl!: HTMLInputElement;
    private scanPreviewEl!: HTMLElement;
    private actionEl!: HTMLElement;
    private reportEl!: HTMLElement;
    private importToDailyEl!: HTMLInputElement;
    private scanResult: LegacyImportScanResult | null = null;
    private draft: FirstInsightReportDraft | null = null;
    /**
     * 已经建立的导入会话。缓存它是为了让「开启试用后继续」不必重新复制一遍原文——
     * `createImport()` 会往归档区写文件，重跑一次就多出一份一模一样的副本。
     */
    private importSession: LegacyImportSession | null = null;

    constructor(
        app: TideLogPlugin['app'],
        private plugin: TideLogPlugin,
        /** 引导弹窗里用户已确认过的目录。没有时才回落到猜测。 */
        private prefillFolder?: string,
    ) {
        super(app);
    }

    private get isDirectMode(): boolean {
        return Boolean(this.prefillFolder?.trim());
    }

    onOpen(): void {
        const { contentEl } = this;
        this.modalEl.addClass('tl-first-insight-shell');
        contentEl.addClass('tl-first-insight-modal');

        if (!this.isDirectMode) {
            const headerEl = contentEl.createDiv('tl-first-insight-header');
            headerEl.createDiv({ cls: 'tl-insights-report-preview-kicker', text: t('firstInsight.kicker') });
            headerEl.createEl('h2', { cls: 'tl-first-insight-title', text: t('firstInsight.title') });
            headerEl.createDiv({ cls: 'tl-insights-card-desc', text: t('firstInsight.desc') });
            headerEl.createDiv({ cls: 'tl-first-insight-privacy-note', text: t('firstInsight.privacyNote') });

            const stepperEl = contentEl.createDiv('tl-first-insight-stepper');
            [
                t('firstInsight.stepChoose'),
                t('firstInsight.stepScan'),
                t('firstInsight.stepReport'),
            ].forEach((label, index) => {
                const itemEl = stepperEl.createDiv('tl-first-insight-stepper-item');
                itemEl.createSpan({ cls: 'tl-first-insight-stepper-index', text: String(index + 1) });
                itemEl.createSpan({ cls: 'tl-first-insight-stepper-label', text: label });
            });
            this.renderSetupCard(contentEl);
        } else {
            this.folderInputEl = contentEl.createEl('input', {
                cls: 'tl-first-insight-folder-value',
                attr: { type: 'hidden', value: this.prefillFolder!.trim() },
            });
            this.folderInputEl.value = this.prefillFolder!.trim();
            this.importToDailyEl = contentEl.createEl('input', {
                cls: 'tl-first-insight-direct-import-toggle',
                attr: { type: 'checkbox', hidden: 'true' },
            });
        }
        this.scanPreviewEl = contentEl.createDiv('tl-first-insight-preview');
        this.actionEl = contentEl.createDiv('tl-first-insight-actions');
        this.reportEl = contentEl.createDiv('tl-first-insight-report');

        if (this.isDirectMode) {
            const controlsEl = contentEl.createDiv('tl-first-insight-direct-controls');
            const generateButton = controlsEl.createEl('button', {
                cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready',
                text: t('firstInsight.generateBtn'),
                attr: { type: 'button' },
            });
            // 自动启动前先锁住按钮，避免用户在 setTimeout 回调前点击造成双请求。
            generateButton.disabled = true;
            generateButton.addEventListener('click', () => void this.startFirstInsight(generateButton));
            window.setTimeout(() => void this.startFirstInsight(generateButton), 0);
        }
    }

    onClose(): void {
        this.modalEl.removeClass('tl-first-insight-shell');
        this.contentEl.empty();
    }

    private renderSetupCard(containerEl: HTMLElement): void {
        const card = containerEl.createDiv('tl-insights-card tl-first-insight-setup-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({ cls: 'tl-insights-card-title', text: t('firstInsight.setupTitle') });
        titleWrap.createDiv({ cls: 'tl-insights-card-subtitle', text: t('firstInsight.setupSubtitle') });

        const fieldsEl = card.createDiv('tl-first-insight-fields');
        const folderField = fieldsEl.createDiv('tl-first-insight-field tl-first-insight-field-wide');
        folderField.createEl('label', { text: t('firstInsight.folderLabel') });

        const folderOptions = this.getImportableFolderOptions(this.plugin.legacyImportService.listVaultFolders());
        this.folderInputEl = folderField.createEl('input', {
            cls: 'tl-first-insight-folder-value',
            attr: { type: 'hidden' },
        });
        if (folderOptions.length > 0) {
            const selectedEl = folderField.createDiv('tl-first-insight-folder-selected');
            const treeEl = folderField.createDiv('tl-first-insight-folder-tree');
            this.renderFolderTree(treeEl, folderOptions, this.pickDefaultFolder(folderOptions), selectedEl);
        } else {
            folderField.createDiv({
                cls: 'tl-insights-notice tl-insights-notice-stale',
                text: t('onboarding.folderEmpty'),
            });
        }

        // 明确匹配到配置目录或 Daily / 日记语义时，不显示“这是猜测”。只有退回
        // 字典序占位时才提醒用户，避免正确路径旁边出现一条无意义的怀疑文案。
        if (folderOptions.length > 0 && !(this.prefillFolder && folderOptions.includes(this.prefillFolder))) {
            const guess = guessJournalFolder(folderOptions, this.folderGuessContext());
            if (isFolderGuessFallback(guess, folderOptions, this.folderGuessContext())) {
                card.createDiv({
                    cls: 'tl-first-insight-folder-guess-hint',
                    text: t('firstInsight.folderGuessFallbackHint'),
                });
            }
        }

        const importOptionEl = card.createEl('label', { cls: 'tl-first-insight-system-import-option' });
        this.importToDailyEl = importOptionEl.createEl('input', { attr: { type: 'checkbox' } });
        const importCopyEl = importOptionEl.createSpan('tl-first-insight-system-import-copy');
        importCopyEl.createSpan({ cls: 'tl-first-insight-system-import-title', text: t('firstInsight.systemImportTitle') });
        importCopyEl.createSpan({ cls: 'tl-first-insight-system-import-desc', text: t('firstInsight.systemImportDesc') });

        const generateButton = card.createEl('button', {
            cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready',
            text: t('firstInsight.generateBtn'),
            attr: { type: 'button' },
        });
        generateButton.disabled = folderOptions.length === 0;
        const resetGeneratedState = () => {
            this.resetGeneratedStateForFolderChange(generateButton);
        };
        this.folderInputEl.addEventListener('change', resetGeneratedState);
        this.folderInputEl.addEventListener('input', resetGeneratedState);
        generateButton.addEventListener('click', () => {
            void this.startFirstInsight(generateButton);
        });
    }

    private resetGeneratedStateForFolderChange(button: HTMLButtonElement): void {
        if (button.classList.contains('tl-insights-primary-btn-loading')) return;
        // 失败态卡片也要跟着清掉——不然用户在改目录时，上一次的「找不到文件夹」还挂在那里。
        if (!this.draft && !this.scanResult && !this.importSession
            && !this.scanPreviewEl.querySelector('.tl-first-insight-block')) return;

        this.clearResults();
        button.parentElement?.querySelector('.tl-first-insight-generating-status')?.remove();
        button.disabled = false;
        button.removeClass('tl-insights-primary-btn-complete');
        button.setText(t('firstInsight.generateBtn'));
    }

    private folderGuessContext() {
        return {
            archiveFolder: this.plugin.settings.archiveFolder,
            dailyFolder: this.plugin.settings.dailyFolder,
        };
    }

    private pickDefaultFolder(folderOptions: string[]): string {
        // 引导弹窗若已经让用户确认过目录，就用那个值——用户的确认永远优先于猜测。
        if (this.prefillFolder && folderOptions.includes(this.prefillFolder)) {
            return this.prefillFolder;
        }
        return guessJournalFolder(folderOptions, this.folderGuessContext());
    }

    private getImportableFolderOptions(folderOptions: string[]): string[] {
        return importableFolderOptions(folderOptions, this.folderGuessContext());
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
        const setSelectedDisplay = (folderPath: string) => {
            selectedEl.empty();
            selectedEl.createSpan({ cls: 'tl-first-insight-folder-selected-label', text: t('firstInsight.selectedFolderLabel') });
            selectedEl.createSpan({ cls: 'tl-first-insight-folder-selected-path', text: folderPath });
        };
        const selectFolder = (folderPath: string, notify = true) => {
            this.folderInputEl.value = folderPath;
            setSelectedDisplay(folderPath);
            nodeEls.forEach((nodeEl, path) => {
                nodeEl.classList.toggle('is-selected', path === folderPath);
                nodeEl.setAttr('aria-selected', path === folderPath ? 'true' : 'false');
            });
            if (notify) {
                this.folderInputEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };

        const renderNode = (node: FolderTreeNode, parentEl: HTMLElement, depth: number) => {
            const isDefaultPath = defaultFolder === node.path || defaultFolder.startsWith(`${node.path}/`);
            if (node.children.length > 0) {
                const detailsEl = parentEl.createEl('details', {
                    cls: 'tl-first-insight-folder-branch',
                    attr: { 'data-folder-path': node.path },
                });
                if (isDefaultPath) detailsEl.setAttr('open', 'true');
                const summaryEl = detailsEl.createEl('summary', { cls: 'tl-first-insight-folder-row tl-first-insight-folder-summary' });
                summaryEl.style.setProperty('--tl-first-insight-folder-depth', String(depth));
                const nodeEl = this.createFolderNode(summaryEl, node, selectFolder, detailsEl);
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
        selectFolder(defaultFolder, false);
    }

    private createFolderNode(
        rowEl: HTMLElement,
        node: FolderTreeNode,
        onSelect: (folderPath: string) => void,
        detailsEl?: HTMLDetailsElement,
    ): HTMLElement {
        let updateBranchState = () => {};
        if (detailsEl) {
            const toggleEl = rowEl.createEl('button', {
                cls: 'tl-first-insight-folder-toggle',
                attr: {
                    type: 'button',
                    'aria-label': t('firstInsight.folderExpandLabel', node.path),
                },
            });
            toggleEl.createSpan({ cls: 'tl-first-insight-folder-chevron', text: '›' });
            toggleEl.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                detailsEl.open = !detailsEl.open;
                updateBranchState();
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
        if (detailsEl) {
            nodeEl.setAttr('aria-expanded', detailsEl.open ? 'true' : 'false');
        }
        nodeEl.createSpan({ cls: 'tl-first-insight-folder-icon', attr: { 'aria-hidden': 'true' } });
        nodeEl.createSpan({ cls: 'tl-first-insight-folder-name', text: node.name });
        if (node.path !== node.name) {
            nodeEl.createSpan({ cls: 'tl-first-insight-folder-path', text: node.path });
        }

        if (detailsEl) {
            const toggleEl = rowEl.querySelector('.tl-first-insight-folder-toggle');
            updateBranchState = () => {
                const isOpen = detailsEl.open;
                nodeEl.setAttr('aria-expanded', isOpen ? 'true' : 'false');
                toggleEl?.setAttr('aria-label', t(isOpen ? 'firstInsight.folderCollapseLabel' : 'firstInsight.folderExpandLabel', node.path));
            };
            detailsEl.addEventListener('toggle', updateBranchState);
        }

        nodeEl.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (detailsEl && !detailsEl.open) {
                detailsEl.open = true;
                updateBranchState();
            }
            onSelect(node.path);
        });
        nodeEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (!detailsEl) return;
            if (event.key === 'ArrowRight') {
                event.preventDefault();
                detailsEl.open = true;
                updateBranchState();
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                detailsEl.open = false;
                updateBranchState();
            }
        });
        updateBranchState();
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

    private async startFirstInsight(button: HTMLButtonElement): Promise<void> {
        const folderPath = this.folderInputEl.value.trim();
        if (!folderPath) {
            new Notice(t('firstInsight.folderRequired'));
            return;
        }

        // 目录不存在是失败态里最容易发生的一种——首屏预填的就是一个猜测值。
        // 让它走 scanFolder 的 throw，用户看到的是英文的 `Folder not found: X`。
        if (!(this.app.vault.getAbstractFileByPath(folderPath) instanceof TFolder)) {
            this.clearResults();
            this.renderBlockCard('folder_missing', {
                folderPath,
                markdownCount: 0,
                candidateCount: 0,
                validCount: 0,
                tooShortCount: 0,
            });
            return;
        }

        button.disabled = true;
        button.addClass('tl-insights-primary-btn-loading');
        button.empty();
        button.createSpan('tl-insights-spinner');
        button.createSpan({ cls: 'tl-insights-loading-label', text: t('firstInsight.scanning') });
        this.clearResults();

        let completed = false;
        try {
            const detectedScan = await this.plugin.legacyImportService.scanFolder(folderPath);
            const selection = selectRecentFirstInsightScan(detectedScan);
            this.scanResult = selection.scan;
            this.renderScanPreview(detectedScan, selection.scan);
            if (!selection.scan.canGenerate) {
                return;
            }
            completed = await this.generate(button);
        } catch (error) {
            this.scanPreviewEl.createDiv({
                cls: 'tl-insights-notice tl-insights-notice-stale',
                text: error instanceof Error ? error.message : t('firstInsight.scanFailed'),
            });
        } finally {
            button.removeClass('tl-insights-primary-btn-loading');
            if (completed) {
                button.disabled = true;
                button.addClass('tl-insights-primary-btn-complete');
                button.setText(t('firstInsight.generatedBtn'));
            } else {
                button.disabled = false;
                button.removeClass('tl-insights-primary-btn-complete');
                button.setText(t('firstInsight.generateBtn'));
            }
        }
    }

    /**
     * 忘掉上一次运行的**唯一**入口。
     *
     * 换过文件夹之后还留着旧的 importSession，就会拿 A 文件夹的副本去生成
     * 界面上显示的 B 文件夹的画像——错得静悄悄。新增一个状态字段却漏掉一处清理
     * 是这类 bug 的常态，所以清理只留一个地方。
     */
    private clearResults(): void {
        this.scanPreviewEl.empty();
        this.actionEl.empty();
        this.reportEl.empty();
        this.scanResult = null;
        this.draft = null;
        this.importSession = null;
    }

    /** 没有扫描结果可挂靠时（文件夹压根不存在），自成一张卡片。 */
    private renderBlockCard(reason: FirstInsightBlockReason, context: FirstInsightBlockContext): void {
        const card = this.scanPreviewEl.createDiv('tl-insights-card tl-first-insight-scan-card');
        this.renderBlockNotice(card, reason, context);
        this.revealElement(card);
    }

    /**
     * 失败态只说一句「差 N 篇」是不够的：用户需要知道差的是什么，以及现在该做什么。
     * `data-block-reason` 让这四种情况在测试里可分辨，不必依赖文案匹配。
     */
    private renderBlockNotice(
        containerEl: HTMLElement,
        reason: FirstInsightBlockReason,
        context: FirstInsightBlockContext,
    ): void {
        const copy = firstInsightBlockCopy(reason, context);
        const noticeEl = containerEl.createDiv({
            cls: 'tl-insights-notice tl-insights-notice-stale tl-first-insight-block',
            attr: { 'data-block-reason': reason },
        });
        noticeEl.createDiv({ cls: 'tl-first-insight-block-title', text: copy.title });
        noticeEl.createDiv({ cls: 'tl-first-insight-block-action', text: copy.action });
    }

    private renderScanPreview(detectedScan: LegacyImportScanResult, selectedScan: LegacyImportScanResult): void {
        this.scanPreviewEl.empty();
        const card = this.scanPreviewEl.createDiv('tl-insights-card tl-first-insight-scan-card');
        const header = card.createDiv('tl-insights-card-header');
        const titleWrap = header.createDiv('tl-insights-card-title-wrap');
        titleWrap.createDiv({
            cls: 'tl-insights-card-title',
            text: t('firstInsight.scanPreviewTitle', String(selectedScan.validCount)),
        });
        titleWrap.createDiv({
            cls: 'tl-insights-card-subtitle',
            text: t(
                'firstInsight.scanPreviewSubtitle',
                selectedScan.folderPath,
                selectedScan.dateRange.start,
                selectedScan.dateRange.end,
            ),
        });

        if (selectedScan.canGenerate) {
            const estimate = this.buildGenerationEstimate(selectedScan);
            const isLimited = detectedScan.validCount > FIRST_INSIGHT_MAX_SELECTED_ENTRIES;
            card.createDiv({
                cls: 'tl-insights-notice',
                text: t(
                    isLimited ? 'firstInsight.readyNoticeLimited' : 'firstInsight.readyNoticeAll',
                    String(detectedScan.validCount),
                    String(selectedScan.validCount),
                    estimate.label,
                    String(FIRST_INSIGHT_RECENT_WINDOW_DAYS),
                    String(FIRST_INSIGHT_MAX_SELECTED_ENTRIES),
                ),
            });
            // 一篇日记都没写明自己的日期时，这多半不是日记文件夹——但它扫得通过，
            // 不该拦。拦住写「今天很累.md」的人比让选错目录的人多等一次更糟。
            if (selectedScan.validEntries.every(entry => entry.dateSource === 'mtime')) {
                card.createDiv({
                    cls: 'tl-insights-notice tl-insights-notice-stale tl-first-insight-mtime-warning',
                    text: t('firstInsight.mtimeOnlyWarning', String(selectedScan.validCount), selectedScan.folderPath),
                });
            }
        } else if (detectedScan.canGenerate) {
            const noticeEl = card.createDiv({
                cls: 'tl-insights-notice tl-insights-notice-stale tl-first-insight-block',
                attr: { 'data-block-reason': 'recent_too_few' },
            });
            noticeEl.createDiv({
                cls: 'tl-first-insight-block-title',
                text: t(
                    'firstInsight.blockRecentTooFewTitle',
                    String(FIRST_INSIGHT_RECENT_WINDOW_DAYS),
                    String(selectedScan.validCount),
                ),
            });
            noticeEl.createDiv({
                cls: 'tl-first-insight-block-action',
                text: t('firstInsight.blockRecentTooFewAction', String(FIRST_INSIGHT_MIN_VALID_ENTRIES)),
            });
        } else {
            const context = firstInsightBlockContext(detectedScan);
            this.renderBlockNotice(card, diagnoseFirstInsightBlock(context), context);
        }

        if (!selectedScan.canGenerate && detectedScan.excludedEntries.length > 0) {
            const excludedEl = card.createDiv('tl-first-insight-excluded');
            excludedEl.createDiv({ cls: 'tl-first-insight-section-title', text: t('firstInsight.excludedTitle') });
            const listEl = excludedEl.createEl('ul');
            detectedScan.excludedEntries.slice(0, 8).forEach((item) => {
                listEl.createEl('li', {
                    text: `${item.path} · ${this.reasonLabel(item.reason)}${item.date ? ` · ${item.date}` : ''}`,
                });
            });
            if (detectedScan.excludedEntries.length > 8) {
                excludedEl.createDiv({ cls: 'tl-first-insight-muted', text: t('firstInsight.excludedMore', String(detectedScan.excludedEntries.length - 8)) });
            }
        }

        this.revealElement(card);
    }

    private async generate(button: HTMLButtonElement): Promise<boolean> {
        if (!this.scanResult) return false;
        button.disabled = true;
        button.addClass('tl-insights-primary-btn-loading');
        button.empty();
        button.createSpan('tl-insights-spinner');
        button.createSpan({ cls: 'tl-insights-loading-label', text: t('firstInsight.generating') });
        button.parentElement?.querySelector('.tl-first-insight-generating-status')?.remove();
        const progressEl = button.parentElement?.createDiv('tl-first-insight-generating-status');

        this.actionEl.empty();
        this.reportEl.empty();
        const estimate = this.buildGenerationEstimate(this.scanResult);
        let longRunning = false;
        const updateProgress = () => {
            const key = longRunning ? 'firstInsight.generatingLongHint' : 'firstInsight.generatingHint';
            const progressText = t(key, String(estimate.journalCount), estimate.label);
            progressEl?.setText(progressText);
        };
        updateProgress();
        const progressTimer = window.setTimeout(() => {
            longRunning = true;
            updateProgress();
        }, estimate.maxSeconds * 1000);

        try {
            const session = this.importSession
                ?? await this.plugin.legacyImportService.createImport(this.scanResult);
            const isFirstAttempt = this.importSession === null;
            this.importSession = session;
            // 重试（开启试用后继续）不该再往日记库里导入一次——第一次已经导过了。
            if (isFirstAttempt && this.importToDailyEl.checked) {
                await this.plugin.legacyImportService.importSessionToDailyNotes(session);
            }
            const draft = await this.plugin.firstInsightService.generateFirstInsight(session);
            this.draft = draft;
            const actionCard = this.renderSaveAction();
            this.revealElement(actionCard);
            window.setTimeout(() => this.revealElement(actionCard), 120);
            if (this.isDirectMode) button.parentElement?.remove();
            return true;
        } catch (error) {
            const card = this.reportEl.createDiv('tl-insights-card tl-first-insight-error-card');
            const notice = card.createDiv('tl-insights-notice tl-insights-notice-stale');
            // TideLogError 保留了分类结果，所以这里能区分「档位不够」和「网络断了」。
            // 前者有一条明确的出路，后者没有——不该拿同一句话打发。
            const message = formatAPIErrorPlainText(error, this.plugin.settings.activeProvider)
                || t('firstInsight.generateFailed');
            notice.setText(message);
            if (this.canOfferTrialFor(error)) {
                this.renderTrialGate(card, button);
            }
            this.revealElement(card);
            return false;
        } finally {
            window.clearTimeout(progressTimer);
            progressEl?.remove();
            button.removeClass('tl-insights-primary-btn-loading');
        }
    }

    /**
     * 只有「档位不提供这项功能」且用户还能开试用时，才在这里给出路。
     * 配额用尽、网络失败、内容被拦——这些开试用都解决不了，给按钮反而是骗人。
     */
    private canOfferTrialFor(error: unknown): boolean {
        if (!(error instanceof TideLogError) || error.code !== ErrorCode.FEATURE_UNAVAILABLE) return false;
        return this.plugin.licenseManager?.isTrialEligible?.() === true;
    }

    /**
     * 就地开启试用并接着生成。
     *
     * 这是四条承诺该出现的位置之一：用户此刻正要开启试用，条款到这里才有人读
     * ——和付费墙同理，只是他这次是从画像这条路撞上来的。
     */
    private renderTrialGate(card: HTMLElement, generateButton: HTMLButtonElement): void {
        card.querySelector('.tl-first-insight-trial-gate')?.remove();
        const gate = card.createDiv('tl-first-insight-trial-gate');
        gate.createDiv({ cls: 'tl-first-insight-trial-gate-title', text: t('firstInsight.trialRequiredTitle') });
        gate.createDiv({
            cls: 'tl-first-insight-trial-gate-desc',
            text: t('firstInsight.trialRequiredDesc', String(this.scanResult?.validCount ?? 0)),
        });

        gate.createDiv({ cls: 'tl-first-insight-trial-promises', text: t('trial.compactPromise') });

        const startBtn = gate.createEl('button', {
            cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready tl-first-insight-trial-start',
            text: t('firstInsight.trialRequiredBtn'),
            attr: { type: 'button' },
        });
        startBtn.addEventListener('click', () => {
            void (async () => {
                startBtn.disabled = true;
                startBtn.setText(t('firstInsight.trialStarting'));
                // startTrial() 内部要写盘。抛出来的话按钮会永久停在「正在开启试用」，
                // 用户既看不到原因也点不动——比失败本身更糟。
                const started = await this.plugin.licenseManager.startTrial().catch((error) => {
                    console.warn('TideLog trial start failed:', error);
                    return false;
                });
                if (!started) {
                    startBtn.disabled = false;
                    startBtn.setText(t('firstInsight.trialRequiredBtn'));
                    new Notice(t('firstInsight.trialStartFailed'));
                    return;
                }
                gate.remove();
                // 会话已缓存，这一次不会重新复制原文，直接接着生成。
                const completed = await this.generate(generateButton);
                // 重试不经过 startFirstInsight，按钮状态得在这里自己收尾，
                // 否则它会一直停在「正在生成画像」的加载态上。
                generateButton.disabled = completed;
                generateButton.toggleClass?.('tl-insights-primary-btn-complete', completed);
                generateButton.setText(t(completed ? 'firstInsight.generatedBtn' : 'firstInsight.generateBtn'));
            })();
        });
        this.revealElement(gate);
    }

    private revealElement(element: HTMLElement): void {
        const reveal = () => {
            const container = this.contentEl;
            if (container.contains(element) && typeof container.scrollTo === 'function') {
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                const top = Math.max(0, container.scrollTop + elementRect.top - containerRect.top - 8);
                container.scrollTo({ top, behavior: 'smooth' });
                return;
            }
            if (typeof element.scrollIntoView === 'function') {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(reveal);
        } else {
            window.setTimeout(reveal, 0);
        }
    }

    private buildGenerationEstimate(scan: LegacyImportScanResult): {
        label: string;
        minSeconds: number;
        maxSeconds: number;
        journalCount: number;
    } {
        const minSeconds = 60;
        const maxSeconds = scan.validCount <= 12 ? 60 : 180;

        return {
            label: this.formatEstimateRange(minSeconds, maxSeconds),
            minSeconds,
            maxSeconds,
            journalCount: scan.validCount,
        };
    }

    private formatEstimateRange(minSeconds: number, maxSeconds: number): string {
        const minMinutes = Math.max(1, Math.round(minSeconds / 60));
        const maxMinutes = Math.max(minMinutes, Math.round(maxSeconds / 60));
        if (minMinutes === maxMinutes) {
            return t('firstInsight.estimateMinutes', String(maxMinutes));
        }
        return t('firstInsight.estimateMinutesRange', String(minMinutes), String(maxMinutes));
    }

    private renderSaveAction(): HTMLElement {
        this.actionEl.empty();
        const confirmEl = this.actionEl.createDiv('tl-insights-card tl-first-insight-confirm');
        confirmEl.createDiv({ cls: 'tl-first-insight-section-title', text: t('firstInsight.saveQuestion') });
        const saveButton = confirmEl.createEl('button', {
            cls: 'tl-insights-primary-btn tl-insights-primary-btn-ready',
            text: t('firstInsight.saveBtn'),
            attr: { type: 'button' },
        });
        saveButton.addEventListener('click', () => {
            void this.saveDraft(saveButton);
        });
        return confirmEl;
    }

    private async saveDraft(saveButton: HTMLButtonElement): Promise<void> {
        if (!this.draft) return;
        saveButton.disabled = true;
        saveButton.setText(t('firstInsight.saving'));
        try {
            const { profileFile, reportFile } = await this.plugin.firstInsightService.saveInitialProfile(this.draft);
            new Notice(t('firstInsight.savedNotice', reportFile?.path ?? `${this.plugin.settings.archiveFolder}/Insights`));
            if (reportFile ?? profileFile) {
                await this.app.workspace.getLeaf().openFile(reportFile ?? profileFile!);
            }
            await this.plugin.completeOnboarding();
            this.close();
        } catch (error) {
            console.error('TideLog failed to save the first insight report:', error);
            new Notice(error instanceof Error ? error.message : t('firstInsight.saveFailed'));
            saveButton.disabled = false;
            saveButton.setText(t('firstInsight.saveBtn'));
        }
    }

    private reasonLabel(reason: LegacyImportScanResult['excludedEntries'][number]['reason']): string {
        switch (reason) {
            case 'outside_range': return t('firstInsight.reasonOutsideRange');
            case 'missing_date': return t('firstInsight.reasonMissingDate');
            case 'too_short': return t('firstInsight.reasonTooShort');
            case 'read_error': return t('firstInsight.reasonReadError');
            default: return reason;
        }
    }
}
