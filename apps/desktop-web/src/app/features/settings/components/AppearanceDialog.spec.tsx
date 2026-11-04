import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<object>()),
    toast: vi.fn(),
}));
const setTheme = vi.hoisted(() => vi.fn());
vi.mock('@chatic/theme', () => ({
    useTheme: () => ({ theme: 'light', setTheme }),
}));

import i18n from '../../../../i18n';
import { useAppearancePrefsStore } from '../../../shared';
import { useAppearanceDialogStore } from '../stores/useAppearanceDialogStore';
import { AppearanceDialog } from './AppearanceDialog';

describe('AppearanceDialog', () => {
    beforeEach(() => {
        localStorage.clear();
        setTheme.mockReset();
        useAppearanceDialogStore.setState({ isOpen: false });
        useAppearancePrefsStore.setState({ fontSize: 'default', density: 'comfy', palette: 'mist' });
    });

    afterEach(() => {
        cleanup();
        void i18n.changeLanguage('en');
    });

    it('renders nothing until the store opens it', () => {
        render(<AppearanceDialog />);
        expect(screen.queryByRole('dialog')).toBeNull();

        act(() => useAppearanceDialogStore.getState().setOpen(true));
        expect(screen.getByRole('dialog', { name: 'Appearance' })).toBeTruthy();
    });

    it('recolours the shell at once, while the dialog stays open', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));

        fireEvent.click(
            within(screen.getByRole('radiogroup', { name: 'Theme' })).getByRole('radio', { name: 'Forest' })
        );

        expect(useAppearancePrefsStore.getState().palette).toBe('forest');
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('applies a display mode pick at once', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));

        fireEvent.click(
            within(screen.getByRole('radiogroup', { name: 'Display mode' })).getByRole('radio', { name: 'Dark' })
        );

        expect(setTheme).toHaveBeenCalledWith('dark');
    });

    it('applies text size and message density at once', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));

        fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));

        expect(useAppearancePrefsStore.getState().fontSize).toBe('large');
        expect(useAppearancePrefsStore.getState().density).toBe('compact');
    });

    it('closes from the close button', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(useAppearanceDialogStore.getState().isOpen).toBe(false);
    });

    it('updates the appearance preview live', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));
        const preview = screen.getByTestId('appearance-preview');
        expect(preview.getAttribute('data-font-size')).toBe('default');
        expect(preview.getAttribute('data-density')).toBe('comfy');

        fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
        fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));

        expect(preview.getAttribute('data-font-size')).toBe('large');
        expect(preview.getAttribute('data-density')).toBe('compact');
        expect(document.documentElement.style.fontSize).toBe('17px');
        expect(document.documentElement.style.getPropertyValue('--message-row-py')).toBe('0.125rem');
    });

    it('moves the choice with the arrow keys', () => {
        render(<AppearanceDialog />);
        act(() => useAppearanceDialogStore.getState().setOpen(true));

        fireEvent.keyDown(screen.getByRole('radio', { name: 'Default' }), { key: 'ArrowRight' });

        expect(useAppearancePrefsStore.getState().fontSize).toBe('large');
    });
});
