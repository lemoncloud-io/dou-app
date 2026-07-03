import type { AppMessageData } from '@chatic/app-messages';

import { normalizeReceivedPush } from './normalizeReceivedPush';

const makeMessage = (notification: unknown): AppMessageData<'OnReceiveNotification'> =>
    ({ type: 'OnReceiveNotification', success: true, data: { notification } } as unknown as AppMessageData<'OnReceiveNotification'>);

describe('normalizeReceivedPush', () => {
    it('title/body/data와 receivedAt를 평탄화한다', () => {
        const message = makeMessage({ title: '새 메시지', body: '안녕하세요', data: { cid: 'c1', sid: 's1' } });

        expect(normalizeReceivedPush(message, 1700000000000)).toEqual({
            title: '새 메시지',
            body: '안녕하세요',
            data: { cid: 'c1', sid: 's1' },
            receivedAt: 1700000000000,
        });
    });

    it('title/body가 없으면 플레이스홀더로, data가 없으면 빈 객체로 채운다', () => {
        const result = normalizeReceivedPush(makeMessage({}), 42);

        expect(result).toEqual({ title: '(none)', body: '(none)', data: {}, receivedAt: 42 });
    });

    it('notification 자체가 없어도 던지지 않는다', () => {
        const message = { type: 'OnReceiveNotification', success: true, data: {} } as unknown as AppMessageData<'OnReceiveNotification'>;

        expect(() => normalizeReceivedPush(message, 1)).not.toThrow();
        expect(normalizeReceivedPush(message, 1).title).toBe('(none)');
    });
});
