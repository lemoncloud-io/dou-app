/**
 * Which feature graph a screen belongs to.
 *
 * Pure: no router, no React, no DOM. One regex table and the two readings it supports.
 *
 * Some features are not a screen but a small graph of screens about ONE thing — a channel has its
 * room, its settings, its invite and its threads; a place has its detail and five settings pages.
 * Every one of those is *about* a particular channel or a particular place, and the reader who
 * walked into the graph walked in from somewhere outside it.
 *
 * That "outside" is what the history stack loses. Arriving at channel B while standing three
 * screens deep in channel A's graph pushes B on top of A's screens, so back walks the reader
 * through settings for a channel they have already left. Naming the graph is what lets the stack
 * treat A's screens as one unit to be put away, rather than as three unrelated entries.
 *
 * A feature that is NOT instance-scoped has no graph here and gets no special treatment: `/mypage`,
 * `/search` and `/subscription` are single destinations a reader chose, and collapsing them would
 * delete a screen they meant to keep. That distinction has been paid for before — the room-entry
 * rule in `stackPolicy` once read "anywhere but home" and made a push tapped from `/mypage` delete
 * mypage.
 */

/** A screen's place in its feature's navigation graph. */
export interface FeatureGraphNode {
    /** The feature that owns the graph, e.g. `channels`. */
    feature: string;
    /** The one thing the graph is about — the channel id, the place id. */
    instance: string;
}

/**
 * The instance-scoped graphs, and nothing else.
 *
 * Deliberately a short explicit list rather than a general `/:feature/:id/*` rule. A general rule
 * would sweep in `/invite/:inviteId/waiting`, which looks identical and is not a graph — it is one
 * screen, and treating a second invite as "another instance of the same graph" would delete the
 * first one's entry while the reader is still using it.
 */
const GRAPH_PATTERNS: readonly { feature: string; pattern: RegExp }[] = [
    { feature: 'channels', pattern: /^\/channels\/([^/]+)(?:\/|$)/ },
    { feature: 'place', pattern: /^\/place\/([^/]+)(?:\/|$)/ },
];

/** Drops the query and the fragment; neither ever decides which graph a screen is in. */
const pathnameOf = (location: string): string => location.split('#')[0].split('?')[0];

/**
 * The graph this location belongs to, or null when it belongs to none.
 *
 * Null is the common answer and the safe one: a screen with no graph is a screen that stands on
 * its own, which is exactly how the stack has always treated every screen.
 */
export const readFeatureGraph = (location: string): FeatureGraphNode | null => {
    const pathname = pathnameOf(location);

    for (const { feature, pattern } of GRAPH_PATTERNS) {
        const match = pattern.exec(pathname);
        if (match) return { feature, instance: match[1] };
    }

    return null;
};

/**
 * Is moving from `from` to `to` a move to a DIFFERENT instance of the SAME feature graph?
 *
 * The narrow question the stack acts on. Both halves matter:
 *
 * - Same feature, because collapsing across features would delete a screen the reader chose.
 *   Walking from `/mypage` into a channel leaves mypage underneath, as it always has.
 * - Different instance, because moving WITHIN one channel's graph (room → its settings) is
 *   ordinary forward movement and must keep stacking, or back inside a channel would stop working.
 */
export const isSiblingGraphEntry = (from: string, to: string): boolean => {
    const fromGraph = readFeatureGraph(from);
    const toGraph = readFeatureGraph(to);

    if (!fromGraph || !toGraph) return false;

    return fromGraph.feature === toGraph.feature && fromGraph.instance !== toGraph.instance;
};

/**
 * How many entries at the top of the stack belong to `graph`, counting down from the current one.
 *
 * `stack` is indexed by history index — position 0 is the app's first entry — and `currentIndex` is
 * where the reader is standing. Entries ABOVE the cursor are a forward branch the next push will
 * discard, so they are not counted.
 *
 * Counting stops at the first entry that is not in the graph, and at the first `null`. A null is an
 * entry the tracker never observed (the stack below where a reload landed), and an unobserved entry
 * is not evidence of anything — treating it as "not in the graph" stops the rewind there, which
 * errs towards rewinding too little. Rewinding too far would drop a screen we cannot see.
 */
export const countGraphRun = (
    stack: readonly (string | null)[],
    currentIndex: number | null,
    graph: FeatureGraphNode | null
): number => {
    if (!graph || currentIndex === null) return 0;

    let run = 0;
    for (let index = Math.min(currentIndex, stack.length - 1); index >= 0; index -= 1) {
        const pathname = stack[index];
        if (!pathname) break;

        const entryGraph = readFeatureGraph(pathname);
        if (!entryGraph || entryGraph.feature !== graph.feature || entryGraph.instance !== graph.instance) break;

        run += 1;
    }

    return run;
};
