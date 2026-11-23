export const DESTINATION_WAIT_CAP_MS = 300;

export interface WaitForDestinationOptions {
    traversal: boolean;
    capMs?: number;
}

export const waitForDestination = ({ traversal, capMs = DESTINATION_WAIT_CAP_MS }: WaitForDestinationOptions) =>
    new Promise<void>(resolve => {
        const leaving: unknown = window.history.state;
        let settled = false;

        const observer = new MutationObserver(() => {
            if (!traversal || window.history.state !== leaving) finish();
        });
        const timer = setTimeout(() => finish(), capMs);

        function finish() {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            observer.disconnect();
            resolve();
        }

        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
