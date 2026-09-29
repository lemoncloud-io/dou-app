import { isValidPerfTraceName } from './limits';

describe('isValidPerfTraceName', () => {
    it('accepts any well-formed name, including one added after this build shipped', () => {
        expect(isValidPerfTraceName('chat_room_open')).toBe(true);
        expect(isValidPerfTraceName('added_later')).toBe(true);
    });

    it('rejects what Firebase would: a leading underscore, other characters, over 100 characters', () => {
        expect(isValidPerfTraceName('_app_start')).toBe(false);
        expect(isValidPerfTraceName('has space')).toBe(false);
        expect(isValidPerfTraceName('')).toBe(false);
        expect(isValidPerfTraceName('a'.repeat(101))).toBe(false);
    });
});
