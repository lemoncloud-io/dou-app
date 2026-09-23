import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCloudDmChannels } from './useCloudDmChannels';

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

describe('useCloudDmChannels', () => {
    // Every 1:1 in this cloud, whatever place it carries — `sid` does not scope this read.
    it('keeps the cloud 1:1 rooms, place tag and all', () => {
        const { result } = renderHook(() => useCloudDmChannels(), {
            wrapper: wrapper([
                channel('cloud-dm', 'dm', '1000001', 'S:creator-was-here'),
                channel('relay-dm', 'dm', 'default'),
                channel('group', 'private', '1000001'),
                channel('self', 'self', '1000001'),
            ]),
        });

        expect(result.current.channels.map(c => c.id)).toEqual(['cloud-dm']);
        expect(result.current.isLoading).toBe(false);
    });

    // The section exists because these rooms are in no place list. If it also took the relay's
    // 1:1s — which DO live in a place and are already listed — they would appear twice.
    it('leaves a relay 1:1 to the place list it already appears in', () => {
        const { result } = renderHook(() => useCloudDmChannels(), {
            wrapper: wrapper([channel('relay-dm', 'dm', 'default')]),
        });

        expect(result.current.channels).toEqual([]);
    });

    // An empty cloud and a cloud whose read has not landed are the same array; only the flag tells
    // them apart, so the empty state cannot be shown over an unfinished read.
    it('reports loading from the observation, not from emptiness', () => {
        const { result } = renderHook(() => useCloudDmChannels(), { wrapper: wrapper([], false) });

        expect(result.current.channels).toEqual([]);
        expect(result.current.isLoading).toBe(true);
    });
});
