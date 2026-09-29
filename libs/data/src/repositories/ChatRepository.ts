import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
// `-lib`'s send input is the one that carries `uploadIds` (see ChatSocketDataSource).
import type { ChatSendInput } from '@lemoncloud/chatic-sockets-lib';
import type { ChatQueryOptions } from '@chatic/app-messages';
import { logger } from '@chatic/bridges';
import type { DomainChat, DomainLastChat, DomainListResult } from '../domain';
import type { IChatLocalDataSource } from '../local/data-sources';
import type {
    ChatDeleteInput,
    ChatGetInput,
    ChatReactionInput,
    ChatUpdateInput,
    IChatSocketDataSource,
    IUploadSocketDataSource,
    UploadCompleteInput,
    UploadStartInput,
} from '../remote/socket-data-sources';
import type { UploadCompleteResultMirror, UploadStartResultMirror } from '../uploads/types';
import { isPendingUploadSlot } from '../uploads/types';
import type { DataContext, DataContextProvider } from './types';
import { BaseRepository, type DisposableRepository } from './types';

export interface ChatRefreshResult {
    fetchedCount: number;
    cursorNo?: number;
    readNo?: number;
    total: number;
}

export interface IChatRepository extends DisposableRepository {
    observeList(query: ChatFeedInput, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;
    observeLastList(channelIds: string[], callback: (result: DomainLastChat[]) => void): () => void;

    refreshList(query: ChatFeedInput): Promise<ChatRefreshResult>;
    getChat(payload: ChatGetInput): Promise<DomainChat>;
    sendChat(payload: ChatSendInput): Promise<DomainChat>;
    updateChat(payload: ChatUpdateInput): Promise<DomainChat>;
    deleteChat(payload: ChatDeleteInput): Promise<DomainChat>;
    setReaction(payload: ChatReactionInput): Promise<DomainChat>;

    /** Declares image slots for an attachment message; one ticket per slot, same order. */
    startUploads(payload: UploadStartInput): Promise<UploadStartResultMirror>;
    /** Settles the slots — failed transfers included — and returns each upload's final status. */
    completeUploads(payload: UploadCompleteInput): Promise<UploadCompleteResultMirror>;
    /**
     * Writes the optimistic row of an image message before any byte moves, one `sending` slot per
     * image. With `pendingId` it re-arms that same row for a retry instead of adding another.
     */
    createPendingImageChat(input: PendingImageChatInput): Promise<string>;
    /** Sends the pending row's message with its stored uploads and swaps in the server's row. Throws on failure. */
    sendPendingImageChat(pendingId: string, input: { uploadIds: string[] }): Promise<DomainChat>;
    /** Marks the pending row and every one of its slots failed. A row that is gone is left gone. */
    failPendingImageChat(pendingId: string): Promise<void>;
    /** Pending image rows of a channel, unsent ones included — the rows a page may have left behind. */
    listPendingImageChats(channelId: string): Promise<DomainChat[]>;

    cacheRead(id: string): Promise<DomainChat | null>;
    cacheReadList(query: ChatFeedInput): Promise<DomainListResult<DomainChat> | null>;
    cacheWrite(item: Partial<DomainChat>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainChat>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
    cacheClearByChannelId(channelId: string): Promise<void>;
}

export interface PendingImageChatInput {
    channelId: string;
    parentId?: string;
    /** One preview per picked image, in picking order. */
    localThumbUrls: string[];
    /** Re-arm this row (a retry) rather than create one. */
    pendingId?: string;
}

/**
 * How many rows a pending-row read looks at. A channel holds at most a handful of unsent image
 * messages; this only has to be comfortably more than that.
 */
const PENDING_IMAGE_SCAN_LIMIT = 50;

/** Manages local-first chat timelines, pending states, and remote synchronization. */
export class ChatRepository extends BaseRepository implements IChatRepository {
    constructor(
        private readonly chatSocketDataSource: IChatSocketDataSource,
        private readonly chatLocalDataSource: IChatLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly uploadSocketDataSource: IUploadSocketDataSource
    ) {
        super(contextProvider);
    }

    /**
     * The scope each pending image row was written in. An image send spans seconds to minutes, long
     * enough for a cloud switch, and a later read or write under the new scope would miss the row —
     * the send would find it "gone" and the failure would leave it `sending` in the old cloud forever.
     * Held for the page's life only, like the files the row belongs to.
     */
    private readonly pendingImageScopes = new Map<string, DataContext>();

    /** The pending row's own scope; the current one for a row this page did not write (a leftover). */
    private pendingImageScope(pendingId: string): DataContext {
        return this.pendingImageScopes.get(pendingId) ?? this.getRequestContext();
    }

    public observeList(
        query: ChatFeedInput,
        callback: (result: DomainListResult<DomainChat> | null) => void
    ): () => void {
        return this.chatLocalDataSource.observeList(query, callback, this.getRepositoryContext());
    }

    public observeLastList(channelIds: string[], callback: (result: DomainLastChat[]) => void): () => void {
        return this.chatLocalDataSource.observeLastList(channelIds, callback, this.getRepositoryContext());
    }

    public cacheRead(id: string): Promise<DomainChat | null> {
        return this.chatLocalDataSource.cacheRead(id, this.getRepositoryContext());
    }

    public cacheReadList(query: ChatFeedInput): Promise<DomainListResult<DomainChat> | null> {
        return this.chatLocalDataSource.cacheReadList(query, this.getRepositoryContext());
    }

    public cacheWrite(item: Partial<DomainChat>): Promise<void> {
        return this.chatLocalDataSource.cacheWrite(item, this.getRepositoryContext());
    }

    public cacheWriteMany(items: Array<Partial<DomainChat>>): Promise<void> {
        return this.chatLocalDataSource.cacheWriteMany(items, this.getRepositoryContext());
    }

    public cacheDelete(id: string): Promise<void> {
        return this.chatLocalDataSource.cacheDelete(id, this.getRepositoryContext());
    }

    public cacheClear(): Promise<void> {
        return this.chatLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public cacheClearByChannelId(channelId: string): Promise<void> {
        return this.chatLocalDataSource.cacheClearByChannelId(channelId, this.getRepositoryContext());
    }

    public async refreshList(query: ChatFeedInput): Promise<ChatRefreshResult> {
        this.assertRequiredString(query.channelId, 'channelId');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.chatSocketDataSource.fetchChat(query, normalizedContext);
        const domainList = remote.list || [];
        await this.chatLocalDataSource.cacheWriteMany(domainList, requestContext);

        return {
            fetchedCount: domainList.length,
            cursorNo: remote.cursorNo,
            readNo: remote.readNo,
            total: remote.total ?? domainList.length,
        };
    }

    public async getChat(payload: ChatGetInput): Promise<DomainChat> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domainChat = await this.chatSocketDataSource.getChat(payload, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);

        return domainChat;
    }

    public async sendChat(payload: ChatSendInput): Promise<DomainChat> {
        this.assertRequiredString(payload.channelId, 'channelId');
        const requestRef = `chat-send-${Date.now()}`;
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const optimisticChat = this.createOptimisticChat(payload, `optimistic-${requestRef}`, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(optimisticChat, requestContext);

        try {
            const remote = await this.chatSocketDataSource.sendChat(payload, normalizedContext);
            return await this.replaceOptimisticChat(optimisticChat.id, remote, requestContext);
        } catch (error) {
            await this.chatLocalDataSource.cacheWrite(
                {
                    ...optimisticChat,
                    isPending: false,
                    isFailed: true,
                    updatedAt: Date.now(),
                },
                requestContext
            );
            throw error;
        }
    }

    /**
     * Uploads live on the chat facade because they exist only to become a message's attachments —
     * a separate repository would own no state of its own. Nothing is cached: a ticket holds signed
     * URLs, which must not be stored, and the message row is what the screen renders.
     */
    public startUploads(payload: UploadStartInput): Promise<UploadStartResultMirror> {
        return this.uploadSocketDataSource.start(payload);
    }

    public completeUploads(payload: UploadCompleteInput): Promise<UploadCompleteResultMirror> {
        return this.uploadSocketDataSource.complete(payload);
    }

    public async createPendingImageChat(input: PendingImageChatInput): Promise<string> {
        this.assertRequiredString(input.channelId, 'channelId');
        const slots = input.localThumbUrls.map(localThumbUrl => ({ localStatus: 'sending' as const, localThumbUrl }));

        if (input.pendingId) {
            const requestContext = this.pendingImageScope(input.pendingId);
            // A merge into a row that was deleted would recreate it with no channel: refuse instead.
            if (!(await this.chatLocalDataSource.cacheRead(input.pendingId, requestContext))) {
                throw new Error(`[ChatRepository] pending image chat ${input.pendingId} is gone`);
            }
            await this.chatLocalDataSource.cacheWrite(
                { id: input.pendingId, isPending: true, isFailed: false, upload$$: slots, updatedAtMs: Date.now() },
                requestContext
            );
            return input.pendingId;
        }

        const requestContext = this.getRequestContext();
        // Random suffix: two sends in one millisecond (a double tap) must not share a row.
        const id = `optimistic-chat-images-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.pendingImageScopes.set(id, requestContext);
        const row = this.createOptimisticChat(
            { channelId: input.channelId, content: '', ...(input.parentId ? { parentId: input.parentId } : {}) },
            id,
            this.getNormalizedContext(requestContext)
        );
        await this.chatLocalDataSource.cacheWrite({ ...row, upload$$: slots }, requestContext);
        return id;
    }

    public async sendPendingImageChat(pendingId: string, input: { uploadIds: string[] }): Promise<DomainChat> {
        const requestContext = this.pendingImageScope(pendingId);
        const normalizedContext = this.getNormalizedContext(requestContext);
        // The send goes out on this graph's socket. On the app graph that follows the selection, so
        // once the selection has left the row's cloud the uploads belong to another cloud: fail
        // rather than post them there. A graph bound to one cloud always sends on that cloud's own
        // socket, so on it the two always agree and the row's cloud is where the send goes.
        if (this.getNormalizedContext().cid !== normalizedContext.cid) {
            throw new Error(`[ChatRepository] pending image chat ${pendingId} belongs to another cloud`);
        }
        const pending = await this.chatLocalDataSource.cacheRead(pendingId, requestContext);
        if (!pending) throw new Error(`[ChatRepository] pending image chat ${pendingId} is gone`);

        const payload: ChatSendInput = {
            channelId: pending.channelId,
            content: '',
            uploadIds: input.uploadIds,
            ...(pending.parentId ? { parentId: pending.parentId } : {}),
        };
        const remote = await this.chatSocketDataSource.sendChat(payload, normalizedContext);
        const sent = await this.replaceOptimisticChat(pendingId, remote, requestContext);
        this.pendingImageScopes.delete(pendingId);
        return this.readBackImageChat(sent, requestContext);
    }

    /**
     * `chat.send`'s answer names the uploads but not where to fetch them — its `upload$$` is
     * `{ id, status, stereo }`, and the sender gets no broadcast of its own message to fill the gap
     * (measured on dev). `chat.get` answers the signed addresses, so the confirmed row reads itself
     * back once. The message is sent either way: if the read fails, the row keeps the send's answer
     * and the images appear the next time the room reads its feed.
     */
    private async readBackImageChat(sent: DomainChat, requestContext: DataContext): Promise<DomainChat> {
        if (!sent.id) return sent;
        try {
            const read = await this.chatSocketDataSource.getChat(
                { id: sent.id },
                this.getNormalizedContext(requestContext)
            );
            const confirmed: DomainChat = { ...read, tempId: sent.tempId, isPending: false, isFailed: false };
            await this.chatLocalDataSource.cacheWrite(confirmed, requestContext);
            return confirmed;
        } catch (error) {
            logger.warn('CHAT', '[ChatRepository] could not read back a sent image message', {
                chatId: sent.id,
                error: (error as Error)?.name,
            });
            return sent;
        }
    }

    public async failPendingImageChat(pendingId: string): Promise<void> {
        const requestContext = this.pendingImageScope(pendingId);
        const pending = await this.chatLocalDataSource.cacheRead(pendingId, requestContext);
        // Deleted while its upload was still running: failing it would bring it back.
        if (!pending) return;
        await this.chatLocalDataSource.cacheWrite(
            {
                id: pendingId,
                isPending: false,
                isFailed: true,
                updatedAtMs: Date.now(),
                upload$$: (pending.upload$$ ?? []).map(slot =>
                    isPendingUploadSlot(slot) ? { ...slot, localStatus: 'failed' as const } : slot
                ),
            },
            requestContext
        );
    }

    public async listPendingImageChats(channelId: string): Promise<DomainChat[]> {
        this.assertRequiredString(channelId, 'channelId');
        // The two backends reach unsent rows (`chatNo: 0`) differently: the web store appends them
        // when asked with `includeUnsent`, the native store ignores that flag but honours `sort`, and
        // ascending by number puts `0` first. Asking for both reaches them on either.
        const query: ChatFeedInput & ChatQueryOptions = {
            channelId,
            limit: PENDING_IMAGE_SCAN_LIMIT,
            includeUnsent: true,
            sort: 'asc',
        };
        const result = await this.chatLocalDataSource.cacheReadList(query, this.getRepositoryContext());
        return (result?.list ?? []).filter(chat => !chat.chatNo && !!chat.upload$$?.some(isPendingUploadSlot));
    }

    public async updateChat(payload: ChatUpdateInput): Promise<DomainChat> {
        const chatId = this.assertRequiredString((payload as { id?: string }).id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const existing = await this.chatLocalDataSource.cacheRead(chatId, requestContext);

        await this.chatLocalDataSource.cacheWrite(
            {
                ...(existing ?? { id: chatId }),
                ...(payload as Partial<DomainChat>),
                id: chatId,
            },
            requestContext
        );

        try {
            const domainChat = await this.chatSocketDataSource.updateChat(payload, normalizedContext);
            await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
            return domainChat;
        } catch (error) {
            if (existing) {
                await this.chatLocalDataSource.cacheWrite(existing, requestContext);
            }
            throw error;
        }
    }

    /**
     * Publish a reaction on/off event.
     *
     * The reaction is not a field on the target message but a separate event chat, so
     * the optimistic write is an event of our own: a provisional row with no `chatNo`,
     * which the fold sorts last and therefore treats as the newest state for that
     * (message, person, emoji). The chip flips on the click, not on the round trip.
     *
     * On success the provisional row is replaced by the server's event; the broadcast
     * echo carries the same `chatNo` and lands on that same row. On failure it is
     * removed, so the chip returns to what the remaining events say — there is no
     * previous value to restore, because the event never existed anywhere but here.
     */
    public async setReaction(payload: ChatReactionInput): Promise<DomainChat> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const { chatId, emoji, action } = payload;
        const now = Date.now();
        const provisionalId = `optimistic-reaction-${chatId}-${emoji}-${now}`;
        const provisional: DomainChat = {
            id: provisionalId,
            tempId: provisionalId,
            cid: normalizedContext.cid ?? 'default',
            // The event belongs to the target's channel — the id is `<channelId>:<chatNo>`.
            channelId: chatId.split(':')[0] ?? '',
            chatNo: 0,
            stereo: 'system',
            subType: 'reaction',
            reaction$: { chatId, emoji, action },
            ownerId: normalizedContext.uid,
            createdAt: now,
            updatedAt: now,
            createdAtMs: now,
            updatedAtMs: now,
            isPending: true,
            isFailed: false,
        };
        await this.chatLocalDataSource.cacheWrite(provisional, requestContext);

        try {
            const event = await this.chatSocketDataSource.setReaction(payload, normalizedContext);
            await this.chatLocalDataSource.cacheWrite(event, requestContext);
            if (event.id && event.id !== provisionalId) {
                await this.chatLocalDataSource.cacheDelete(provisionalId, requestContext);
            }
            return event;
        } catch (error) {
            await this.chatLocalDataSource.cacheDelete(provisionalId, requestContext);
            throw error;
        }
    }

    /**
     * Delete a message. NOT optimistic: the row is hidden only once the server confirms.
     *
     * The server's delete is a soft delete — `chat.delete` maps to `PUT { hidden: true }`
     * and the row survives — so hiding it here would mean marking the cached row rather
     * than removing it, and that mark could not be taken back. `cacheWrite` MERGES, so
     * writing the previous record back cannot clear a key that record never had: the
     * optimistic `hidden: true` survived its own rollback, and a failed delete left the
     * message looking deleted while it was alive on the server. The rollback was not
     * fixed, it was made unnecessary — nothing is written before the answer arrives, so
     * a failure changes nothing and only has to be reported.
     *
     * Delete is the operation with the least to gain from optimism anyway: it already
     * costs a confirmation step, it is rare, and it cannot be undone. Showing it as done
     * before the server knows is not speed. Send and update keep their optimistic paths,
     * where the immediacy is worth it and a rollback actually works.
     */
    public async deleteChat(payload: ChatDeleteInput): Promise<DomainChat> {
        this.assertRequiredString((payload as { id?: string }).id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        const domainChat = await this.chatSocketDataSource.deleteChat(payload, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
        return domainChat;
    }

    /** Writes the server's row and drops the optimistic one it answers — the one swap both send paths share. */
    private async replaceOptimisticChat(
        optimisticId: string,
        remote: DomainChat,
        requestContext: DataContext
    ): Promise<DomainChat> {
        const domainChat: DomainChat = { ...remote, tempId: optimisticId, isPending: false, isFailed: false };
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
        if (domainChat.id && optimisticId !== domainChat.id) {
            await this.chatLocalDataSource.cacheDelete(optimisticId, requestContext);
        }
        return domainChat;
    }

    // Optimistic chats are built as domain literals (no mapper); cacheWrite fills any remaining defaults.
    private createOptimisticChat(payload: ChatSendInput, id: string, normalizedContext: DataContext): DomainChat {
        const now = Date.now();
        return {
            id,
            tempId: id,
            cid: normalizedContext.cid ?? 'default',
            channelId: payload.channelId || '',
            chatNo: 0,
            content: payload.content,
            contentType: payload.contentType ?? 'text',
            parentId: payload.parentId,
            ownerId: normalizedContext.uid,
            createdAt: now,
            updatedAt: now,
            createdAtMs: now,
            updatedAtMs: now,
            isPending: true,
            isFailed: false,
        };
    }
}
