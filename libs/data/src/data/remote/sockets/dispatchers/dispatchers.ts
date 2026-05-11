import { authHandler, chatHandler, modelHandler, syncHandler, systemHandler, userHandler } from '../handlers';
import type { IEventBus } from '../../../events/eventBus';
import type { SocketEventMap } from '../../../events/types';
import type { WSSEnvelope, WSSEventDomainType } from '@lemoncloud/chatic-sockets-api';
import { logger } from '@chatic/app-messages';

export interface ISocketDispatcher {
    dispatch(envelope: WSSEnvelope): void;
}

export class SocketDispatcher implements ISocketDispatcher {
    /**
     * @param eventBus 핸들러들이 이벤트를 방출할 때 사용할 공통 이벤트 버스
     */
    constructor(private readonly eventBus: IEventBus<SocketEventMap>) {}

    /**
     * 수신된 소켓 Envelope) 타입을 분석하여 적절한 핸들러 함수를 호출합니다.
     * @param envelope 서버로부터 수신된 원시 소켓 데이터
     */
    dispatch(envelope: WSSEnvelope) {
        if (!envelope || !envelope.type) {
            logger.warn('SOCKET_DISPATCHER', '[Socket Dispatcher] Invalid envelope received');
            return;
        }

        const domain: WSSEventDomainType = envelope.type;

        if (domain) {
            /**
             * 도메인 타입에 따라 메시지 처리를 분기합니다.
             * 각 핸들러는 데이터를 가공하여 최종적으로 이벤트 버스에 이벤트를 방출합니다.
             */
            switch (domain) {
                case 'model': {
                    modelHandler(envelope, this.eventBus);
                    break;
                }
                case 'chat': {
                    chatHandler(envelope, this.eventBus);
                    break;
                }
                case 'auth': {
                    authHandler(envelope, this.eventBus);
                    break;
                }
                case 'sync': {
                    syncHandler(envelope, this.eventBus);
                    break;
                }
                case 'user': {
                    userHandler(envelope, this.eventBus);
                    break;
                }
                case 'system': {
                    systemHandler(envelope, this.eventBus);
                    break;
                }
                default: {
                    logger.warn('SOCKET_DISPATCHER', `[Socket Dispatcher] Unhandled domain: ${domain}`);
                }
            }
        } else {
            logger.warn('SOCKET_DISPATCHER', `[Socket Dispatcher] No router found for domain: ${domain}`);
        }
    }
}
