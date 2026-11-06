/**
 * Where a value physically lives. The name is the medium, not the meaning of what is stored in it:
 * a domain (the session, push registration) declares the ports it needs, and each app's entry point
 * decides which medium backs each port in that environment.
 *
 * - `webLocal` — the page's `localStorage`: survives a reload and a relaunch, per origin.
 * - `webSession` — the page's `sessionStorage`: survives a reload, dies with the tab.
 * - `memory` — this page lifetime only.
 */
export type MediumName = 'webLocal' | 'webSession' | 'memory';

/**
 * The one shape every medium has. Synchronous on purpose: the session is read on every request and
 * every render, so a read must never wait.
 */
export interface KeyValueStore {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
    /** Empties the whole medium — every key in it, not only the ones a given caller wrote. */
    clear(): void;
    keys(): string[];
}
