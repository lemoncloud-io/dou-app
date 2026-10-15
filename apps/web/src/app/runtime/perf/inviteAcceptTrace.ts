import { isPageHidden, pageHideCount, startPerfTrace } from '@chatic/perf';

import type { PerfTrace } from '@chatic/perf';

/** Which accept pipeline the trace times: the cloud invite's REST pipeline, or the relay 1:1 one. */
export type InviteAcceptLane = 'cloud' | 'relay';

/**
 * Where an accept run stopped.
 *
 * - `ok` — handed over: the room (or, with no room, home) is next.
 * - `pending` — relay only: accepted, but the room it creates was not found in time.
 * - `verify` / `profile` — stopped to ask the person for something. A form is paced by a person,
 *   so the run ends there and the step that resumes it starts a run of its own.
 * - `notice` — relay only: the invite turned out to be expired, used, canceled or rejected, or the
 *   number verified is not the invited one.
 * - `error` — a step failed.
 */
export type InviteAcceptOutcome = 'ok' | 'pending' | 'verify' | 'profile' | 'notice' | 'error';

/**
 * Phase boundaries, each recorded once as ms since the run began.
 *
 * Cloud: `login` (the invite login answered), `cloud` (the cloud entered), `site` (the place
 * entered), `profile_check` (the place profile was looked up).
 * Relay: `invite_read` (the re-read answered), `accepted` (`invite.accept` answered), `room` (the
 * room it created was found, or given up on).
 */
export type InviteAcceptPhase = 'login' | 'cloud' | 'site' | 'profile_check' | 'invite_read' | 'accepted' | 'room';

export interface InviteAcceptTrace {
    mark(phase: InviteAcceptPhase): void;
    /**
     * Records how the run ended and stops the trace. Only the first call counts. `step` names the
     * step an error stopped in; `room` says which way the relay room was found (`response`, `push`,
     * `probe`, `list`, or `none`).
     */
    end(outcome: InviteAcceptOutcome, detail?: { step?: string; room?: string }): void;
}

const NOOP_INVITE_TRACE: InviteAcceptTrace = { mark: () => undefined, end: () => undefined };

interface InviteAcceptTracerOptions {
    /** Overridable for tests; production starts through the process-wide perf slot. */
    start?: (name: 'invite_accept') => PerfTrace;
    isHidden?: () => boolean;
    hideCount?: () => number;
}

/**
 * Times one run of an invite's accept pipeline — the spinner a person watches after pressing Accept.
 *
 * `cloud_switch` and `site_switch` cover two of its steps, but every other switch in the app lands
 * in the same rows, and almost all of those are onto a socket that is already up. An accept is a
 * rare, cold switch, so it never reached even their 95th percentile; this trace is the only place
 * its time shows.
 *
 * No cap, unlike `chat_send`: a person accepts an invite a handful of times, ever.
 *
 * A run started on a hidden page is not timed, and one the page was hidden during is dropped by
 * leaving its trace unstopped — it would time the absence, not the pipeline.
 */
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
