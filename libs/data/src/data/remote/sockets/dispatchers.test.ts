import { SocketDispatcher } from './dispatchers';
import { authHandler, chatHandler, modelHandler } from './handlers';
import type { IEventBus } from '../../events/eventBus';
import type { SocketEventMap } from '../../events/types';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 1. 핸들러 모듈 전체를 Mocking 처리합니다.
jest.mock('./handlers', () => ({
    authHandler: jest.fn(),
    chatHandler: jest.fn(),
    modelHandler: jest.fn(),
    syncHandler: jest.fn(),
    systemHandler: jest.fn(),
    userHandler: jest.fn(),
}));

describe('SocketDispatcher', () => {
    let mockEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let dispatcher: SocketDispatcher;

    beforeEach(() => {
        // 매 테스트마다 Mock 초기화 (호출 횟수 누적 방지)
        jest.clearAllMocks();

        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            onAny: jest.fn(),
        } as unknown as jest.Mocked<IEventBus<SocketEventMap>>;

        dispatcher = new SocketDispatcher(mockEventBus);
    });

    it('유효하지 않은 envelope 수신 시 무시하고 핸들러를 호출하지 않아야 한다', () => {
        const invalidEnvelope = {} as WSSEnvelope;

        dispatcher.dispatch(invalidEnvelope, { cloudId: 'test-cloud' });

        expect(authHandler).not.toHaveBeenCalled();
        expect(chatHandler).not.toHaveBeenCalled();
    });

    it('도메인 타입이 "model"일 때 modelHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'model', action: 'update', payload: {} } as WSSEnvelope;
        const context = { cloudId: 'test-cloud' };

        dispatcher.dispatch(envelope, context);

        expect(modelHandler).toHaveBeenCalledWith(envelope, context, mockEventBus);
        expect(chatHandler).not.toHaveBeenCalled();
    });

    it('도메인 타입이 "chat"일 때 chatHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'chat', action: 'send', payload: {} } as WSSEnvelope;
        const context = { cloudId: 'test-cloud' };

        dispatcher.dispatch(envelope, context);

        expect(chatHandler).toHaveBeenCalledWith(envelope, context, mockEventBus);
    });

    it('도메인 타입이 "auth"일 때 authHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'auth', action: 'update', payload: {} } as WSSEnvelope;
        const context = { cloudId: 'test-cloud' };

        dispatcher.dispatch(envelope, context);

        expect(authHandler).toHaveBeenCalledWith(envelope, context, mockEventBus);
    });

    it('정의되지 않은 알 수 없는 도메인 수신 시 어떤 핸들러도 호출하지 않아야 한다', () => {
        const envelope = { type: 'unknown_domain' as any, action: 'test', payload: {} } as any;
        dispatcher.dispatch(envelope, { cloudId: 'test-cloud' });

        expect(authHandler).not.toHaveBeenCalled();
        expect(chatHandler).not.toHaveBeenCalled();
        expect(modelHandler).not.toHaveBeenCalled();
    });
});
