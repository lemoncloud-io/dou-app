import { MemoryStore } from '@chatic/storage';

import { configureAppStores, deviceStore, resetAppStores, tabStore } from './appStores';

describe('appStores', () => {
    beforeEach(() => {
        resetAppStores();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('writes to the web storages before the entry point configures it', () => {
        deviceStore.set('d', '1');
        tabStore.set('t', '1');
        expect(localStorage.getItem('d')).toBe('1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });

    it('routes a store taken before configuration to the configured one', () => {
        const taken = deviceStore; // what a store created at import time holds
        const device = new MemoryStore();
        configureAppStores({ device, tab: new MemoryStore() });
        taken.set('d', '1');
        expect(device.get('d')).toBe('1');
        expect(taken.keys()).toEqual(['d']);
        expect(localStorage.length).toBe(0);
    });
});
