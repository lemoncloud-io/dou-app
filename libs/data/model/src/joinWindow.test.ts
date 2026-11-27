import { isInJoinWindow } from './joinWindow';

describe('isInJoinWindow', () => {
    it('rows after joinedNo are visible', () => {
        expect(isInJoinWindow({ chatNo: 8 }, 7)).toBe(true);
    });

    it('rows before joinedNo are hidden', () => {
        expect(isInJoinWindow({ chatNo: 3 }, 7)).toBe(false);
    });

    it('boundary — a row equal to joinedNo is hidden (matching chatNo > joinedNo on the server)', () => {
        expect(isInJoinWindow({ chatNo: 7 }, 7)).toBe(false);
    });

    it('nothing is hidden when joinedNo is absent', () => {
        expect(isInJoinWindow({ chatNo: 3 }, undefined)).toBe(true);
    });

    it('nothing is hidden when joinedNo is 0 (an empty channel at first entry)', () => {
        expect(isInJoinWindow({ chatNo: 1 }, 0)).toBe(true);
    });

    it('an optimistic send row (chatNo: 0) stays visible however large joinedNo is', () => {
        expect(isInJoinWindow({ chatNo: 0 }, 999)).toBe(true);
    });

    it('a row with no chatNo is visible too', () => {
        expect(isInJoinWindow({}, 999)).toBe(true);
    });
});
