import { diagnosticsKind } from '../../config/diagnosticsKind';

let owner: 'web' | 'native' | undefined;

/**
 * Records who holds the session this run — `web` (the page) or `native` (the phone app's own
 * runtime) — once the entry point has settled it.
 */
export const setLaunchSessionOwner = (next: 'web' | 'native' | undefined): void => {
    owner = next;
};

/**
 * Who holds the session this run, for the log context and the performance pipeline to stamp. Only
 * where the `diagnostics` port sends the logs through the app: in a browser tab only the page can hold
 * it, and the value would say nothing. Read through `diagnosticsKind`, because the log context stamps
 * it on entries dispatched before the entry point publishes the ports.
 */
export const readLaunchSessionOwner = (): 'web' | 'native' | undefined =>
    diagnosticsKind() === 'shell' ? owner : undefined;
