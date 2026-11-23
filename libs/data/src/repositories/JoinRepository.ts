import type { ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../domain';
import type { IJoinLocalDataSource } from '../local/data-sources';
import { OutboxRefusalError, type OutboxPort, type WriteReceipt } from '../outbox/ports';
import type { IJoinSocketDataSource } from '../remote/socket-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';
import type { JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';

export interface MyJoinFields {
    nick?: string;
    notify?: DomainJoin['notify'];
}

export interface IJoinRepository extends DisposableRepository {
    observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void,
        contextOverride?: DataContext
    ): () => void;

    readChat(payload: ChatReadInput): Promise<WriteReceipt>;
    updateJoin(payload: JoinUpdateInput): Promise<WriteReceipt>;

    sendRead(payload: { channelId: string; chatNo: number }): Promise<DomainJoin>;
    sendJoinUpdate(channelId: string, fields: MyJoinFields): Promise<DomainJoin>;
    writeMyJoinLocally(channelId: string, fields: MyJoinFields): Promise<void>;

    cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null>;
    cacheWrite(item: Partial<DomainJoin>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

export class JoinRepository extends BaseRepository implements IJoinRepository {
    constructor(
        private readonly joinSocketDataSource: IJoinSocketDataSource,
        private readonly joinLocalDataSource: IJoinLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly outbox: OutboxPort
    ) {
        super(contextProvider);
    }

    public observeList(
        query: DomainJoinListPayload,
        callback: (result: DomainListResult<DomainJoin> | null) => void,
        contextOverride?: DataContext
    ): () => void {
        return this.joinLocalDataSource.observeList(query, callback, contextOverride ?? this.getRepositoryContext());
    }

    public cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null> {
        return this.joinLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainJoin>): Promise<void> {
        return this.joinLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.joinLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.joinLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public async readChat(payload: ChatReadInput): Promise<WriteReceipt> {
        const channelId = this.assertRequiredString(payload.channelId, 'channelId');
        const chatNo = payload.chatNo;
        if (typeof chatNo !== 'number') throw new Error('[Repository] chatNo is required.');
        const requestContext = this.getRequestContext();

        await this.writeLocalRead(channelId, chatNo, requestContext);
        return this.outbox.set({ op: 'join.read', ...this.writeScope(requestContext), key: channelId, value: chatNo });
    }

    public async updateJoin(payload: ChannelUpdateJoinInput): Promise<WriteReceipt> {
        const requestContext = this.getRequestContext();
        const { channelId, existing } = await this.resolveMyJoin(payload, requestContext);
        const { nick, notify } = payload as MyJoinFields;

        const fields: MyJoinFields = {
            ...(typeof nick === 'string' ? { nick } : {}),
            ...(typeof notify !== 'undefined' ? { notify } : {}),
        };
        await this.joinLocalDataSource.cacheWrite({ ...existing, ...(fields as Partial<DomainJoin>) }, requestContext);

        const scope = this.writeScope(requestContext);
        const receipts: WriteReceipt[] = [];
        if (fields.notify !== undefined) {
            receipts.push(
                this.outbox.set({
                    op: 'join.notify',
                    ...scope,
                    key: channelId,
                    value: fields.notify,
                    previous: existing.notify,
                })
            );
        }
        if (fields.nick !== undefined) {
            receipts.push(
                this.outbox.set({
                    op: 'join.nick',
                    ...scope,
                    key: channelId,
                    value: fields.nick,
                    previous: existing.nick,
                })
            );
        }
        const delivered = Promise.all(receipts.map(receipt => receipt.delivered)).then(() => undefined);
        delivered.catch(() => undefined);
        return { delivered };
    }

    public async sendRead(payload: { channelId: string; chatNo: number }): Promise<DomainJoin> {
        const requestContext = this.getRequestContext();
        return this.joinSocketDataSource.readChat(payload, this.getNormalizedContext(requestContext));
    }

    public async sendJoinUpdate(channelId: string, fields: MyJoinFields): Promise<DomainJoin> {
        const requestContext = this.getRequestContext();
        const { existing } = await this.resolveMyJoin({ channelId } as ChannelUpdateJoinInput, requestContext).catch(
            (error: unknown) => {
                throw new OutboxRefusalError(error instanceof Error ? error.message : String(error));
            }
        );
        return this.joinSocketDataSource.updateJoin(
            { id: existing.id, ...fields },
            this.getNormalizedContext(requestContext)
        );
    }

    public async writeMyJoinLocally(channelId: string, fields: MyJoinFields): Promise<void> {
        const requestContext = this.getRequestContext();
        const { existing } = await this.resolveMyJoin({ channelId } as ChannelUpdateJoinInput, requestContext);
        await this.joinLocalDataSource.cacheWrite({ ...existing, ...(fields as Partial<DomainJoin>) }, requestContext);
    }

    private writeScope(requestContext: DataContext): { cid: string; uid: string } {
        return { cid: this.getNormalizedContext(requestContext).cid as string, uid: String(requestContext.uid || '') };
    }

    private async resolveMyJoin(
        payload: ChannelUpdateJoinInput,
        requestContext: DataContext
    ): Promise<{ channelId: string; existing: DomainJoin }> {
        const myUid = String(requestContext.uid || '');
        const targetUserId = (payload as { userId?: string }).userId || myUid;
        if (targetUserId !== myUid) throw new Error('[Repository] only my own join can be updated.');

        const explicitId = (payload as { id?: string }).id || (payload as { joinId?: string }).joinId || '';
        let existing = explicitId ? await this.joinLocalDataSource.cacheRead(explicitId, requestContext) : null;
        const channelId = (payload as { channelId?: string }).channelId || existing?.channelId || '';
        if (!existing && channelId) {
            const list = await this.joinLocalDataSource.cacheReadList({ channelId, activeOnly: false }, requestContext);
            existing = (list?.list || []).find(item => item.userId === myUid) || null;
        }
        this.assertRequiredString(existing?.id, 'id');
        return { channelId: this.assertRequiredString(channelId, 'channelId'), existing: existing as DomainJoin };
    }

    private async writeLocalRead(channelId: string, chatNo: number, requestContext: DataContext) {
        const currentList = await this.joinLocalDataSource.cacheReadList(
            { channelId, activeOnly: false },
            requestContext
        );
        const current = (currentList?.list || []).find(item => item.userId === requestContext.uid);
        const optimisticId = current?.id || `${channelId}@${requestContext.uid || 'me'}`;
        const optimisticPatch: Partial<DomainJoin> = {
            id: optimisticId,
            channelId,
            userId: String(requestContext.uid || ''),
            readNo: chatNo,
            chatNo,
        };

        await this.joinLocalDataSource.cacheWrite({ ...(current ?? {}), ...optimisticPatch }, requestContext);
    }
}
