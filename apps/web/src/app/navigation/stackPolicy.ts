/**
 * How an ENTRY transition should be placed on the history stack.
 *
 * Pure: no router, no React, no bridge. The whole module is one lookup table plus the predicates
 * it needs, so the rules can be read and tested without standing an app up.
 *
 * "Entry" is the narrow word it looks like. This answers for the three ways a screen is reached
 * from OUTSIDE the user's own tapping — a deep link, an auth transition, a push — and for nothing
 * else. Ordinary in-app movement keeps calling `navigate` directly; `'in-app'` exists so that
 * "we deliberately do not decide this one" has a name rather than being an omission.
 */

import { countGraphRun, isSiblingGraphEntry, readFeatureGraph } from './featureGraph';

/** Which kind of entry is being made. These four are exhaustive. */
export type EntryKind =
    /** An invite or share link; the link arrived from outside the app. */
    | 'deeplink'
    /** LEAVING the login screen. Entering it belongs to `useNavigateToLogin` — see the rule below. */
    | 'auth-transition'
    /** An OS notification tap, or a tap on the in-app banner. */
    | 'push'
    /** Everything else. Named so that "no policy applies" is explicit. */
    | 'in-app';

export interface EntryContext {
    /** Where we are: `pathname` + `search`, read from `window.location` at call time. */
    from: string;
    /** Where we are going, in the same shape. */
    to: string;
    /**
     * Depth from the app's first entry — `history.state.idx`, via `stackDepth`.
     *
     * 0 means this is the app's first screen and there is nothing behind it. Null means the index
     * could not be read, which is treated as "do not rewind" rather than as 0-with-confidence.
     */
    depth: number | null;
    /**
     * The reconstructed stack, indexed by history index, for the one rule that needs to see more
     * than the top of it — collapsing a whole feature graph (`featureGraph`).
     *
     * Optional, and its absence is not an error: the browser exposes no way to enumerate history,
     * so this is `stackTracker`'s reconstruction and it is only as good as what the tracker
     * observed. Every rule that does not name it behaves identically without it, and the one that
     * does falls back to the single-entry behaviour it had before.
     */
    stack?: readonly (string | null)[];
}

export type EntryAction =
    /** Already there. Re-navigating would remount the screen and stack a duplicate. */
    | { kind: 'skip' }
    | { kind: 'push' }
    | { kind: 'replace' }
    /** `history.back()` — rewind, which removes the entry instead of stacking another. */
    | { kind: 'back' }
    /**
     * Put a whole feature graph away, then enter. `steps` entries are rewound — every screen of
     * the graph the reader is standing in — and the target is pushed onto whatever was underneath
     * it.
     *
     * Rewind and PUSH, not rewind and replace: after the rewind the cursor is on the screen the
     * reader entered the graph from, and that screen is one they chose. Replacing it would leave
     * the app one entry deep with the reader's own starting point gone.
     */
    | { kind: 'rewind-then-push'; steps: number };

/**
 * Is this pathname a channel room?
 *
 * A room is the one screen treated as disposable. Rooms are peers a push hops between, so stacking
 * them buries the screen the reader actually wants to return to. Every other screen is one the
 * reader chose to be on. Deliberately NOT widened beyond rooms — it used to read "anywhere but
 * home", and that made a push tapped from `/mypage` delete mypage.
 */
const isChannelRoomPath = (pathname: string): boolean => /^\/channels\/[^/]+\/room$/.test(pathname);

/**
 * A screen that exists only to carry an invite inwards.
 *
 * `/s` and `/i` are the two share-link formats' redirects, and `/invite/accept` is the acceptance
 * screen. All three are places the reader passes THROUGH rather than chooses, which is why leaving
 * one rewinds rather than stacking. Each already redirects with `replace`; naming them here is what
 * keeps that answer the same once an entry point asks this table instead of deciding for itself.
 */
const INVITE_ENTRY_PATHS = ['/s', '/i', '/invite/accept'];

const isInviteEntryPath = (pathname: string): boolean => INVITE_ENTRY_PATHS.includes(pathname);

/** Drops the fragment, which never distinguishes one screen from another. */
const withoutHash = (location: string): string => location.split('#')[0];

const pathnameOf = (location: string): string => withoutHash(location).split('?')[0];

/**
 * Applies the entry rules. This function is the contract; `stackPolicy.test.ts` pins every row.
 *
 * Read the rules in order — the first match wins, and the same-target rule is checked before
 * anything else because re-entering the screen you are on is never right whatever the entry kind.
 *
 * `depth === null` never produces `back`. Rewinding to a place we cannot locate is the one
 * outcome worse than not rewinding, so an unreadable index falls through to `replace`.
 */
export const resolveEntryAction = (entry: EntryKind, ctx: EntryContext): EntryAction => {
    const from = withoutHash(ctx.from);
    const to = withoutHash(ctx.to);

    // Every kind, first: already on the exact target, query string included. A matching pathname
    // with a DIFFERENT query is not "already there" — invite deeplinks land on `/` carrying their
    // payload in the query, and skipping those swallows the invite.
    if (from === to) return { kind: 'skip' };

    const fromPath = pathnameOf(ctx.from);
    const toPath = pathnameOf(ctx.to);

    const canRewind = ctx.depth !== null && ctx.depth > 0;

    /**
     * Moving to another instance of the graph we are standing in — channel A to channel B.
     *
     * Returns the collapse when it applies and null otherwise, so each entry kind can ask the
     * question without repeating the arithmetic. The answer is a number of entries to rewind, and
     * three things bound it:
     *
     *  - the run itself, from `countGraphRun`: every entry of A's graph at the top of the stack;
     *  - `ctx.depth`, because rewinding past the app's first entry leaves the app;
     *  - one, below which there is nothing to collapse and the caller's own rule is already right.
     */
    const collapseSiblingGraph = (): EntryAction | null => {
        if (!isSiblingGraphEntry(ctx.from, ctx.to)) return null;
        if (ctx.depth === null || ctx.depth <= 0) return null;

        const run = countGraphRun(ctx.stack ?? [], ctx.depth, readFeatureGraph(ctx.from));
        const steps = Math.min(run, ctx.depth);

        return steps > 0 ? { kind: 'rewind-then-push', steps } : null;
    };

    switch (entry) {
        case 'push':
            // Arriving in another channel while standing in one: put the whole of the first
            // channel's graph away, so back leaves for wherever the reader entered it from rather
            // than walking them through settings for a channel they have left.
            return (
                collapseSiblingGraph() ??
                // Leaving a room: replace it, so repeated taps cannot stack `[home, roomA, roomB, …]`.
                // Anywhere else: push, so the screen the reader chose stays underneath.
                (isChannelRoomPath(fromPath) ? { kind: 'replace' } : { kind: 'push' })
            );

        case 'deeplink': {
            // Heading INTO the invite path: a redirect hop, which must not leave an entry behind.
            if (isInviteEntryPath(toPath)) return { kind: 'replace' };
            // A link that lands in another channel collapses the one being stood in, for the same
            // reason a push does. Checked before the rewind rule below, which only knows how to
            // step back one entry.
            const collapsed = collapseSiblingGraph();
            if (collapsed) return collapsed;
            // Leaving it once the invite is done. Warm entry means the screen the reader was on
            // before the link arrived is still underneath, so rewind onto it. Cold entry has
            // nothing underneath, so overwrite the acceptance screen with the destination.
            return canRewind ? { kind: 'back' } : { kind: 'replace' };
        }

        case 'auth-transition':
            // LEAVING login, always. Entering it is not routed through here and must not be: the
            // repo pins `useNavigateToLogin` as the only thing allowed to name the login route
            // (`loginEntryPoints.test.ts`), because that hook is what attaches `returnTo`. It
            // pushes, which is exactly what makes this rewind land on the right screen — the two
            // halves are a pair, one just lives outside this module.
            //
            // So: rewind onto the screen that sent us to login. With nothing behind us — a fresh
            // WebView load, a deep link, a reload — fall back to the target instead.
            return canRewind ? { kind: 'back' } : { kind: 'replace' };

        case 'in-app':
            // No policy. The caller decides; this branch exists so the kind is total.
            return { kind: 'push' };
    }
};
