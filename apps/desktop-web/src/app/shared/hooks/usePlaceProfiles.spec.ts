import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

type Row = { uid: string; sid: string; nick?: string };
type Query = { sid?: string } | undefined;

const state = vi.hoisted(() => ({
    places: [] as Array<{ id: string }>,
    rows: [] as Row[],
    deferred: false,
    pending: [] as Array<() => void>,
    flush() {
        this.pending.splice(0).forEach(answer => answer());
    },
}));

vi.mock('@chatic/runtime-react', async () =>
    (await import('@chatic/runtime-react/testing')).fakeRuntimeModule({
        data: {
            useRuntimeRepositories: () => ({
                profile: {
                    observeList: (query: Query, callback: (result: { list: Row[] }) => void) => {
                        const answer = () =>
                            callback({ list: state.rows.filter(row => !query?.sid || row.sid === query.sid) });
                        if (state.deferred) state.pending.push(answer);
                        else answer();
                        return () => undefined;
                    },
                },
            }),
        },
    })
);

vi.mock('./usePlaces', () => ({ usePlaces: () => ({ places: state.places }) }));

import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';
import { usePlaceProfiles } from './usePlaceProfiles';

afterEach(() => {
    usePlaceProfilesStore.setState({ bySid: {} });
    state.places = [];
    state.rows = [];
    state.deferred = false;
    state.pending = [];
});

describe('usePlaceProfiles', () => {
    it('keeps each place its own nick for the same person', () => {
        state.places = [{ id: 'S1' }, { id: 'S2' }];
        state.rows = [
            { uid: 'u1', sid: 'S1', nick: 'Alice' },
            { uid: 'u1', sid: 'S2', nick: 'J' },
        ];
        renderHook(() => usePlaceProfiles());
        const { bySid } = usePlaceProfilesStore.getState();
        expect(bySid.S1?.u1?.nick).toBe('Alice');
        expect(bySid.S2?.u1?.nick).toBe('J');
    });

    it('drops a place that is no longer listed', () => {
        usePlaceProfilesStore.setState({ bySid: { gone: { u1: { nick: 'Old' } } } });
        state.places = [{ id: 'S1' }];
        renderHook(() => usePlaceProfiles());
        expect(usePlaceProfilesStore.getState().bySid.gone).toBeUndefined();
        expect(usePlaceProfilesStore.getState().bySid.S1).toEqual({});
    });

    it('keeps the same map when an emission changes no nick or photo', () => {
        const { setPlace } = usePlaceProfilesStore.getState();
        setPlace('S1', { u1: { nick: 'Alice' } });
        const before = usePlaceProfilesStore.getState().bySid;
        setPlace('S1', { u1: { nick: 'Alice' } });
        expect(usePlaceProfilesStore.getState().bySid).toBe(before);
        setPlace('S1', { u1: { nick: 'Al' } });
        expect(usePlaceProfilesStore.getState().bySid).not.toBe(before);
    });

    it('ignores an answer that arrives after the places changed', () => {
        state.places = [{ id: 'S1' }];
        state.deferred = true;
        const { unmount } = renderHook(() => usePlaceProfiles());
        unmount();
        state.rows = [{ uid: 'u1', sid: 'S1', nick: 'Late' }];
        state.flush();
        expect(usePlaceProfilesStore.getState().bySid.S1).toBeUndefined();
    });
});
