import { isInJoinWindow } from './joinWindow';

describe('isInJoinWindow', () => {
    it('joinedNo 이후의 행은 보인다', () => {
        expect(isInJoinWindow({ chatNo: 8 }, 7)).toBe(true);
    });

    it('joinedNo 이전의 행은 숨긴다', () => {
        expect(isInJoinWindow({ chatNo: 3 }, 7)).toBe(false);
    });

    it('경계값 — joinedNo와 같은 행은 숨긴다 (서버의 chatNo > joinedNo와 동일)', () => {
        expect(isInJoinWindow({ chatNo: 7 }, 7)).toBe(false);
    });

    it('joinedNo가 없으면 아무것도 숨기지 않는다', () => {
        expect(isInJoinWindow({ chatNo: 3 }, undefined)).toBe(true);
    });

    it('joinedNo가 0이면 (최초 입장 시점의 빈 채널) 아무것도 숨기지 않는다', () => {
        expect(isInJoinWindow({ chatNo: 1 }, 0)).toBe(true);
    });

    it('낙관적 전송 행(chatNo: 0)은 joinedNo가 아무리 커도 보인다', () => {
        expect(isInJoinWindow({ chatNo: 0 }, 999)).toBe(true);
    });

    it('chatNo가 없는 행도 보인다', () => {
        expect(isInJoinWindow({}, 999)).toBe(true);
    });
});
