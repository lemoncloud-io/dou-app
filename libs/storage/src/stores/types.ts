/**
 * Where a value physically lives. The name is the store, not the meaning of what is stored in it:
 * a domain (the session, push registration) declares the ports it needs, and each app's entry point
 * decides which store backs each port in that environment.
 *
 * - `webLocal` — the page's `localStorage`: survives a reload and a relaunch, per origin.
 * - `webSession` — the page's `sessionStorage`: survives a reload, dies with the tab.
 * - `memory` — this page lifetime only.
 * - `nativeSecure` — the device vault an app or desktop shell keeps, reached over the bridge.
 */
export type StoreName = 'webLocal' | 'webSession' | 'memory' | 'nativeSecure';

/**
 * The one shape every store has. Synchronous on purpose: the session is read on every request and
 * every render, so a read must never wait.
 */
export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    /** Empties the whole store — every key in it, not only the ones a given caller wrote. */
    clear(): void;
    keys(): string[];
}
