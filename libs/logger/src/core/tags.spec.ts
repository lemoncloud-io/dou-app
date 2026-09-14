import { KNOWN_LOG_TAGS, isKnownLogTag, type LogTag } from './tags';

describe('KNOWN_LOG_TAGS — 카탈로그 태그 상수', () => {
    it('중복이 없다', () => {
        expect(new Set(KNOWN_LOG_TAGS).size).toBe(KNOWN_LOG_TAGS.length);
    });

    // 카탈로그가 명시적으로 금지한 이름들 — 각각 대체 태그가 있다.
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
    /**
     * 이 테스트의 값은 런타임이 아니라 **컴파일**에 있다. 닫힌 union이면 아래 두 번째 줄이 타입
     * 에러가 나고, 그건 ADR-0047이 일부러 걷어낸 상태로 되돌아간 것이다 — 웹보다 오래된 네이티브
     * 셸이 이 빌드가 모르는 태그를 보낼 수 있어야 한다.
     */
    it('카탈로그 밖의 태그도 여전히 유효한 LogTag다', () => {
        const known: LogTag = 'CACHE';
        const fromAnOlderShell: LogTag = 'SOME_TAG_THIS_BUILD_NEVER_HEARD_OF';

        expect(isKnownLogTag(known)).toBe(true);
        expect(isKnownLogTag(fromAnOlderShell)).toBe(false);
    });
});
