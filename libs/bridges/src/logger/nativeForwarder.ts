import type { WebMessageData } from '@chatic/app-messages';
import type { LogEntry, LogListener } from '@chatic/logger';

import { NativeBridgeAdapter } from '../web/adapters';
import { toAppLogInfo } from './appLogInfoCodec';

/**
 * Creates a hub listener that forwards `info` and above to the native app via
 * the `SendLog` bridge message — `debug` is deliberately not relayed (see the
 * gate below). The original occurrence `timestamp` and
 * `source: 'web'` ride along so the native merged buffer keeps the web
 * entry's identity instead of restamping/retagging it (ADR-0047). Older app
 * builds simply ignore the extra fields.
 *
 * The entry `id` and its occurrence-time context travel too. In a hybrid run a
 * web entry is queued for upload AND relayed here, and the uploader later
 * drains this same native buffer — without a shared id the server would store
 * that one log as two documents. With it, the second copy upserts onto the
 * first.
 */
/**
 * Whether the batched charge has taken over is NOT decided here (ADR-0063).
 *
 * It used to be: this module held a `batchRelayActive` flag that `apps/web`
 * flipped through an exported setter, plus a reset seam for tests — a hidden
 * channel between two packages that nothing in the types connected. The relay's
 * stand-down now belongs to `setupBridgeLogger`, which owns the subscription and
 * hands the caller a method to call. This file just relays.
 */
/**
 * How long identical lines are folded together.
 *
 * One second, because that is the scale the failure mode runs at: a stalled
 * network produces the same `NET … failed` line as fast as requests time out.
 */
const REPEAT_WINDOW_MS = 1_000;

/**
 * Identical lines allowed through per window before the rest are counted
 * instead of sent.
 *
 * Five rather than one: a handful of repeats is ordinary and sometimes the
 * point (three retries of the same call). Past that, the n-th copy of a line
 * says nothing the first did not, and sending it costs a bridge hop at exactly
 * the moment the bridge is the contended resource.
 */
const REPEAT_THRESHOLD = 5;

/**
 * Distinct lines tracked at once. Exceeding it clears the table rather than
 * evicting cleverly — suppression restarting is harmless, and an unbounded map
 * in the log path is not.
 */
const MAX_TRACKED_LINES = 64;

/**
 * Whether the app on the other side has a live console.
 *
 * Read from a global the shell injects at WebView load, so it is available
 * before the first entry is dispatched — no handshake, no round trip, no race.
 * An older app injects nothing, which reads as false and keeps `debug` local:
 * the behaviour this had before the flag existed.
 */
const appConsoleEnabled = (): boolean =>
    (globalThis as { CHATIC_APP_CONSOLE_ENABLED?: boolean }).CHATIC_APP_CONSOLE_ENABLED === true;

/** A line is "the same line" by level, tag and message — not by `data`. */
const repeatKey = (entry: LogEntry): string => `${entry.level}|${entry.tag}|${entry.message}`;

export const createNativeForwarder = (): LogListener => {
    const adapter = new NativeBridgeAdapter();

    /**
     * Per-line repeat counters.
     *
     * This is a counter table, not a buffer: no entry is ever held here, so the
     * listener stays the shape the other two have (principle 17). What it costs
     * is that suppressed entries are dropped rather than delayed — see the
     * `send` note below.
     */
    const recent = new Map<string, { firstAt: number; count: number }>();

    const send = (entry: LogEntry, messageOverride?: string): void => {
        const message: WebMessageData<'SendLog'> = {
            type: 'SendLog',
            data: { ...toAppLogInfo(entry), message: messageOverride ?? entry.message },
        };

        adapter.postMessage(message);
    };

    return entry => {
        // `debug` crosses only when the app can print it.
        //
        // Both of the app's durable sinks drop `debug` — the store at its door,
        // Crashlytics in its subscriber — so the only consumer over there is the
        // console, and in a release build that console is not running. Relaying
        // into it would buy nothing and cost the most: `debug` is the
        // highest-volume level (`withNetworkLog` emits one per HTTP request) and
        // this is the per-entry path, so every line is a `postMessage` on the UI
        // thread contending with the cache path.
        //
        // Where the console *is* running, the calculus inverts. The reason to
        // relay at all is that the app's terminal becomes the one place web and
        // native logs share a timeline, and dropping the busiest level leaves
        // that timeline missing exactly the trace a developer is following. The
        // volume is the same volume, but there are no users to spend it on.
        if (entry.level === 'debug' && !appConsoleEnabled()) return;

        // Burst control. `debug` being gated removes the steady high-volume
        // source, but not the spiky one: when the network stalls, every request
        // that times out logs an `error`, and each of those is a `postMessage`
        // on the UI thread contending with the cache path — which then slows,
        // which produces more warnings. That loop is what made the per-entry
        // relay expensive the first time around, and folding repeats is what
        // breaks it.
        //
        // The cost is real and worth stating plainly: a suppressed entry is
        // dropped, not deferred. In a hybrid run against a capable app the web
        // is not storing either, so those copies exist nowhere afterwards. The
        // trade is deliberate — past the threshold the n-th identical line
        // carries only its count, and the count survives.
        const key = repeatKey(entry);
        const now = entry.timestamp;
        const seen = recent.get(key);

        if (seen && now - seen.firstAt < REPEAT_WINDOW_MS) {
            seen.count += 1;
            if (seen.count > REPEAT_THRESHOLD) return;
            send(entry);
            return;
        }

        // Window closed (or first sighting). Report what the previous window
        // swallowed before starting a new one, so the count is never silent.
        //
        // Reported on the next occurrence rather than on a timer: a timer here
        // would be the first piece of scheduling machinery inside a listener,
        // which is the thing this design keeps out. The bounded consequence is
        // that a burst which stops dead leaves its final tally unsent — one line
        // about entries that were themselves duplicates.
        if (seen && seen.count > REPEAT_THRESHOLD) {
            send(entry, `${entry.message} (+${seen.count - REPEAT_THRESHOLD} identical suppressed)`);
        }

        if (recent.size >= MAX_TRACKED_LINES) recent.clear();
        recent.set(key, { firstAt: now, count: 1 });
        send(entry);
    };
};
