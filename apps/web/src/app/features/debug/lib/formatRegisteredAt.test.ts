import { formatRegisteredAt } from './formatRegisteredAt';

describe('formatRegisteredAt', () => {
    it('값이 없거나 0이면 플레이스홀더를 반환한다', () => {
        expect(formatRegisteredAt()).toBe('-');
        expect(formatRegisteredAt(0)).toBe('-');
        expect(formatRegisteredAt(null)).toBe('-');
    });

    it('초 단위(10자리 미만)는 ms로 스케일해 ms 단위와 동일한 시각을 준다', () => {
        expect(formatRegisteredAt(1_700_000_000)).toBe(formatRegisteredAt(1_700_000_000_000));
    });

    it('ms 단위는 그대로 해석한다', () => {
        expect(formatRegisteredAt(1_700_000_000_000)).toBe(new Date(1_700_000_000_000).toLocaleString());
    });
});
