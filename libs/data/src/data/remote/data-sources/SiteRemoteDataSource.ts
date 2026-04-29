import type { SiteView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, ListResult, SocketEventMap } from '../../events/types';

export interface ISiteRemoteDataSource {}

export class SiteRemoteDataSource implements ISiteRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('site:update', detail => {
            this.domainEventBus.emit('site:update', {
                data: detail.payload as SiteView,
                ref: detail.ref,
                cid: detail.cid,
            });
        });

        this.socketEventBus.on('site:read', detail => {
            this.domainEventBus.emit('site:list', {
                data: detail.payload as ListResult<SiteView>,
                ref: detail.ref,
                cid: detail.cid,
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
}
