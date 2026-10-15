import { logger, type ObservationData } from '@chatic/bridges';

/** Whose place list an answer was about — the partition its request was captured for. */
export interface PlaceListScope {
    cid: string;
    uid?: string;
}

export interface PlaceListEmptyReporter {
    /**
     * A full snapshot answered with no live place. `deletedRows` counts the rows it did carry that were
     * all stamped deleted, so "the server listed nothing" and "every place was deleted" stay apart.
     */
    empty(scope: PlaceListScope, deletedRows: number): void;
    /** A full snapshot answered with at least one live place. */
    filled(scope: PlaceListScope): void;
    /** Forgets every scope. For tests. */
    reset(): void;
}

/**
 * The empty answer that opens the record. The first one alone is not enough: right after a switch
 * the session can answer empty before it is ready, and the next poll, a minute later, lists the
 * places. A second empty answer in a row is the account really having none.
 */
export const EMPTY_ANSWERS_TO_REPORT = 2;

/**
 * Says when a cloud's place list keeps coming back empty, and when it stops.
 *
 * Home selects a place before it can draw a channel, so a user who belongs to no place in a cloud
 * sees an empty cloud. Without this record the logs cannot tell that apart from a client that never
 * asked: an empty answer is not written to the cache (written, the not-ready one would wipe the real
 * rows), and a successful refresh logs nothing.
 *
 * One entry when a scope goes empty and one when it fills again, never one per answer: the list is
 * re-asked every minute by the foreground poll and by every background cloud, and an account with no
 * place in a cloud would otherwise write the same line for as long as the app is open. Scopes are
 * kept per cloud and account, since another cloud being empty says nothing about this one, and an
 * answer whose account is not known yet is not counted at all — it could not be matched to the
 * answer that ends the run. The record lives as long as the process: an account that signs out and
 * back in with a cloud still empty is not reported a second time.
 */
export const createPlaceListEmptyReporter = (): PlaceListEmptyReporter => {
    // Scope key → empty answers in a row since the scope was last seen with a place.
    const emptyAnswers = new Map<string, number>();
    const keyOf = ({ cid, uid }: PlaceListScope) => `${cid}|${uid}`;

    return {
        empty(scope, deletedRows) {
            if (!scope.uid) return;
            const key = keyOf(scope);
            const count = (emptyAnswers.get(key) ?? 0) + 1;
            emptyAnswers.set(key, count);
            if (count !== EMPTY_ANSWERS_TO_REPORT) return;
            // `cid` is carried because the entry's own context names the ACTIVE cloud, and a
            // background cloud's refresh answers for another one. The account is not carried — the
            // scope only needs it to keep two accounts' runs apart.
            logger.info('PLACE', 'place list answered with no place — nothing to select', {
                observation: 'place-list-empty',
                cid: scope.cid,
                deletedRows,
                emptyAnswers: count,
            } satisfies ObservationData);
        },
        filled(scope) {
            if (!scope.uid) return;
            const key = keyOf(scope);
            const count = emptyAnswers.get(key);
            if (count == null) return;
            emptyAnswers.delete(key);
            // A single empty answer was never reported, so its end is not either.
            if (count < EMPTY_ANSWERS_TO_REPORT) return;
            logger.info('PLACE', 'place list has a place again', {
                observation: 'place-list-empty',
                cid: scope.cid,
                afterEmptyAnswers: count,
            } satisfies ObservationData);
        },
        reset() {
            emptyAnswers.clear();
        },
    };
};

/** Shared by every repository graph, so a scoped graph rebuilt on a switch keeps the same runs. */
export const placeListEmptyReporter = createPlaceListEmptyReporter();
