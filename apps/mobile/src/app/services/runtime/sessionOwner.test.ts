import { SESSION_OWNER_KEY, readSessionOwner, writeSessionOwner } from './sessionOwner';

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

    it('reads back what writeSessionOwner recorded', () => {
        const file = fakeFile();
        writeSessionOwner(file, 'native');
        expect(readSessionOwner(file)).toBe('native');
    });
});
