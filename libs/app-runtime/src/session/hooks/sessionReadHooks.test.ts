import { act, renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '@chatic/runtime-client';
import { useIsPairedSession, usePairedCloudIds, usePairedCloudNames } from './pairing/usePairedSession';
import { useGlobalSession } from './session/readers/useGlobalSession';
import { useSessionAuth } from './session/readers/useSessionAuth';
import { useSessionIdentity } from './session/readers/useSessionIdentity';

// The readers these hooks subscribe to are runtime-client's (`session/sessionReads`); this is the
// React side — that a hook re-renders with what the engine reports next.
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
