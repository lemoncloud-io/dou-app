import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, ListResult, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';
import type { UserMakeSitePayload, UserUpdateSitePayload } from '@lemoncloud/chatic-sockets-api';

export interface ISiteRemoteDataSource {
    /** 사용자가 접근 가능한 사이트 목록을 요청합니다. */
    fetchSite(payload?: {}, ref?: string): void;

    /** 새 사이트 생성을 요청합니다. */
    createSite(payload: UserMakeSitePayload, ref?: string): void;

    /** 사이트 정보 수정을 요청합니다. */
    updateSite(payload: UserUpdateSitePayload, ref?: string): void;
}

export class SiteRemoteDataSource implements ISiteRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('site:create', detail => {
            this.domainEventBus.emit('site:create', {
                data: detail.payload as SiteView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('site:update', detail => {
            this.domainEventBus.emit('site:update', {
                data: detail.payload as SiteView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('site:read', detail => {
            this.domainEventBus.emit('site:list', {
                data: detail.payload as ListResult<SiteView>,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('site:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'site',
                message: detail.payload.error || 'Unknown Site Error',
                ref: detail.ref,
            });
        });
    }

    public fetchSite(payload?: {}, ref?: string) {
        this.wssClient.send('user', 'my-site', payload ?? {}, ref);
    }

    public createSite(payload: UserMakeSitePayload, ref?: string) {
        this.wssClient.send('user', 'make-site', payload, ref);
    }

    public updateSite(payload: UserUpdateSitePayload, ref?: string) {
        this.wssClient.send('user', 'update-site', payload, ref);
    }
}
