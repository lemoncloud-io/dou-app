import { act, renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { useIsPairedSession, usePairedCloudIds, usePairedCloudNames } from './hooks/pairing/usePairedSession';
import { useGlobalSession } from './hooks/session/readers/useGlobalSession';
import { useSessionAuth } from './hooks/session/readers/useSessionAuth';
import { useSessionIdentity } from './hooks/session/readers/useSessionIdentity';
import {
    getActiveServerContext,
    getActiveSessionUser,
    getCommittedSessionSiteId,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    getUidInCloud,
    isInOwnCloudSession,
    isPairedSession,
} from './sessionReads';

// The session the engine hands over is the only thing these read: an engine with a fake session view,
// and nothing of the stores.
const session = fakeSessionView();
const base = emptySessionSnapshot();
const signedIn = {
    context: {
        ...base.context,
        identity: { ...base.context.identity, isInitialized: true, isAuthenticated: true, userId: 'uid-c1' },
        activeServer: { kind: 'cloud' as const, cloudId: 'c1', siteId: 'p1', backend: 'https://c1', wss: 'wss://c1' },
    },
    auth: { isInitialized: true, isAuthenticated: true, error: null },
    activeUser: { name: 'In cloud' },
    relayUser: { name: 'Account' },
    committedSiteId: 'p1',
    uidByCloud: { default: 'uid-relay', c1: 'uid-c1' },
    pairing: { isPairedSession: true, isInOwnCloudSession: false, cloudIds: ['c9'], cloudNames: { c9: 'Studio' } },
};

beforeEach(() => {
    session.set(emptySessionSnapshot());
    initAppRuntime({ ...coreEngine, session });
});

afterEach(() => resetRuntimeEngine());

describe('the session readers', () => {
    it('answer from the snapshot of the engine they were handed', () => {
        session.set(signedIn);

        expect(getGlobalSessionContext()).toBe(session.snapshot().context);
        expect(getActiveServerContext()).toEqual(signedIn.context.activeServer);
        expect(getIdentityContext().userId).toBe('uid-c1');
        expect(getActiveSessionUser()).toEqual({ name: 'In cloud' });
        expect(getRelaySessionUser()).toEqual({ name: 'Account' });
        expect(getCommittedSessionSiteId()).toBe('p1');
        expect(getUidInCloud('c1')).toBe('uid-c1');
        expect(getUidInCloud('nowhere')).toBeNull();
        expect(isPairedSession()).toBe(true);
        expect(isInOwnCloudSession()).toBe(false);
    });

    it('throw before the entry point handed over an engine, instead of reading the stores', () => {
        resetRuntimeEngine();

        expect(() => getGlobalSessionContext()).toThrow(/initAppRuntime/);
    });
});

describe('the session hooks', () => {
    it('re-render with the session the engine reports next', () => {
        const { result } = renderHook(() => ({
            context: useGlobalSession(),
            auth: useSessionAuth(),
            identity: useSessionIdentity(),
            paired: useIsPairedSession(),
            pairedIds: usePairedCloudIds(),
            pairedNames: usePairedCloudNames(),
        }));
        expect(result.current.auth.isAuthenticated).toBe(false);

        act(() => session.set(signedIn));

        expect(result.current.context).toBe(session.snapshot().context);
        expect(result.current.auth.isAuthenticated).toBe(true);
        expect(result.current.identity.userId).toBe('uid-c1');
        expect(result.current.paired).toBe(true);
        expect(result.current.pairedIds).toEqual(['c9']);
        expect(result.current.pairedNames).toEqual({ c9: 'Studio' });
    });
});
