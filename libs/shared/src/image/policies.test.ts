import { AVATAR_IMAGE, CHAT_ATTACHMENT, INLINE_IMAGE, REPORT_PHOTO } from './policies';

// These assert intent, not arithmetic. A policy is a decision written as data, and what is worth
// pinning is the decision — that an avatar crops, that an attachment does not resize — so changing
// one is a deliberate edit to a failing test rather than a quiet drift.

describe('AVATAR_IMAGE', () => {
    it('base64로 나가고 정사각으로 자른다', () => {
        expect(AVATAR_IMAGE.avatar.as).toBe('dataUrl');
        expect(AVATAR_IMAGE.avatar.profile.fit).toBe('cover');
        expect(AVATAR_IMAGE.avatar.profile.maxEdge).toBe(150);
    });
});

describe('REPORT_PHOTO', () => {
    it('프레임을 자르지 않는다 — 스크린샷은 읽는 것이다', () => {
        expect(REPORT_PHOTO.photo.profile.fit).toBe('contain');
    });

    it('인라인 기본값과 같은 크기에 품질만 낮다', () => {
        // A report carries several at once, so the encoded total is the bound — and it is bought
        // with quality rather than pixels, because a screenshot has to stay readable.
        expect(REPORT_PHOTO.photo.profile.maxEdge).toBe(INLINE_IMAGE.image.profile.maxEdge);
        expect(REPORT_PHOTO.photo.profile.quality).toBeLessThan(INLINE_IMAGE.image.profile.quality);
    });
});

describe('CHAT_ATTACHMENT', () => {
    it('원본은 바이트로 나가고 프로필이 없다 — 그 부재가 결정이다', () => {
        expect(CHAT_ATTACHMENT.original.as).toBe('file');
        // No profile means the sender's own bytes go up, unresized.
        expect('profile' in CHAT_ATTACHMENT.original).toBe(false);
    });

    it('썸네일이 같이 나간다 — 목록이 원본을 받지 않게 하는 것이 이 정책의 절반이다', () => {
        expect(CHAT_ATTACHMENT.thumbnail.as).toBe('file');
        expect(CHAT_ATTACHMENT.thumbnail.profile.maxEdge).toBe(512);
    });

    it('썸네일 이름이 원본과 겹치지 않는다 — 한 업로드의 두 객체다', () => {
        expect(CHAT_ATTACHMENT.thumbnail.suffix).toBe('-thumb');
    });
});

describe('덮어쓰기', () => {
    it('일회성 변형은 펼쳐서 덮는다', () => {
        const smaller = {
            avatar: { ...AVATAR_IMAGE.avatar, profile: { ...AVATAR_IMAGE.avatar.profile, maxEdge: 64 } },
        };

        expect(smaller.avatar.profile.maxEdge).toBe(64);
        expect(smaller.avatar.profile.fit).toBe('cover');
        expect(AVATAR_IMAGE.avatar.profile.maxEdge).toBe(150);
    });
});
