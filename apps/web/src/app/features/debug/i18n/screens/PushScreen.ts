import { defineDebugStrings } from '../define';

const en = {
    title: 'Push',
    subtitle: (isOnNative: boolean): string =>
        isOnNative ? 'Native bridge connected' : 'Browser mode — token requires the app shell',
    registration: {
        title: 'Server Registration',
        stateLabel: 'state:',
        check: 'Check',
        registered: 'Registered on server',
        notRegistered: 'Not registered',
        tokenLabel: 'Token',
        tokenNotFetched: '(not fetched)',
        endpointLabel: 'Endpoint',
        registeredAtLabel: 'Registered',
        statusLabel: 'Status',
    },
    /** Passed into `usePushRegistration` — the hook stays free of user-visible text. */
    errors: {
        noNative: 'Push token is only available inside the native app shell.',
        noToken: 'No push token — permission denied or not issued yet.',
        checkFailed: 'Failed to check registration.',
    },
    actions: {
        title: 'Actions',
        hint: (isOnNative: boolean) =>
            `The app runs it and returns the result${isOnNative ? '' : ' — only works inside the app shell'}`,
        deleteToken: 'Delete token',
        requestPermission: 'Request notification permission',
        showLocalNotification: 'Show local notification',
        fetchBadge: 'Fetch badge',
        badgeToZero: 'Badge to 0',
        reproducePushTap: 'Reproduce push tap',
    },
    /** Labels passed to `run`/`fire` — shown as the operation name in the result line. */
    operations: {
        deleteToken: 'Delete token',
        requestPermission: 'Request notification permission',
        localNotification: 'Local notification',
        fetchBadge: 'Fetch badge',
        badgeToZero: 'Badge to 0',
        reproducePushTap: 'Reproduce push tap',
    },
    notification: {
        title: 'Debug notification',
        body: 'Local notification triggered from the web panel',
    },
    received: {
        title: (count: number) => `Received (${count})`,
        subtitle: 'Foreground pushes via bridge',
        openLogBuffer: 'Open log buffer',
        clearList: 'Clear received list',
        empty: 'No pushes received yet.',
    },
};

const ko: typeof en = {
    title: '푸시',
    subtitle: isOnNative =>
        isOnNative ? '네이티브 브릿지 연결됨' : '브라우저 모드 — 토큰은 앱 셸에서만 확인할 수 있습니다',
    registration: {
        title: '서버 등록 확인',
        stateLabel: '상태:',
        check: '확인',
        registered: '서버에 등록됨',
        notRegistered: '등록되지 않음',
        tokenLabel: '토큰',
        tokenNotFetched: '(가져오지 않음)',
        endpointLabel: '엔드포인트',
        registeredAtLabel: '등록 일시',
        statusLabel: '상태',
    },
    errors: {
        noNative: '푸시 토큰은 네이티브 앱 셸 안에서만 확인할 수 있습니다.',
        noToken: '푸시 토큰이 없습니다 — 권한이 거부되었거나 아직 발급되지 않았습니다.',
        checkFailed: '등록 확인에 실패했습니다.',
    },
    actions: {
        title: '조작',
        hint: isOnNative => `앱이 실행하고 결과를 돌려줍니다${isOnNative ? '' : ' — 앱 셸 안에서만 동작합니다'}`,
        deleteToken: '토큰 삭제',
        requestPermission: '알림 권한 요청',
        showLocalNotification: '로컬 알림 띄우기',
        fetchBadge: '뱃지 조회',
        badgeToZero: '뱃지 0으로',
        reproducePushTap: '푸시 탭 재현',
    },
    operations: {
        deleteToken: '토큰 삭제',
        requestPermission: '알림 권한 요청',
        localNotification: '로컬 알림',
        fetchBadge: '뱃지 조회',
        badgeToZero: '뱃지 0으로',
        reproducePushTap: '푸시 탭 재현',
    },
    notification: {
        title: '디버그 알림',
        body: '웹 패널에서 띄운 로컬 알림입니다',
    },
    received: {
        title: count => `수신 (${count})`,
        subtitle: '브릿지로 받은 포그라운드 푸시',
        openLogBuffer: '로그 버퍼 열기',
        clearList: '받은 목록 지우기',
        empty: '아직 받은 푸시가 없습니다.',
    },
};

export const usePushScreenStrings = defineDebugStrings({ ko, en });
