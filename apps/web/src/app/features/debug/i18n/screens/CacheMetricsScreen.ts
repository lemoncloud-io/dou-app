import { defineDebugStrings } from '../define';

const en = {
    title: 'Native Cache Metrics',
    reset: 'Reset',
    browserNotice:
        "The browser doesn't use native storage, so there's nothing to measure here. Check inside the app (WebView).",
    summary: (totalOps: number, grandTotalMs: number) =>
        `${totalOps.toLocaleString()} total calls · ${grandTotalMs.toLocaleString()}ms cumulative`,
    empty: 'No calls recorded yet.',
    columns: {
        operation: 'Operation',
        count: 'Count',
        avg: 'Avg',
        max: 'Max',
        total: 'Total',
    },
    footnote:
        "If a high-cumulative row has a low average but a high count, the culprit is an observer re-reading on every emit, not storage. If the average itself is high, it's storage.",
};

const ko: typeof en = {
    title: '네이티브 캐시 지표',
    reset: '초기화',
    browserNotice: '브라우저에서는 네이티브 저장소를 쓰지 않아 계측이 비어 있습니다. 앱(WebView)에서 확인하세요.',
    summary: (totalOps, grandTotalMs) => `총 ${totalOps.toLocaleString()}회 · 누적 ${grandTotalMs.toLocaleString()}ms`,
    empty: '아직 기록된 호출이 없습니다.',
    columns: {
        operation: '연산',
        count: '횟수',
        avg: '평균',
        max: '최대',
        total: '누적',
    },
    footnote:
        '누적이 큰 항목이 평균은 낮은데 횟수가 많다면, 범인은 저장소가 아니라 옵저버가 emit마다 다시 읽는 구조입니다. 평균 자체가 크다면 저장소 쪽입니다.',
};

export const useCacheMetricsStrings = defineDebugStrings({ ko, en });
