import {
    adoptPerfTrace,
    clearActivePerfTrace,
    getActivePerfTrace,
    setActivePerfTrace,
    startPerfTrace,
} from '@chatic/perf';

import type { HandedOverPerfTrace } from '@chatic/bridge-messages';
import type { PerfTrace } from '@chatic/perf';

export type RoomOpenEntry = 'list' | 'push_banner' | HandedOverPerfTrace['entry'] | 'navigate';

export const channelIdOfRoomPath = (target: string): string | null => {
    const raw = /^\/channels\/([^/?#]+)\/room\/?(?:[?#]|$)/.exec(target)?.[1];
    if (!raw) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
};

class RoomOpenTraceSlot {
    public static readonly CLAIM_TTL_MS = 60_000;

    public static readonly RELEASE_GRACE_MS = 1_000;

    private pending: {
        channelId: string;
        trace: PerfTrace;
        sync?: PerfTrace;
        at: number;
        releaseTimer?: ReturnType<typeof setTimeout>;
    } | null = null;

    private claimedSync: { channelId: string; trace: PerfTrace } | null = null;

    public begin(channelId: string, entry: RoomOpenEntry, handedOver?: HandedOverPerfTrace): PerfTrace {
        this.closeReleased();
        const trace = handedOver
            ? adoptPerfTrace('chat_room_open', handedOver.id, handedOver.startedAt)
            : startPerfTrace('chat_room_open');
        const sync = handedOver?.syncId
            ? adoptPerfTrace('chat_room_sync', handedOver.syncId, handedOver.startedAt)
            : startPerfTrace('chat_room_sync');
        for (const each of [trace, sync]) {
            each.putAttribute('entry', entry);
            if (handedOver) each.putAttribute('start', handedOver.coldStart ? 'cold' : 'warm');
        }
        setActivePerfTrace('chat_room_sync', channelId, sync);
        this.pending = { channelId, trace, sync, at: Date.now() };
        return trace;
    }

    public mark(channelId: string | null, key: string): void {
        if (!channelId) return;
        this.peek(channelId)?.mark(key);
        getActivePerfTrace('chat_room_sync', channelId)?.mark(key);
    }

    public putAttribute(channelId: string | null, key: string, value: string): void {
        if (!channelId) return;
        this.peek(channelId)?.putAttribute(key, value);
        getActivePerfTrace('chat_room_sync', channelId)?.putAttribute(key, value);
    }

    public peek(channelId: string | null): PerfTrace | undefined {
        if (!channelId || !this.isFreshFor(channelId)) return undefined;
        return this.pending?.trace;
    }

    public claim(channelId: string): PerfTrace | undefined {
        if (!this.isFreshFor(channelId)) return undefined;
        const trace = this.pending?.trace;
        const sync = this.pending?.sync;
        if (sync) this.claimedSync = { channelId, trace: sync };
        this.clearPending();
        return trace;
    }

    public takeClaimedSync(channelId: string): PerfTrace | undefined {
        const claimed = this.claimedSync;
        if (!claimed || claimed.channelId !== channelId) return undefined;
        this.claimedSync = null;
        return claimed.trace;
    }

    public release(channelId: string, trace: PerfTrace): void {
        const pending = this.pending;
        if (pending && pending.trace !== trace && !pending.releaseTimer) {
            closeAsLeft(trace);
            return;
        }
        this.closeReleased();
        const releaseTimer = setTimeout(() => {
            if (this.pending?.trace === trace) this.closeReleased();
        }, RoomOpenTraceSlot.RELEASE_GRACE_MS);
        this.pending = { channelId, trace, at: Date.now(), releaseTimer };
    }

    public handleHidden(): void {
        const pending = this.pending;
        if (pending && !pending.releaseTimer) {
            const sync = getActivePerfTrace('chat_room_sync', pending.channelId);
            if (sync) clearActivePerfTrace('chat_room_sync', sync);
        }
        this.closeReleased();
    }

    public reset(): void {
        this.clearPending();
        this.claimedSync = null;
        clearActivePerfTrace('chat_room_sync');
    }

    private isFreshFor(channelId: string): boolean {
        const pending = this.pending;
        if (!pending || pending.channelId !== channelId) return false;
        return Date.now() - pending.at <= RoomOpenTraceSlot.CLAIM_TTL_MS;
    }

    private closeReleased(): void {
        const pending = this.pending;
        if (!pending?.releaseTimer) {
            this.clearPending();
            return;
        }
        this.clearPending();
        closeAsLeft(pending.trace);
    }

    private clearPending(): void {
        if (this.pending?.releaseTimer) clearTimeout(this.pending.releaseTimer);
        this.pending = null;
    }
}

const closeAsLeft = (trace: PerfTrace): void => {
    trace.putAttribute('outcome', 'left');
    trace.stop();
};

export const ROOM_OPEN_CLAIM_TTL_MS = RoomOpenTraceSlot.CLAIM_TTL_MS;
export const ROOM_OPEN_RELEASE_GRACE_MS = RoomOpenTraceSlot.RELEASE_GRACE_MS;

export const roomOpenTrace = new RoomOpenTraceSlot();

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') roomOpenTrace.handleHidden();
    });
}
