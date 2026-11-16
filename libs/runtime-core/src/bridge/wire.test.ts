import type { CheckedCrossing, NotOnTheWire, PromiseCrossing } from './wire';

// These are checks on types: each assignment compiles only when the type works out as the test says,
// and a test file that does not compile fails. The runtime assertion only makes the case visible.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Brand = string & { readonly __brand: 'cloud-id' };

describe('NotOnTheWire', () => {
    it('finds nothing in plain JSON, a date, a branded string or any', () => {
        const plain: Same<
            NotOnTheWire<{ id: Brand; at: Date; list: { n: number | null }[]; raw: any; flag?: boolean }>,
            never
        > = true;
        expect(plain).toBe(true);
    });

    it('names each part JSON cannot carry, by its path', () => {
        const named: Same<
            NotOnTheWire<{ delivered: Promise<void>; rows: { onTap: () => void }[]; seen: Set<string> }>,
            'delivered: a promise' | 'rows: onTap: a function' | 'seen: a Map or Set'
        > = true;
        expect(named).toBe(true);
    });
});

describe('PromiseCrossing', () => {
    it('reads a write receipt as a receipt, and plain JSON, null included, as a call', () => {
        const receipt: Same<PromiseCrossing<{ delivered: Promise<void> }>, 'receipt'> = true;
        const call: Same<PromiseCrossing<{ id: string } | null>, 'call'> = true;
        expect([receipt, call]).toEqual([true, true]);
    });

    it('judges a nullable result whole, so a part that does not cross is not hidden by the null', () => {
        const nullable: Same<
            PromiseCrossing<{ onTap: () => void } | null>,
            'result does not cross the bridge — onTap: a function'
        > = true;
        // A receipt that may be null is no receipt: in-process the caller gets null, the mirror an object.
        const maybeReceipt: Same<
            PromiseCrossing<{ delivered: Promise<void> } | null>,
            'result does not cross the bridge — delivered: a promise'
        > = true;
        expect([nullable, maybeReceipt]).toEqual([true, true]);
    });
});

describe('CheckedCrossing', () => {
    it('lets a member whose result crosses be listed as a call', () => {
        const crosses: Same<CheckedCrossing<() => Promise<{ id: string }>, 'call' | 'local'>, 'call' | 'local'> = true;
        expect(crosses).toBe(true);
    });

    it('takes the call away from one whose result does not, and says why', () => {
        const refused: Same<
            CheckedCrossing<() => Promise<{ delivered: Promise<void> }>, 'call' | 'local'>,
            'local' | 'result does not cross the bridge — delivered: a promise'
        > = true;
        expect(refused).toBe(true);
    });
});
