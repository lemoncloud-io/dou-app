import { FeedCoverage, feedCoverageKey } from './feedCoverage';

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

    it('ignores an empty or inverted range', () => {
        const coverage = new FeedCoverage();
        coverage.add('k', 20, 10);

        expect(coverage.uncovered('k', 10, 20)).toEqual([[10, 20]]);
        expect(coverage.uncovered('k', 20, 10)).toEqual([]);
    });
});
