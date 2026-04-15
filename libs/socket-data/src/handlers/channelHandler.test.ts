import { channelHandler } from './channelHandler';
import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

jest.mock('../sync-events', () => ({
    notifyAppUpdated: jest.fn(),
}));

describe('channelHandler', () => {
    const mockCid = 'test-cloud';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('subscribe 액션 수신 시 system 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'subscribe',
            payload: { subscribed: ['ch1', 'ch2'] },
        } as any;

        await channelHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'system',
            action: 'subscribe',
            cid: mockCid,
            payload: { subscribed: ['ch1', 'ch2'] },
        });
    });

    it('unsubscribe 액션 수신 시 system 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'unsubscribe',
            payload: { unsubscribed: ['ch1'] },
        } as any;

        await channelHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'system',
            action: 'unsubscribe',
            cid: mockCid,
            payload: { unsubscribed: ['ch1'] },
        });
    });
});
