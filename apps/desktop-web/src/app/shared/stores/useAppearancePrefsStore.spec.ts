import { beforeEach, describe, expect, it } from 'vitest';

import { applyAppearance, useAppearancePrefsStore } from './useAppearancePrefsStore';

const root = () => document.documentElement;

describe('useAppearancePrefsStore', () => {
    beforeEach(() => {
        localStorage.clear();
        useAppearancePrefsStore.setState({ fontSize: 'default', density: 'comfy' });
        applyAppearance(useAppearancePrefsStore.getState());
    });

    it('persists and applies appearance', () => {
        useAppearancePrefsStore.getState().setFontSize('large');
        useAppearancePrefsStore.getState().setDensity('compact');

        expect(root().style.fontSize).toBe('17px');
        expect(root().style.getPropertyValue('--message-row-py')).toBe('0.125rem');
        const stored = JSON.parse(localStorage.getItem('chatic-appearance-prefs') ?? '{}');
        expect(stored.state).toEqual({ fontSize: 'large', density: 'compact' });
    });

    it('sets 14px for small', () => {
        useAppearancePrefsStore.getState().setFontSize('small');

        expect(root().style.fontSize).toBe('14px');
    });

    it('leaves the root font-size alone at the default, and the rows at their old padding', () => {
        useAppearancePrefsStore.getState().setFontSize('large');
        useAppearancePrefsStore.getState().setFontSize('default');

        expect(root().style.fontSize).toBe('');
        expect(root().style.getPropertyValue('--message-row-py')).toBe('0.375rem');
        expect(root().style.getPropertyValue('--message-gap')).toBe('0.125rem');
    });

    it('applies a stored value synchronously on rehydrate', async () => {
        localStorage.setItem(
            'chatic-appearance-prefs',
            JSON.stringify({ state: { fontSize: 'small', density: 'spacious' }, version: 0 })
        );

        await useAppearancePrefsStore.persist.rehydrate();

        expect(root().style.fontSize).toBe('14px');
        expect(root().style.getPropertyValue('--message-row-py')).toBe('0.625rem');
    });
});
