import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, render, screen } from '@testing-library/react';

import type * as SharedModule from '../../../shared';

const GUEST_UUID = 'de54529d-1c2b-4f3e-9a8b-7c6d5e4f3a2b';

const session = vi.hoisted(() => ({
    profile: { userName: '', photo: null as string | null, isGuest: false },
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
    useCurrentPlace: () => ({ placeName: 'Lemon' }),
}));

import '../../../../i18n';
import { useSiteProfilesStore } from '../../../shared';
import { ProfilePage } from './ProfilePage';

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe('ProfilePage account name', () => {
    beforeEach(() => {
        useSiteProfilesStore.setState({ profiles: {} });
    });
    afterEach(cleanup);

    it('names a guest "Guest" everywhere the account name shows, never by the UUID', () => {
        session.profile = { userName: GUEST_UUID, photo: null, isGuest: true };
        render(<ProfilePage />, { wrapper });

        expect(screen.queryByText(GUEST_UUID)).toBeNull();
        // The "This place" card falls back to the account, and the Account card names it.
        expect(screen.getAllByText('Guest')).toHaveLength(2);
    });

    it('shows a real account name as it is', () => {
        session.profile = { userName: 'Kim', photo: null, isGuest: false };
        render(<ProfilePage />, { wrapper });

        expect(screen.getAllByText('Kim')).toHaveLength(2);
    });
});
