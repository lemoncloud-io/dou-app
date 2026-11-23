import { isPageHidden, pageHideCount, startPerfTrace } from '@chatic/perf';

import type { PerfTrace } from '@chatic/perf';

export const CHAT_SEND_TRACES_PER_MINUTE = 10;

const MINUTE_MS = 60_000;

export type ChatSendOutcome = 'ok' | 'error';

export interface ChatSendTrace {
    end(outcome: ChatSendOutcome): void;
}

const NOOP_SEND_TRACE: ChatSendTrace = { end: () => undefined };

interface ChatSendTracerOptions {
    start?: (name: 'chat_send') => PerfTrace;
    now?: () => number;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

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
        trace.putAttribute('thread', context.reply ? 'reply' : 'root');
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

export const beginChatSendTrace = createChatSendTracer();
