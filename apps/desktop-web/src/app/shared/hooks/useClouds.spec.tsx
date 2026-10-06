import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

// Invited clouds are not in the relay catalog and their durable record is the local `invitecloud`
// cache row — the joined-clouds store is a per-profile localStorage twin. Reading only that twin
// hid every invited cloud joined on another profile, including the one the session was inside.
let catalogClouds: Array<Record<string, unknown>> = [];
let cachedClouds: Array<Record<string, unknown>> = [];
let joinedClouds: Record<string, { id: string; name?: string }> = {};
let activeCloudId = '';

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                cloud: {
                    observeList: (callback: (result: { list: unknown[] } | null) => void) => {
                        callback({ list: cachedClouds });
                        return () => undefined;
                    },
                },
            }),
        },
        session: {
            useGlobalSession: () => ({ cloud: { cloudId: activeCloudId } }),
        },
    },
}));

// The catalog hook lives in this folder, not in the runtime: ADR-0070 moved it
// down so each app owns the read's cache policy. Mocking it on `@chatic/app-runtime`
// left the real one running against a mock that has no `useSessionAuth`.
vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: catalogClouds, isFetchingClouds: false }),
}));

vi.mock('../stores', () => ({
    useJoinedCloudsStore: (selector: (state: { joinedClouds: typeof joinedClouds }) => unknown) =>
        selector({ joinedClouds }),
}));

import i18n from '../../../i18n';
import { useClouds } from './useClouds';

describe('useClouds', () => {
    beforeEach(() => {
        catalogClouds = [];
        cachedClouds = [];
        joinedClouds = {};
        activeCloudId = '';
    });

    it('shows an invited cloud held only in the local cache', () => {
        cachedClouds = [{ id: '1000001', cid: '1000001', name: '넹미', cloudType: 'invited' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.clouds[1]).toMatchObject({ name: '넹미', kind: 'invited' });
    });

    it('keeps the owned entry when the same cloud is also cached as invited', () => {
        catalogClouds = [{ id: '1000004', name: 'Owned', status: 'active' }];
        cachedClouds = [{ id: '1000004', cid: '1000004', cloudType: 'invited' }];

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.kind)).toEqual(['home', 'owned']);
    });

    it('names a cached invited cloud from the joined-clouds store', () => {
        // The invite-accept flow writes id/cid/backend/wss to the cache but no name; the store has it.
        cachedClouds = [{ id: '1000001', cid: '1000001', cloudType: 'invited' }];
        joinedClouds = { '1000001': { id: '1000001', name: '넹미' } };

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.clouds[1].name).toBe('넹미');
    });

    it('gives the cloud the session is inside a tile even when no source lists it', () => {
        activeCloudId = '1000001';

        const { result } = renderHook(() => useClouds());

        expect(result.current.clouds.map(c => c.id)).toEqual(['default', '1000001']);
        expect(result.current.activeCloudId).toBe('1000001');
    });

    // The tile read "Home" in a Korean UI: the name was a literal, not a string of the UI.
    it('names the Home tile in the UI language', async () => {
        await i18n.changeLanguage('ko');
        const { result } = renderHook(() => useClouds());
        expect(result.current.clouds[0]).toMatchObject({ id: 'default', name: '홈', kind: 'home' });
        await i18n.changeLanguage('en');
    });
});
