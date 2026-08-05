import { act, renderHook } from '@testing-library/react';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { useSentInviteLog, useSentInviteLogStore } from './useSentInviteLog';

const STORAGE_KEY = 'dou.relayInvite.sentLog.v2';
const LEGACY_STORAGE_KEY = 'dou.relayInvite.sentLog.v1';

const invite = (id: string): MyInviteView => ({ id }) as MyInviteView;

describe('useSentInviteLog', () => {
    beforeEach(() => {
        localStorage.clear();
        // The store is a module-level singleton — reset its in-memory state too, so a record()
        // from one test can't leak into the next (mirrors usePreferenceStore.test.ts's resetStore).
        useSentInviteLogStore.setState({ log: {} });
    });

    it('처음에는 아무 번호도 기록되어 있지 않다', () => {
        const { result } = renderHook(() => useSentInviteLog());
        expect(result.current.findByPhone('+821012345678')).toBeUndefined();
    });

    it('record 후 findByPhone으로 inviteId/name을 조회할 수 있다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record(invite('invite-1'), { phone: '+821012345678', name: '홍길동' });
        });

        expect(result.current.findByPhone('+821012345678')).toEqual({ inviteId: 'invite-1', name: '홍길동' });
    });

    it('같은 번호를 다시 record하면 최신 항목으로 덮어쓴다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record(invite('invite-1'), { phone: '+821012345678', name: '홍길동' });
            result.current.record(invite('invite-2'), { phone: '+821012345678', name: '홍길동(재초대)' });
        });

        expect(result.current.findByPhone('+821012345678')).toEqual({ inviteId: 'invite-2', name: '홍길동(재초대)' });
    });

    it('id가 없는 invite는 기록하지 않는다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record({} as MyInviteView, { phone: '+821099998888', name: '이름' });
        });

        expect(result.current.findByPhone('+821099998888')).toBeUndefined();
    });

    it('localStorage에 JSON으로 영속화된다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record(invite('invite-3'), { phone: '+821055556666', name: '박영희' });
        });

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        expect(stored['+821055556666']).toEqual({ inviteId: 'invite-3', name: '박영희' });
    });

    it('손상된 localStorage 값은 빈 로그로 취급한다', () => {
        localStorage.setItem(STORAGE_KEY, 'not-json');
        const { result } = renderHook(() => useSentInviteLog());
        expect(result.current.findByPhone('+821012345678')).toBeUndefined();
    });

    it('findByInviteId로 inviteId만 가지고 phone/name을 역조회할 수 있다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record(invite('invite-7'), { phone: '+821077778888', name: '최유진' });
        });

        expect(result.current.findByInviteId('invite-7')).toEqual({
            inviteId: 'invite-7',
            phone: '+821077778888',
            name: '최유진',
        });
    });

    it('findByInviteId는 일치하는 항목이 없으면 undefined다', () => {
        const { result } = renderHook(() => useSentInviteLog());
        expect(result.current.findByInviteId('invite-none')).toBeUndefined();
    });

    it('구 .v1 키는 첫 읽기에서 치운다 — 키 교체가 곧 마이그레이션이다 (ADR-0044 §6)', () => {
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ '01012345678': { inviteId: 'old', name: '옛' } }));

        // The store reads storage once, at module init — so re-import to observe that read.
        jest.isolateModules(() => {
            require('./useSentInviteLog');
        });

        expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    });

    it('E.164 키라 로컬 형태가 겹치는 두 나라 번호를 구분한다', () => {
        const { result } = renderHook(() => useSentInviteLog());

        act(() => {
            result.current.record(invite('kr-1'), { phone: '+821012345678', name: '한국' });
            result.current.record(invite('jp-1'), { phone: '+819012345678', name: '일본' });
        });

        expect(result.current.findByPhone('+821012345678')?.inviteId).toBe('kr-1');
        expect(result.current.findByPhone('+819012345678')?.inviteId).toBe('jp-1');
    });
});
