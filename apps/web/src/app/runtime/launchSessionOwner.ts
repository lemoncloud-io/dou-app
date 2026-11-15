import { isNative } from '@chatic/bridges';

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
 * inside the app: in a browser tab only the page can hold it, and the value would say nothing.
 */
export const readLaunchSessionOwner = (): 'web' | 'native' | undefined => (isNative() ? owner : undefined);
