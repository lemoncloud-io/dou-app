import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCloudSelfChannels } from './useCloudSelfChannels';

const channel = (id: string, stereo: string, cid: string, sid = 'S:wherever'): DomainChannel =>
    ({ id, stereo, cid, sid }) as unknown as DomainChannel;

/** The shared observation this hook slices — no repositories involved. */
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

describe('useCloudSelfChannels', () => {
    // The notes-to-self room belongs to the account, not a place, so it is read cloud-wide. A cloud
    // 1:1 is listed nowhere on mobile home, so this section does not take it either.
    it('keeps only the notes-to-self room, whatever place it carries', () => {
        const { result } = renderHook(() => useCloudSelfChannels(), {
            wrapper: wrapper([
                channel('cloud-dm', 'dm', '1000001', 'S:creator-was-here'),
                channel('relay-dm', 'dm', 'default'),
                channel('group', 'private', '1000001'),
                channel('self', 'self', '1000001', 'S:somewhere'),
            ]),
        });

        expect(result.current.channels.map(c => c.id)).toEqual(['self']);
        expect(result.current.isLoading).toBe(false);
    });

    // The relay's self chat lives in its one place and is already listed there; taking it here as
    // well would show it twice.
    it('leaves the relay notes-to-self room to the place list', () => {
        const { result } = renderHook(() => useCloudSelfChannels(), {
            wrapper: wrapper([channel('relay-self', 'self', 'default')]),
        });

        expect(result.current.channels).toEqual([]);
    });

    // An empty cloud and a cloud whose read has not landed are the same array; only the flag tells
    // them apart, so the empty state cannot be shown over an unfinished read.
    it('reports loading from the observation, not from emptiness', () => {
        const { result } = renderHook(() => useCloudSelfChannels(), { wrapper: wrapper([], false) });

        expect(result.current.channels).toEqual([]);
        expect(result.current.isLoading).toBe(true);
    });
});
