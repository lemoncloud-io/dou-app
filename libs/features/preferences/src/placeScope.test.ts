import { isPlaceScopeKey, placeScopeKey } from './placeScope';

describe('placeScopeKey', () => {
    it('클라우드와 플레이스가 모두 있으면 cid:sid 형태로 합친다', () => {
        expect(placeScopeKey('cloud-1', 'place-1')).toBe('cloud-1:place-1');
    });

    it('한쪽이라도 없으면 null — 반쪽짜리 키는 쓰지 않는다', () => {
        expect(placeScopeKey('cloud-1', null)).toBeNull();
        expect(placeScopeKey(null, 'place-1')).toBeNull();
        expect(placeScopeKey(undefined, undefined)).toBeNull();
    });
});

describe('isPlaceScopeKey', () => {
    it('구분자가 있어야 클라우드 절반을 가진 키로 인정한다', () => {
        expect(isPlaceScopeKey('cloud-1:place-1')).toBe(true);
        expect(isPlaceScopeKey('place-1')).toBe(false);
    });
});
