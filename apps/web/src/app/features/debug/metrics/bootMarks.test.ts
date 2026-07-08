import { isFromCache, markBoot, getBootSnapshot, summarizeAssets } from './bootMarks';

describe('bootMarks — 부팅 타임라인 계측', () => {
    describe('isFromCache', () => {
        it('transferSize 0 + body 존재면 캐시 히트로 판정한다', () => {
            expect(isFromCache({ transferSize: 0, decodedBodySize: 1000, durationMs: 120 })).toBe(true);
        });

        it('transferSize 0이지만 body도 0이면 duration으로 보정한다 (30ms 미만 = 캐시)', () => {
            expect(isFromCache({ transferSize: 0, decodedBodySize: 0, durationMs: 10 })).toBe(true);
            expect(isFromCache({ transferSize: 0, decodedBodySize: 0, durationMs: 200 })).toBe(false);
        });

        it('transferSize가 있으면 네트워크 다운로드로 판정한다', () => {
            expect(isFromCache({ transferSize: 310_000, decodedBodySize: 1_050_000, durationMs: 800 })).toBe(false);
        });
    });

    describe('summarizeAssets', () => {
        it('/assets/ 번들만 추려 파일명·캐시 여부로 요약한다', () => {
            const result = summarizeAssets([
                {
                    name: 'https://dou.chatic.io/assets/index-abc.js',
                    transferSize: 310_000,
                    decodedBodySize: 1_000_000,
                    duration: 812.4,
                },
                {
                    name: 'https://dou.chatic.io/assets/vendor-react.js',
                    transferSize: 0,
                    decodedBodySize: 56_000,
                    duration: 3.2,
                },
                {
                    name: 'https://fonts.gstatic.com/font.woff2',
                    transferSize: 8_000,
                    decodedBodySize: 8_000,
                    duration: 40,
                },
            ]);
            expect(result).toEqual([
                {
                    name: 'index-abc.js',
                    transferSize: 310_000,
                    decodedBodySize: 1_000_000,
                    durationMs: 812,
                    fromCache: false,
                },
                { name: 'vendor-react.js', transferSize: 0, decodedBodySize: 56_000, durationMs: 3, fromCache: true },
            ]);
        });
    });

    describe('markBoot', () => {
        it('같은 키는 최초 1회만 기록한다', () => {
            const nowSpy = jest.spyOn(performance, 'now');
            nowSpy.mockReturnValue(100);
            markBoot('app-render');
            nowSpy.mockReturnValue(999);
            markBoot('app-render');
            expect(getBootSnapshot().marks['app-render']).toBe(100);
            nowSpy.mockRestore();
        });
    });
});
