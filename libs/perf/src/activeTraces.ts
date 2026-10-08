import type { PerfTrace } from './PerfTrace';
import type { PerfTraceName } from './types';

/**
 * The one trace of a given name currently in progress, and what it is about.
 *
 * For a trace that several modules contribute phases to without being connected to each other —
 * `chat_room_sync` is begun by a tap in the web, marked by the sync hooks in `libs/app-runtime`,
 * and ended by the room page. None of them can hand the handle to the next, so they meet here,
 * keyed by the trace name and the subject it measures (the channel, for a room).
 *
 * One per name, because the things measured this way happen one at a time — a user opens one
 * room at a time — and a slot that overwrites needs no cleanup to stay small. A trace replaced
 * here can no longer be found by name; a module that already holds it may still mark and stop it,
 * and one that held nothing leaves it unstopped, which records nothing.
 */
const active = new Map<PerfTraceName, { subject: string; trace: PerfTrace }>();

/** Makes `trace` the active one for `name`, about `subject`, replacing whatever was there. */
export const setActivePerfTrace = (name: PerfTraceName, subject: string, trace: PerfTrace): void => {
    active.set(name, { subject, trace });
};

/** The active trace for `name`, if it is about `subject`. */
export const getActivePerfTrace = (name: PerfTraceName, subject: string): PerfTrace | undefined => {
    const entry = active.get(name);
    return entry && entry.subject === subject ? entry.trace : undefined;
};

/**
 * Clears the slot for `name` — only if it still holds `trace`, when one is given, so a module
 * finishing an old trace cannot clear the newer one that replaced it.
 */
export const clearActivePerfTrace = (name: PerfTraceName, trace?: PerfTrace): void => {
    const entry = active.get(name);
    if (!entry) return;
    if (trace && entry.trace !== trace) return;
    active.delete(name);
};

/**
 * Ends the active trace for `name`, if it is about `subject`: records `outcome`, stops it and
 * clears the slot. For the module that knows the measured thing is over — whichever it is.
 */
export const endActivePerfTrace = (name: PerfTraceName, subject: string, outcome: string): void => {
    const trace = getActivePerfTrace(name, subject);
    if (trace) endPerfTrace(name, trace, outcome);
};

/**
 * Ends `trace` itself: records `outcome`, stops it, and frees the slot if the slot still holds it.
 * For a module ending the trace it took, which may since have been replaced in the slot — looking it
 * up by subject instead would end whichever trace is there now. A trace already stopped is left as
 * it was.
 */
export const endPerfTrace = (name: PerfTraceName, trace: PerfTrace, outcome: string): void => {
    clearActivePerfTrace(name, trace);
    trace.putAttribute('outcome', outcome);
    trace.stop();
};
