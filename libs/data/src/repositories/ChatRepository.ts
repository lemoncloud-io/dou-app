import type { ChatFeedInput } from '@lemoncloud/chatic-sockets-api';
import type { ChatQueryOptions } from '@chatic/app-messages';
import { logger } from '@chatic/bridges';
import type { ChatMentionBody, ChatSendPayload, DomainChat, DomainLastChat, DomainListResult } from '../domain';
import { channelIdOfChatId, toMentionBody, toMentionRecord } from '../domain';
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
import { BaseRepository, type DisposableRepository } from './types';

export interface ChatRefreshResult {
    fetchedCount: number;
    /**
     * The highest `chatNo` in the page written, or 0 for an empty page. A caller waiting for the
     * page to reach a list can wait for this row rather than for any emission.
     */
    latestNo: number;
    cursorNo?: number;
    readNo?: number;
    total: number;
}

export interface ChatRefreshOptions {
    /**
     * Called once the server page has arrived, before it is written to the cache. A caller timing the
     * refresh can then tell the server round trip from the local write, which awaiting the whole call
     * cannot. It must not throw: it runs between the fetch and the write, so a throw would drop the
     * page it was told about.
     */
    onFetched?: () => void;
    /**
     * Marks a cached row the page left out as deleted (`hidden`). The server leaves out only
     * soft-deleted rows, so within the range a page answers for, a row this device still holds but
     * the server did not send was deleted while the device was not listening — a delete that live
     * sync never replays. Only for callers that refetch history they already hold (a gap fill, a
     * re-check of old rows, a thread root's page); the entry refresh leaves it off. The mark is
     * recorded as inferred (`hiddenByFeed`), and the cache undoes it when a server copy of the row
     * comes back without saying it is hidden — a delete the server announced is never undone.
     */
    markMissingHidden?: boolean;
    /**
     * The request cursor is a row the server numbered (a cached chat), so the channel's head is at
     * or above it. Lets a page that ran down to the start of history answer for everything below the
     * cursor even when its newest numbers were all deleted; without it the range stops at the newest
     * row the page carried.
     */
    cursorIsRow?: boolean;
}

/**
 * Feed query plus the desktop opt-in `includeUnsent`: `chat_no: 0` rows (sending / failed) sort
 * lowest in the pagination index, so a newest-N page drops them unless the reader asks for them.
 * Read by the local source and the query executor; the socket request never carries it.
 */
export type ChatObserveQuery = ChatFeedInput & Pick<ChatQueryOptions, 'includeUnsent'>;

export interface IChatRepository extends DisposableRepository {
    observeList(query: ChatObserveQuery, callback: (result: DomainListResult<DomainChat> | null) => void): () => void;
    observeLastList(channelIds: string[], callback: (result: DomainLastChat[]) => void): () => void;

    refreshList(query: ChatFeedInput, options?: ChatRefreshOptions): Promise<ChatRefreshResult>;
    /**
     * The parts of `[low, high]` no feed page has answered for in this run (see `FeedCoverage`). A
     * missing chat number outside them is a deleted message; inside them, history not fetched yet.
     */
    uncoveredFeed(channelId: string, low: number, high: number): FeedRange[];
    getChat(payload: ChatGetInput): Promise<DomainChat>;
    sendChat(payload: ChatSendPayload): Promise<DomainChat>;
    updateChat(payload: ChatUpdateInput): Promise<DomainChat>;
    deleteChat(payload: ChatDeleteInput): Promise<DomainChat>;
    setReaction(payload: ChatReactionInput): Promise<DomainChat>;

    /** Declares image slots for an attachment message; one ticket per slot, same order. */
    startUploads(payload: UploadStartInput): Promise<PresignedUploadStartResult>;
    /** Settles the slots — failed transfers included — and returns each upload's final status. */
    completeUploads(payload: UploadCompleteInput): Promise<CheckedUploadCompleteResult>;
    /**
     * Writes the optimistic row of an image message before any byte moves, one `sending` slot per
     * image, and the message's text when it has one. With `pendingId` it re-arms that same row for a
     * retry instead of adding another.
     */
    createPendingImageChat(input: PendingImageChatInput): Promise<string>;
    /** Sends the pending row's text with its stored uploads and swaps in the server's row. Throws on failure. */
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

export interface PendingFileDetails {
    name: string;
    contentType: string;
    size: number;
}

export interface PendingImageChatInput {
    channelId: string;
    parentId?: string;
    /** One preview per picked file, in picking order. */
    localThumbUrls: string[];
    /**
     * Per slot, a video or document's name, type and size (`null` for an image). Left out on a
     * rewrite of the same row, which keeps what the row already holds.
     */
    localFiles?: (PendingFileDetails | null)[];
    /**
     * Text sent in the same message as the files (a caption), trimmed. Absent or blank is a message
     * of files alone. Left out on a rewrite of the same row, which keeps the text the row holds.
     */
    content?: string;
    /**
     * Who the text calls out, as the composer picked it. Left out on a rewrite of the same row, which
     * keeps the mention the row holds — like the text, it belongs to the message the user sent.
     */
    mention?: ChatMentionBody;
    /** Re-arm this row (a retry) rather than create one. */
    pendingId?: string;
}

/**
 * How many rows a pending-row read looks at. A channel holds at most a handful of unsent image
 * messages; this only has to be comfortably more than that.
 */
const PENDING_IMAGE_SCAN_LIMIT = 50;

/** The page size the server applies when a request names none. */
const SERVER_DEFAULT_FEED_LIMIT = 20;

/**
 * The chat numbers a feed page answered for. The server counts a page down from the request cursor —
 * or from the channel's head, whichever is lower — `limit` numbers at a time, looks each one up, and
 * leaves out the soft-deleted ones. It returns the lowest number it counted as the next cursor, or 0
 * when the count ran down to the start of what this member may see. So:
 *
 * - With a returned cursor, the range is exactly `[cursor, cursor + limit − 1]`. The top is read from
 *   the answer, never from the request: a request cursor above the head (a block re-check near the
 *   newest messages) counts only up to the head, and claiming more would mark a message that arrived
 *   meanwhile as deleted.
 * - With 0, the range runs from the start of history up to the newest row the page carried — or up to
 *   the request cursor when the caller knows it is a numbered row (`cursorIsRow`), which puts the head
 *   at or above it. An empty page then proves nothing.
 * - `tombstoneLow` is where a row missing from the page may be read as deleted. At the start of
 *   history it stops at the oldest row the page carried: below that sit rows from before my join,
 *   which the server also leaves out and which are hidden by the join window, not deleted.
 */
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

    // A clear takes what pages answered for with it (`FeedCoverage.forget`), before the rows go.
    public cacheClear(): Promise<void> {
        const { cid, uid } = this.getNormalizedContext();
        const scope = feedCoverageScope(cid, uid);
        feedCoverage.forget(key => key.startsWith(scope));
        return this.chatLocalDataSource.cacheClear(this.getRepositoryContext());
    }

    public cacheClearByChannelId(channelId: string): Promise<void> {
        forgetChannelCoverage(channelId, this.getNormalizedContext());
        return this.chatLocalDataSource.cacheClearByChannelId(channelId, this.getRepositoryContext());
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
        // Recorded after the write, so a reader that sees the range answered for also sees its rows.
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

    public uncoveredFeed(channelId: string, low: number, high: number): FeedRange[] {
        const { cid, uid } = this.getNormalizedContext();
        return feedCoverage.uncovered(feedCoverageKey(cid, uid, channelId), low, high);
    }

    /**
     * Cached rows inside `range` that a page answering for it did not carry, returned marked deleted.
     * Rows still being sent are left alone: they have no chat number the server could answer for.
     */
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

    /**
     * Uploads live on the chat facade because they exist only to become a message's attachments —
     * a separate repository would own no state of its own. Nothing is cached: a ticket holds signed
     * URLs, which must not be stored, and the message row is what the screen renders.
     */
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
            // A merge into a row that was deleted would recreate it with no channel: refuse instead.
            if (!existing) {
                throw new Error(`[ChatRepository] pending image chat ${input.pendingId} is gone`);
            }
            // A retry or a switch to thumbnails passes previews only; the files, and their details, are
            // the same ones.
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
                    // The write merges, so a rewrite that names no text keeps the row's own.
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
        // Random suffix: two sends in one millisecond (a double tap) must not share a row.
        const id = `optimistic-chat-images-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.pendingImageScopes.set(id, requestContext);
        const row = this.createOptimisticChat(
            {
                channelId: input.channelId,
                // On the row from the start, so the pending message shows its text while the files go up.
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
        // The send goes out on this graph's socket. On the app graph that follows the selection, so
        // once the selection has left the row's cloud the uploads belong to another cloud: fail
        // rather than post them there. A graph bound to one cloud always sends on that cloud's own
        // socket, so on it the two always agree and the row's cloud is where the send goes.
        if (this.getNormalizedContext().cid !== normalizedContext.cid) {
            throw new Error(`[ChatRepository] pending image chat ${pendingId} belongs to another cloud`);
        }
        const pending = await this.chatLocalDataSource.cacheRead(pendingId, requestContext);
        if (!pending) throw new Error(`[ChatRepository] pending image chat ${pendingId} is gone`);

        // The row's own mention, for the same reason as its text: a retry sends what was written.
        const mention = toMentionBody(pending.mention$);
        const payload: ChatSendPayload = {
            channelId: pending.channelId,
            // The row's own text, not the caller's: a retry sends the text it was written with.
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
    private createOptimisticChat(payload: ChatSendPayload, id: string, normalizedContext: DataContext): DomainChat {
        const now = Date.now();
        // The row is the only copy of a send that fails, and a resend is rebuilt from it — so it keeps
        // the mention the send carried, in the stored record's shape.
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
