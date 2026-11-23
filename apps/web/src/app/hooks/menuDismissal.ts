export const MENU_EXIT_TIMEOUT_MS = 260;

const CLOSING_MENU_SELECTOR = '[role="menu"], [role="listbox"]';

export interface WaitForMenuDismissalOptions {
    root?: Document;
    timeoutMs?: number;
}

export const waitForMenuDismissal = ({
    root,
    timeoutMs = MENU_EXIT_TIMEOUT_MS,
}: WaitForMenuDismissalOptions = {}): Promise<void> => {
    const doc = root ?? (typeof document === 'undefined' ? undefined : document);
    if (!doc || !doc.querySelector(CLOSING_MENU_SELECTOR)) return Promise.resolve();

    return new Promise<void>(resolve => {
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            observer.disconnect();
            resolve();
        };

        const timer = window.setTimeout(settle, timeoutMs);
        const observer = new MutationObserver(() => {
            if (!doc.querySelector(CLOSING_MENU_SELECTOR)) settle();
        });
        observer.observe(doc.body, { childList: true, subtree: true });
    });
};
