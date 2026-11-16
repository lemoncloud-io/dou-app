import { SESSION_OWNER_KEY, defaultSessionOwner, readSessionOwner, writeSessionOwner } from './sessionOwner';

const fakeFile = (initial?: string) => {
    const entries = new Map<string, string>(initial === undefined ? [] : [[SESSION_OWNER_KEY, initial]]);
    return {
        getString: (key: string) => entries.get(key),
        set: (key: string, value: string) => void entries.set(key, value),
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
        ['PROD', 'web'],
        // An env file that failed to load, or a stage this build does not know, counts as production.
        [undefined, 'web'],
        ['STAGING', 'web'],
    ])('stage %p starts an unswitched install on %p', (stage, owner) => {
        expect(defaultSessionOwner(stage)).toBe(owner);
    });

    it.each([
        ['DEV', 'web', 'web'],
        ['LOCAL', 'native', 'native'],
        ['DEV', 'shell', 'native'],
        ['DEV', '', 'native'],
    ])('stage %p with the build override %p starts on %p', (stage, override, owner) => {
        expect(defaultSessionOwner(stage, override)).toBe(owner);
    });

    it.each(['PROD', undefined, 'STAGING'])(
        'never starts a production stage %p on the runtime, override or not',
        stage => {
            expect(defaultSessionOwner(stage, 'native')).toBe('web');
        }
    );
});
