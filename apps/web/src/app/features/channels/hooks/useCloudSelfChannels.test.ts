import { createElement, type ReactNode } from 'react';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/runtime';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCloudSelfChannels } from './useCloudSelfChannels';

const channel = (id: string, stereo: string, cid: string, sid = 'S:wherever'): DomainChannel =>
    ({ id, stereo, cid, sid }) as unknown as DomainChannel;

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

    it('leaves the relay notes-to-self room to the place list', () => {
        const { result } = renderHook(() => useCloudSelfChannels(), {
            wrapper: wrapper([channel('relay-self', 'self', 'default')]),
        });

        expect(result.current.channels).toEqual([]);
    });

    it('reports loading from the observation, not from emptiness', () => {
        const { result } = renderHook(() => useCloudSelfChannels(), { wrapper: wrapper([], false) });

        expect(result.current.channels).toEqual([]);
        expect(result.current.isLoading).toBe(true);
    });
});
