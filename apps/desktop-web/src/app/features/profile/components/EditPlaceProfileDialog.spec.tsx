import { useState } from 'react';

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
/** Mirrors the real hook's saving flag, which is what disables the form during a save. */
const useFakeMyProfile = () => {
    const [isSaving, setIsSaving] = useState(false);
    const save = async (body: unknown) => {
        setIsSaving(true);
        try {
            return await setMyProfile(body);
        } finally {
            setIsSaving(false);
        }
    };
    return { isLoading: false, isSaving, load, save };
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
        const useAccount = screen.getByRole('button', { name: 'Use account profile' });
        useAccount.focus();
        fireEvent.click(useAccount);

        await screen.findByRole('alert');
        await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Nickname')));
    });
});
