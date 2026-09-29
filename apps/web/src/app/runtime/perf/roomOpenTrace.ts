import {
    adoptPerfTrace,
    clearActivePerfTrace,
    getActivePerfTrace,
    setActivePerfTrace,
    startPerfTrace,
} from '@chatic/perf';

import type { HandedOverPerfTrace } from '@chatic/app-messages';
import type { PerfTrace } from '@chatic/perf';

/**
 * How a room was opened — the `entry` attribute of `chat_room_open`.
 *
 * - `list`        — a row in the home chat list
 * - `push_banner` — the in-app banner shown for a foreground push
 * - `push_tap`    — an OS notification tap, reported by the notification library as one
 * - `deeplink`    — an OS link; on Android this includes a tap on a notification the app drew
 *                   itself, which reaches the app as a plain URL
 * - `navigate`    — an `OnNavigate` from an app build that does not say what caused it
 */
export type RoomOpenEntry = 'list' | 'push_banner' | HandedOverPerfTrace['entry'] | 'navigate';

/**
 * The channel id of a room route (`/channels/<id>/room`), or `null` for any other path.
 *
 * Read the way the router reads it, because the id is compared against the room page's own route
 * param: a trailing slash still matches (React Native's URL polyfill appends one to a deep link's
 * path, and the router ignores it), and the id is percent-decoded, as route params are.
 */
export const channelIdOfRoomPath = (target: string): string | null => {
    const raw = /^\/channels\/([^/?#]+)\/room\/?(?:[?#]|$)/.exec(target)?.[1];
    if (!raw) return null;
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
};

/**
 * Carries a room-open trace from the tap that began it to the room page that ends it.
 *
 * The same single-slot hand-off as `pushEntryRegistry`, for the same reason: threading a trace
 * through navigation state would put a measurement field into the router contract every screen
 * shares. One slot is enough — a user opens one room at a time, and a second tap before the first
 * room mounted replaces the first trace, which is then never stopped and so never recorded.
 *
 * Unlike that registry this covers every entry, not only pushes: "the room is slow to open" was
 * reported for ordinary list taps too, and the comparison between entries is the point.
 */
class RoomOpenTraceSlot {
    /**
     * A trace whose room has not mounted by now belongs to a navigation that went somewhere else.
     * Longer than the push path's handshake wait plus a switch, so a slow switch is still measured.
     */
    public static readonly CLAIM_TTL_MS = 60_000;

    /**
     * How long an unmounted room's trace waits to be claimed again before it is closed as `left`.
     * Covers a remount of the same room — React's development double-mount, or a route that
     * re-renders its element — without recording it as the user leaving.
     */
    public static readonly RELEASE_GRACE_MS = 1_000;

    private pending: {
        channelId: string;
        trace: PerfTrace;
        /** The `chat_room_sync` trace begun with it; absent once the entry is a released one. */
        sync?: PerfTrace;
        at: number;
        releaseTimer?: ReturnType<typeof setTimeout>;
    } | null = null;

    /** The sync trace of the room claimed last, until its page takes it. */
    private claimedSync: { channelId: string; trace: PerfTrace } | null = null;

    /**
     * Starts the traces for a room about to be opened — or, when the native shell already started
     * them at a notification tap, takes those over so they keep their native start.
     *
     * Two traces, begun together: `chat_room_open` ends when the room first shows messages, which
     * may be the cache's; `chat_room_sync` ends when it shows the synced, latest ones. The second is
     * not carried through this slot but published as the active `chat_room_sync`, because the sync
     * hooks that mark its phases live in `libs/app-runtime` and cannot reach this module.
     */
    public begin(channelId: string, entry: RoomOpenEntry, handedOver?: HandedOverPerfTrace): PerfTrace {
        // A room left moments ago is still in its grace window; that user did leave, so close it as
        // such instead of letting the new trace overwrite it unrecorded.
        this.closeReleased();
        const trace = handedOver
            ? adoptPerfTrace('chat_room_open', handedOver.id, handedOver.startedAt)
            : startPerfTrace('chat_room_open');
        // An app build that predates the sync trace hands over only the first; the web then starts
        // the second here, a little later than the tap.
        const sync = handedOver?.syncId
            ? adoptPerfTrace('chat_room_sync', handedOver.syncId, handedOver.startedAt)
            : startPerfTrace('chat_room_sync');
        // Both traces sit at Firebase's cap of five attributes once a switched push adds `switch`
        // and the room writes `cache` and `outcome` (last). A sixth would silently displace
        // `outcome`, so adding one means removing one.
        for (const each of [trace, sync]) {
            each.putAttribute('entry', entry);
            if (handedOver) each.putAttribute('start', handedOver.coldStart ? 'cold' : 'warm');
        }
        setActivePerfTrace('chat_room_sync', channelId, sync);
        this.pending = { channelId, trace, sync, at: Date.now() };
        return trace;
    }

    /** Marks a phase on both of a pending room's traces. A no-op for a room nothing began. */
    public mark(channelId: string | null, key: string): void {
        if (!channelId) return;
        this.peek(channelId)?.mark(key);
        getActivePerfTrace('chat_room_sync', channelId)?.mark(key);
    }

    /** Sets an attribute on both of a pending room's traces. */
    public putAttribute(channelId: string | null, key: string, value: string): void {
        if (!channelId) return;
        this.peek(channelId)?.putAttribute(key, value);
        getActivePerfTrace('chat_room_sync', channelId)?.putAttribute(key, value);
    }

    /** The pending trace for `channelId`, left in place — for marks made on the way to the room. */
    public peek(channelId: string | null): PerfTrace | undefined {
        if (!channelId || !this.isFreshFor(channelId)) return undefined;
        return this.pending?.trace;
    }

    /** Takes the pending trace for `channelId`, if it is still fresh. The room page calls this. */
    public claim(channelId: string): PerfTrace | undefined {
        if (!this.isFreshFor(channelId)) return undefined;
        const trace = this.pending?.trace;
        const sync = this.pending?.sync;
        if (sync) this.claimedSync = { channelId, trace: sync };
        this.clearPending();
        return trace;
    }

    /**
     * Takes the sync trace begun with the open trace this room just claimed. The room page calls
     * this after `claim`, in the same mount.
     *
     * Tying the two together is what keeps a stale sync trace out: one begun for a room that was
     * already on screen (a push for the open room), or for a navigation that never arrived, is
     * never claimed, so a later, unrelated mount of that room cannot pick it up and record a
     * duration that started at an old tap.
     */
    public takeClaimedSync(channelId: string): PerfTrace | undefined {
        const claimed = this.claimedSync;
        if (!claimed || claimed.channelId !== channelId) return undefined;
        this.claimedSync = null;
        return claimed.trace;
    }

    /**
     * Hands a claimed, unfinished trace back when its room unmounts. Reclaimed within the grace
     * window, it carries on; otherwise it is closed as `left`, so a `left` duration runs up to the
     * grace window past the moment the user gave up. Nothing is marked at release itself: a mark is
     * first-write-wins, and a remount that reclaims the trace would carry a leave that never
     * happened.
     *
     * When another room's trace is already waiting — the user tapped a banner or a push while this
     * room was still loading, and the new trace began before this page unmounted — this one is
     * closed as `left` at once rather than parked, so the newer trace keeps the slot.
     */
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

    /**
     * The app left the foreground. Timers stop in the background, so a trace still waiting here
     * would come back measuring the time away: an unclaimed one is dropped unrecorded, and a
     * released one is closed as `left`, which it already was.
     */
    public handleHidden(): void {
        // A room that has not mounted yet has nothing to end its sync trace either; drop that too.
        // A mounted room's sync trace is its page's to close.
        const pending = this.pending;
        if (pending && !pending.releaseTimer) {
            const sync = getActivePerfTrace('chat_room_sync', pending.channelId);
            if (sync) clearActivePerfTrace('chat_room_sync', sync);
        }
        this.closeReleased();
    }

    /** Drops the pending trace without recording it. Tests only. */
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
