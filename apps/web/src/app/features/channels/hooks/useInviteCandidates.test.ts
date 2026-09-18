import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

let mockChannels: Array<Partial<DomainChannel>> = [];
let mockIsLoading = false;
let mockUserId: string | undefined = 'me';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSessionIdentity: () => ({ userId: mockUserId }),
        },
    },
}));
jest.mock('../../../hooks', () => ({
    useHomeChannels: () => ({ channels: mockChannels, isLoading: mockIsLoading }),
}));

import { useInviteCandidates } from './useInviteCandidates';

const run = (channelId: string | null = 'target', sid: string | null = 'site-1') =>
    renderHook(() => useInviteCandidates(channelId, sid)).result.current;

beforeEach(() => {
    mockChannels = [];
    mockIsLoading = false;
    mockUserId = 'me';
});

describe('useInviteCandidates', () => {
    it('내 다른 채널들의 멤버를 합집합으로 모은다', () => {
        mockChannels = [
            { id: 'target', memberIds: ['me'] },
            { id: 'a', memberIds: ['me', 'u1', 'u2'] },
            { id: 'b', memberIds: ['me', 'u2', 'u3'] },
        ];

        expect(run().candidateIds.sort()).toEqual(['u1', 'u2', 'u3']);
    });

    it('이미 타깃 채널에 있는 사람은 뺀다', () => {
        mockChannels = [
            { id: 'target', memberIds: ['me', 'u1'] },
            { id: 'a', memberIds: ['u1', 'u2'] },
        ];

        expect(run().candidateIds).toEqual(['u2']);
    });

    it('나는 후보가 아니다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['me', 'u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    // Two defenses overlap here: excluding the target channel from iteration, and set-subtracting its memberIds.
    it('타깃 채널 행 자체는 후보 출처로 쓰지 않는다', () => {
        mockChannels = [{ id: 'target', memberIds: ['u1', 'u2'] }];

        expect(run().candidateIds).toEqual([]);
    });

    // memberIds is optional — a row that didn't come through the detail:true path may be mixed in.
    it('memberIds가 없는 채널 행은 건너뛴다', () => {
        mockChannels = [{ id: 'target', memberIds: ['me'] }, { id: 'a' }, { id: 'b', memberIds: ['u1'] }];

        expect(run().candidateIds).toEqual(['u1']);
    });

    // Even if the target row arrives without memberIds, excluding it from iteration keeps that room's people from leaking into the candidates.
    it('타깃 행에 memberIds가 없어도 다른 채널에서만 후보를 만든다', () => {
        mockChannels = [{ id: 'target' }, { id: 'a', memberIds: ['u1'] }];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('빈 문자열 id는 후보에 넣지 않는다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['', 'u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('중복은 한 번만 센다', () => {
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u1', 'u1'] },
            { id: 'b', memberIds: ['u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('channelId나 sid가 없으면 빈 목록이다', () => {
        mockChannels = [{ id: 'a', memberIds: ['u1'] }];

        expect(run(null).candidateIds).toEqual([]);
        expect(run('target', null).candidateIds).toEqual([]);
    });

    // The list must still render even at the moment the session hasn't yet supplied a userId.
    it('userId가 아직 없어도 후보를 만든다', () => {
        mockUserId = undefined;
        mockChannels = [
            { id: 'target', memberIds: [] },
            { id: 'a', memberIds: ['u1'] },
        ];

        expect(run().candidateIds).toEqual(['u1']);
    });

    it('isLoading은 채널 관측의 것을 그대로 전달한다', () => {
        mockIsLoading = true;

        expect(run().isLoading).toBe(true);
    });
});
