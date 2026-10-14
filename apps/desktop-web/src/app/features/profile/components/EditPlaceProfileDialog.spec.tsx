import { useCallback, useState } from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as SharedModule from '../../../shared';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'u1' }),
            useRuntimeProfile: () => ({ userName: 'Kim', photo: null }),
        },
    },
}));

const load = vi.fn();
const setMyProfile = vi.fn();
/** Mirrors the real hook's flags: loading while the opening read is in flight, saving around a save. */
const useFakeMyProfile = () => {
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const loadWhile = useCallback(async () => {
        setIsLoading(true);
        try {
            return await load();
        } finally {
            setIsLoading(false);
        }
    }, []);
    const save = async (body: unknown) => {
        setIsSaving(true);
        try {
            return await setMyProfile(body);
        } finally {
            setIsSaving(false);
        }
    };
    return { isLoading, isSaving, load: loadWhile, save };
};
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useMyProfile: () => useFakeMyProfile(),
    useCurrentPlace: () => ({ placeName: 'Lemon' }),
}));

import '../../../../i18n';
import { useSiteProfilesStore } from '../../../shared';
import { useEditPlaceProfileDialogStore } from '../stores';
import { EditPlaceProfileDialog } from './EditPlaceProfileDialog';

// Saving disables the field and the buttons, so the control that was focused goes dead
// and focus fell to <body>. A failed save left it there, away from the field to fix.
describe('EditPlaceProfileDialog focus after a failed save', () => {
    beforeEach(() => {
        load.mockResolvedValue(null);
        setMyProfile.mockRejectedValue(new Error('offline'));
        useSiteProfilesStore.setState({ profiles: { u1: { nick: 'Kimmy' } } });
        act(() => useEditPlaceProfileDialogStore.getState().open());
    });
    afterEach(() => {
        act(() => useEditPlaceProfileDialogStore.getState().close());
        useSiteProfilesStore.setState({ profiles: {} });
        vi.clearAllMocks();
    });

    it('puts focus back on the nickname field when Save fails', async () => {
        render(<EditPlaceProfileDialog />);
        // The opening read disables the form until it settles.
        await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy());
        await waitFor(() =>
            expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false)
        );
        const save = screen.getByRole('button', { name: 'Save' });
        save.focus();
        fireEvent.click(save);

        await screen.findByRole('alert');
        const nick = screen.getByLabelText('Nickname') as HTMLInputElement;
        await waitFor(() => expect(document.activeElement).toBe(nick));
        expect(nick.disabled).toBe(false);
    });

    it('puts focus back on the nickname field when switching to the account profile fails', async () => {
        render(<EditPlaceProfileDialog />);
        await waitFor(() =>
            expect((screen.getByRole('button', { name: 'Use account profile' }) as HTMLButtonElement).disabled).toBe(
                false
            )
        );
        const useAccount = screen.getByRole('button', { name: 'Use account profile' });
        useAccount.focus();
        fireEvent.click(useAccount);

        await screen.findByRole('alert');
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Nickname')));
    });

    // The autofocused field is disabled while the opening read loads, so the
    // autofocus lands nowhere and focus is left on the page behind the dialog.
    it('focuses the nickname field once the opening load finishes', async () => {
        let settle: (profile: null) => void = () => undefined;
        load.mockReturnValue(new Promise<null>(resolve => (settle = resolve)));
        render(<EditPlaceProfileDialog />);

        const nick = screen.getByLabelText('Nickname') as HTMLInputElement;
        expect(nick.disabled).toBe(true);

        await act(async () => settle(null));

        await waitFor(() => expect(document.activeElement).toBe(nick));
        expect(nick.disabled).toBe(false);
    });
});
