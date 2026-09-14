import { act, renderHook } from '@testing-library/react';

import type { AppMessageData } from '@chatic/app-messages';

jest.mock('@chatic/bridges', () => ({ logger: { info: jest.fn() } }));
jest.mock('../../../bridge', () => ({ useOnReceiveNotification: jest.fn() }));

import { logger } from '@chatic/bridges';

import { useOnReceiveNotification } from '../../../bridge';
import { useReceivedPushLog } from './useReceivedPushLog';

const mockUseOnReceive = useOnReceiveNotification as jest.Mock;
const mockLoggerInfo = logger.info as jest.Mock;

/** The handler the hook registered on its latest render. */
const latestHandler = (): ((message: AppMessageData<'OnReceiveNotification'>) => void) => {
    const lastCall = mockUseOnReceive.mock.calls.at(-1);
    if (!lastCall) throw new Error('useOnReceiveNotification was not called');
    return lastCall[0];
};

const makeMessage = (title: string): AppMessageData<'OnReceiveNotification'> =>
    ({
        type: 'OnReceiveNotification',
        success: true,
        data: { notification: { title, body: 'b' } },
    }) as unknown as AppMessageData<'OnReceiveNotification'>;

describe('useReceivedPushLog — 푸시 수신 기록', () => {
    beforeEach(() => jest.clearAllMocks());

    it('처음에는 수신 목록이 비어 있다', () => {
        const { result } = renderHook(() => useReceivedPushLog());
        expect(result.current.entries).toEqual([]);
    });

    it('푸시를 받으면 목록에 최신순으로 쌓는다', () => {
        const { result } = renderHook(() => useReceivedPushLog());

        act(() => latestHandler()(makeMessage('첫번째')));
        act(() => latestHandler()(makeMessage('두번째')));

        expect(result.current.entries).toHaveLength(2);
        expect(result.current.entries[0].title).toBe('두번째');
        expect(result.current.entries[1].title).toBe('첫번째');
        expect(result.current.entries[0].id).not.toBe(result.current.entries[1].id);
    });

    // 수신 엔트리는 앱 전역 구독자(useInAppPushMessage)가 남긴다. 여기서도 남기면 디버그 화면이
    // 떠 있는 동안 모든 수신이 두 줄이 된다.
    it('로그는 남기지 않는다 — 전역 구독자와 중복되기 때문', () => {
        const { result } = renderHook(() => useReceivedPushLog());

        act(() => latestHandler()(makeMessage('첫번째')));

        expect(result.current.entries).toHaveLength(1);
        expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('clear는 목록을 비운다', () => {
        const { result } = renderHook(() => useReceivedPushLog());
        act(() => latestHandler()(makeMessage('x')));
        expect(result.current.entries).toHaveLength(1);

        act(() => result.current.clear());
        expect(result.current.entries).toEqual([]);
    });
});
