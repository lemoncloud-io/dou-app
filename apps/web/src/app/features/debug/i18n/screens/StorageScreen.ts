import { defineDebugStrings } from '../define';

const en = {
    title: 'Storage',
    subtitle: 'What the app keeps natively and what the WebView keeps, side by side. Clearing one leaves the other.',
    refresh: 'Refresh',
    confirm: 'Tap again to confirm',
    native: {
        section: 'App cache (native)',
        noShell: 'No app shell attached — only the web storage below exists here.',
        unsupported: "This app build can't report its storage. Update the app to use this half.",
        sqlite: 'SQLite tables',
        mmkv: 'MMKV keys (not cleared)',
        mmkvNote:
            "The shell's own settings and its unsent log and report queues — no server data, so a clear leaves them.",
        unrecoverable: "can't be refilled",
        alwaysKept: 'always kept',
        tableMissing: 'missing',
        includeInvitedClouds: 'Also delete the invited-cloud list',
        invitedCloudsWarning:
            "The server has no list of invited clouds. Once deleted, a cloud comes back only when a push names it — until then this device can't enter it.",
        clear: 'Clear app cache',
    },
    web: {
        section: 'Web cache (WebView)',
        groups: {
            session: 'Session & sign-in',
            config: 'Settings (@chatic/config)',
            logs: 'Unsent logs (kept)',
            other: 'UI state & other',
        },
        sessionStorage: 'sessionStorage',
        indexedDb: 'IndexedDB',
        cacheStorage: 'Cache Storage',
        usage: 'Browser estimate',
        none: 'none',
        notListable: "can't list",
        signOutWarning:
            'Clears everything this page stores but the unsent logs, the sign-in included — you will be signed out. In a browser this also takes the cached chats, the invited-cloud list and invite dismissals.',
        clear: 'Clear web cache',
    },
    clearBoth: 'Clear both',
    keyCount: (count: number) => (count === 1 ? '1 key' : `${count} keys`),
    rowCount: (count: number) => (count === 1 ? '1 row' : `${count} rows`),
    /** Labels passed to `run` — shown as the operation name in the result line. */
    operations: {
        load: 'Read native storage',
        clearNative: 'Clear app cache',
        clearWeb: 'Clear web cache',
    },
    /** Result-line text for a partial clear, which does not reload so the reader can see it. */
    nativeFailed: (tables: string) => `Some tables did not clear: ${tables}`,
};

const ko: typeof en = {
    title: '저장소',
    subtitle: '앱이 네이티브에 저장한 것과 WebView가 저장한 것을 나란히 봅니다. 한쪽만 비우면 다른 쪽은 남습니다.',
    refresh: '새로고침',
    confirm: '한 번 더 눌러 확인',
    native: {
        section: '앱 캐시 (네이티브)',
        noShell: '앱 셸이 붙어 있지 않습니다 — 여기서는 아래 웹 저장소만 있습니다.',
        unsupported: '이 앱 빌드는 저장소를 알려주지 못합니다. 앱을 업데이트해야 이 절반을 볼 수 있습니다.',
        sqlite: 'SQLite 테이블',
        mmkv: 'MMKV 키 (비우지 않음)',
        mmkvNote: '셸 자체의 설정과 아직 안 보낸 로그·리포트 큐입니다. 서버 데이터가 아니라서 비우기 대상이 아닙니다.',
        unrecoverable: '다시 못 받음',
        alwaysKept: '항상 유지',
        tableMissing: '없음',
        includeInvitedClouds: '초대받은 클라우드 목록도 삭제',
        invitedCloudsWarning:
            '서버에는 초대받은 클라우드 목록이 없습니다. 지우면 그 클라우드를 알리는 푸시가 다시 오기 전까지 이 기기에서 들어갈 수 없습니다.',
        clear: '앱 캐시 비우기',
    },
    web: {
        section: '웹 캐시 (WebView)',
        groups: {
            session: '세션·로그인',
            config: '설정 (@chatic/config)',
            logs: '아직 안 보낸 로그 (유지)',
            other: 'UI 상태·기타',
        },
        sessionStorage: 'sessionStorage',
        indexedDb: 'IndexedDB',
        cacheStorage: 'Cache Storage',
        usage: '브라우저 추정치',
        none: '없음',
        notListable: '목록 불가',
        signOutWarning:
            '안 보낸 로그를 빼고 이 페이지가 저장한 모든 것을 지웁니다. 로그인도 지워지니 로그아웃됩니다. 브라우저에서는 캐시된 채팅, 초대받은 클라우드 목록, 초대 닫음 기록까지 지워집니다.',
        clear: '웹 캐시 비우기',
    },
    clearBoth: '둘 다 비우기',
    keyCount: (count: number) => `키 ${count}개`,
    rowCount: (count: number) => `${count}행`,
    operations: {
        load: '네이티브 저장소 읽기',
        clearNative: '앱 캐시 비우기',
        clearWeb: '웹 캐시 비우기',
    },
    nativeFailed: (tables: string) => `일부 테이블을 비우지 못했습니다: ${tables}`,
};

export const useStorageScreenStrings = defineDebugStrings({ ko, en });
