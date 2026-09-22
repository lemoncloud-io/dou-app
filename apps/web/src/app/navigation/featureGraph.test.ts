import { countGraphRun, isSiblingGraphEntry, readFeatureGraph } from './featureGraph';

describe('readFeatureGraph', () => {
    it.each([
        ['/channels/C1/room', 'channels', 'C1'],
        ['/channels/C1/settings', 'channels', 'C1'],
        ['/channels/C1/invite', 'channels', 'C1'],
        ['/channels/C1/invite/link', 'channels', 'C1'],
        ['/channels/C1/thread/42', 'channels', 'C1'],
        ['/place/P1', 'place', 'P1'],
        ['/place/P1/settings', 'place', 'P1'],
        ['/place/P1/settings/channels', 'place', 'P1'],
    ])('reads %s as %s:%s', (pathname, feature, instance) => {
        expect(readFeatureGraph(pathname)).toEqual({ feature, instance });
    });

    it.each([
        ['/'],
        ['/channels'],
        ['/mypage'],
        ['/mypage/settings/notifications'],
        ['/search'],
        ['/subscription'],
        ['/invite/accept'],
        // Shaped exactly like a graph and deliberately not one: a second invite must not delete
        // the first one's entry.
        ['/invite/INV1/waiting'],
    ])('gives %s no graph', pathname => {
        expect(readFeatureGraph(pathname)).toBeNull();
    });

    it('ignores the query and the fragment', () => {
        expect(readFeatureGraph('/channels/C1/room?chatNo=7#top')).toEqual({ feature: 'channels', instance: 'C1' });
    });

    it('reads an id containing a colon, which is the shape real channel ids take', () => {
        expect(readFeatureGraph('/channels/U:1001721/room')).toEqual({ feature: 'channels', instance: 'U:1001721' });
    });
});

describe('isSiblingGraphEntry', () => {
    it('is true for another channel — the case that buries the first channel under the second', () => {
        expect(isSiblingGraphEntry('/channels/A/settings', '/channels/B/room')).toBe(true);
    });

    it('is false within one channel, so forward movement inside a graph keeps stacking', () => {
        expect(isSiblingGraphEntry('/channels/A/room', '/channels/A/settings')).toBe(false);
    });

    it('is false across features, so a channel entered from mypage leaves mypage underneath', () => {
        expect(isSiblingGraphEntry('/mypage', '/channels/B/room')).toBe(false);
        expect(isSiblingGraphEntry('/place/P1/settings', '/channels/B/room')).toBe(false);
    });

    it('is false leaving a graph for a screen that has none', () => {
        expect(isSiblingGraphEntry('/channels/A/room', '/mypage')).toBe(false);
    });

    it('is true for another place, the second instance-scoped graph', () => {
        expect(isSiblingGraphEntry('/place/P1/settings/edit', '/place/P2')).toBe(true);
    });
});

describe('countGraphRun', () => {
    const channels = (instance: string) => ({ feature: 'channels', instance });

    it('counts the whole run of one channel at the top of the stack', () => {
        const stack = ['/', '/channels/A/room', '/channels/A/settings'];

        expect(countGraphRun(stack, 2, channels('A'))).toBe(3 - 1);
    });

    it('counts a single entry when the reader only opened the room', () => {
        expect(countGraphRun(['/', '/channels/A/room'], 1, channels('A'))).toBe(1);
    });

    it('stops at the first entry outside the graph', () => {
        const stack = ['/', '/mypage', '/channels/A/room', '/channels/A/settings'];

        expect(countGraphRun(stack, 3, channels('A'))).toBe(2);
    });

    it('stops at a different instance of the same feature', () => {
        const stack = ['/', '/channels/A/room', '/channels/B/room', '/channels/B/settings'];

        expect(countGraphRun(stack, 3, channels('B'))).toBe(2);
    });

    it('ignores the forward branch above the cursor, which the next push discards anyway', () => {
        const stack = ['/', '/channels/A/room', '/channels/A/settings', '/channels/A/invite'];

        expect(countGraphRun(stack, 1, channels('A'))).toBe(1);
    });

    it('stops at an unobserved entry rather than rewinding past something it cannot see', () => {
        const stack = [null, '/channels/A/room', '/channels/A/settings'];

        expect(countGraphRun(stack, 2, channels('A'))).toBe(2);
    });

    it('counts nothing when the current screen is not in the graph', () => {
        expect(countGraphRun(['/', '/mypage'], 1, channels('A'))).toBe(0);
    });

    it('counts nothing without a graph or without a cursor', () => {
        expect(countGraphRun(['/', '/channels/A/room'], 1, null)).toBe(0);
        expect(countGraphRun(['/', '/channels/A/room'], null, channels('A'))).toBe(0);
    });

    it('tolerates a cursor past the end of what was observed', () => {
        expect(countGraphRun(['/', '/channels/A/room'], 9, channels('A'))).toBe(1);
    });
});
