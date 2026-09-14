import { logger, type ObservationData } from '@chatic/bridges';

/** The app-icon badge the web derived vs the value the device is really showing. */
export interface BadgeDivergenceInput {
    /** The authoritative total the web pushed: active cloud + every other cloud. */
    web: number;
    /**
     * What the device answers for its icon badge, or `null` when it cannot be read at all. Android
     * has no readable icon badge (its notifee badge API is a no-op off iOS and answers a constant
     * 0), and comparing against an unreadable value would mark every Android device as diverged
     * forever — so `null` means "skip", never "zero".
     */
    native: number | null;
    /** Active cloud's share of `web` — splits a wrong total into which half produced it. */
    active: number;
    /** Every other cloud's share of `web`. */
    others: number;
}

/** What the channel list drew vs what the room had already marked read. */
export interface UnreadDivergenceInput {
    channelId: string;
    /** Highest `chatNo` the room marked read, or `undefined` when it never got to mark. */
    markedChatNo?: number;
    /** The read cursor the list actually derived its count from (`join.chatNo`). */
    cursorChatNo?: number;
    /** The channel head at comparison time — guards against messages that arrived after the read. */
    headChatNo?: number;
    /** The count the list drew for this channel. */
    drawn: number;
    /**
     * Whether the join row carries its own `metaNo` snapshot. Without it `countUnread` falls back to
     * the head's snapshot and errs HIGH by the system events in between (ADR-0048) — the same
     * symptom as a cursor that never landed, so the two must be told apart in the entry.
     */
    hasReadMetaNo: boolean;
}

/** The channel roster vs the join records that say who is actually in the room. */
export interface MemberDivergenceInput {
    channelId: string;
    /** Ids in `channel.memberIds` with no join record — the ghost members still being rendered. */
    rosterOnly: number;
    /** Ids with a join record but absent from the roster — the opposite skew. */
    joinOnly: number;
    /**
     * How many join records were read. Zero is ambiguous (an unhydrated cache looks like an empty
     * room), so the check is skipped rather than reported.
     */
    joinCount: number;
    /**
     * Whether the channel row actually carried a roster. An absent `memberIds` means "not synced
     * yet", not "nobody is in this room" — treating it as an empty roster reports every join as
     * "joins ahead" on any channel whose cache row has not landed.
     */
    rosterKnown: boolean;
}

/** The locally cached cloud name vs the one the relay catalog answers. */
export interface CloudNameDivergenceInput {
    cid: string;
    /** Local cache value. Never logged — only its length is. */
    cachedName?: string;
    /** Relay catalog value. Never logged — only its length is. */
    catalogName?: string;
}

/**
 * Records that two values which should agree did not.
 *
 * **Why the client compares instead of the server.** These bugs never fail — nothing throws, no
 * request errors, two numbers simply disagree. The stored logs can be narrowed server-side by
 * `level`, `runId` and date only, and the payload lands inside a length-capped `data` string that
 * is not queryable by value. So "upload both numbers and diff them later" cannot be executed;
 * comparing here and emitting a single `warn` is what makes the disagreement findable at all.
 *
 * **Silence on agreement is a hard requirement, not an optimisation.** Every method returns without
 * logging when the values match, so a healthy device pays nothing and the checks can therefore sit
 * on paths that run on every foreground return.
 *
 * **Never call these from a log listener or the upload path.** Listeners run synchronously while the
 * collector is handing an entry out, so logging there re-enters immediately; the send path's
 * `logger → send → fail → logger` recursion is already pinned by a test. These belong on screen and
 * hook layers only.
 *
 * Entries carry the numbers under `data`, discriminated by `data.observation`, and keep `message`
 * to a human-readable one-liner: the direction of the skew, never the values. Two readers (a person scanning
 * breadcrumbs, a script aggregating) cannot share one string without one of them losing.
 */
export interface IDivergenceReporter {
    badge(input: BadgeDivergenceInput): void;
    unread(input: UnreadDivergenceInput): void;
    member(input: MemberDivergenceInput): void;
    cloudName(input: CloudNameDivergenceInput): void;
}

class DivergenceReporter implements IDivergenceReporter {
    badge({ web, native, active, others }: BadgeDivergenceInput): void {
        if (native === null) return;
        if (web === native) return;

        logger.warn('NOTIFICATION', `badge diverged — ${native > web ? 'device' : 'web'} ahead`, {
            observation: 'badge-divergence',
            web,
            native,
            delta: web - native,
            breakdown: { active, others },
        } satisfies ObservationData);
    }

    unread({ channelId, markedChatNo, cursorChatNo, headChatNo, drawn, hasReadMetaNo }: UnreadDivergenceInput): void {
        // Nothing was marked, so there is no expectation to violate — the room may never have been
        // opened, or its read request failed (which logs on its own).
        if (markedChatNo === undefined) return;
        // Messages arrived after the read, so a count is correct rather than stale. Comparing anyway
        // would report every active room the moment someone else speaks in it.
        if (headChatNo !== undefined && headChatNo > markedChatNo) return;
        if (drawn === 0) return;

        // Which of the two failures this is: a cursor that never landed, or a cursor that landed and
        // still nets a count. Naming it in the message keeps the breadcrumb readable without values.
        const cursorLanded = cursorChatNo !== undefined && cursorChatNo >= markedChatNo;
        logger.warn(
            'CHAT',
            `unread diverged — ${cursorLanded ? 'cursor landed but count remains' : 'cursor behind mark'}`,
            {
                observation: 'unread-divergence',
                channelId,
                markedChatNo,
                cursorChatNo,
                headChatNo,
                drawn,
                cursorLanded,
                hasReadMetaNo,
            } satisfies ObservationData
        );
    }

    member({ channelId, rosterOnly, joinOnly, joinCount, rosterKnown }: MemberDivergenceInput): void {
        if (!rosterKnown) return;
        if (joinCount === 0) return;
        if (rosterOnly === 0 && joinOnly === 0) return;

        // Counts and direction only. Who diverged is not needed to locate the bug, and user ids in a
        // log entry would widen what this track puts on the wire.
        logger.warn('CHANNEL', `member diverged — ${rosterOnly > 0 ? 'roster ahead' : 'joins ahead'}`, {
            observation: 'member-divergence',
            channelId,
            rosterOnly,
            joinOnly,
            joinCount,
        } satisfies ObservationData);
    }

    cloudName({ cid, cachedName, catalogName }: CloudNameDivergenceInput): void {
        // One side absent is a cold cache or an unanswered catalog, not a disagreement.
        if (!cachedName || !catalogName) return;
        if (cachedName === catalogName) return;

        // Lengths, never the names: a cloud name is a string the user chose, and "they disagree" plus
        // "for how long" is the whole of what the diagnosis needs.
        logger.warn('CLOUD', 'cloud name diverged — cache and catalog disagree', {
            observation: 'cloud-name-divergence',
            cid,
            cachedLen: cachedName.length,
            catalogLen: catalogName.length,
        } satisfies ObservationData);
    }
}

export const divergenceReporter: IDivergenceReporter = new DivergenceReporter();
