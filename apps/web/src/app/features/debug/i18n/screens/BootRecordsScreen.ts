import { defineDebugStrings } from '../define';

const en = {
    refresh: 'Refresh',
    clear: 'Clear',
    copyJson: 'Copy JSON',
    // Fixes the "1 rows" plural bug the English sweep left behind.
    rowCount: (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`,
    // Operation labels passed to `run()` — they end up in the shared result line above the list.
    loadOperation: 'Boot records',
    clearOperation: 'Clear records',
    currentRun: {
        title: 'Current app run',
        webViewKills: 'WebView process kills',
        lastResume: 'Last foreground resume',
    },
    noRecords: 'No records — restart the app once to get some',
    totalBoot: 'Total boot',
    webSnapshot: {
        label: 'Web snapshot',
        none: 'None (timed out)',
        mainStart: 'web main start',
        appRender: 'web app render',
        sessionInit: 'web session init',
    },
    /** Native milestones, in the order the boot happened — see `NATIVE_MARK_KEYS`. */
    nativeMarks: {
        providerReady: 'provider ready',
        appMount: 'app mount',
        mainScreenMount: 'main screen mount',
        loadStart: 'WebView load start',
        loadEnd: 'WebView load end',
        webAppReady: 'web app ready',
    },
};

const ko: typeof en = {
    refresh: '새로고침',
    clear: '초기화',
    copyJson: 'JSON 복사',
    rowCount: (count: number) => `${count}건`,
    loadOperation: '부팅 기록',
    clearOperation: '기록 초기화',
    currentRun: {
        title: '현재 앱 실행',
        webViewKills: 'WebView 프로세스 종료',
        lastResume: '마지막 포그라운드 복귀',
    },
    noRecords: '기록이 없습니다 — 앱을 한 번 재시작하면 남습니다',
    totalBoot: '총 부팅',
    webSnapshot: {
        label: '웹 스냅샷',
        none: '없음 (타임아웃)',
        mainStart: '웹 main 시작',
        appRender: '웹 앱 렌더',
        sessionInit: '웹 세션 초기화',
    },
    nativeMarks: {
        providerReady: '프로바이더 준비',
        appMount: '앱 마운트',
        mainScreenMount: '메인 화면 마운트',
        loadStart: 'WebView 로드 시작',
        loadEnd: 'WebView 로드 종료',
        webAppReady: '웹 앱 준비',
    },
};

export const useBootRecordsScreenStrings = defineDebugStrings({ ko, en });
