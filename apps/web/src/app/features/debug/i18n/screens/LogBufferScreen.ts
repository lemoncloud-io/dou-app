import { defineDebugStrings } from '../define';

/**
 * `TTFB`/`FCP`/`LCP`-style Web Vitals codes aren't here — those are standardized abbreviations,
 * identical in both languages, and this screen has none of its own anyway. Log `level` values
 * (`debug`/`info`/`warn`/`error`) and log `tag`s also stay inline in the component: they are the
 * literal values the app itself logs with, not panel copy.
 */
const en = {
    status: {
        title: 'Status',
        mobileApp: 'Mobile App',
        queueSize: 'Queue Size',
        loadedLogs: 'Loaded Logs',
        shown: 'Shown',
        lastAction: 'Last Action',
        lastResponse: 'Last Response',
        limit: 'Limit',
        discarded: 'Discarded',
        queueNoteApp: "The app's unsent queue (non-debug only). debug-level logs stay in the console only.",
        queueNoteWeb: "This tab's unsent queue (non-debug only). debug-level logs stay in the console only.",
    },
    // Action names fed into the "Last Action" readout below (`{action} requested/received/failed`)
    // — the same word doubles as the log tag under `LOG_BUFFER`, so it stays a short verb/noun.
    actions: {
        idle: 'Idle',
        fetch: 'Fetch',
        refresh: 'Refresh',
        loadMore: 'Load more',
        discard: 'Discard',
    },
    requested: (action: string) => `${action} requested`,
    received: (action: string) => `${action} received`,
    failed: (action: string) => `${action} failed`,
    sampleLogsSent: 'Sample logs sent',
    controls: {
        title: 'Controls',
        sample: 'Sample',
        refresh: 'Refresh',
        discard: 'Discard',
    },
    upload: {
        title: 'Upload',
        holding: 'Holding server send',
        hold: 'Hold server send',
        on: 'ON',
        off: 'OFF',
        heldByApp: "The app's debug menu turned this hold on — turn it off there too.",
        heldNote:
            "Doesn't clear the queue. Logs you reproduce stay queued. Collection keeps running; turning this off sends what piled up on the next flush.",
        notHeldNote:
            'Normally these get sent, so an empty queue is expected. A different lever from opting the device out of collection.',
        sendNow: 'Send now',
        sending: 'Sending…',
        sent: 'Sent (the queue guarantees delivery, not server acceptance)',
        unavailable: "Uploader isn't running",
        onHold: 'On hold — sending may be blocked',
        flushFailed: 'flush failed',
    },
    filter: {
        title: 'Filter',
        placeholder: 'Search · -exclude · tag:NET · "quoted phrase"',
        clear: 'Clear',
        reset: 'Reset',
    },
    logs: {
        title: (shown: number, total: number) => `Logs (${shown}${shown !== total ? ` / ${total}` : ''})`,
        noMatch: 'No logs match the filter',
        heldEmpty: 'On hold, but the queue is empty — nothing to send yet.',
        empty: 'Queue is empty.',
        emptyHint: 'Empty is expected while sending is on. To hold on to logs, turn on the send hold above.',
        loading: 'Loading...',
        loadMore: (count: number) => `Scroll to load ${count} more`,
        data: 'data',
        error: 'error',
        copy: 'Copy',
        copyEntry: 'Copy entry',
    },
    copied: 'Copied',
    copyFailed: 'Copy failed',
};

const ko: typeof en = {
    status: {
        title: '상태',
        mobileApp: '모바일 앱',
        queueSize: '큐 크기',
        loadedLogs: '불러온 로그',
        shown: '표시 중',
        lastAction: '마지막 동작',
        lastResponse: '마지막 응답',
        limit: '한도',
        discarded: '버림',
        queueNoteApp: '앱의 미전송 큐입니다 (비-debug만). debug는 콘솔에만 남습니다.',
        queueNoteWeb: '이 탭의 미전송 큐입니다 (비-debug만). debug는 콘솔에만 남습니다.',
    },
    actions: {
        idle: '대기 중',
        fetch: '조회',
        refresh: '새로고침',
        loadMore: '더 보기',
        discard: '버리기',
    },
    requested: (action: string) => `${action} 요청함`,
    received: (action: string) => `${action} 받음`,
    failed: (action: string) => `${action} 실패`,
    sampleLogsSent: '샘플 로그 전송함',
    controls: {
        title: '조작',
        sample: '샘플',
        refresh: '새로고침',
        discard: '버리기',
    },
    upload: {
        title: '전송',
        holding: '서버 전송 보류 중',
        hold: '서버 전송 보류',
        on: '켜짐',
        off: '꺼짐',
        heldByApp: '앱 디버그 메뉴가 보류를 켰습니다 — 끄는 것도 그쪽입니다.',
        heldNote:
            '큐를 비우지 않습니다. 재현한 로그가 큐에 남습니다. 수집은 계속되며, 끄면 다음 전송에 쌓인 것이 나갑니다.',
        notHeldNote: '평시에는 전송돼 큐가 비어 있는 것이 정상입니다. 수집 거부(기기 opt-out)와는 다른 레버입니다.',
        sendNow: '지금 보내기',
        sending: '보내는 중…',
        sent: '보냈습니다 (서버 수락 여부는 큐가 보장)',
        unavailable: '업로더가 돌고 있지 않습니다',
        onHold: '홀드 중 — 보내기가 막혀 있을 수 있습니다',
        flushFailed: '전송 실패',
    },
    filter: {
        title: '필터',
        placeholder: '검색 · -제외 · tag:NET · "따옴표 구"',
        clear: '지우기',
        reset: '초기화',
    },
    logs: {
        title: (shown: number, total: number) => `로그 (${shown}${shown !== total ? ` / ${total}` : ''})`,
        noMatch: '필터에 맞는 로그가 없습니다',
        heldEmpty: '보류 중이지만 큐가 비어 있습니다 — 아직 전송할 로그가 없습니다.',
        empty: '큐가 비어 있습니다.',
        emptyHint: '전송이 켜져 있으면 비어 있는 것이 정상입니다. 로그를 붙잡아 보려면 위의 전송 보류를 켜세요.',
        loading: '불러오는 중...',
        loadMore: (count: number) => `스크롤하면 ${count}개 더 불러옵니다`,
        data: '데이터',
        error: '에러',
        copy: '복사',
        copyEntry: '항목 복사',
    },
    copied: '복사됨',
    copyFailed: '복사 실패',
};

export const useLogBufferScreenStrings = defineDebugStrings({ ko, en });
