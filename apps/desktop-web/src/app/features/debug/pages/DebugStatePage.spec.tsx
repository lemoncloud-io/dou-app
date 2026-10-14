import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: 'u1' }),
            useRuntimeProfile: () => ({ userName: 'Kim' }),
            getActiveSessionUser: () => null,
            useSessionAuth: () => ({ isAuthenticated: true }),
            useSessionSelection: () => ({ selectedCloudId: 'c1', selectedSiteId: 's1' }),
        },
        connection: {
            useRuntimeSocketState: () => ({ isConnected: true, isVerified: true, state: 'open' }),
        },
    },
}));
vi.mock('../../../shared', () => ({
    useClouds: () => ({ clouds: [], activeCloudId: 'c1' }),
    usePlaces: () => ({ places: [] }),
    useSelectedChannelStore: (select: (s: { selectedChannelId: null }) => null) => select({ selectedChannelId: null }),
    useChannels: () => ({ channels: [] }),
}));

import { DebugStatePage } from './DebugStatePage';

describe('DebugStatePage', () => {
    it('heads sections in ink, not the 1.6:1 lime', () => {
        render(<DebugStatePage />);

        expect(screen.getByText('Session').className).toContain('text-primary-ink');
    });

    it('draws rows no smaller than tiny', () => {
        render(<DebugStatePage />);

        expect(screen.getByText('Authenticated').className).toContain('text-tiny');
    });
});
