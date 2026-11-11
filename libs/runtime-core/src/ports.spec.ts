import type { AllRequired, OptionalKeys, RuntimePorts } from './ports';
import type { AuthPlatformPorts } from '@chatic/auth';
import type { LocalCachePorts } from '@chatic/data';
import type { SessionStoragePorts } from '@chatic/session';
import type { TransportPlatformPorts } from '@chatic/transport';

/**
 * What this file checks is checked by the compiler, and the `typecheck` target is what runs it:
 * `tsc -b` builds this file, so a `@ts-expect-error` whose error has gone away, or an `isTrue<…>`
 * handed `false`, fails there. Jest transpiles each file on its own without type-checking, so the
 * `expect` calls below prove nothing by themselves — they give each check a name in the report.
 */
const storage = {} as SessionStoragePorts;
const transport = {} as TransportPlatformPorts;
const auth = {} as AuthPlatformPorts;
const cache = {} as LocalCachePorts;

const isTrue = <T extends true>(): T => true as T;
const isFalse = <T extends false>(): T => false as T;

describe('RuntimePorts', () => {
    it('accepts an object that fills every port', () => {
        const ports: RuntimePorts = { storage, transport, auth, cache };
        expect(Object.keys(ports)).toEqual(['storage', 'transport', 'auth', 'cache']);
    });

    it('refuses an object that leaves a port out', () => {
        // @ts-expect-error — `cache` is missing.
        const ports: RuntimePorts = { storage, transport, auth };
        expect(ports).toEqual({ storage, transport, auth });
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
