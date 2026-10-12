import { isPageHidden, pageHideCount, startPerfTrace } from '@chatic/perf';

import type { PerfTrace } from '@chatic/perf';

/**
 * At most this many `chat_send` traces per minute.
 *
 * Every trace a device records shares one Firebase Performance budget (300 per ten minutes in the
 * foreground, see `bridgeRequestTrace`). People send in bursts — a pasted list, a quick back and
 * forth — and an uncapped trace could crowd out `chat_room_open`. Ten a minute keeps the ordinary
 * pace whole and only thins a burst.
 */
export const CHAT_SEND_TRACES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

export type ChatSendOutcome = 'ok' | 'error';

export interface ChatSendTrace {
    /** Records how the send ended and stops the trace. Only the first call counts. */
    end(outcome: ChatSendOutcome): void;
}

const NOOP_SEND_TRACE: ChatSendTrace = { end: () => undefined };

interface ChatSendTracerOptions {
    /** Overridable for tests; production starts through the process-wide perf slot. */
    start?: (name: 'chat_send') => PerfTrace;
    now?: () => number;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

/**
 * Times text sends, from the moment the send is asked for to the server's answer.
 *
 * The span is the wait a person sees between pressing send and the message no longer showing as
 * pending: the optimistic row, the request, the answer, and the write that replaces the row.
 *
 * A send from a hidden page is not timed, and one the page was hidden during is dropped: it would
 * time the absence, and the background budget is a tenth of the foreground one. Dropping means the
 * trace is never stopped, which is how a trace records nothing — the native side forgets an
 * unstopped trace after two minutes.
 */
export const createChatSendTracer = ({
    start = startPerfTrace,
    now = Date.now,
    isHidden = isPageHidden,
    hideCount = pageHideCount,
}: ChatSendTracerOptions = {}) => {
    let windowStart = Number.NEGATIVE_INFINITY;
    let startedInWindow = 0;

    return (context: { reply: boolean }): ChatSendTrace => {
        if (isHidden()) return NOOP_SEND_TRACE;
        const at = now();
        if (at - windowStart >= MINUTE_MS) {
            windowStart = at;
            startedInWindow = 0;
        }
        if (startedInWindow >= CHAT_SEND_TRACES_PER_MINUTE) return NOOP_SEND_TRACE;
        startedInWindow += 1;

        const hidesAtStart = hideCount();
        const trace = start('chat_send');
        // A thread reply resolves its root on the server first, so it is kept apart from a top-level send.
        trace.putAttribute('thread', context.reply ? 'reply' : 'root');
        // The same `kind` attribute as `chat_send_media`, which carries the other kinds.
        trace.putAttribute('kind', 'text');
        return {
            end: outcome => {
                if (isHidden() || hideCount() !== hidesAtStart) return;
                trace.putAttribute('outcome', outcome);
                trace.stop();
            },
        };
    };
};

/** The app's tracer: one per page, so the per-minute cap counts every send the page makes. */
export const beginChatSendTrace = createChatSendTracer();
