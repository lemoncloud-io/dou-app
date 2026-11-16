import { defineDebugStrings } from '../define';

const en = {
    title: 'Session owner',
    subtitle:
        'Which side holds the session on the phone: this page, or the app’s own runtime. Changing it restarts the app, which reloads this page.',
    unavailable: 'This app build does not offer the switch (a production build, or one from before it).',
    statusSection: 'Owner',
    currentLabel: 'This run',
    nextLabel: 'From the next start',
    pageLabel: 'This page',
    owners: { web: 'Page (web)', native: 'App (native)' },
    // What the page settled at boot: a launch set to the app whose runtime could not start still
    // reads "App (native)" above, while the page here holds its own session.
    pageOwners: { web: 'Holds its own session', native: 'Mirrors the app’s runtime' },
    carryOver:
        'The tokens in the device vault carry over. What the page keeps in its own storage (the selected cloud, cloud identities) does not.',
    restarting: 'Restarting the app…',
    refresh: 'Refresh',
    operations: { setOwner: 'Set session owner' },
};

const ko: typeof en = {
    title: '세션 소유자',
    subtitle:
        '폰에서 세션을 누가 쥐는지 — 이 페이지인지, 앱의 런타임인지. 바꾸면 앱이 다시 시작되고 이 페이지도 다시 로드됩니다.',
    unavailable: '이 앱 빌드는 이 전환을 제공하지 않습니다 (PROD 빌드이거나 그 이전 빌드).',
    statusSection: '소유자',
    currentLabel: '이번 실행',
    nextLabel: '다음 시작부터',
    pageLabel: '이 페이지',
    owners: { web: '페이지 (web)', native: '앱 (native)' },
    pageOwners: { web: '자기 세션을 쥠', native: '앱 런타임을 미러링' },
    carryOver:
        '기기 보관함의 토큰은 그대로 이어집니다. 페이지가 자기 저장소에 둔 값(선택한 클라우드, 클라우드 신원)은 넘어가지 않습니다.',
    restarting: '앱을 다시 시작하는 중…',
    refresh: '새로고침',
    operations: { setOwner: '세션 소유자 변경' },
};

export const useSessionOwnerScreenStrings = defineDebugStrings({ ko, en });
