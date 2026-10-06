import type { CloudView } from '@lemoncloud/chatic-backend-api';

/**
 * Which clouds a downgrade keeps — the app-side half of the relay's "drop" marks.
 *
 * The relay asks the question the other way round: `POST /memberships/0/drops` takes the clouds to
 * GIVE UP when the allowance shrinks, and the list it receives is the final state (anything owned
 * and not listed loses its mark, an empty list clears them all). The screen asks which to KEEP,
 * because that is the choice a person actually makes, so every function here translates between
 * the two.
 *
 * The mark is read from `state$.plan === 'drop'` and nothing else. `plannedAt` is not a signal —
 * the relay stamps it when a mark is set and leaves it behind when the mark is cleared.
 */

/**
 * The clouds a keep choice is made over.
 *
 * A released cloud has left the membership, and the relay skips `expired` ones when it applies
 * marks — listing either would let the user pick something the request then silently ignores. A
 * cloud already on hold is still a candidate: the relay lets a mark be withdrawn during the hold,
 * which is exactly how a held cloud is chosen back.
 */
export const keepCandidates = <T extends CloudView>(clouds: T[]): T[] =>
    clouds.filter(c => !!c.id && c.status !== 'expired' && c.state$?.life !== 'released');

export const isMarkedForDrop = (cloud: CloudView): boolean => cloud.state$?.plan === 'drop';

/** Whether a choice has been sent before — decides "confirm" versus "change" on the screen. */
export const hasDropMarks = (clouds: CloudView[]): boolean => clouds.some(isMarkedForDrop);

/**
 * The selection the screen opens with: the clouds the relay currently keeps, or nothing when no
 * choice has been made yet. Pre-selecting on a first visit would make "confirm" a choice the user
 * never looked at.
 */
export const initialKeepIds = (candidates: CloudView[]): string[] =>
    hasDropMarks(candidates) ? candidates.filter(c => !isMarkedForDrop(c)).map(c => c.id as string) : [];

/** The request body's list: every candidate the user did not keep. */
export const toDropIds = (candidates: CloudView[], keepIds: string[]): string[] => {
    const keep = new Set(keepIds);
    return candidates.filter(c => !keep.has(c.id as string)).map(c => c.id as string);
};

/** A choice is owed only when the clouds would not fit under the next plan's allowance. */
export const needsKeepChoice = (candidateCount: number, nextLimit: number | null | undefined): boolean =>
    typeof nextLimit === 'number' && candidateCount > nextLimit;

/**
 * Toggles one cloud in the keep selection, never letting it grow past `limit`.
 *
 * Picking one more than the allowance drops the OLDEST pick rather than refusing the tap, which is
 * how a single-choice list already behaves (limit 1 is a radio group) and avoids a dead tap on a
 * multi-choice one.
 */
export const toggleKeep = (selected: string[], id: string, limit: number): string[] => {
    if (selected.includes(id)) return selected.filter(s => s !== id);
    const next = [...selected, id];
    return next.length > limit ? next.slice(next.length - limit) : next;
};

/** Whether the current selection is a different choice from the one the relay holds. */
export const isSameKeepChoice = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every(id => b.includes(id));

/** Clouds the relay has put on hold because a downgrade left them past the allowance. */
export const findHeldClouds = <T extends CloudView>(clouds: T[]): T[] =>
    clouds.filter(c => c.state$?.hold === 'downgrade' && c.state$?.life !== 'released');
