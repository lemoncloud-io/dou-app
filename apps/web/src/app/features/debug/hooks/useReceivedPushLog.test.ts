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
    ({ type: 'OnReceiveNotification', success: true, data: { notification: { title, body: 'b' } } } as unknown as AppMessageData<'OnReceiveNotification'>);

describe('useReceivedPushLog — 푸시 수신 기록', () => {
    beforeEach(() => jest.clearAllMocks());

    it('처음에는 수신 목록이 비어 있다', () => {
        const { result } = renderHook(() => useReceivedPushLog());
        expect(result.current.entries).toEqual([]);
    });

    it('푸시를 받으면 목록에 최신순으로 쌓고 PUSH 태그로 로깅한다', () => {
        const { result } = renderHook(() => useReceivedPushLog());

        act(() => latestHandler()(makeMessage('첫번째')));
        act(() => latestHandler()(makeMessage('두번째')));

        expect(result.current.entries).toHaveLength(2);
        expect(result.current.entries[0].title).toBe('두번째');
        expect(result.current.entries[1].title).toBe('첫번째');
        expect(result.current.entries[0].id).not.toBe(result.current.entries[1].id);
        expect(mockLoggerInfo).toHaveBeenCalledWith('PUSH', expect.stringContaining('두번째'), expect.any(Object));
    });

    it('clear는 목록을 비운다', () => {
        const { result } = renderHook(() => useReceivedPushLog());
        act(() => latestHandler()(makeMessage('x')));
        expect(result.current.entries).toHaveLength(1);

        act(() => result.current.clear());
        expect(result.current.entries).toEqual([]);
    });
});
