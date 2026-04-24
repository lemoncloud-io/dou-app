import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { SocketEventMap } from '../../../events/types';
import type { IEventBus } from '../../../events/eventBus';
import type { SocketContext } from '../dispatchers';
import { authHandler, chatHandler, modelHandler } from './index';

describe('Socket Dispatcher Handlers', () => {
    let mockEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    const mockContext: SocketContext = { cloudId: 'test-cloud-id' };

    beforeEach(() => {
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<SocketEventMap>>;
    });

    describe('authHandler', () => {
        it('update 액션 수신 시 auth:update 이벤트를 발생시켜야 한다', () => {
            const envelope: WSSEnvelope = {
                type: 'auth',
                action: 'update',
                payload: { token: 'new-token' },
                meta: {
                    ref: 'ref-1',
                    ts: 1234567890,
                },
            };

            authHandler(envelope, mockContext, mockEventBus);

            expect(mockEventBus.emit).toHaveBeenCalledWith('auth:update', {
                cid: 'test-cloud-id',
                ref: 'ref-1',
                payload: { token: 'new-token' },
            });
        });

        it('에러 페이로드 포함 시 auth:error 이벤트를 발생시켜야 한다', () => {
            const envelope: WSSEnvelope = {
                type: 'auth',
                action: 'update',
                payload: { error: 'Unauthorized' },
            };

            authHandler(envelope, mockContext, mockEventBus);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'auth:error',
                expect.objectContaining({
                    error: 'Unauthorized',
                })
            );
        });
    });

    describe('chatHandler', () => {
        it('send 액션 수신 시 chat:create 이벤트를 발생시켜야 한다', () => {
            const envelope: WSSEnvelope = {
                type: 'chat',
                action: 'send',
                payload: { id: 'msg-1', text: 'hello' },
            };

            chatHandler(envelope, mockContext, mockEventBus);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'chat:create',
                expect.objectContaining({
                    payload: { id: 'msg-1', text: 'hello' },
                })
            );
        });

        it('mine 액션 수신 시 channel:read 이벤트를 발생시켜야 한다', () => {
            const envelope: WSSEnvelope = {
                type: 'chat',
                action: 'mine',
                payload: { list: [], total: 0 },
            };

            chatHandler(envelope, mockContext, mockEventBus);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'channel:read',
                expect.objectContaining({
                    payload: { list: [], total: 0 },
                })
            );
        });
    });

    describe('modelHandler', () => {
        it('동적 도메인 타입과 액션을 조합하여 이벤트를 발생시켜야 한다', () => {
            const envelope: WSSEnvelope = {
                type: 'model',
                action: 'update',
                payload: { type: 'channel', id: 'ch-1', name: 'updated' },
            };

            modelHandler(envelope, mockContext, mockEventBus);

            // payload.type('channel') + action('update') => 'channel:update'
            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'channel:update',
                expect.objectContaining({
                    payload: { type: 'channel', id: 'ch-1', name: 'updated' },
                })
            );
        });
    });
});
