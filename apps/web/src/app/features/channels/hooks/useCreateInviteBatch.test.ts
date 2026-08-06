import { renderHook } from '@testing-library/react';

import { useCreateInviteBatch } from './useCreateInviteBatch';
import { useUserMutations } from './useUserMutations';

jest.mock('./useUserMutations', () => ({ useUserMutations: jest.fn() }));
jest.mock('@chatic/bridges', () => ({ isNative: () => false }));
jest.mock('../../../bridge', () => ({ appBridge: { openShareSheet: jest.fn() } }));
jest.mock('../utils/copyMessageToClipboard', () => ({ copyMessageToClipboard: jest.fn() }));

const requestInviteBatchMock = jest.fn();
const requestInviteMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    requestInviteBatchMock.mockResolvedValue([]);
    (useUserMutations as jest.Mock).mockReturnValue({
        requestInvite: requestInviteMock,
        requestInviteBatch: requestInviteBatchMock,
        isPending: {},
    });
});

const batch = () => renderHook(() => useCreateInviteBatch()).result.current.createBatchInvite;

describe('useCreateInviteBatch.createBatchInvite', () => {
    it('번호 목록을 to 배열로 그대로 보낸다 (콤마로 잇지 않는다)', async () => {
        await batch()({ channelId: 'ch-1', phones: ['+821011112222', '+821033334444'] });

        // Joining the list into one alias made the server parse it as a single phone and reject it
        // (`@phone[a,b] is invalid format`).
        expect(requestInviteBatchMock).toHaveBeenCalledWith({
            to: ['+821011112222', '+821033334444'],
            channelId: 'ch-1',
        });
    });

    it('중복 번호는 한 번만 보낸다 (같은 대상에 SMS 두 번 방지)', async () => {
        await batch()({ channelId: 'ch-1', phones: ['+821011112222', '+821011112222'] });

        expect(requestInviteBatchMock).toHaveBeenCalledWith({ to: ['+821011112222'], channelId: 'ch-1' });
    });

    it('중복을 걸러도 원래 순서를 지킨다', async () => {
        await batch()({ channelId: 'ch-1', phones: ['+821033334444', '+821011112222', '+821033334444'] });

        expect(requestInviteBatchMock).toHaveBeenCalledWith({
            to: ['+821033334444', '+821011112222'],
            channelId: 'ch-1',
        });
    });

    it('빈 문자열·공백만 있는 번호는 제외하고, 보낼 대상이 없으면 요청하지 않는다', async () => {
        const result = await batch()({ channelId: 'ch-1', phones: ['', '   '] });

        expect(result).toEqual([]);
        expect(requestInviteBatchMock).not.toHaveBeenCalled();
    });
});
