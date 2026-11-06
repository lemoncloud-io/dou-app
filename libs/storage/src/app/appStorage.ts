import { NoopAdapter } from './noopAdapter';

import type { IAppStorage, StorageAdapter } from './types';

/**
 * The app-wide storage for state that belongs to no domain port — push registration records, the
 * desktop sign-in hand-off. An entry point that keeps such state somewhere else points it there
 * (`setStorageAdapter`); until then it is this tab's `sessionStorage`, which is the browser's answer
 * and the one an app that never sets it (admin-v2, the landing site, the testbed) keeps.
 */
export class AppStorage implements IAppStorage {
    private adapter: StorageAdapter = typeof sessionStorage !== 'undefined' ? sessionStorage : new NoopAdapter();

    get(key: string): string | null {
        return this.adapter.getItem(key);
    }

    set(key: string, value: string): void {
        this.adapter.setItem(key, value);
    }

    remove(key: string): void {
        this.adapter.removeItem(key);
    }

    use(adapter: StorageAdapter): void {
        this.adapter = adapter;
    }
}
