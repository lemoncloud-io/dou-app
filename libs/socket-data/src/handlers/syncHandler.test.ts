import { syncHandler } from './syncHandler';
import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

jest.mock('../sync-events', () => ({
    notifyAppUpdated: jest.fn(),
}));

describe('syncHandler', () => {
    const mockCid = 'test-cloud';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('update 및 sync 액션 수신 시 presence 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'sync',
            payload: { status: 'online' },
        } as any;

        await syncHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'presence',
            action: 'sync',
            cid: mockCid,
            payload: { status: 'online' },
        });
    });

    it('info 액션 수신 시 presence 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'info',
            payload: { device: 'web' },
        } as any;

        await syncHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'presence',
            action: 'info',
            cid: mockCid,
            payload: { device: 'web' },
        });
    });
});
