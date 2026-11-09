import { storageKeyFor } from '@chatic/config';
import { WebMedium } from '@chatic/storage';
import { syncThemeFromSharedKey } from './themeSharedKeySync';

describe('syncThemeFromSharedKey', () => {
    beforeEach(() => localStorage.clear());

    it('mirrors the shared vite-ui-theme key into the config namespaced key', () => {
        localStorage.setItem('vite-ui-theme', 'dark');

        syncThemeFromSharedKey(WebMedium.local());

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBe('"dark"');
    });

    it('leaves the shared key in place for the other apps that still read it', () => {
        localStorage.setItem('vite-ui-theme', 'dark');

        syncThemeFromSharedKey(WebMedium.local());

        expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
    });

    it('does nothing when the shared key is absent', () => {
        syncThemeFromSharedKey(WebMedium.local());

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBeNull();
    });

    it('re-syncs on every boot so a change made in another app shows up', () => {
        localStorage.setItem('vite-ui-theme', 'dark');
        syncThemeFromSharedKey(WebMedium.local());
        localStorage.setItem('vite-ui-theme', 'light');

        syncThemeFromSharedKey(WebMedium.local());

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBe('"light"');
    });
});
