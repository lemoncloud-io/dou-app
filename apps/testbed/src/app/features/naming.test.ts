import { describe, expect, it } from 'vitest';

import { normalizeName } from './naming';

describe('normalizeName', () => {
    it('앞뒤 공백을 제거한 값을 반환한다', () => {
        expect(normalizeName('  앨리스  ')).toBe('앨리스');
    });

    it('공백뿐이거나 빈 문자열이면 null을 반환한다', () => {
        expect(normalizeName('   ')).toBeNull();
        expect(normalizeName('')).toBeNull();
    });

    it('minLength 미만이면 null을 반환한다 (클라우드 이름은 2자 이상)', () => {
        expect(normalizeName('a', 2)).toBeNull();
        expect(normalizeName(' ab ', 2)).toBe('ab');
    });
});
