import type { ChannelUpdateJoinInput, ChatReadInput } from '@lemoncloud/chatic-sockets-api';
import type { DomainJoin, DomainJoinListPayload, DomainListResult } from '../domain';
import type { IJoinLocalDataSource } from '../local/data-sources';
import { OutboxRefusalError, type OutboxPort, type WriteReceipt } from '../outbox/ports';
import type { IJoinSocketDataSource } from '../remote/socket-data-sources';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';
import type { JoinUpdateInput } from '@lemoncloud/chatic-sockets-lib';

/** The fields of my own join row that `join.update` sets. */
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

    /** Moves my read cursor locally at once and hands the server half to the outbox. */
    readChat(payload: ChatReadInput): Promise<WriteReceipt>;
    /** Sets my nick and/or notification setting locally at once and hands each to the outbox. */
    updateJoin(payload: JoinUpdateInput): Promise<WriteReceipt>;

    /** Outbox delivery for `join.read` — the socket half only. Screens call `readChat`. */
    sendRead(payload: { channelId: string; chatNo: number }): Promise<DomainJoin>;
    /** Outbox delivery for `join.notify` / `join.nick` — the socket half only. Screens call `updateJoin`. */
    sendJoinUpdate(channelId: string, fields: MyJoinFields): Promise<DomainJoin>;
    /** Outbox restore after a refusal — writes my join's fields locally. */
    writeMyJoinLocally(channelId: string, fields: MyJoinFields): Promise<void>;

    cacheReadList(query: DomainJoinListPayload): Promise<DomainListResult<DomainJoin> | null>;
    cacheWrite(item: Partial<DomainJoin>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
}

/**
 * Maintains join membership snapshots and read-state transitions for each channel context.
 *
 * My own join's writes — the read cursor, the notification setting, my name for the room — are
 * state writes: each goes two ways, locally at once and into the outbox, which sends it when this
 * cloud's socket can carry it (`../outbox`). There is no path that calls the server directly, so no
 * screen can skip the queue.
 */
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

    /**
     * A failure is never rolled back: a read position only moves forward, and the user has seen the
     * messages whether or not the server heard about it yet. Restoring the old cursor put the unread
     * badge back on a room the user had just read.
     */
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
        // `join.update` requires a single composite join id; resolved when the write goes out, from the
        // row the local half wrote. A row that is gone by then (I left the room) never comes back for
        // this write, so it is a refusal rather than something to retry.
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

    /** The cloud and account a write belongs to, captured when it is made. */
    private writeScope(requestContext: DataContext): { cid: string; uid: string } {
        return { cid: this.getNormalizedContext(requestContext).cid as string, uid: String(requestContext.uid || '') };
    }

    /**
     * My join row in a channel, looked up in the local cache. `join.update` names the row by its
     * composite id, and the app input arrives as `{channelId, userId}` or with the id itself. Only my
     * own row can be written: its writes are keyed by my uid in the outbox.
     */
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
