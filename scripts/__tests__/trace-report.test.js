const { parseReport, missingLocally } = require('../trace-report');

describe('trace-report', () => {
    describe('parseReport', () => {
        it('admin 이 붙인 헤더를 읽고 스택만 남긴다', () => {
            const input = [
                '# chatic-report id=42 app=mobile webVersion=0.36.0 at=2026-08-11T07:12:33.000Z',
                'a@https://x/index-abc.js:1:9',
                'b@https://x/index-abc.js:2:3',
            ].join('\n');

            expect(parseReport(input)).toEqual({
                meta: { id: '42', app: 'mobile', webVersion: '0.36.0', at: '2026-08-11T07:12:33.000Z' },
                stack: 'a@https://x/index-abc.js:1:9\nb@https://x/index-abc.js:2:3',
            });
        });

        it('헤더 없이 스택만 붙여넣어도 동작한다', () => {
            const { meta, stack } = parseReport('  a@https://x/index-abc.js:1:9  ');

            expect(meta).toEqual({});
            expect(stack).toBe('a@https://x/index-abc.js:1:9');
        });

        it('헤더가 일부 필드만 담고 있어도 그것만 읽는다', () => {
            expect(parseReport('# chatic-report app=web\nx@https://x/index-abc.js:1:9').meta).toEqual({ app: 'web' });
        });
    });

    describe('missingLocally', () => {
        it('체크아웃에 없는 파일만 골라낸다 — 이 리포에 있는 경로는 빼고', () => {
            const resolved = [
                'a (scripts/trace-report.js:1:0)',
                'b (apps/web/src/does-not-exist-here.ts:1:0)',
                'c (libs/nope/also-missing.ts:2:0)',
            ].join('\n');

            // scripts/ 는 apps|libs 접두어가 아니라 애초에 대상이 아니다.
            expect(missingLocally(resolved)).toEqual([
                'apps/web/src/does-not-exist-here.ts',
                'libs/nope/also-missing.ts',
            ]);
        });

        it('실제 있는 파일은 보고하지 않는다', () => {
            expect(missingLocally('a (libs/web-core/docs/error-reporting.md:1:0)')).toEqual([]);
        });

        it('node_modules 프레임은 클릭 대상이 아니라 대상에서 뺀다', () => {
            expect(missingLocally('a (node_modules/no-such-pkg/index.js:1:0)')).toEqual([]);
        });
    });
});
