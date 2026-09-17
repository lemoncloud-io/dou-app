/**
 * Labels for the application menu's own items (role items are localized by the OS).
 *
 * Picked from the OS locale, like the load-error page: the renderer's in-app
 * language choice never reaches main, so a user who picked Korean on an English
 * system still sees these in English. Electron-free so it is testable.
 */
const MENU_LABELS = {
    en: {
        settings: 'Settings',
        file: 'File',
        view: 'View',
        go: 'Go',
        switcher: 'Jump to Channel…',
        search: 'Search Messages…',
        shortcuts: 'Keyboard Shortcuts',
    },
    ko: {
        settings: '설정',
        file: '파일',
        view: '보기',
        go: '이동',
        switcher: '채널로 이동…',
        search: '메시지 검색…',
        shortcuts: '키보드 단축키',
    },
} as const;

/** @param locale what `app.getLocale()` returns, e.g. `ko-KR`. */
type MenuLabels = (typeof MENU_LABELS)[keyof typeof MENU_LABELS];

export const menuLabels = (locale: string): MenuLabels =>
    locale.toLowerCase().startsWith('ko') ? MENU_LABELS.ko : MENU_LABELS.en;
