import type {
    DomainSyncPlan,
    DomainSyncContext,
    SyncTargetDescriptor,
    SocketMessage,
} from '@lemoncloud/chatic-sockets-lib';

// ---------------------------------------------------------------------------
// Sync Target
// ---------------------------------------------------------------------------

export interface ChatSyncTarget extends SyncTargetDescriptor {
    type: 'chat';
    id: string; // channelId
    meta?: { serverChatNo?: number; [key: string]: unknown };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export interface ChatSyncSnapshot {
    channelId: string;
    localMaxChatNo: number;
    serverChatNo: number;
    lastSyncedAt: number;
    isSynced: boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ChatSyncPlanOptions {
    intervalMs?: number;
    onSyncComplete?: (channelId: string, newMessages: number) => void;
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export class ChatSyncPlan implements DomainSyncPlan<ChatSyncTarget> {
    readonly domain = 'chat';

    constructor(private options?: ChatSyncPlanOptions) {}

    supports = (target: SyncTargetDescriptor): target is ChatSyncTarget => target?.type === 'chat' && !!target.id;

    getKey = (target: ChatSyncTarget): string => `chat:${target.id}`;

    getIntervalMs = (target: ChatSyncTarget): number => target.intervalMs ?? this.options?.intervalMs ?? 60_000;

    // Connection/reconnect → reset snapshot → force resync
    onConnected(target: ChatSyncTarget, ctx: DomainSyncContext): void {
        ctx.writeSnapshot(target, undefined);
    }

    // Core sync logic: detect chatNo gap → page-based fetch
    async run(target: ChatSyncTarget, ctx: DomainSyncContext): Promise<void> {
        const prev = ctx.readSnapshot<ChatSyncSnapshot>(target);
        const channelId = target.id;
        const serverChatNo = target.meta?.serverChatNo ?? 0;

        if (serverChatNo === 0) return;

        let localMax = prev?.localMaxChatNo ?? 0;
        if (localMax >= serverChatNo) {
            ctx.writeSnapshot(target, {
                ...prev,
                isSynced: true,
                lastSyncedAt: ctx.now(),
            } as ChatSyncSnapshot);
            return;
        }

        // Gap detected → fetch by tier
        const gap = serverChatNo - localMax;
        let totalFetched = 0;

        if (gap <= 100) {
            // Tier 1: full sync (1-2 pages)
            totalFetched = await this.fullSync(channelId, localMax, serverChatNo, ctx);
            localMax = Math.max(localMax, localMax + totalFetched);
        } else if (gap <= 500) {
            // Tier 2: latest 200 first, rest handled by interval
            const result = await this.partialSync(channelId, serverChatNo, 200, ctx);
            totalFetched = result.fetched;
            localMax = Math.max(localMax, result.maxChatNo);
        } else {
            // Tier 3: latest 100 only, rest via loadMore on channel entry
            const result = await this.partialSync(channelId, serverChatNo, 100, ctx);
            totalFetched = result.fetched;
            localMax = Math.max(localMax, result.maxChatNo);
        }

        const next: ChatSyncSnapshot = {
            channelId,
            localMaxChatNo: localMax,
            serverChatNo,
            lastSyncedAt: ctx.now(),
            isSynced: localMax >= serverChatNo,
        };
        ctx.writeSnapshot(target, next);
        this.options?.onSyncComplete?.(channelId, totalFetched);
    }

    // Server sends chat.sync → immediate re-sync
    async onTrigger(target: ChatSyncTarget, message: SocketMessage<any>, ctx: DomainSyncContext): Promise<void> {
        const data = message?.data ?? {};
        if (target.id && data?.channelId && target.id !== data.channelId) return;

        // Update serverChatNo if provided
        if (typeof data?.chatNo === 'number') {
            target.meta = { ...target.meta, serverChatNo: data.chatNo };
        }
        await this.run(target, ctx);
    }

    updateLocalState(target: ChatSyncTarget, snapshot: unknown, ctx: DomainSyncContext): void {
        const prev = ctx.readSnapshot<ChatSyncSnapshot>(target);
        const patch = (snapshot ?? {}) as Partial<ChatSyncSnapshot>;
        ctx.writeSnapshot(target, {
            ...prev,
            ...patch,
            localMaxChatNo: patch.localMaxChatNo ?? prev?.localMaxChatNo ?? 0,
            serverChatNo: patch.serverChatNo ?? prev?.serverChatNo ?? 0,
        } as ChatSyncSnapshot);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private async fullSync(
        channelId: string,
        localMaxChatNo: number,
        serverChatNo: number,
        ctx: DomainSyncContext
    ): Promise<number> {
        let cursorNo: number | undefined = undefined;
        let totalFetched = 0;
        let localMax = localMaxChatNo;

        while (localMax < serverChatNo) {
            const result: any = await ctx.client.request(
                'chat.feed' as any,
                {
                    channelId,
                    limit: 100,
                    ...(cursorNo !== undefined ? { cursorNo } : {}),
                } as any
            );

            const list: Array<{ chatNo?: number }> = result?.list ?? [];
            if (list.length === 0) break;

            totalFetched += list.length;
            const maxInBatch = Math.max(...list.map(m => m.chatNo ?? 0));
            localMax = Math.max(localMax, maxInBatch);

            cursorNo = (result as any)?.cursorNo;
            if (cursorNo === 0 || cursorNo === undefined) break;
        }

        return totalFetched;
    }

    private async partialSync(
        channelId: string,
        serverChatNo: number,
        maxCount: number,
        ctx: DomainSyncContext
    ): Promise<{ fetched: number; maxChatNo: number }> {
        let totalFetched = 0;
        let maxChatNo = 0;
        let cursorNo: number | undefined = undefined;

        while (totalFetched < maxCount) {
            const limit = Math.min(100, maxCount - totalFetched);
            const result: any = await ctx.client.request(
                'chat.feed' as any,
                {
                    channelId,
                    limit,
                    ...(cursorNo !== undefined ? { cursorNo } : {}),
                } as any
            );

            const list: Array<{ chatNo?: number }> = result?.list ?? [];
            if (list.length === 0) break;

            totalFetched += list.length;
            const maxInBatch = Math.max(...list.map(m => m.chatNo ?? 0));
            maxChatNo = Math.max(maxChatNo, maxInBatch);

            cursorNo = (result as any)?.cursorNo;
            if (cursorNo === 0 || cursorNo === undefined) break;
        }

        return { fetched: totalFetched, maxChatNo };
    }
}
