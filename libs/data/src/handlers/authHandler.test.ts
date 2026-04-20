import { authHandler } from './authHandler';
import { notifyAppUpdated } from '../sync-events';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

jest.mock('../sync-events', () => ({
    notifyAppUpdated: jest.fn(),
}));

describe('authHandler', () => {
    const mockCid = 'test-cloud';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('에러가 없는 update 액션 수신 시 auth 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'update',
            payload: { token: '1234' },
        } as any;

        await authHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'auth',
            action: 'update',
            cid: mockCid,
            payload: { token: '1234' },
        });
    });

    it('에러가 포함된 update 액션 수신 시 error 도메인으로 이벤트를 방출한다', async () => {
        const mockEnvelope: WSSEnvelope = {
            action: 'update',
            payload: { error: 'invalid_token' },
        } as any;

        await authHandler(mockEnvelope, mockCid);

        expect(notifyAppUpdated).toHaveBeenCalledWith({
            domain: 'error',
            action: 'update',
            cid: mockCid,
            payload: { error: 'invalid_token' },
        });
    });
});
