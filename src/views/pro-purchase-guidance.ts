/**
 * Shared Pro purchase guidance for the current Afdian-based checkout path.
 *
 * TideLog can already deliver License Keys after purchase. The remaining UX
 * friction is that Afdian requires users to sign in/register before buying;
 * every in-app purchase CTA should set that expectation before opening Afdian.
 */

import { t } from '../i18n';

export function renderProPurchaseGuidance(containerEl: HTMLElement, extraClass = ''): HTMLElement {
    const guidanceEl = containerEl.createDiv(
        ['tl-pro-purchase-guidance', extraClass].filter(Boolean).join(' ')
    );
    guidanceEl.createDiv({ cls: 'tl-pro-purchase-guidance-main', text: t('pro.purchaseNotice') });
    guidanceEl.createDiv({ cls: 'tl-pro-purchase-guidance-tip', text: t('pro.purchaseBlankTip') });
    return guidanceEl;
}
