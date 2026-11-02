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

import { derivePaletteTokens, PRESET_COLORS, useAppearancePrefsStore } from '../../../shared';
import { SettingsPage } from './SettingsPage';

const renderPage = () =>
    render(
        <MemoryRouter initialEntries={['/settings']}>
            <SettingsPage />
        </MemoryRouter>
    );

const themeGroup = () => screen.getByRole('radiogroup', { name: 'Theme' });
const customCard = () => within(themeGroup()).getByRole('radio', { name: 'Custom' });
const colourInput = (name: string) => screen.getByLabelText<HTMLInputElement>(name);
const shellCss = () => document.getElementById('shell-palette')?.textContent ?? '';

describe('SettingsPage custom theme', () => {
    beforeEach(() => {
        localStorage.clear();
        toast.mockReset();
        useAppearancePrefsStore.setState({
            fontSize: 'default',
            density: 'comfy',
            palette: 'forest',
            customPalette: null,
        });
    });

    afterEach(cleanup);

    it('offers Custom after the six presets, with no colour fields while a preset is on', () => {
        renderPage();

        const names = within(themeGroup())
            .getAllByRole('radio')
            .map(option => option.textContent);
        expect(names.at(-1)).toBe('Custom');
        expect(screen.queryByLabelText('List')).toBeNull();
    });

    it('starts Custom from the colours of the palette that was on', () => {
        renderPage();

        fireEvent.click(customCard());

        expect(customCard().getAttribute('aria-checked')).toBe('true');
        expect(colourInput('Cloud bar').value).toBe(PRESET_COLORS.forest.cloudRail.toLowerCase());
        expect(colourInput('Menu bar').value).toBe(PRESET_COLORS.forest.navRail.toLowerCase());
        expect(colourInput('List').value).toBe(PRESET_COLORS.forest.list.toLowerCase());
        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('seeds Custom the same way when the arrow keys move onto it', () => {
        useAppearancePrefsStore.setState({ palette: 'lemon' });
        renderPage();

        fireEvent.keyDown(within(themeGroup()).getByRole('radio', { name: 'Lemon' }), { key: 'ArrowRight' });

        expect(customCard().getAttribute('aria-checked')).toBe('true');
        expect(colourInput('Menu bar').value).toBe(PRESET_COLORS.lemon.navRail.toLowerCase());
    });

    it('recolours the shell while a colour is dragged, and says so once when it is set', () => {
        renderPage();
        fireEvent.click(customCard());
        toast.mockReset();

        fireEvent.input(colourInput('List'), { target: { value: '#fde68a' } });
        fireEvent.input(colourInput('List'), { target: { value: '#fef3c7' } });

        const colors = { ...PRESET_COLORS.forest, list: '#fef3c7' };
        expect(useAppearancePrefsStore.getState()).toMatchObject({ palette: 'custom', customPalette: colors });
        expect(shellCss()).toContain(`--sidebar: ${derivePaletteTokens(colors, 'light').root['sidebar']};`);
        expect(toast).not.toHaveBeenCalled();

        fireEvent.change(colourInput('List'), { target: { value: '#fef3c7' } });

        expect(toast).toHaveBeenCalledTimes(1);
    });

    it('keeps the custom colours across a reload', async () => {
        renderPage();
        fireEvent.click(customCard());
        fireEvent.input(colourInput('Cloud bar'), { target: { value: '#1e3a8a' } });
        cleanup();

        await useAppearancePrefsStore.persist.rehydrate();
        renderPage();

        expect(customCard().getAttribute('aria-checked')).toBe('true');
        expect(colourInput('Cloud bar').value).toBe('#1e3a8a');
    });
});
