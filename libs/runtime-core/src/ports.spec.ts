import type { AllRequired, OptionalKeys, RuntimePorts } from './ports';
import type { SessionStoragePorts } from '@chatic/session';

/**
 * What this file checks is checked by the compiler, and the `typecheck` target is what runs it:
 * `tsc -b` builds this file, so a `@ts-expect-error` whose error has gone away, or an `isTrue<…>`
 * handed `false`, fails there. Jest transpiles each file on its own without type-checking, so the
 * `expect` calls below prove nothing by themselves — they give each check a name in the report.
 */
const storage = {} as SessionStoragePorts;

const isTrue = <T extends true>(): T => true as T;
const isFalse = <T extends false>(): T => false as T;

describe('RuntimePorts', () => {
    it('accepts an object that fills every port', () => {
        const ports: RuntimePorts = { storage };
        expect(Object.keys(ports)).toEqual(['storage']);
    });

    it('refuses an object that leaves a port out', () => {
        // @ts-expect-error — `storage` is missing.
        const ports: RuntimePorts = {};
        expect(ports).toEqual({});
    });

    it('declares no optional port', () => {
        expect(isTrue<AllRequired<RuntimePorts>>()).toBe(true);
    });
});

describe('AllRequired', () => {
    it('is false for a type with an optional field, and names that field', () => {
        interface WithOptional {
            always: string;
            sometimes?: string;
        }
        const optional: OptionalKeys<WithOptional> = 'sometimes';

        expect(isFalse<AllRequired<WithOptional>>()).toBe(false);
        expect(optional).toBe('sometimes');
    });

    it('is true for a required field that may hold undefined', () => {
        // Being allowed to hold `undefined` is not being allowed to be left out.
        expect(isTrue<AllRequired<{ value: string | undefined }>>()).toBe(true);
    });

    it('is false where true is asked for', () => {
        // @ts-expect-error — a type with an optional field is not all-required.
        expect(isTrue<AllRequired<{ sometimes?: string }>>()).toBe(true);
    });
});
