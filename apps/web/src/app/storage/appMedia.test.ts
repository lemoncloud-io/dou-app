import { MemoryMedium } from '@chatic/storage';

import { configureAppMedia, deviceMedium, resetAppMedia, tabMedium } from './appMedia';

describe('appMedia', () => {
    beforeEach(() => {
        resetAppMedia();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('writes to the web storages before the entry point configures it', () => {
        deviceMedium.set('d', '1');
        tabMedium.set('t', '1');
        expect(localStorage.getItem('d')).toBe('1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });

    it('routes a medium taken before configuration to the configured one', () => {
        const taken = deviceMedium; // what a store created at import time holds
        const device = new MemoryMedium();
        configureAppMedia({ device, tab: new MemoryMedium() });
        taken.set('d', '1');
        expect(device.get('d')).toBe('1');
        expect(taken.keys()).toEqual(['d']);
        expect(localStorage.length).toBe(0);
    });
});
