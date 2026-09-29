import { defineDebugStrings } from '../define';

/**
 * `INP`/`CLS` stay out of this table — they're standardized Web Vitals metric codes, identical in
 * both languages, and are written inline in `PerfScreen.tsx` next to their values.
 */
const en = {
    copyMetrics: 'Copy metrics',
    syncTargets: {
        title: (count: number) => `Sync Targets (${count})`,
        empty: 'No sync targets registered',
        current: '(current)',
    },
    throughput: {
        title: 'Throughput / Latency',
        chatMsgsTotal: 'chat msgs total',
        chatMsgsPerSec: 'chat msgs/s (10s)',
        lastLatency: 'last latency',
        avgLatency: 'avg latency',
    },
    cache: {
        title: 'Cache observations',
        empty: 'No changes observed',
    },
    renders: {
        title: 'Renders',
        empty: 'No render reports',
    },
    connection: {
        title: 'Connection quality',
        state: 'state',
        connects: 'connects',
        disconnects: 'disconnects',
        inStateFor: 'in state for',
    },
    longTasks: {
        title: 'Main thread (long tasks >50ms)',
        count: 'count',
        totalBlocked: 'total blocked',
        maxTask: 'max task',
        unsupported: "This engine doesn't support the Long Tasks API",
    },
    responsiveness: {
        title: 'Responsiveness / Memory',
        jsHeap: 'JS heap',
        jsHeapUnsupported: 'n/a (WKWebView)',
    },
};

const ko: typeof en = {
    copyMetrics: '지표 복사',
    syncTargets: {
        title: (count: number) => `동기화 대상 (${count})`,
        empty: '등록된 sync 타깃이 없습니다',
        current: '(현재)',
    },
    throughput: {
        title: '처리량 / 지연',
        chatMsgsTotal: '채팅 메시지 총계',
        chatMsgsPerSec: '채팅 메시지/초 (10초)',
        lastLatency: '최근 지연',
        avgLatency: '평균 지연',
    },
    cache: {
        title: '캐시 관측',
        empty: '관측된 변화가 없습니다',
    },
    renders: {
        title: '렌더',
        empty: '렌더 보고가 없습니다',
    },
    connection: {
        title: '연결 품질',
        state: '상태',
        connects: '연결 횟수',
        disconnects: '끊김 횟수',
        inStateFor: '유지 시간',
    },
    longTasks: {
        title: '메인 스레드 (50ms 초과 롱태스크)',
        count: '건수',
        totalBlocked: '총 지연',
        maxTask: '최대 작업',
        unsupported: '이 엔진은 Long Tasks API를 지원하지 않습니다',
    },
    responsiveness: {
        title: '응답성 / 메모리',
        jsHeap: 'JS 힙',
        jsHeapUnsupported: 'n/a (WKWebView)',
    },
};

export const usePerfScreenStrings = defineDebugStrings({ ko, en });
