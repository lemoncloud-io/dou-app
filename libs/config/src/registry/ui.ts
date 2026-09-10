import type { ConfigRegistryModule } from '../types';

/**
 * User-facing preferences, absorbed from `PREFERENCES` (`apps/web/src/app/stores/preferenceKeys.ts`).
 *
 * `ui.onboardingCompleted` drops the old inversion: the legacy `isFirstRun` state was the negation
 * of what its localStorage key stored, which needed a comment to warn readers. This key's name
 * matches what it holds.
 *
 * `channelSort`/`pinnedChannels`/`recentSearches` are `'internal'` on purpose even though a person
 * changes them — the place they change is a sort picker, a pin gesture, a search box, not a
 * settings screen, so a generic settings UI must not render a row for them.
 */
export const uiModule: ConfigRegistryModule = {
    'ui.theme': {
        title: '테마',
        description: '화면을 밝게·어둡게 표시한다.',
        type: 'enum',
        values: ['light', 'dark', 'system'],
        defaultValue: 'light',
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.language': {
        title: '언어',
        description: '앱 표시 언어.',
        type: 'string',
        defaultValue: 'ko',
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.blurLastMessage': {
        title: '마지막 메시지 미리보기 가리기',
        description: '채널 목록에서 마지막 메시지 내용을 흐리게 보여준다.',
        type: 'boolean',
        defaultValue: false,
        surface: 'user',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.onboardingCompleted': {
        title: '온보딩 완료',
        description: '첫 실행 안내를 다시 보여줄지 결정한다.',
        type: 'boolean',
        defaultValue: false,
        surface: 'internal',
        writableBy: ['shell', 'local'],
        persist: 'shell',
    },
    'ui.pushMuted': {
        title: '푸시 알림 음소거',
        description: '기기 전체의 푸시 알림을 끈다.',
        type: 'boolean',
        defaultValue: false,
        surface: 'user',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.channelSort': {
        title: '채널 정렬 방식',
        description: '장소별 채널 목록 정렬 방식을 저장한다.',
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.pinnedChannels': {
        title: '고정된 채널',
        description: '장소별로 상단에 고정한 채널 목록.',
        type: 'json',
        defaultValue: {},
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.recentSearches': {
        title: '최근 검색어',
        description: '통합검색에서 최근 입력한 검색어 목록.',
        type: 'json',
        defaultValue: [],
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.cloudPromoDismissedAt': {
        title: '클라우드 홍보 닫은 시각',
        description: '클라우드 추가 안내 배너를 마지막으로 닫은 시각.',
        type: 'number',
        defaultValue: 0,
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
    'ui.dismissedUpdateVersion': {
        title: '업데이트 알림 닫은 버전',
        description: '업데이트 안내를 닫은 마지막 버전. 그 버전까지는 다시 뜨지 않는다.',
        type: 'string',
        defaultValue: '',
        surface: 'internal',
        writableBy: ['local'],
        persist: 'local',
    },
};
