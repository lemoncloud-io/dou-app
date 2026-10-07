import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

type Row = { uid: string; sid: string; nick?: string };
type Query = { sid?: string } | undefined;

const state = vi.hoisted(() => ({ siteId: 'S1' as string | undefined, rows: [] as Row[] }));

// Answers the way the profile cache does: no `sid` in the query means every site's rows.
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                profile: {
                    observeList: (query: Query, callback: (result: { list: Row[] }) => void) => {
                        callback({ list: state.rows.filter(row => !query?.sid || row.sid === query.sid) });
                        return () => undefined;
                    },
                },
            }),
        },
        session: { useGlobalSession: () => ({ activeServer: { siteId: state.siteId } }) },
    },
}));

import { useSiteProfilesStore } from '../stores/useSiteProfilesStore';
import { useSiteProfiles } from './useSiteProfiles';

afterEach(() => {
    useSiteProfilesStore.getState().reset();
    state.siteId = 'S1';
    state.rows = [];
});

describe('useSiteProfiles', () => {
    // The profile cache holds a row per place I have been in. A row from another place used to be
    // folded into the map by uid, so whichever came last decided my name here — a nickname set
    // on this place was hidden behind the other place's older row.
    it("keeps another place's row for the same person out of this place's map", () => {
        state.rows = [
            { uid: 'me', sid: 'S1', nick: 'Captain' },
            { uid: 'me', sid: 'S2', nick: 'Old name' },
        ];
        renderHook(() => useSiteProfiles());
        expect(useSiteProfilesStore.getState().profiles.me?.nick).toBe('Captain');
    });

    it('does not borrow a place that is not the selected one', () => {
        state.rows = [{ uid: 'ada', sid: 'S2', nick: 'Countess' }];
        renderHook(() => useSiteProfiles());
        expect(useSiteProfilesStore.getState().profiles.ada).toBeUndefined();
    });

    it('mirrors nothing, and never subscribes, while no place is selected', () => {
        state.siteId = undefined;
        state.rows = [{ uid: 'me', sid: 'S1', nick: 'Captain' }];
        renderHook(() => useSiteProfiles());
        expect(useSiteProfilesStore.getState().profiles).toEqual({});
    });
});
