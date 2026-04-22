import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { WSSEventDomainType } from '@lemoncloud/chatic-sockets-api/dist/libs/wss/wss-types';
import { authHandler, chatHandler, modelHandler, syncHandler, systemHandler, userHandler } from './handlers';
import type { IEventBus } from '../../events/eventBus';
import type { SocketEventMap } from '../../events/types';

export interface SocketContext {
    cloudId: string; // 현재 접속 중인 클라우드 서비스 식별자
}

export class SocketDispatcher {
    /**
     * @param eventBus 핸들러들이 이벤트를 방출할 때 사용할 공통 이벤트 버스
     */
    constructor(private readonly eventBus: IEventBus<SocketEventMap>) {}

    /**
     * 수신된 소켓 Envelope) 타입을 분석하여 적절한 핸들러 함수를 호출합니다.
     * @param envelope 서버로부터 수신된 원시 소켓 데이터
     * @param context 서비스 식별자 등 처리에 필요한 외부 문맥 정보
     */
    dispatch(envelope: WSSEnvelope, context: SocketContext) {
        if (!envelope || !envelope.type) {
            console.warn('[Socket Dispatcher] Invalid envelope received');
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
                    modelHandler(envelope, context, this.eventBus);
                    break;
                }
                case 'chat': {
                    chatHandler(envelope, context, this.eventBus);
                    break;
                }
                case 'auth': {
                    authHandler(envelope, context, this.eventBus);
                    break;
                }
                case 'sync': {
                    syncHandler(envelope, context, this.eventBus);
                    break;
                }
                case 'user': {
                    userHandler(envelope, context, this.eventBus);
                    break;
                }
                case 'system': {
                    systemHandler(envelope, context, this.eventBus);
                    break;
                }
                default: {
                    console.warn(`[Socket Dispatcher] Unhandled domain: ${domain}`);
                }
            }
        } else {
            console.warn(`[Socket Dispatcher] No router found for domain: ${domain}`);
        }
    }
}
