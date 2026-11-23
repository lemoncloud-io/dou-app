import {
    DEFAULT_SESSION_OWNER_KEY,
    SESSION_OWNER_KEY,
    defaultSessionOwner,
    readDefaultSessionOwner,
    readSessionOwner,
    readSessionOwnerChoice,
    unswitchedSessionOwner,
    unswitchedSessionOwnerChoice,
    writeDefaultSessionOwner,
    writeSessionOwner,
} from './sessionOwner';

const fakeFile = (initial?: string, initialDefault?: string) => {
    const entries = new Map<string, string>(initial === undefined ? [] : [[SESSION_OWNER_KEY, initial]]);
    if (initialDefault !== undefined) entries.set(DEFAULT_SESSION_OWNER_KEY, initialDefault);
    return {
        entries,
        getString: (key: string) => entries.get(key),
        set: (key: string, value: string) => void entries.set(key, value),
        remove: (key: string) => entries.delete(key),
    };
};

describe('readSessionOwner', () => {
    it.each([
        [undefined, 'web'],
        ['web', 'web'],
        ['native', 'native'],
        ['Native', 'web'],
        ['shell', 'web'],
    ])('reads %p as %p', (stored, owner) => {
        expect(readSessionOwner(fakeFile(stored))).toBe(owner);
    });

    it.each([
        [undefined, 'native'],
        ['web', 'web'],
        ['native', 'native'],
        ['shell', 'native'],
    ])('with a native fallback reads %p as %p — a recorded choice stands', (stored, owner) => {
        expect(readSessionOwner(fakeFile(stored), 'native')).toBe(owner);
    });

    it('reads back what writeSessionOwner recorded', () => {
        const file = fakeFile();
        writeSessionOwner(file, 'native');
        expect(readSessionOwner(file)).toBe('native');
    });
});

describe('defaultSessionOwner', () => {
    it.each([
        ['DEV', 'native'],
        ['dev', 'native'],
        ['LOCAL', 'web'],
        ['PROD', 'native'],
        ['prod', 'native'],
        [undefined, 'web'],
        ['STAGING', 'web'],
    ])('stage %p starts an unswitched install on %p', (stage, owner) => {
        expect(defaultSessionOwner(stage)).toBe(owner);
    });

    it.each([
        ['DEV', 'web', 'web'],
        ['PROD', 'web', 'web'],
        ['LOCAL', 'native', 'native'],
        ['PROD', 'shell', 'native'],
        ['DEV', 'shell', 'native'],
        ['DEV', '', 'native'],
    ])('stage %p with the build override %p starts on %p', (stage, override, owner) => {
        expect(defaultSessionOwner(stage, override)).toBe(owner);
    });

    it.each([undefined, '', 'STAGING'])(
        'never starts an unrecognised stage %p on the runtime, override or not',
        stage => {
            expect(defaultSessionOwner(stage, 'native')).toBe('web');
        }
    );
});

describe('readDefaultSessionOwner', () => {
    it.each([
        [undefined, undefined],
        ['web', 'web'],
        ['native', 'native'],
        ['shell', undefined],
    ])("reads the page's default %p as %p", (stored, owner) => {
        expect(readDefaultSessionOwner(fakeFile(undefined, stored))).toBe(owner);
    });
});

describe('writeDefaultSessionOwner', () => {
    it("records the page's default beside the switch's choice, without touching it", () => {
        const file = fakeFile('web');

        writeDefaultSessionOwner(file, 'native');

        expect(file.entries.get(DEFAULT_SESSION_OWNER_KEY)).toBe('native');
        expect(file.entries.get(SESSION_OWNER_KEY)).toBe('web');
    });

    it("clears the page's default with null", () => {
        const file = fakeFile(undefined, 'native');

        writeDefaultSessionOwner(file, null);

        expect(file.entries.has(DEFAULT_SESSION_OWNER_KEY)).toBe(false);
    });
});

describe('unswitchedSessionOwner', () => {
    it.each([
        ['PROD', undefined, undefined, 'native'],
        ['PROD', undefined, 'web', 'web'],
        ['DEV', undefined, 'web', 'web'],
        ['LOCAL', undefined, 'native', 'native'],
        ['PROD', 'web', 'native', 'web'],
        ['DEV', 'web', 'native', 'web'],
        ['PROD', 'shell', 'web', 'web'],
        [undefined, undefined, 'native', 'web'],
        ['STAGING', 'native', 'native', 'web'],
    ] as const)('stage %p, pin %p, page default %p starts on %p', (stage, pin, pageDefault, owner) => {
        expect(unswitchedSessionOwner(stage, pin, pageDefault)).toBe(owner);
    });
});

describe('unswitchedSessionOwnerChoice', () => {
    it.each([
        ['PROD', 'web', 'native', 'web', 'build'],
        ['PROD', undefined, 'web', 'web', 'page'],
        ['PROD', 'shell', undefined, 'native', 'stage'],
        ['LOCAL', undefined, undefined, 'web', 'stage'],
        ['STAGING', 'native', 'native', 'web', 'stage'],
    ] as const)('stage %p, pin %p, page default %p is %p from %p', (stage, pin, pageDefault, owner, source) => {
        expect(unswitchedSessionOwnerChoice(stage, pin, pageDefault)).toEqual({ owner, source });
    });
});

describe('readSessionOwnerChoice', () => {
    const fallback = { owner: 'native', source: 'page' } as const;

    it("names the switch when a choice is recorded, over the fallback's row", () => {
        expect(readSessionOwnerChoice(fakeFile('web'), fallback)).toEqual({ owner: 'web', source: 'switch' });
    });

    it('answers the fallback, row and all, with no choice or one this build does not know', () => {
        expect(readSessionOwnerChoice(fakeFile(), fallback)).toBe(fallback);
        expect(readSessionOwnerChoice(fakeFile('shell'), fallback)).toBe(fallback);
    });
});
