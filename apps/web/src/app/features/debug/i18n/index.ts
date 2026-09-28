import { defineDebugStrings } from './define';

import type { DebugScreenKey, DebugSectionKey } from '../overlay/screenManifest';

export { defineDebugStrings, setDebugLanguageForTests } from './define';

/**
 * Every word the debug panel shows, one table per language.
 *
 * Two problems this fixes at once. Labels used to be written next to whatever registered the
 * screen, so the same panel said `Email Login` and `App Icon` in one list (the web and the app had
 * drifted the same way). And the tables are typed by `DebugScreenKey`, so a new screen
 * cannot be added without naming it in BOTH languages — the compiler asks.
 *
 * The tables are bundled rather than fetched from `/locales/{{lng}}/{{ns}}.json` like the product's
 * namespaces: the panel is what you open when boot is broken, and a translation that needs a
 * successful network request would come up as raw keys in exactly that case. The language still
 * follows the app's — read from the same i18next instance below.
 */

interface ScreenStrings {
    title: string;
    /** Tab-strip label. Every screen has a chip, and titles are too long for one. */
    short: string;
}

export interface DebugStrings {
    panel: {
        home: string;
        loading: string;
        tabStrip: string;
        disable: string;
        /** Badge on a screen that needs the native shell. */
        shellOnly: string;
        /** Shown instead of such a screen when there is no shell. */
        shellOnlyNotice: string;
    };
    sections: Record<DebugSectionKey, string>;
    screens: Record<DebugScreenKey, ScreenStrings>;
}

const ko: DebugStrings = {
    panel: {
        home: '메뉴',
        loading: '불러오는 중…',
        tabStrip: '화면 목록',
        disable: '디버그 모드 끄기',
        shellOnly: '앱 전용',
        shellOnlyNotice: '이 화면은 앱 안에서만 동작합니다 — 지금은 셸이 붙어 있지 않습니다',
    },
    sections: { info: '모니터링', tools: '기능 테스트', data: '데이터' },
    screens: {
        State: { title: '상태', short: '상태' },
        Boot: { title: '부팅', short: '부팅' },
        Perf: { title: '성능', short: '성능' },
        Unread: { title: '안읽음', short: '안읽음' },
        Route: { title: '라우트 스택', short: '라우트' },
        DeviceInfo: { title: '기기 정보', short: '기기' },
        Config: { title: '설정 보기·변경', short: '설정' },
        CustomZip: { title: '커스텀 web zip', short: 'web zip' },
        BootRecords: { title: '부팅 기록 (앱)', short: '부팅기록' },
        Bridge: { title: '브릿지', short: '브릿지' },
        LogBuffer: { title: '로그 버퍼', short: '로그' },
        CacheMetrics: { title: '캐시 지표', short: '캐시' },
        EmailLogin: { title: '이메일 로그인', short: '로그인' },
        CacheTest: { title: '캐시 DB 테스트', short: '캐시DB' },
        UploadTest: { title: '업로드 테스트', short: '업로드' },
        Push: { title: '푸시 (토큰·수신)', short: '푸시' },
        Sms: { title: '문자 (SMS)', short: 'SMS' },
        OAuthNative: { title: 'OAuth (네이티브)', short: 'OAuth' },
        Iap: { title: '인앱결제', short: '결제' },
        InviteRedirect: { title: '초대 링크 변환', short: '초대링크' },
        Deeplink: { title: '딥링크 보내기 (앱)', short: '딥링크' },
        DBBrowser: { title: 'DB 브라우저', short: 'DB' },
    },
};

const en: DebugStrings = {
    panel: {
        home: 'Menu',
        loading: 'Loading…',
        tabStrip: 'Screens',
        disable: 'Disable debug mode',
        shellOnly: 'App only',
        shellOnlyNotice: 'This screen only works inside the app — no shell is attached right now.',
    },
    sections: { info: 'Monitoring', tools: 'Tools', data: 'Data' },
    screens: {
        State: { title: 'State', short: 'State' },
        Boot: { title: 'Boot', short: 'Boot' },
        Perf: { title: 'Performance', short: 'Perf' },
        Unread: { title: 'Unread', short: 'Unread' },
        Route: { title: 'Route stack', short: 'Route' },
        DeviceInfo: { title: 'Device info', short: 'Device' },
        Config: { title: 'Settings', short: 'Settings' },
        CustomZip: { title: 'Custom web zip', short: 'Web zip' },
        BootRecords: { title: 'Boot records (app)', short: 'Boot rec.' },
        Bridge: { title: 'Bridge', short: 'Bridge' },
        LogBuffer: { title: 'Log buffer', short: 'Logs' },
        CacheMetrics: { title: 'Cache metrics', short: 'Cache' },
        EmailLogin: { title: 'Email login', short: 'Login' },
        CacheTest: { title: 'Cache DB test', short: 'Cache DB' },
        UploadTest: { title: 'Upload test', short: 'Upload' },
        Push: { title: 'Push (token & receive)', short: 'Push' },
        Sms: { title: 'SMS', short: 'SMS' },
        OAuthNative: { title: 'OAuth (native)', short: 'OAuth' },
        Iap: { title: 'In-app purchase', short: 'IAP' },
        InviteRedirect: { title: 'Invite link converter', short: 'Invite' },
        Deeplink: { title: 'Send deeplink (app)', short: 'Deeplink' },
        DBBrowser: { title: 'DB browser', short: 'DB' },
    },
};

const TABLES: Record<'ko' | 'en', DebugStrings> = { ko, en };

/** Exported for the manifest test: every screen must be named in every language. */
export const DEBUG_LOCALE_TABLES = TABLES;

export const useDebugStrings = defineDebugStrings(TABLES);
