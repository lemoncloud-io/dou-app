import type { ChatReadPayload, ChatUpdateJoinPayload } from '@lemoncloud/chatic-sockets-api';
import type { IJoinLocalDataSource } from '../local/data-sources';
import type { IJoinRemoteDataSource } from '../remote/data-sources';
import type { DataContextProvider } from './types';
import { BaseRepository, type RepositoryRequestOptions } from './types';
import type { ISocketRequestManager } from '../remote/sockets/SocketRequestManager';
import type { DomainEventMap } from '../events/domain';
import type { IEventBus } from '../events/eventBus';
import type { DomainJoin } from '../domain';
import { toDomainJoin } from '../domain';

/** 채널 참여 상태(join) 도메인의 Repository 공개 계약입니다. */
export interface IJoinRepository {
    /** 특정 채팅 번호까지 읽었음을 서버에 알립니다. */
    readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<DomainJoin>;

    /** 알림 설정, 닉네임 등 채널 참여 정보를 갱신합니다. */
    updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<DomainJoin>;
}

/** Remote join API와 local join cache를 중재합니다. */
export class JoinRepository extends BaseRepository implements IJoinRepository {
    constructor(
        private readonly joinRemoteDataSource: IJoinRemoteDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        requestManager: ISocketRequestManager,
        contextProvider: DataContextProvider,
        domainEventBus: IEventBus<DomainEventMap>
    ) {
        super(requestManager, contextProvider, domainEventBus);
        this.initializeInternalListeners();
    }

    /** chat:read 요청을 수행하고 응답을 기다립니다. */
    public async readChat(payload: ChatReadPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<DomainJoin>(
            ref => this.joinRemoteDataSource.readChat(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsertJoin(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    /** chat:update-join 요청을 수행하고 응답을 기다립니다. */
    public async updateJoin(payload: ChatUpdateJoinPayload, options?: RepositoryRequestOptions): Promise<DomainJoin> {
        const join = await this.requestRemote<DomainJoin>(
            ref => this.joinRemoteDataSource.updateJoin(payload, ref),
            options
        );
        const domainJoin = toDomainJoin(join, this.getDomainScope());
        await this.joinLocalDataSource.upsertJoin(domainJoin, this.getRepositoryContext());
        return domainJoin;
    }

    private initializeInternalListeners(): void {
        this.onDomainEvent('join:create', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.upsertJoin(detail.data, this.getRepositoryContext()),
                'join:create'
            );
        });
        this.onDomainEvent('join:update', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.upsertJoin(detail.data, this.getRepositoryContext()),
                'join:update'
            );
        });
        this.onDomainEvent('join:delete', detail => {
            this.runInBackground(
                () => this.joinLocalDataSource.deleteJoin(detail.data.id || '', this.getRepositoryContext()),
                'join:delete'
            );
        });
    }
}
