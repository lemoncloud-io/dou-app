import { renderHook } from '@testing-library/react';

import type { DomainCloud } from '@chatic/data';

import { useInvitedClouds } from './useInvitedClouds';

let mockCached: DomainCloud[] = [];
let mockOwned: DomainCloud[] = [];
let mockDelegatorId: string | null = 'guest-1';

// One repositories object for every render, as the runtime hands out: the hook subscribes per `cloud`,
// and a fresh one each render would re-subscribe and re-set state forever.
const mockRepositories = {
    cloud: {
        observeList: (listener: (result: { list: DomainCloud[] }) => void) => {
            listener({ list: mockCached });
            return () => undefined;
        },
    },
};

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => mockRepositories },
        session: { useSessionIdentity: () => ({ delegatorId: mockDelegatorId }) },
    },
}));
jest.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: mockOwned }),
}));

const invited = (id: string, acceptedBy?: string[]): DomainCloud =>
    ({ id, cid: id, cloudType: 'invited', acceptedBy }) as DomainCloud;

beforeEach(() => {
    mockCached = [];
    mockOwned = [];
    mockDelegatorId = 'guest-1';
});

describe('useInvitedClouds', () => {
    it('lists the invited rows of the cloud cache, and only those', () => {
        mockCached = [invited('a'), { id: 'b', cid: 'b', cloudType: 'owner' } as DomainCloud];

        const { result } = renderHook(() => useInvitedClouds());

        expect(result.current.invitedClouds.map(c => c.id)).toEqual(['a']);
        expect(result.current.hasInvitedClouds).toBe(true);
        expect(result.current.ownedAlsoInvitedIds).toEqual([]);
    });

    it('hides an invited row the account owns, and reports it as owned and invited', () => {
        mockCached = [invited('a'), invited('owned-1')];
        mockOwned = [{ id: 'owned-1' } as DomainCloud];

        const { result } = renderHook(() => useInvitedClouds());

        expect(result.current.invitedClouds.map(c => c.id)).toEqual(['a']);
        expect(result.current.ownedAlsoInvitedIds).toEqual(['owned-1']);
    });

    it('reports an owned and invited row whoever accepted it — the reclaim decides what it holds', () => {
        mockCached = [invited('owned-1', ['another-guest'])];
        mockOwned = [{ id: 'owned-1' } as DomainCloud];

        const { result } = renderHook(() => useInvitedClouds());

        expect(result.current.ownedAlsoInvitedIds).toEqual(['owned-1']);
    });

    it('leaves out a row another guest accepted from the invited list', () => {
        mockCached = [invited('a', ['another-guest']), invited('b', ['guest-1'])];

        const { result } = renderHook(() => useInvitedClouds());

        expect(result.current.invitedClouds.map(c => c.id)).toEqual(['b']);
    });
});
