import { encodeTypeFor, isUploadableType, renameForType, THUMBNAIL_SUFFIX, toUploadFile } from './package';

describe('encodeTypeFor — 나가는 형식', () => {
    it('투명도를 가진 형식은 자기 자신으로 남는다', () => {
        expect(encodeTypeFor('image/png')).toBe('image/png');
        expect(encodeTypeFor('image/webp')).toBe('image/webp');
    });

    it('그 외는 전부 jpeg다 — 모든 대상이 쓸 수 있는 유일한 형식이다', () => {
        expect(encodeTypeFor('image/jpeg')).toBe('image/jpeg');
        expect(encodeTypeFor('image/heic')).toBe('image/jpeg');
        expect(encodeTypeFor('image/heif')).toBe('image/jpeg');
        // A browser that hands over an empty type still has to land somewhere valid.
        expect(encodeTypeFor('')).toBe('image/jpeg');
    });
});

describe('isUploadableType — 서버가 받는 넷', () => {
    it('넷은 통과한다', () => {
        ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].forEach(t => expect(isUploadableType(t)).toBe(true));
    });

    it('HEIC와 image/jpg는 통과하지 못한다', () => {
        expect(isUploadableType('image/heic')).toBe(false);
        // iOS's picker emits exactly this, and the endpoint answers 415 — the alias is not resolved
        // anywhere, so it must not read as uploadable.
        expect(isUploadableType('image/jpg')).toBe(false);
    });
});

describe('renameForType — 이름이 바이트를 따라간다', () => {
    it('확장자를 바꾼다', () => {
        expect(renameForType('IMG_0001.heic', 'image/jpeg')).toBe('IMG_0001.jpg');
    });

    it('확장자가 없으면 붙인다', () => {
        expect(renameForType('scan', 'image/jpeg')).toBe('scan.jpg');
    });

    it('점이 여러 개면 마지막 것만 바꾼다', () => {
        expect(renameForType('2026.09.22 photo.heic', 'image/jpeg')).toBe('2026.09.22 photo.jpg');
    });

    it('이름이 점으로만 되어 있으면 통째로 살린다', () => {
        // `.gitkeep`-shaped names would otherwise become an empty base.
        expect(renameForType('.hidden', 'image/jpeg')).toBe('.hidden.jpg');
    });

    it('접미사가 파생본을 구분한다', () => {
        expect(renameForType('photo.jpg', 'image/jpeg', THUMBNAIL_SUFFIX)).toBe('photo-thumb.jpg');
    });
});

describe('toUploadFile — 선언이 바이트와 맞는다', () => {
    const source = new File(['x'], 'IMG_0001.heic', { type: 'image/heic', lastModified: 1_700_000_000_000 });

    it('type과 이름이 같이 바뀐다', () => {
        const out = toUploadFile(new Blob(['y']), source, 'image/jpeg');

        // Both values are declared to the upload endpoint and signed, so they have to move together.
        expect(out.type).toBe('image/jpeg');
        expect(out.name).toBe('IMG_0001.jpg');
    });

    it('원본의 시각을 물려받는다', () => {
        expect(toUploadFile(new Blob(['y']), source, 'image/jpeg').lastModified).toBe(1_700_000_000_000);
    });

    it('썸네일은 원본과 이름이 겹치지 않는다', () => {
        const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

        const thumb = toUploadFile(new Blob(['y']), jpeg, 'image/jpeg', THUMBNAIL_SUFFIX);

        expect(thumb.name).not.toBe(jpeg.name);
    });
});
