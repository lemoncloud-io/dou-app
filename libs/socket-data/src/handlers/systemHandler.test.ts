import { systemHandler } from './systemHandler';
import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

jest.mock('../sync-events', () => ({
    notifyAppUpdated: jest.fn(),
}));

describe('systemHandler', () => {
    const mockCid = 'test-cloud';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('ping, pong, info, message 액션은 system 도메인으로 방출한다', async () => {
        const actions = ['ping', 'pong', 'info', 'message'];

        for (const action of actions) {
            const mockEnvelope: WSSEnvelope = { action, payload: { content: 'test' } } as any;
            await systemHandler(mockEnvelope, mockCid);

            expect(notifyAppUpdated).toHaveBeenCalledWith({
                domain: 'system',
                action,
                cid: mockCid,
                payload: { content: 'test' },
            });
        }
    });

    it('error 액션 수신 시 error 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'error',
            payload: { code: '500' },
        } as any;

        await systemHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'error',
            action: 'error',
            cid: mockCid,
            payload: { code: '500' },
        });
    });
});
