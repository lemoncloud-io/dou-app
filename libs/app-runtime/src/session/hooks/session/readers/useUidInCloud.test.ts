import { act, renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../../../../init';
import { useUidInCloud } from './useUidInCloud';

const session = fakeSessionView();

beforeEach(() => {
    session.set({ uidByCloud: {} });
    initAppRuntime({ ...coreEngine, session });
});

afterEach(() => resetRuntimeEngine());

describe('useUidInCloud', () => {
    it('answers with the uid the account has in that cloud', () => {
        session.set({ uidByCloud: { 'cloud-a': 'uid-a' } });

        const { result } = renderHook(() => useUidInCloud('cloud-a'));

        expect(result.current).toBe('uid-a');
    });

    it('is null for a cloud the account has no uid in', () => {
        const { result } = renderHook(() => useUidInCloud('cloud-z'));

        expect(result.current).toBeNull();
    });

    it('follows a change of the session', () => {
        const { result } = renderHook(() => useUidInCloud('cloud-b'));
        expect(result.current).toBeNull();

        act(() => session.set({ uidByCloud: { 'cloud-b': 'uid-b' } }));

        expect(result.current).toBe('uid-b');
    });
});
