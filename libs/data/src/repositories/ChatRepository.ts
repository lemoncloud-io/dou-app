import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatQueryOptions } from '@chatic/bridge-messages';
import { logger } from '@chatic/logger';
import type { ChatMentionBody, ChatSendPayload, DomainChat, DomainLastChat, DomainListResult } from '../domain';
import { channelIdOfChatId, toMentionBody, toMentionRecord } from '../domain';
import type { IChatLocalDataSource, ListRoomMediaInput, RoomMediaCounts, RoomMediaPage } from '../local/data-sources';
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
import type { CheckedUploadCompleteResult, PresignedUploadStartResult } from '../uploads/types';
import { isPendingUploadSlot } from '../uploads/types';
import {
    feedCoverage,
    feedCoverageKey,
    feedCoverageScope,
    forgetChannelCoverage,
    type FeedRange,
} from './feedCoverage';
import type { DataContext, DataContextProvider } from './types';
import { isGoneFailure, readRevisedTargets, revisedIdsOf } from './revisionNotices';
import { BaseRepository, type DisposableRepository } from './types';

export interface ChatRefreshResult {
    fetchedCount: number;
    latestNo: number;
    cursorNo?: number;
    readNo?: number;
    total: number;
}

export interface ChatRefreshOptions {
    onFetched?: () => void;
    markMissingHidden?: boolean;
    cursorIsRow?: boolean;
}

export type ChatObserveQuery = ChatFeedInput & Pick<ChatQueryOptions, 'includeUnsent'>;

export interface IChatRepository extends DisposableRepository {
    observeList(query: ChatObserveQuery, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;
    observeLastList(channelIds: string[], callback: (result: DomainLastChat[]) => void): () => void;

    refreshList(query: ChatFeedInput, options?: ChatRefreshOptions): Promise<ChatRefreshResult>;
    observeFeedCoverage(channelId: string, callback: (covered: readonly FeedRange[]) => void): () => void;
    getChat(payload: ChatGetInput): Promise<DomainChat>;
    sendChat(payload: ChatSendPayload): Promise<DomainChat>;
    updateChat(payload: ChatUpdateInput): Promise<DomainChat>;
    deleteChat(payload: ChatDeleteInput): Promise<DomainChat>;
    setReaction(payload: ChatReactionInput): Promise<DomainChat>;

    startUploads(payload: UploadStartInput): Promise<PresignedUploadStartResult>;
    completeUploads(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
    createPendingImageChat(input: PendingImageChatInput): Promise<string>;
    sendPendingImageChat(pendingId: string, input: { uploadIds: string[] }): Promise<DomainChat>;
    failPendingImageChat(pendingId: string): Promise<void>;
    listPendingImageChats(channelId: string): Promise<DomainChat[]>;

    cacheRead(id: string): Promise<DomainChat | null>;
    cacheReadList(query: ChatFeedInput): Promise<DomainListResult<DomainChat> | null>;
    cacheWrite(item: Partial<DomainChat>): Promise<void>;
    cacheWriteMany(items: Array<Partial<DomainChat>>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheClear(): Promise<void>;
    cacheClearByChannelId(channelId: string): Promise<void>;

    listRoomMedia(input: ListRoomMediaInput): Promise<RoomMediaPage>;
    countRoomMedia(input: { channelId: string }): Promise<RoomMediaCounts>;
}

export interface PendingFileDetails {
    name: string;
    contentType: string;
    size: number;
}

export interface PendingImageChatInput {
    channelId: string;
    parentId?: string;
    localThumbUrls: string[];
    localFiles?: (PendingFileDetails | null)[];
    content?: string;
    mention?: ChatMentionBody;
    pendingId?: string;
}

const PENDING_IMAGE_SCAN_LIMIT = 50;

const SERVER_DEFAULT_FEED_LIMIT = 20;

const provenRange = ({
    requestCursor,
    limit,
    responseCursor,
    cursorIsRow,
    page,
}: {
    requestCursor?: number;
    limit: number;
    responseCursor?: number;
    cursorIsRow?: boolean;
    page: DomainChat[];
}): { low: number; high: number; tombstoneLow: number } | null => {
    let newest = 0;
    let oldest = Infinity;
    for (const chat of page) {
        if (!chat.chatNo) continue;
        newest = Math.max(newest, chat.chatNo);
        oldest = Math.min(oldest, chat.chatNo);
    }
    const asked = requestCursor && requestCursor > 0 ? requestCursor - 1 : Infinity;
    if (responseCursor && responseCursor > 0) {
        const high = Math.min(asked, responseCursor + limit - 1);
        return high < responseCursor ? null : { low: responseCursor, high, tombstoneLow: responseCursor };
    }
    const high = cursorIsRow && Number.isFinite(asked) ? asked : newest;
    if (high < 1) return null;
    return { low: 1, high, tombstoneLow: Number.isFinite(oldest) ? oldest : high + 1 };
};

export class ChatRepository extends BaseRepository implements IChatRepository {
    private readonly settledNotices = new Set<string>();

    constructor(
        private readonly chatSocketDataSource: IChatSocketDataSource,
        private readonly chatLocalDataSource: IChatLocalDataSource,
        contextProvider: DataContextProvider,
        private readonly uploadSocketDataSource: IUploadSocketDataSource
    ) {
        super(contextProvider);
    }

    private readonly pendingImageScopes = new Map<string, DataContext>();

    private pendingImageScope(pendingId: string): DataContext {
        return this.pendingImageScopes.get(pendingId) ?? this.getRequestContext();
    }

    public observeList(
        query: ChatObserveQuery,
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
        const { cid, uid } = this.getNormalizedContext();
        const scope = feedCoverageScope(cid, uid);
        feedCoverage.forget(key => key.startsWith(scope));
        this.settledNotices.clear();
        return this.chatLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public cacheClearByChannelId(channelId: string): Promise<void> {
        forgetChannelCoverage(channelId, this.getNormalizedContext());
        return this.chatLocalDataSource.cacheClearByChannelId(channelId, this.getRepositoryContext());
    }

    public listRoomMedia(input: ListRoomMediaInput): Promise<RoomMediaPage> {
        return this.chatLocalDataSource.listRoomMedia(input, this.getRepositoryContext());
    }

    public countRoomMedia(input: { channelId: string }): Promise<RoomMediaCounts> {
        return this.chatLocalDataSource.countRoomMedia(input, this.getRepositoryContext());
    }

    public async refreshList(query: ChatFeedInput, options: ChatRefreshOptions = {}): Promise<ChatRefreshResult> {
        this.assertRequiredString(query.channelId, 'channelId');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const remote = await this.chatSocketDataSource.fetchChat(query, normalizedContext);
        options.onFetched?.();
        const domainList = remote.list || [];
        const proven = provenRange({
            requestCursor: query.cursorNo,
            limit: remote.limit ?? query.limit ?? SERVER_DEFAULT_FEED_LIMIT,
            responseCursor: remote.cursorNo,
            cursorIsRow: options.cursorIsRow,
            page: domainList,
        });
        const missing =
            options.markMissingHidden && proven
                ? await this.cachedRowsMissingFrom(query.channelId, proven, domainList, requestContext)
                : [];
        await this.chatLocalDataSource.cacheWriteMany([...domainList, ...missing], requestContext);
        void this.syncRevisedTargets(domainList, requestContext);
        if (proven) {
            const { cid, uid } = this.getNormalizedContext(requestContext);
            feedCoverage.add(feedCoverageKey(cid, uid, query.channelId), proven.low, proven.high);
        }

        return {
            fetchedCount: domainList.length,
            latestNo: domainList.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0),
            cursorNo: remote.cursorNo,
            readNo: remote.readNo,
            total: remote.total ?? domainList.length,
        };
    }

    private async syncRevisedTargets(page: DomainChat[], context: DataContext): Promise<void> {
        try {
            const { cid, uid } = this.getNormalizedContext(context);
            const keyOf = (noticeId: string) => `${cid}:${uid}:${noticeId}`;
            const open = page.filter(
                row => row.subType === 'edit' && !!row.id && !this.settledNotices.has(keyOf(row.id))
            );
            if (open.length === 0) return;
            const inPage = new Set(page.map(row => row.id));
            const settle = (targetIds: Set<string>) => {
                for (const notice of open) {
                    if (targetIds.has(notice.edit$?.chatId ?? '')) this.settledNotices.add(keyOf(notice.id));
                }
            };
            const ids = revisedIdsOf(open);
            settle(new Set(ids.filter(id => inPage.has(id))));
            const toCheck = ids.filter(id => !inPage.has(id));
            if (toCheck.length === 0) return;

            const cached = await Promise.all(toCheck.map(id => this.chatLocalDataSource.cacheRead(id, context)));
            settle(new Set(toCheck.filter((_, index) => !cached[index])));
            const targets = toCheck.filter((_, index) => !!cached[index]);
            if (targets.length === 0) return;

            const normalizedContext = this.getNormalizedContext(context);
            const { changed, failed } = await readRevisedTargets(targets, id =>
                this.chatSocketDataSource.getChat({ id }, normalizedContext)
            );
            const stillCached = await Promise.all(
                changed.map(row => this.chatLocalDataSource.cacheRead(row.id, context))
            );
            const writable = changed.filter((_, index) => !!stillCached[index]);
            if (writable.length) await this.chatLocalDataSource.cacheWriteMany(writable, context);
            settle(new Set(changed.map(row => row.id)));
            settle(new Set(failed.filter(({ error }) => isGoneFailure(error)).map(({ id }) => id)));
            if (failed.length) {
                logger.warn('CHAT', '[ChatRepository] could not re-read revised messages', {
                    failed: failed.length,
                    read: changed.length,
                });
            }
        } catch (error) {
            logger.warn('CHAT', '[ChatRepository] could not bring revised messages up to date', {
                error: (error as Error)?.name,
            });
        }
    }

    public observeFeedCoverage(channelId: string, callback: (covered: readonly FeedRange[]) => void): () => void {
        const { cid, uid } = this.getNormalizedContext();
        const key = feedCoverageKey(cid, uid, channelId);
        const unsubscribe = feedCoverage.subscribe(key, callback);
        callback(feedCoverage.covered(key));
        return unsubscribe;
    }

    private async cachedRowsMissingFrom(
        channelId: string,
        range: { low: number; high: number; tombstoneLow: number },
        page: DomainChat[],
        context: DataContext
    ): Promise<DomainChat[]> {
        if (range.tombstoneLow > range.high) return [];
        const cached = await this.chatLocalDataSource.cacheReadList(
            { channelId, cursorNo: range.high + 1, limit: range.high - range.tombstoneLow + 1 },
            context
        );
        const sent = new Set(page.map(chat => chat.chatNo));
        return (cached?.list ?? [])
            .filter(
                chat =>
                    !!chat.chatNo &&
                    chat.chatNo >= range.tombstoneLow &&
                    chat.chatNo <= range.high &&
                    !sent.has(chat.chatNo) &&
                    !chat.hidden &&
                    !chat.isPending
            )
            .map(chat => ({ ...chat, hidden: true, hiddenByFeed: true }));
    }

    public async getChat(payload: ChatGetInput): Promise<DomainChat> {
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);
        const domainChat = await this.chatSocketDataSource.getChat(payload, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);

        return domainChat;
    }

    public async sendChat(payload: ChatSendPayload): Promise<DomainChat> {
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

    public startUploads(payload: UploadStartInput): Promise<PresignedUploadStartResult> {
        return this.uploadSocketDataSource.start(payload);
    }

    public completeUploads(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult> {
        return this.uploadSocketDataSource.complete(payload);
    }

    public async createPendingImageChat(input: PendingImageChatInput): Promise<string> {
        this.assertRequiredString(input.channelId, 'channelId');
        const detailsOf = (file: PendingFileDetails | null | undefined) =>
            file ? { localName: file.name, localContentType: file.contentType, localSize: file.size } : {};
        const slotsWith = (details: (object | undefined)[]) =>
            input.localThumbUrls.map((localThumbUrl, index) => ({
                localStatus: 'sending' as const,
                localThumbUrl,
                ...details[index],
            }));

        if (input.pendingId) {
            const requestContext = this.pendingImageScope(input.pendingId);
            const existing = await this.chatLocalDataSource.cacheRead(input.pendingId, requestContext);
            if (!existing) {
                throw new Error(`[ChatRepository] pending image chat ${input.pendingId} is gone`);
            }
            const kept = (existing.upload$$ ?? []).map(slot => {
                if (!isPendingUploadSlot(slot) || !slot.localContentType) return {};
                const { localName, localContentType, localSize } = slot;
                return { localName, localContentType, localSize };
            });
            const slots = slotsWith(input.localFiles ? input.localFiles.map(detailsOf) : kept);
            await this.chatLocalDataSource.cacheWrite(
                {
                    id: input.pendingId,
                    isPending: true,
                    isFailed: false,
                    upload$$: slots,
                    ...(input.content !== undefined ? { content: input.content.trim() } : {}),
                    ...(input.mention !== undefined ? { mention$: toMentionRecord(input.mention) } : {}),
                    updatedAtMs: Date.now(),
                },
                requestContext
            );
            return input.pendingId;
        }

        const slots = slotsWith((input.localFiles ?? []).map(detailsOf));
        const requestContext = this.getRequestContext();
        const id = `optimistic-chat-images-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.pendingImageScopes.set(id, requestContext);
        const row = this.createOptimisticChat(
            {
                channelId: input.channelId,
                content: input.content?.trim() ?? '',
                ...(input.parentId ? { parentId: input.parentId } : {}),
                ...(input.mention ? { mention: input.mention } : {}),
            },
            id,
            this.getNormalizedContext(requestContext)
        );
        await this.chatLocalDataSource.cacheWrite({ ...row, upload$$: slots }, requestContext);
        return id;
    }

    public async sendPendingImageChat(pendingId: string, input: { uploadIds: string[] }): Promise<DomainChat> {
        const requestContext = this.pendingImageScope(pendingId);
        const normalizedContext = this.getNormalizedContext(requestContext);
        if (this.getNormalizedContext().cid !== normalizedContext.cid) {
            throw new Error(`[ChatRepository] pending image chat ${pendingId} belongs to another cloud`);
        }
        const pending = await this.chatLocalDataSource.cacheRead(pendingId, requestContext);
        if (!pending) throw new Error(`[ChatRepository] pending image chat ${pendingId} is gone`);

        const mention = toMentionBody(pending.mention$);
        const payload: ChatSendPayload = {
            channelId: pending.channelId,
            content: pending.content ?? '',
            uploadIds: input.uploadIds,
            ...(pending.parentId ? { parentId: pending.parentId } : {}),
            ...(mention ? { mention } : {}),
        };
        const remote = await this.chatSocketDataSource.sendChat(payload, normalizedContext);
        const sent = await this.replaceOptimisticChat(pendingId, remote, requestContext);
        this.pendingImageScopes.delete(pendingId);
        return this.readBackImageChat(sent, requestContext);
    }

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
            channelId: channelIdOfChatId(chatId),
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

    public async deleteChat(payload: ChatDeleteInput): Promise<DomainChat> {
        this.assertRequiredString((payload as { id?: string }).id, 'id');
        const requestContext = this.getRequestContext();
        const normalizedContext = this.getNormalizedContext(requestContext);

        const domainChat = await this.chatSocketDataSource.deleteChat(payload, normalizedContext);
        await this.chatLocalDataSource.cacheWrite(domainChat, requestContext);
        return domainChat;
    }

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

    private createOptimisticChat(payload: ChatSendPayload, id: string, normalizedContext: DataContext): DomainChat {
        const now = Date.now();
        const mention$ = toMentionRecord(payload.mention);
        return {
            id,
            tempId: id,
            cid: normalizedContext.cid ?? 'default',
            channelId: payload.channelId || '',
            chatNo: 0,
            content: payload.content,
            contentType: payload.contentType ?? 'text',
            parentId: payload.parentId,
            ...(mention$ ? { mention$ } : {}),
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
