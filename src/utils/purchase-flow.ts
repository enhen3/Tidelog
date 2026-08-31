import { Notice } from 'obsidian';
import { t } from '../i18n';

/**
 * Keep the buyer's next step inside TideLog when Afdian drops the item route
 * after login. The first click opens the canonical item and turns the same CTA
 * into a retry. Once Afdian has established the session, that retry lands on
 * the item directly, so the buyer never has to search the platform homepage.
 */
export function bindAfdianPurchaseFlow(
    target: HTMLElement,
    purchaseUrl: string,
    setRetryLabel: () => void,
): void {
    let hasOpened = false;
    target.addEventListener('click', (event) => {
        event.preventDefault();
        window.open(purchaseUrl);

        if (hasOpened) return;
        hasOpened = true;
        setRetryLabel();
        new Notice(t('pro.purchaseRetryNotice'), 8_000);
    });
}
