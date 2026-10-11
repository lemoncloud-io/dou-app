import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { LaunchAtLoginState } from '../../../shared/utils/electronApi';

// The section reads the OS through the preload bridge; each test answers as the OS would.
const api = vi.hoisted(() => ({
    get: vi.fn(async (): Promise<LaunchAtLoginState> => ({ enabled: false, supported: true })),
    set: vi.fn(async (enabled: boolean): Promise<LaunchAtLoginState> => ({ enabled, supported: true })),
}));
vi.mock('../../../shared/utils/electronApi', async importOriginal => ({
    ...(await importOriginal<object>()),
    getLoginItemApi: () => api,
}));

import '../../../../i18n';

import { LaunchAtLoginSection } from './LaunchAtLoginSection';

const renderSection = async () => {
    render(<LaunchAtLoginSection />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeTruthy());
};

describe('LaunchAtLoginSection', () => {
    beforeEach(() => {
        cleanup();
        api.get.mockReset();
        api.set.mockReset();
        api.get.mockResolvedValue({ enabled: false, supported: true });
        api.set.mockImplementation(async enabled => ({ enabled, supported: true }));
    });

    it('renders the OS-reported switch position', async () => {
        api.get.mockResolvedValueOnce({ enabled: true, supported: true });
        await renderSection();

        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    });

    it('applies the OS answer after a toggle, not the request', async () => {
        // macOS 13+ can answer `requires-approval` and leave the app unregistered.
        api.set.mockResolvedValueOnce({ enabled: false, supported: true });
        await renderSection();

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => expect(api.set).toHaveBeenCalledWith(true));
        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    // A failed write used to flip the switch back with nothing said — a flicker.
    it('names a failed write and falls back to the previous position', async () => {
        api.set.mockRejectedValueOnce(new Error('denied'));
        await renderSection();

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
        expect(screen.getByRole('alert').textContent).toBe('Could not change this setting.');
        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    });

    it('clears the failure notice on the next toggle', async () => {
        api.set.mockRejectedValueOnce(new Error('denied'));
        await renderSection();

        fireEvent.click(screen.getByRole('switch'));
        await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
