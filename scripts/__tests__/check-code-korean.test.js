const { checkFile } = require('../check-code-korean');

// The source is stated inline; the filename only matters for the extension glob when scanning.
const check = (source, file = 'apps/web/src/example.ts') => checkFile(file, source);

describe('check-code-korean', () => {
    it('accepts a file with no comments at all', () => {
        expect(check('const label = "구독하기";\nexport const x = 1;')).toEqual([]);
    });

    it('accepts an English line comment', () => {
        expect(check('// Retry once before giving up.\nconst x = 1;')).toEqual([]);
    });

    it('reports a bare Korean line comment', () => {
        const [problem] = check('// 이 값은 절대 null이 될 수 없다.\nconst x = 1;');
        expect(problem).toContain('Korean comment');
        expect(problem).toContain('line 1');
    });

    it('reports Korean mixed into an otherwise English line comment', () => {
        const [problem] = check('// The bridge owns 세션 상태 and nothing else.');
        expect(problem).toContain('Korean comment');
    });

    it('reports Korean inside a block comment, on the correct line', () => {
        const [problem] = check('/**\n * 이 함수는 세션을 갱신한다.\n */\nconst x = 1;');
        expect(problem).toContain('line 2');
    });

    it('accepts a double-quoted UI-copy citation inside a comment', () => {
        expect(check('// the label reads "두유 홈" in Korean and "DoU Home" in English.')).toEqual([]);
    });

    it('accepts a code-span citation inside a comment', () => {
        expect(check('// see `나와의 채팅` — the i18n key, not prose.')).toEqual([]);
    });

    it('accepts a code-span citation wrapped across lines inside a block comment', () => {
        const src = '/**\n * message (`등록된 핸들러를\n * 찾을 수 없습니다`) is quoted, not prose.\n */';
        expect(check(src)).toEqual([]);
    });

    it('accepts a short single-quoted Korean term', () => {
        expect(check("// Korean grammar picks '이' or '가' by the name's final sound.")).toEqual([]);
    });

    it('never inspects a string literal — Korean UI copy stays untouched', () => {
        expect(check('const label = "구독하기";')).toEqual([]);
        expect(check("describe('로그인 실패', () => {});")).toEqual([]);
    });

    it('never inspects a template literal, including one containing // or /*', () => {
        expect(check('const url = `http://example.com/가-힣`;\nconst note = `/* not a comment */`;')).toEqual([]);
    });

    it('does not mistake // inside a string for a comment opener', () => {
        const src = 'const url = "http://example.com"; // 실제 주석\nconst y = 1;';
        const [problem] = check(src);
        expect(problem).toContain('line 1');
    });

    it('does not mistake /* inside a string for a comment opener', () => {
        expect(check('const note = "설명은 /* 여기 */ 안에 있다";')).toEqual([]);
    });

    it('handles an escaped quote inside a string without ending it early', () => {
        const src = 'const s = "a \\" b"; // 진짜 주석\nconst t = 1;';
        const [problem] = check(src);
        expect(problem).toContain('line 1');
    });

    it('reports the correct line number after a multi-line block comment', () => {
        const src = 'const a = 1;\n/*\n한글 줄\n*/\nconst b = 2;\n// 다음 줄은 진짜 위반이다\nconst c = 3;';
        const problems = check(src);
        expect(problems).toHaveLength(2);
        expect(problems[0]).toContain('line 3');
        expect(problems[1]).toContain('line 6');
    });

    it('accepts a Kotlin-style line comment in a .kt file', () => {
        expect(check('// Retry once before giving up.', 'apps/mobile/android/App.kt')).toEqual([]);
    });

    it('reports Korean in a Kotlin block comment', () => {
        const [problem] = check('/* 이 값은 문자열이다 */', 'apps/mobile/android/App.kt');
        expect(problem).toContain('Korean comment');
    });
});
