import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCloudDmCandidates } from './useCloudDmCandidates';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { session: { useSessionIdentity: () => ({ userId: 'me' }) } },
}));

const channel = (id: string, sid: string, memberIds?: string[]): DomainChannel =>
    ({ id, sid, memberIds }) as unknown as DomainChannel;

const wrapper =
    (channels: DomainChannel[], isLoaded = true) =>
    ({ children }: { children: ReactNode }) =>
        createElement(
            ActiveCloudDataContext.Provider,
            {
                value: {
                    channels,
                    isLoaded,
                    myJoins: new Map(),
                    unreads: { byChannel: {}, byPlace: {}, total: 0 },
                } as ActiveCloudData,
            },
            children
        );

describe('useCloudDmCandidates', () => {
    // The point of widening past `useInviteCandidates`: a colleague reachable only through a room
    // in ANOTHER place is exactly who this feature exists to reach.
    it('unions members across every place in the cloud', () => {
        const { result } = renderHook(() => useCloudDmCandidates(), {
            wrapper: wrapper([channel('c1', 's1', ['me', 'a']), channel('c2', 's2', ['me', 'b'])]),
        });

        expect(result.current.candidateIds.sort()).toEqual(['a', 'b']);
    });

    it('never offers me myself', () => {
        const { result } = renderHook(() => useCloudDmCandidates(), {
            wrapper: wrapper([channel('c1', 's1', ['me'])]),
        });

        expect(result.current.candidateIds).toEqual([]);
    });

    it('lists somebody once however many rooms we share', () => {
        const { result } = renderHook(() => useCloudDmCandidates(), {
            wrapper: wrapper([channel('c1', 's1', ['me', 'a']), channel('c2', 's1', ['me', 'a'])]),
        });

        expect(result.current.candidateIds).toEqual(['a']);
    });

    // The roster is optional and only the detail reads fill it. A row without one contributes
    // nothing rather than being guessed at.
    it('skips a row that arrived without a roster', () => {
        const { result } = renderHook(() => useCloudDmCandidates(), {
            wrapper: wrapper([channel('c1', 's1', undefined), channel('c2', 's1', ['me', 'a'])]),
        });

        expect(result.current.candidateIds).toEqual(['a']);
    });

    it('reports loading from the observation', () => {
        const { result } = renderHook(() => useCloudDmCandidates(), { wrapper: wrapper([], false) });

        expect(result.current.isLoading).toBe(true);
    });
});
