const { checkFile } = require('../check-doc-korean');

// The document is stated inline; the filename only matters for the CHANGELOG.md exemption.
const check = (source, file = 'docs/example.md') => checkFile(file, source);

describe('check-doc-korean', () => {
    it('accepts plain English prose', () => {
        expect(check('This document describes the bridge contract in plain English.')).toEqual([]);
    });

    it('reports a bare Korean sentence', () => {
        const [problem] = check('이 문서는 한글로 작성되었습니다.');
        expect(problem).toContain('Korean prose');
    });

    it('reports Korean mixed into an otherwise English sentence', () => {
        const [problem] = check('The bridge owns 세션 상태 and nothing else.');
        expect(problem).toContain('Korean prose');
    });

    it('accepts a double-quoted UI-copy citation', () => {
        expect(check('`channelList.selfChannel`: ko `나와의 채팅` stays, en `My Chat` → `Self Chat`.')).toEqual([]);
        expect(check('the label reads "두유 홈" in Korean and "DoU Home" in English.')).toEqual([]);
    });

    it('accepts a short single-quoted Korean term', () => {
        expect(check("Korean grammar picks '이' or '가' by the name's final sound.")).toEqual([]);
    });

    it('does not let an English contraction pair mask real Korean text between two apostrophes', () => {
        const [problem] = check("Don't ship 이건 안 돼 without review, that's the rule.");
        expect(problem).toContain('Korean prose');
    });

    it('ignores Korean inside a fenced code block', () => {
        expect(check('```md\n이것은 예시 코드 블록입니다\n```')).toEqual([]);
    });

    it('ignores Korean inside an inline code span, including one wrapped across lines', () => {
        expect(check('see `첫 줄\n둘째 줄` for the example')).toEqual([]);
    });

    it('reports the correct line number after a multi-line exempt span', () => {
        const [problem] = check('line one\n`Korean 안 됨\nspans two lines`\n다음 줄은 진짜 위반이다');
        expect(problem).toContain('line 4');
    });

    it('is exempt entirely for CHANGELOG.md', () => {
        expect(check('이 릴리스는 전부 한글로 적혀 있다', 'CHANGELOG.md')).toEqual([]);
    });
});
