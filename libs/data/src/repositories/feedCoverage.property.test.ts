import * as fc from 'fast-check';

import { FeedCoverage, uncoveredIn } from './feedCoverage';
import type { FeedRange } from './feedCoverage';

const RUNS = { numRuns: 200, seed: 1123 };
const KEY = 'cloud-a|me|ch-1|';

const page = fc
    .tuple(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 12 }))
    .map(([low, span]): FeedRange => [low, low + span]);

const numbersIn = (ranges: readonly FeedRange[]): Set<number> => {
    const numbers = new Set<number>();
    for (const [low, high] of ranges) for (let no = low; no <= high; no++) numbers.add(no);
    return numbers;
};

const runsOf = (numbers: Iterable<number>): FeedRange[] => {
    const runs: [number, number][] = [];
    for (const no of [...numbers].sort((a, b) => a - b)) {
        const last = runs[runs.length - 1];
        if (last && last[1] + 1 === no) last[1] = no;
        else runs.push([no, no]);
    }
    return runs;
};

const coverageAfter = (pages: readonly FeedRange[]): FeedCoverage => {
    const coverage = new FeedCoverage();
    pages.forEach(([low, high]) => coverage.add(KEY, low, high));
    return coverage;
};

describe('FeedCoverage properties', () => {
    it('covers exactly the chat numbers of every page joined, as sorted runs that neither overlap nor touch', () => {
        fc.assert(
            fc.property(fc.array(page, { maxLength: 12 }), pages => {
                expect(coverageAfter(pages).covered(KEY)).toEqual(runsOf(numbersIn(pages)));
            }),
            RUNS
        );
    });

    it('reports as uncovered exactly the numbers of a window no page has covered', () => {
        fc.assert(
            fc.property(
                fc.array(page, { maxLength: 12 }),
                fc.integer({ min: 1, max: 80 }),
                fc.integer({ min: -5, max: 30 }),
                (pages, low, span) => {
                    const high = low + span;
                    const covered = numbersIn(pages);
                    const missing: number[] = [];
                    for (let no = low; no <= high; no++) if (!covered.has(no)) missing.push(no);

                    expect(uncoveredIn(coverageAfter(pages).covered(KEY), low, high)).toEqual(runsOf(missing));
                }
            ),
            RUNS
        );
    });

    it('notifies a listener once per page that grows the coverage and never for one already covered', () => {
        fc.assert(
            fc.property(fc.array(page, { maxLength: 12 }), pages => {
                const coverage = new FeedCoverage();
                const listener = jest.fn();
                coverage.subscribe(KEY, listener);
                const seen = new Set<number>();
                let growths = 0;
                for (const [low, high] of pages) {
                    const before = seen.size;
                    numbersIn([[low, high]]).forEach(no => seen.add(no));
                    if (seen.size > before) growths += 1;
                    coverage.add(KEY, low, high);
                }

                expect(listener).toHaveBeenCalledTimes(growths);
            }),
            RUNS
        );
    });
});
