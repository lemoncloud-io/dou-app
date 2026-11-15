import { FeedCoverage, feedCoverageKey, uncoveredIn } from './feedCoverage';
import type { FeedRange } from './feedCoverage';

describe('FeedCoverage', () => {
    it('reports the whole range as uncovered before any page', () => {
        expect(new FeedCoverage().uncovered('k', 10, 20)).toEqual([[10, 20]]);
    });

    it('returns only the parts no page answered for', () => {
        const coverage = new FeedCoverage();
        coverage.add('k', 50, 99);
        coverage.add('k', 120, 150);

        expect(coverage.uncovered('k', 40, 160)).toEqual([
            [40, 49],
            [100, 119],
            [151, 160],
        ]);
        expect(coverage.uncovered('k', 60, 90)).toEqual([]);
    });

    it('merges overlapping and touching ranges', () => {
        const coverage = new FeedCoverage();
        coverage.add('k', 10, 20);
        coverage.add('k', 21, 30);
        coverage.add('k', 25, 40);

        expect(coverage.uncovered('k', 1, 50)).toEqual([
            [1, 9],
            [41, 50],
        ]);
    });

    it('keeps channels and scopes apart', () => {
        const coverage = new FeedCoverage();
        coverage.add(feedCoverageKey('cloud-a', 'me', 'ch-1'), 1, 100);

        expect(coverage.uncovered(feedCoverageKey('cloud-a', 'me', 'ch-2'), 1, 100)).toEqual([[1, 100]]);
        expect(coverage.uncovered(feedCoverageKey('cloud-b', 'me', 'ch-1'), 1, 100)).toEqual([[1, 100]]);
    });

    it('forgets the keys it is told to, and only those', () => {
        const coverage = new FeedCoverage();
        coverage.add('a|ch-1', 1, 10);
        coverage.add('a|ch-2', 1, 10);

        coverage.forget(key => key === 'a|ch-1');

        expect(coverage.uncovered('a|ch-1', 1, 10)).toEqual([[1, 10]]);
        expect(coverage.uncovered('a|ch-2', 1, 10)).toEqual([]);
    });

    it("tells a key's listeners each change, with the ranges after it, and keeps the array until then", () => {
        const coverage = new FeedCoverage();
        const heard: (readonly FeedRange[])[] = [];
        const stop = coverage.subscribe('k', covered => heard.push(covered));
        coverage.add('other', 1, 10);
        coverage.add('k', 10, 20);
        const after = coverage.covered('k');
        coverage.add('k', 12, 18);
        expect(coverage.covered('k')).toBe(after);
        coverage.forget(key => key === 'k');
        stop();
        coverage.add('k', 1, 5);

        expect(heard).toEqual([[[10, 20]], []]);
    });

    it('tells every key that had ranges when it is cleared', () => {
        const coverage = new FeedCoverage();
        coverage.add('a', 1, 10);
        const heard: (readonly FeedRange[])[] = [];
        coverage.subscribe('a', covered => heard.push(covered));
        coverage.clear();
        expect(heard).toEqual([[]]);
    });

    it("keeps a later subscriber when an earlier one's unsubscribe is called twice", () => {
        const coverage = new FeedCoverage();
        const stop = coverage.subscribe('k', () => undefined);
        stop();
        const heard: (readonly FeedRange[])[] = [];
        coverage.subscribe('k', covered => heard.push(covered));
        stop();
        coverage.add('k', 1, 10);
        expect(heard).toEqual([[[1, 10]]]);
    });

    it('works out the uncovered parts from a held list of ranges, the same as the record does', () => {
        const covered: FeedRange[] = [
            [50, 99],
            [120, 150],
        ];
        expect(uncoveredIn(covered, 40, 160)).toEqual([
            [40, 49],
            [100, 119],
            [151, 160],
        ]);
        expect(uncoveredIn([], 5, 6)).toEqual([[5, 6]]);
        expect(uncoveredIn(covered, 9, 8)).toEqual([]);
    });

    it('ignores an empty or inverted range', () => {
        const coverage = new FeedCoverage();
        coverage.add('k', 20, 10);

        expect(coverage.uncovered('k', 10, 20)).toEqual([[10, 20]]);
        expect(coverage.uncovered('k', 20, 10)).toEqual([]);
    });
});
