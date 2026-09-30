import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, cleanup, render, screen } from '@testing-library/react';

import type * as SharedModule from '../../../shared';

const GUEST_UUID = 'de54529d-1c2b-4f3e-9a8b-7c6d5e4f3a2b';

const session = vi.hoisted(() => ({
    profile: { userName: '', photo: null as string | null, isGuest: false },
}));
// My place profile read (`useMyProfile().load`). Each test decides when, and with what, it settles.
const placeRead = vi.hoisted(() => ({
    load: vi.fn<() => Promise<{ nick?: string; thumbnail?: string } | null>>(),
}));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'u1' }),
            useRuntimeProfile: () => session.profile,
            getActiveSessionUser: () => null,
        },
    },
}));
vi.mock('../../auth', () => ({
    GoogleIcon: () => null,
    isSocialLoginEnabled: () => false,
    useSocialLogin: () => ({ start: vi.fn() }),
}));
// The dialog has its own spec; this file is about what the page draws.
vi.mock('../components', () => ({
    EditPlaceProfileDialog: () => null,
    PlaceChip: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('../../../shared', async () => ({
    ...(await vi.importActual<typeof SharedModule>('../../../shared')),
    useSiteProfiles: () => undefined,
    useMyProfile: () => ({ load: placeRead.load }),
    useCurrentPlace: () => ({ placeName: 'Lemon' }),
}));

import '../../../../i18n';
import { useSiteProfilesStore } from '../../../shared';
import { ProfilePage } from './ProfilePage';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('ProfilePage account name', () => {
    beforeEach(() => {
        useSiteProfilesStore.setState({ profiles: {} });
        placeRead.load.mockResolvedValue(null);
    });
    afterEach(cleanup);

    it('names a guest "Guest" everywhere the account name shows, never by the UUID', async () => {
        session.profile = { userName: GUEST_UUID, photo: null, isGuest: true };
        render(<ProfilePage />, { wrapper });
        await screen.findByRole('button', { name: 'Set up' });

        expect(screen.queryByText(GUEST_UUID)).toBeNull();
        // The "This place" card falls back to the account, and the Account card names it.
        expect(screen.getAllByText('Guest')).toHaveLength(2);
    });

    it('shows a real account name as it is', async () => {
        session.profile = { userName: 'Kim', photo: null, isGuest: false };
        render(<ProfilePage />, { wrapper });
        await screen.findByRole('button', { name: 'Set up' });

        expect(screen.getAllByText('Kim')).toHaveLength(2);
    });
});

describe('ProfilePage "This place" card', () => {
    beforeEach(() => {
        session.profile = { userName: 'Kim', photo: null, isGuest: false };
        useSiteProfilesStore.setState({ profiles: {} });
    });
    afterEach(cleanup);

    // The card used to say "Set up" and flip to "Edit" once the edit dialog's read of my place
    // profile landed. It now waits for that read instead of guessing.
    it('draws neither state until my place profile is read, then the right one', async () => {
        let settle: (profile: { nick?: string } | null) => void = () => undefined;
        placeRead.load.mockReturnValue(new Promise(resolve => (settle = resolve)));
        render(<ProfilePage />, { wrapper });

        expect(screen.queryByRole('button', { name: 'Set up' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

        await act(async () => settle({ nick: 'Kimmy' }));

        expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
        expect(screen.getByText('Kimmy')).toBeTruthy();
        expect(screen.getByText('How you appear in Lemon.')).toBeTruthy();
    });

    it('offers "Set up" once the read finds no place profile', async () => {
        placeRead.load.mockResolvedValue(null);
        render(<ProfilePage />, { wrapper });

        expect(await screen.findByRole('button', { name: 'Set up' })).toBeTruthy();
        expect(screen.getByText('Using your account profile here.')).toBeTruthy();
    });

    it('draws at once when the cache already holds my place profile', () => {
        placeRead.load.mockReturnValue(new Promise(() => undefined));
        useSiteProfilesStore.setState({ profiles: { u1: { nick: 'Kimmy' } } });
        render(<ProfilePage />, { wrapper });

        expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    });

    // The edit dialog draws "?" for a person with no name; the card must not draw "-" beside it.
    it('marks a nameless account with the same "?" the edit dialog uses', async () => {
        session.profile = { userName: '', photo: null, isGuest: false };
        placeRead.load.mockResolvedValue(null);
        render(<ProfilePage />, { wrapper });
        await screen.findByRole('button', { name: 'Set up' });

        expect(screen.getByText('?')).toBeTruthy();
    });
});
