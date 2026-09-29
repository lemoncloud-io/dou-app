import { defineDebugStrings } from '../define';

/**
 * This screen was English at HEAD, so `ko` below is freshly written rather than pulled from
 * history.
 *
 * Left out on purpose (technical, identical in both languages): the scenario names (`ok`,
 * `expired`, …, which double as `/s3/<scenario>` URL segments), the `1 MB`/`100 MB` size labels,
 * `formatBytes`'s unit letters, transfer/error codes, and `summarize`'s raw `t.state` fallback.
 */
const en = {
    mobileOnlyNotice: 'File transfer runs in the native shell only. Open this screen inside the mobile app.',
    sections: {
        target: 'Target',
        files: (count: number) => `Files (${count})`,
        transfers: (count: number) => `Transfers (${count})`,
        log: 'Log',
    },
    aria: {
        testServerBaseUrl: 'Test server base URL',
        bytesPerSecond: 'Bytes per second',
        dropAfterBytes: 'Drop after bytes',
        signatureExpiresInSeconds: 'Signature expires in seconds',
    },
    actions: {
        pick: 'Pick',
        fromMemory: 'From memory',
        start: 'Start',
        list: 'List',
        ackEnded: 'Ack ended',
        cancel: 'Cancel',
        clear: 'Clear',
    },
    /** Tags shown next to each log line, one per call site of `addLog`. */
    logTags: {
        picker: 'Picker',
        generator: 'Generator',
        tempFile: 'TempFile',
        start: 'Start',
        cancel: 'Cancel',
        list: 'List',
        ack: 'Ack',
        event: 'Event',
    },
    log: {
        stagedCount: (count: number) => `Staged ${count} ${count === 1 ? 'file' : 'files'}`,
        stagedNamed: (name: string) => `Staged ${name}`,
        wroteFromMemory: (size: string) => `Wrote ${size} from memory`,
        nativeHoldsCount: (count: number) => `Native holds ${count} ${count === 1 ? 'transfer' : 'transfers'}`,
        acknowledged: (count: number, remaining: string) => `Acknowledged ${count}; native still holds ${remaining}`,
    },
    /** Appended by `errorOf` when the shell answers `NOT_FOUND` for a command it predates. */
    noHandlerYet: 'this app build has no file-transfer handler yet',
};

const ko: typeof en = {
    mobileOnlyNotice: '파일 전송은 네이티브 셸에서만 동작합니다. 모바일 앱 안에서 이 화면을 열어주세요.',
    sections: {
        target: '대상',
        files: (count: number) => `파일 (${count})`,
        transfers: (count: number) => `전송 (${count})`,
        log: '로그',
    },
    aria: {
        testServerBaseUrl: '테스트 서버 기본 URL',
        bytesPerSecond: '초당 바이트',
        dropAfterBytes: '연결 끊는 시점 (바이트)',
        signatureExpiresInSeconds: '서명 만료 시간 (초)',
    },
    actions: {
        pick: '선택',
        fromMemory: '메모리에서',
        start: '시작',
        list: '목록',
        ackEnded: '종료 확인',
        cancel: '취소',
        clear: '지우기',
    },
    logTags: {
        picker: '선택',
        generator: '생성기',
        tempFile: '임시파일',
        start: '시작',
        cancel: '취소',
        list: '목록',
        ack: '확인',
        event: '이벤트',
    },
    log: {
        stagedCount: (count: number) => `파일 ${count}개 준비했습니다`,
        stagedNamed: (name: string) => `${name} 준비했습니다`,
        wroteFromMemory: (size: string) => `메모리에서 ${size} 기록했습니다`,
        nativeHoldsCount: (count: number) => `네이티브가 전송 ${count}건을 갖고 있습니다`,
        acknowledged: (count: number, remaining: string) => `${count}건 확인함, 네이티브에 ${remaining}건 남음`,
    },
    noHandlerYet: '이 앱 빌드에는 아직 파일 전송 핸들러가 없습니다',
};

export const useUploadTestScreenStrings = defineDebugStrings({ ko, en });
