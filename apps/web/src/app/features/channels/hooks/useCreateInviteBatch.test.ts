import { renderHook } from '@testing-library/react';

import { useCreateInviteBatch } from './useCreateInviteBatch';
import { useUserMutations } from './useUserMutations';

jest.mock('./useUserMutations', () => ({ useUserMutations: jest.fn() }));
jest.mock('../../../hooks/useMyProfile', () => ({ useMyProfile: () => ({ profile: { nick: '보내는이' } }) }));
jest.mock('react-i18next', () => ({
    // Echo the key with its interpolations so the SMS body is assertable.
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key),
    }),
}));

const sendInviteMessageMock = jest.fn();
jest.mock('../../invite/utils/sendInviteMessage', () => ({
    sendInviteMessage: (...args: unknown[]) => sendInviteMessageMock(...args),
}));

const requestInviteBatchMock = jest.fn();
const requestInviteMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    requestInviteBatchMock.mockResolvedValue([]);
    sendInviteMessageMock.mockResolvedValue('sms');
    (useUserMutations as jest.Mock).mockReturnValue({
        requestInvite: requestInviteMock,
        requestInviteBatch: requestInviteBatchMock,
        isPending: {},
    });
});

const batch = () => renderHook(() => useCreateInviteBatch()).result.current.createBatchInvite;
const single = () => renderHook(() => useCreateInviteBatch()).result.current.createSingleInvite;

describe('useCreateInviteBatch.createSingleInvite', () => {
    it('초대 링크를 담은 문구를 대상 번호로 문자 발송한다 (공유 시트가 아니라)', async () => {
        requestInviteMock.mockResolvedValue({ Location: 'https://dou.link/abc' });

        const { channel } = await single()({ channelId: 'ch-1', name: '민수', phone: '+821011112222' });

        expect(sendInviteMessageMock).toHaveBeenCalledWith(
            '+821011112222',
            expect.stringContaining('https://dou.link/abc')
        );
        // The body names the sender from my place profile, not the account record.
        expect(sendInviteMessageMock.mock.calls[0][1]).toContain('보내는이');
        expect(channel).toBe('sms');
    });

    it('웹에서는 클립보드로 떨어지는데, 그 판정은 sendInviteMessage가 그대로 전달한다', async () => {
        requestInviteMock.mockResolvedValue({ Location: 'https://dou.link/abc' });
        sendInviteMessageMock.mockResolvedValue('clipboard');

        const { channel } = await single()({ channelId: 'ch-1', name: '민수', phone: '+821011112222' });

        expect(channel).toBe('clipboard');
    });

    it('응답에 Location이 없으면 전달을 시도하지 않고 실패로 알린다', async () => {
        requestInviteMock.mockResolvedValue({});

        const { channel } = await single()({ channelId: 'ch-1', name: '민수', phone: '+821011112222' });

        expect(sendInviteMessageMock).not.toHaveBeenCalled();
        expect(channel).toBe(false);
    });
});

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
