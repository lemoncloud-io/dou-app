import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { AuthPayload } from '@lemoncloud/chatic-sockets-api';

export interface IAuthRemoteDataSource {
    /** 서버에 인증 정보(토큰 등) 업데이트를 요청합니다. */
    updateSocketAuth(payload: AuthPayload, ref?: string): void;
}

export class AuthRemoteDataSource implements IAuthRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    /** 인프라 계층의 원시 소켓 이벤트를 도메인 이벤트로 정제하여 발행합니다. */
    private initializeListeners() {
        this.socketEventBus.on('auth:update', detail => {
            this.domainEventBus.emit('auth:update', {
                data: detail.payload as AuthPayload,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('auth:error', detail => {
            const payload = detail.payload as any;
            this.domainEventBus.emit('error', {
                domain: 'auth',
                message: payload.error || payload.message || 'Unknown Auth Error',
                ref: detail.ref,
            });
        });
    }

    public updateSocketAuth(payload?: AuthPayload, ref?: string) {
        this.wssClient.send('auth', 'update', payload, ref);
    }
}
