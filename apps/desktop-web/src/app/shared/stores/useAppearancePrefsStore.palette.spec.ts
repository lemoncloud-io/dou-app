import { beforeEach, describe, expect, it } from 'vitest';

import { derivePaletteTokens, PRESET_COLORS } from '../theme/shellPalette';

import { applyAppearance, useAppearancePrefsStore } from './useAppearancePrefsStore';

const STORAGE_KEY = 'chatic-appearance-prefs';
const shellCss = () => document.getElementById('shell-palette')?.textContent ?? '';
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

const SEA = { cloudRail: '#0B3D2E', navRail: '#14532D', list: '#ECFDF5' };

describe('useAppearancePrefsStore shell palette', () => {
    beforeEach(() => {
        localStorage.clear();
        useAppearancePrefsStore.setState({
            fontSize: 'default',
            density: 'comfy',
            palette: 'mist',
            customPalette: null,
        });
        applyAppearance(useAppearancePrefsStore.getState());
    });

    it('writes the picked preset into the shell stylesheet, for light and dark mode', () => {
        useAppearancePrefsStore.getState().setPalette('forest');

        const light = derivePaletteTokens(PRESET_COLORS.forest, 'light');
        const dark = derivePaletteTokens(PRESET_COLORS.forest, 'dark');
        expect(shellCss()).toContain(`--rail: ${light.root['rail']};`);
        expect(shellCss()).toContain(`--rail: ${dark.root['rail']};`);
        expect(shellCss()).toContain(':root.dark {');
    });

    it('leaves dark mode to its own shell on Mist', () => {
        useAppearancePrefsStore.getState().setPalette('forest');
        useAppearancePrefsStore.getState().setPalette('mist');

        expect(shellCss()).toContain(':root:not(.dark) {');
        expect(shellCss()).not.toContain(':root.dark');
    });

    it('applies and persists a custom palette', () => {
        useAppearancePrefsStore.getState().setCustomPalette(SEA);

        expect(useAppearancePrefsStore.getState().palette).toBe('custom');
        expect(shellCss()).toContain(`--sidebar: ${derivePaletteTokens(SEA, 'light').root['sidebar']};`);
        expect(stored().state).toMatchObject({ palette: 'custom', customPalette: SEA });
        expect(stored().version).toBe(1);
    });

    it('keeps the custom colours when a preset is picked, so Custom can be picked again', () => {
        useAppearancePrefsStore.getState().setCustomPalette(SEA);
        useAppearancePrefsStore.getState().setPalette('plum');

        expect(useAppearancePrefsStore.getState().customPalette).toEqual(SEA);
        expect(shellCss()).toContain(`--rail: ${derivePaletteTokens(PRESET_COLORS.plum, 'light').root['rail']};`);
    });

    it('migrates a palette stored by the previous version', async () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ state: { fontSize: 'default', density: 'comfy', palette: 'plum' }, version: 0 })
        );

        await useAppearancePrefsStore.persist.rehydrate();

        expect(useAppearancePrefsStore.getState()).toMatchObject({ palette: 'plum', customPalette: null });
        expect(shellCss()).toContain(`--rail: ${derivePaletteTokens(PRESET_COLORS.plum, 'dark').root['rail']};`);
    });

    it.each([
        ['an unknown palette', { palette: 'neon', customPalette: null }],
        ['custom with no colours', { palette: 'custom', customPalette: null }],
        [
            'custom with malformed colours',
            { palette: 'custom', customPalette: { cloudRail: 'red', navRail: '#000000', list: '#FFFFFF' } },
        ],
    ])('reads %s as Mist', async (_case, state) => {
        // Start from a palette with dark rules, so falling back to Mist has something to undo.
        useAppearancePrefsStore.getState().setPalette('forest');
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ state: { fontSize: 'default', density: 'comfy', ...state }, version: 1 })
        );

        await useAppearancePrefsStore.persist.rehydrate();

        expect(useAppearancePrefsStore.getState().palette).toBe('mist');
        expect(shellCss()).not.toContain(':root.dark');
    });
});
