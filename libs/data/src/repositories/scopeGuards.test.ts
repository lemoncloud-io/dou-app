import { isCidActive, isForeignContext } from './scopeGuards';

// This replaces six inlined sites with a function, so the table that preserves each site's skip/pass
// cases one-to-one is pinned first (the design doc's §how to verify — the negation flip at
// ChannelRepository:326 especially).
describe('isForeignContext', () => {
    it.each`
        cid          | socketCid    | expected | why
        ${'c1'}      | ${'c1'}      | ${false} | ${'same cloud — the normal case'}
        ${'c2'}      | ${'c1'}      | ${true}  | ${'optimistic switch window — cid already flipped, socket still on the old cloud'}
        ${'c1'}      | ${undefined} | ${false} | ${'with no bound socket there is nothing to mismatch (boot)'}
        ${undefined} | ${'default'} | ${false} | ${'an absent cid is the default partition itself'}
        ${undefined} | ${'c1'}      | ${true}  | ${'default scope while the socket is bound to a cloud'}
        ${'default'} | ${'default'} | ${false} | ${'explicit default on both sides'}
        ${'default'} | ${'c1'}      | ${true}  | ${'relay scope while the socket is on a cloud'}
    `('cid=$cid socketCid=$socketCid → $expected ($why)', ({ cid, socketCid, expected }) => {
        expect(isForeignContext({ cid, socketCid })).toBe(expected);
    });

    it('matches the negation flip in ChannelRepository.getSelfChannel — the write condition is !isForeignContext', () => {
        // Original: cache-write when `socketCid == null || (cid || 'default') === socketCid`
        const shouldWrite = (cid?: string, socketCid?: string) => !isForeignContext({ cid, socketCid });

        expect(shouldWrite('c1', 'c1')).toBe(true);
        expect(shouldWrite('c1', undefined)).toBe(true);
        expect(shouldWrite('c2', 'c1')).toBe(false);
    });
});

describe('isCidActive', () => {
    it.each`
        targetCid | boundCid | expected | why
        ${null}   | ${'c1'}  | ${true}  | ${'work outside a cloud scope is always valid'}
        ${null}   | ${null}  | ${true}  | ${'the same with no binding'}
        ${'c1'}   | ${'c1'}  | ${true}  | ${'target and binding match'}
        ${'c1'}   | ${'c2'}  | ${false} | ${'bound to a different cloud'}
        ${'c1'}   | ${null}  | ${false} | ${'with no binding, cloud-targeted work is not valid'}
    `('target=$targetCid bound=$boundCid → $expected ($why)', ({ targetCid, boundCid, expected }) => {
        expect(isCidActive(targetCid, boundCid)).toBe(expected);
    });
});
