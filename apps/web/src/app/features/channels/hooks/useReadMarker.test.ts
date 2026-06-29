import { act, renderHook } from '@testing-library/react';

import { useReadMarker } from './useReadMarker';

jest.mock('@chatic/bridges', () => ({ logger: { error: jest.fn() } }));

const readMessage = jest.fn();

const setup = (overrides: Partial<Parameters<typeof useReadMarker>[0]> = {}) =>
    renderHook(props => useReadMarker(props), {
        initialProps: {
            channelId: 'c1',
            channelChatNo: undefined as number | undefined,
            lastChatNo: undefined as number | undefined,
            isVerified: true,
            readMessage,
            ...overrides,
        },
    });

beforeEach(() => {
    jest.clearAllMocks();
    readMessage.mockResolvedValue(undefined);
});

describe('useReadMarker — 읽음 처리', () => {
    it('진입 시 channel.chatNo로 읽음을 보낸다', () => {
        setup({ channelChatNo: 10 });
        expect(readMessage).toHaveBeenCalledWith({ channelId: 'c1', chatNo: 10 });
    });

    it('메시지 로딩 후 lastChatNo로 보정한다', () => {
        setup({ lastChatNo: 20 });
        expect(readMessage).toHaveBeenCalledWith({ channelId: 'c1', chatNo: 20 });
    });

    it('isVerified가 아니면 읽음을 보내지 않는다', () => {
        setup({ channelChatNo: 10, lastChatNo: 20, isVerified: false });
        expect(readMessage).not.toHaveBeenCalled();
    });

    it('이미 읽은 chatNo 이하면 중복 전송하지 않는다', () => {
        // 진입 시 10을 읽은 뒤, 더 낮은 lastChatNo(5)는 무시된다.
        setup({ channelChatNo: 10, lastChatNo: 5 });
        expect(readMessage).toHaveBeenCalledTimes(1);
        expect(readMessage).toHaveBeenCalledWith({ channelId: 'c1', chatNo: 10 });
    });

    it('markSent는 전송한 메시지를 읽음 처리한다', () => {
        const { result } = setup();
        act(() => result.current.markSent(7));
        expect(readMessage).toHaveBeenCalledWith({ channelId: 'c1', chatNo: 7 });
    });
});
