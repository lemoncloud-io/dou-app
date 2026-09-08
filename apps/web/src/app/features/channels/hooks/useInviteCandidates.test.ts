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

    // 타깃 채널을 순회에서 빼는 것과 memberIds를 차집합하는 것, 두 방어가 겹친다.
    it('타깃 채널 행 자체는 후보 출처로 쓰지 않는다', () => {
        mockChannels = [{ id: 'target', memberIds: ['u1', 'u2'] }];

        expect(run().candidateIds).toEqual([]);
    });

    // memberIds는 옵셔널이다 — detail:true 경로로 오지 않은 행이 섞일 수 있다.
    it('memberIds가 없는 채널 행은 건너뛴다', () => {
        mockChannels = [{ id: 'target', memberIds: ['me'] }, { id: 'a' }, { id: 'b', memberIds: ['u1'] }];

        expect(run().candidateIds).toEqual(['u1']);
    });

    // 타깃 행이 memberIds 없이 와도, 순회 제외 덕분에 그 방 사람이 후보로 새지 않는다.
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

    // 세션이 아직 userId를 못 준 순간에도 목록은 그려져야 한다.
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
