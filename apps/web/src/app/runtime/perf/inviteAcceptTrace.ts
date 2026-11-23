import { isPageHidden, pageHideCount, startPerfTrace } from '@chatic/perf';

import type { PerfTrace } from '@chatic/perf';

export type InviteAcceptLane = 'cloud' | 'relay';

export type InviteAcceptOutcome = 'ok' | 'pending' | 'verify' | 'profile' | 'notice' | 'error';

export type InviteAcceptPhase = 'login' | 'cloud' | 'site' | 'profile_check' | 'invite_read' | 'accepted' | 'room';

export interface InviteAcceptTrace {
    mark(phase: InviteAcceptPhase): void;
    end(outcome: InviteAcceptOutcome, detail?: { step?: string; room?: string }): void;
}

const NOOP_INVITE_TRACE: InviteAcceptTrace = { mark: () => undefined, end: () => undefined };

interface InviteAcceptTracerOptions {
    start?: (name: 'invite_accept') => PerfTrace;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

export const createInviteAcceptTracer = ({
    start = startPerfTrace,
    isHidden = isPageHidden,
    hideCount = pageHideCount,
}: InviteAcceptTracerOptions = {}) => {
    return (lane: InviteAcceptLane): InviteAcceptTrace => {
        if (isHidden()) return NOOP_INVITE_TRACE;
        const hidesAtStart = hideCount();
        const trace = start('invite_accept');
        trace.putAttribute('lane', lane);
        return {
            mark: phase => trace.mark(phase),
            end: (outcome, detail) => {
                if (isHidden() || hideCount() !== hidesAtStart) return;
                if (detail?.step) trace.putAttribute('step', detail.step);
                if (detail?.room) trace.putAttribute('room', detail.room);
                trace.putAttribute('outcome', outcome);
                trace.stop();
            },
        };
    };
};

export const beginInviteAcceptTrace = createInviteAcceptTracer();
