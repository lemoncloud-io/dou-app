export interface PendingPushEntry {
    messageId?: string;
    elapsedMs: number;
}

export interface IPushEntryRegistry {
    begin(channelId: string, messageId?: string): void;
    consume(channelId: string): PendingPushEntry | undefined;
    reset(): void;
}

class PushEntryRegistry implements IPushEntryRegistry {
    private static readonly TTL_MS = 30_000;

    private pending: { channelId: string; messageId?: string; at: number } | null = null;

    begin(channelId: string, messageId?: string): void {
        if (!channelId) return;
        this.pending = { channelId, messageId, at: Date.now() };
    }

    consume(channelId: string): PendingPushEntry | undefined {
        const pending = this.pending;
        if (!pending || pending.channelId !== channelId) return undefined;

        this.pending = null;
        const elapsedMs = Date.now() - pending.at;
        if (elapsedMs > PushEntryRegistry.TTL_MS) return undefined;
        return { messageId: pending.messageId, elapsedMs };
    }

    reset(): void {
        this.pending = null;
    }
}

export const pushEntryRegistry: IPushEntryRegistry = new PushEntryRegistry();
