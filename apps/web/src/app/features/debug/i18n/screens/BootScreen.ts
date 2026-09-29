import { defineDebugStrings } from '../define';

/**
 * `TTFB`/`DOMContentLoaded`/`FCP`/`LCP` stay out of this table and inline in `BootScreen.tsx` — they
 * are the literal Navigation Timing / Web Vitals names, identical in both languages.
 */
const en = {
    copyBoot: 'Copy boot',
    navigation: {
        title: 'Navigation (HTML)',
        responseEnd: 'response end',
        load: 'load',
    },
    milestones: {
        title: 'App milestones',
        mainStart: 'main.tsx start',
        appRender: 'app render',
        sessionInit: 'session init (router)',
    },
    paint: {
        title: 'Paint',
        ttfbVitals: 'TTFB (vitals)',
    },
    assets: {
        title: (cached: number, total: number, downloaded: string) =>
            `Assets (${cached}/${total} cached · ${downloaded} downloaded)`,
        empty: 'No /assets/ resource entries',
        cached: (durationMs: number) => `cache · ${durationMs} ms`,
        downloaded: (size: string, durationMs: number) => `${size} · ${durationMs} ms`,
    },
};

const ko: typeof en = {
    copyBoot: '부팅 복사',
    navigation: {
        title: '네비게이션 (HTML)',
        responseEnd: '응답 종료',
        load: '로드',
    },
    milestones: {
        title: '앱 마일스톤',
        mainStart: 'main.tsx 시작',
        appRender: '앱 렌더',
        sessionInit: '세션 초기화 (라우터)',
    },
    paint: {
        title: '페인트',
        ttfbVitals: 'TTFB (vitals)',
    },
    assets: {
        title: (cached: number, total: number, downloaded: string) =>
            `에셋 (${cached}/${total} 캐시됨 · ${downloaded} 다운로드)`,
        empty: '/assets/ 리소스 엔트리가 없습니다',
        cached: (durationMs: number) => `캐시 · ${durationMs} ms`,
        downloaded: (size: string, durationMs: number) => `${size} · ${durationMs} ms`,
    },
};

export const useBootScreenStrings = defineDebugStrings({ ko, en });
