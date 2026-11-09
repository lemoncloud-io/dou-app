import { MemoryMedium, TolerantMedium } from '@chatic/storage';

import { runtimeMedia } from './runtimeMedia';

describe('runtimeMedia', () => {
    beforeEach(() => {
        runtimeMedia.reset();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('defaults to the web storages before an entry point configures it', () => {
        runtimeMedia.device().set('d', '1');
        runtimeMedia.tab().set('t', '1');
        expect(localStorage.getItem('d')).toBe('1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });

    it('keeps the tab medium raw by default, so the invited-cloud cache hears a failed write', () => {
        expect(runtimeMedia.tab()).not.toBeInstanceOf(TolerantMedium);
        expect(runtimeMedia.device()).toBeInstanceOf(TolerantMedium);
    });

    it('serves what the entry point configured, keeping the medium it left out', () => {
        const device = new MemoryMedium();
        runtimeMedia.configure({ device });
        expect(runtimeMedia.device()).toBe(device);
        runtimeMedia.tab().set('t', '1');
        expect(sessionStorage.getItem('t')).toBe('1');
    });
});
