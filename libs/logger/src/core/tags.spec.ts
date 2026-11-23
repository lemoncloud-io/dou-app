import { KNOWN_LOG_TAGS, isKnownLogTag, type LogTag } from './tags';

describe('KNOWN_LOG_TAGS — 카탈로그 태그 상수', () => {
    it('중복이 없다', () => {
        expect(new Set(KNOWN_LOG_TAGS).size).toBe(KNOWN_LOG_TAGS.length);
    });

    it('카탈로그가 금지한 태그를 담지 않는다', () => {
        for (const forbidden of ['NETWORK', 'PUSH_QUEUE', 'PUSH', 'NAV']) {
            expect(KNOWN_LOG_TAGS).not.toContain(forbidden);
        }
    });

    it('태그는 대문자·숫자·밑줄만 쓴다', () => {
        for (const tag of KNOWN_LOG_TAGS) {
            expect(tag).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });
});

describe('isKnownLogTag', () => {
    it('카탈로그 태그를 알아본다', () => {
        expect(isKnownLogTag('SYNC')).toBe(true);
        expect(isKnownLogTag('PUSH_EVENT')).toBe(true);
    });

    it('카탈로그에 없는 태그는 거짓이다', () => {
        expect(isKnownLogTag('PUSH')).toBe(false);
        expect(isKnownLogTag('sync')).toBe(false);
        expect(isKnownLogTag('')).toBe(false);
    });
});

describe('LogTag — 열린 계약', () => {
    it('카탈로그 밖의 태그도 여전히 유효한 LogTag다', () => {
        const known: LogTag = 'CACHE';
        const fromAnOlderShell: LogTag = 'SOME_TAG_THIS_BUILD_NEVER_HEARD_OF';

        expect(isKnownLogTag(known)).toBe(true);
        expect(isKnownLogTag(fromAnOlderShell)).toBe(false);
    });
});
