import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import type * as SharedModule from '../../../shared';

const toast = vi.hoisted(() => vi.fn());

vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast,
}));
vi.mock('@chatic/theme', () => ({
    useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    VersionInfo: () => null,
}));
vi.mock('../hooks', () => ({
    useDevicePushMute: () => ({
        isSupported: false,
        pushEnabled: false,
        isPending: false,
        hasFailed: false,
        setPushEnabled: vi.fn(),
    }),
}));
vi.mock('../../chat/components/NotificationSnoozeButton', () => ({
    NotificationSnoozeButton: () => null,
}));

import i18n from '../../../../i18n';
import { applyAppearance, useAppearancePrefsStore } from '../../../shared';
import { SettingsPage } from './SettingsPage';

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/settings']}>
            <SettingsPage />
        </MemoryRouter>
    );

const themeGroup = () => screen.getByRole('radiogroup', { name: 'Theme' });

describe('SettingsPage theme', () => {
    beforeEach(() => {
        localStorage.clear();
        toast.mockReset();
        useAppearancePrefsStore.setState({ fontSize: 'default', density: 'comfy', palette: 'mist' });
    });

    afterEach(() => {
        cleanup();
        void i18n.changeLanguage('en');
    });

    it('offers the six palettes, Mist marked as the default and chosen', () => {
        renderPage();

        const options = within(themeGroup()).getAllByRole('radio');
        expect(options.map(option => option.textContent)).toEqual([
            'Mist (Default)',
            'Midnight',
            'Forest',
            'Ocean',
            'Plum',
            'Lemon',
        ]);
        expect(within(themeGroup()).getByRole('radio', { checked: true }).textContent).toBe('Mist (Default)');
    });

    it('keeps light, dark and system under their own heading', () => {
        renderPage();

        const mode = screen.getByRole('radiogroup', { name: 'Display mode' });
        expect(within(mode).getAllByRole('radio')).toHaveLength(3);
    });

    it('recolours the shell at once and keeps the choice', () => {
        renderPage();

        fireEvent.click(within(themeGroup()).getByRole('radio', { name: 'Forest' }));

        expect(document.documentElement.dataset.palette).toBe('forest');
        expect(within(themeGroup()).getByRole('radio', { checked: true }).textContent).toBe('Forest');
        const stored = JSON.parse(localStorage.getItem('chatic-appearance-prefs') ?? '{}');
        expect(stored.state.palette).toBe('forest');
    });

    it('says the theme was applied, in the words of the design', async () => {
        await i18n.changeLanguage('ko');
        renderPage();

        fireEvent.click(within(screen.getByRole('radiogroup', { name: '테마' })).getByRole('radio', { name: 'Ocean' }));

        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '테마 적용 완료' }));
    });

    it('does not announce a palette that is already on', () => {
        renderPage();

        fireEvent.click(within(themeGroup()).getByRole('radio', { name: 'Mist (Default)' }));

        expect(toast).not.toHaveBeenCalled();
    });

    it('falls back to Mist for a stored palette this build does not know', async () => {
        localStorage.setItem(
            'chatic-appearance-prefs',
            JSON.stringify({ state: { fontSize: 'default', density: 'comfy', palette: 'sunset' }, version: 0 })
        );

        await useAppearancePrefsStore.persist.rehydrate();
        applyAppearance(useAppearancePrefsStore.getState());

        expect(document.documentElement.dataset.palette).toBe('mist');
    });
});
