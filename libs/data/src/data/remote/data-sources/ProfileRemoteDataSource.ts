import type { ProfileBody, ProfileView, SiteProfileSyncView } from '@lemoncloud/chatic-socials-api';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap, SocketEventMap } from '../../events/types';
import type { IWebSocketClient } from '../clients';

export interface IProfileRemoteDataSource {
    /** 본인 플레이스 프로필 조회를 요청합니다. */
    getMyProfile(ref?: string): void;

    /** 본인 플레이스 프로필 저장을 요청합니다. */
    setMyProfile(payload: ProfileBody, ref?: string): void;

    /** 도달 가능한 사용자들의 플레이스 프로필 동기화를 요청합니다. */
    syncProfiles(since: number, ref?: string): void;
}

export class ProfileRemoteDataSource implements IProfileRemoteDataSource {
    constructor(
        private readonly socketEventBus: IEventBus<SocketEventMap>,
        private readonly domainEventBus: IEventBus<DomainEventMap>,
        private readonly wssClient: IWebSocketClient
    ) {
        this.initializeListeners();
    }

    private initializeListeners() {
        this.socketEventBus.on('profile:get', detail => {
            this.domainEventBus.emit('profile:get', {
                data: detail.payload as ProfileView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('profile:update', detail => {
            this.domainEventBus.emit('profile:update', {
                data: detail.payload as ProfileView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('profile:sync', detail => {
            this.domainEventBus.emit('profile:sync', {
                data: detail.payload as SiteProfileSyncView,
                ref: detail.ref,
            });
        });

        this.socketEventBus.on('profile:error', detail => {
            this.domainEventBus.emit('error', {
                domain: 'profile',
                message: detail.payload.error || 'Unknown Profile Error',
                ref: detail.ref,
            });
        });
    }

    public getMyProfile(ref?: string) {
        this.wssClient.send('user', 'get-site-profile', {}, ref);
    }

    public setMyProfile(payload: ProfileBody, ref?: string) {
        this.wssClient.send('user', 'set-site-profile', payload, ref);
    }

    public syncProfiles(since: number, ref?: string) {
        this.wssClient.send('channel', 'sync-site-profile', { since }, ref);
    }
}
