import { MemoryStore, TolerantStore } from '@chatic/storage';

import { runtimeStores } from './runtimeStores';

describe('runtimeStores', () => {
    beforeEach(() => {
        runtimeStores.reset();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('defaults to the web storages before an entry point configures it', () => {
        runtimeStores.device().set('d', '1');
        runtimeStores.tab().set('t', '1');
        expect(localStorage.getItem('d')).toBe('1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });

    it('keeps the tab store raw by default, so the invited-cloud cache hears a failed write', () => {
        expect(runtimeStores.tab()).not.toBeInstanceOf(TolerantStore);
        expect(runtimeStores.device()).toBeInstanceOf(TolerantStore);
    });

    it('serves what the entry point configured, keeping the store it left out', () => {
        const device = new MemoryStore();
        runtimeStores.configure({ device });
        expect(runtimeStores.device()).toBe(device);
        runtimeStores.tab().set('t', '1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });
});
