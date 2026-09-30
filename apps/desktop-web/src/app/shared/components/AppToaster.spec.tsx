import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toast, useToast } from '@chatic/ui-kit/components/ui/use-toast';

import i18n from '../../../i18n';
import { AppToaster } from './AppToaster';

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

// Error toasts used to vanish after 5s, one at a time, with no close button: a failure that
// fired while the person looked elsewhere left no trace, and a second one replaced the first.
describe('AppToaster', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        // The toast store is module-level: close everything and let the removal delay pass.
        const { result } = renderHook(() => useToast());
        act(() => result.current.dismiss());
        wait(2_000);
        vi.useRealTimers();
    });

    it('keeps an error until it is closed', () => {
        render(<AppToaster />);
        act(() => void toast({ variant: 'destructive', description: 'Could not add members.' }));

        wait(30_000);
        expect(screen.getByText('Could not add members.')).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        wait(1_000);
        expect(screen.queryByText('Could not add members.')).toBeNull();
    });

    it('still dismisses a confirmation on its own, without a close button', () => {
        render(<AppToaster />);
        act(() => void toast({ description: 'Channel created' }));

        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
        wait(7_000);
        expect(screen.queryByText('Channel created')).toBeNull();
    });

    it('shows a second error without evicting the first', () => {
        render(<AppToaster />);
        act(() => void toast({ variant: 'destructive', description: 'First failure' }));
        act(() => void toast({ variant: 'destructive', description: 'Second failure' }));

        expect(screen.getByText('First failure')).toBeTruthy();
        expect(screen.getByText('Second failure')).toBeTruthy();
    });
});

describe('AppToaster region', () => {
    afterEach(() => void i18n.changeLanguage('en'));

    it('names the toast region in the app language, with the hotkey filled in', async () => {
        await i18n.changeLanguage('ko');
        render(<AppToaster />);

        // Radix names the region "Notifications (F8)" unless it is given a label.
        expect(screen.getByRole('region', { name: '알림 (F8)' })).toBeTruthy();
    });
});
