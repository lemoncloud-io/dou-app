import type { ISocketDispatcher } from './dispatchers';
import { SocketDispatcher } from './dispatchers';
import { authHandler, chatHandler, modelHandler } from '../handlers';
import type { IEventBus } from '../../../events/eventBus';
import type { SocketEventMap } from '../../../events/types';
import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 1. 핸들러 모듈 전체를 Mocking 처리합니다.
jest.mock('../handlers', () => ({
    authHandler: jest.fn(),
    chatHandler: jest.fn(),
    modelHandler: jest.fn(),
    syncHandler: jest.fn(),
    systemHandler: jest.fn(),
    userHandler: jest.fn(),
}));

describe('SocketDispatcher', () => {
    let mockEventBus: jest.Mocked<IEventBus<SocketEventMap>>;
    let dispatcher: ISocketDispatcher;

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

        dispatcher.dispatch(invalidEnvelope);

        expect(authHandler).not.toHaveBeenCalled();
        expect(chatHandler).not.toHaveBeenCalled();
    });

    it('도메인 타입이 "model"일 때 modelHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'model', action: 'update', payload: {} } as WSSEnvelope;

        dispatcher.dispatch(envelope);

        expect(modelHandler).toHaveBeenCalledWith(envelope, mockEventBus);
        expect(chatHandler).not.toHaveBeenCalled();
    });

    it('도메인 타입이 "chat"일 때 chatHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'chat', action: 'send', payload: {} } as WSSEnvelope;

        dispatcher.dispatch(envelope);

        expect(chatHandler).toHaveBeenCalledWith(envelope, mockEventBus);
    });

    it('도메인 타입이 "auth"일 때 authHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'auth', action: 'update', payload: {} } as WSSEnvelope;

        dispatcher.dispatch(envelope);

        expect(authHandler).toHaveBeenCalledWith(envelope, mockEventBus);
    });

    it('정의되지 않은 알 수 없는 도메인 수신 시 어떤 핸들러도 호출하지 않아야 한다', () => {
        const envelope = { type: 'unknown_domain' as any, action: 'test', payload: {} } as any;
        dispatcher.dispatch(envelope);

        expect(authHandler).not.toHaveBeenCalled();
        expect(chatHandler).not.toHaveBeenCalled();
        expect(modelHandler).not.toHaveBeenCalled();
    });

    // 매핑되지 않은 channel.* 타입이 raw 'channel' 도메인으로 도착해도 chatHandler로
    // 라우팅되어 silently drop 되지 않아야 한다 (channel.sync-site-profile 부류 회귀 방지).
    it('도메인 타입이 "channel"일 때 chatHandler로 라우팅해야 한다', () => {
        const envelope = { type: 'channel' as any, action: 'sync-site-profile', payload: {} } as any;

        dispatcher.dispatch(envelope);

        expect(chatHandler).toHaveBeenCalledWith(envelope, mockEventBus);
    });

    // device.* 응답은 소켓 계층에서 소비됨 — 디스패처는 조용히 무시(에러/핸들러 호출 없음).
    it('도메인 타입이 "device"일 때 핸들러를 호출하지 않고 조용히 무시해야 한다', () => {
        const envelope = { type: 'device' as any, action: 'save', payload: {} } as any;

        expect(() => dispatcher.dispatch(envelope)).not.toThrow();
        expect(chatHandler).not.toHaveBeenCalled();
        expect(authHandler).not.toHaveBeenCalled();
        expect(modelHandler).not.toHaveBeenCalled();
    });
});
