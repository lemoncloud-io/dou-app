import { customJoinNick, isRawIdNick, isServerSeededNick } from './nick';

describe('isRawIdNick', () => {
    it('rejects a nick that is my own id', () => {
        expect(isRawIdNick('1001708', '1001708')).toBe(true);
        expect(isRawIdNick('1001708', '1001709')).toBe(false);
    });

    it('rejects a UUID-shaped nick', () => {
        expect(isRawIdNick('fc15f271-31b4-4043-9edf-8ec7bbbdab2b')).toBe(true);
    });

    it('does not reject a generated account name', () => {
        expect(isRawIdNick('User_0101')).toBe(false);
    });
});

describe('isServerSeededNick', () => {
    it.each(['User_0101', 'user_1234', 'USER-9876', '***0101', '****1234'])('rejects %p', nick => {
        expect(isServerSeededNick(nick)).toBe(true);
    });

    it('still rejects what isRawIdNick rejects', () => {
        expect(isServerSeededNick('1001708', '1001708')).toBe(true);
        expect(isServerSeededNick('fc15f271-31b4-4043-9edf-8ec7bbbdab2b')).toBe(true);
    });

    it.each(['BOB-FRIENDNAME', 'User Research', 'Userboard', '사용자', 'user'])('keeps %p', nick => {
        expect(isServerSeededNick(nick)).toBe(false);
    });
});

describe('customJoinNick', () => {
    it('keeps a name a person chose', () => {
        expect(customJoinNick('  BOB-FRIENDNAME  ')).toBe('BOB-FRIENDNAME');
    });

    it('drops a server-seeded account name so the chain can fall through to the profile', () => {
        expect(customJoinNick('User_0101')).toBeUndefined();
    });

    it('drops empty and whitespace-only values', () => {
        expect(customJoinNick('   ')).toBeUndefined();
        expect(customJoinNick(undefined)).toBeUndefined();
        expect(customJoinNick(null)).toBeUndefined();
    });
});
