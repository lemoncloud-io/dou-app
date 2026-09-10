import { useSyncExternalStore } from 'react';

import i18next from 'i18next';

import type { DebugScreenKey, DebugSectionKey } from './overlay/screenManifest';

/**
 * Every word the debug panel shows, one table per language.
 *
 * Two problems this fixes at once. Labels used to be written next to whatever registered the
 * screen, so the same panel said `Email Login` and `앱 아이콘` in one list (ADR-0080 §맥락 1 saw the
 * same drift between web and app). And the tables are typed by `DebugScreenKey`, so a new screen
 * cannot be added without naming it in BOTH languages — the compiler asks.
 *
 * The tables are bundled rather than fetched from `/locales/{{lng}}/{{ns}}.json` like the product's
 * namespaces: the panel is what you open when boot is broken, and a translation that needs a
 * successful network request would come up as raw keys in exactly that case. The language still
 * follows the app's — read from the same i18next instance below.
 */

interface ScreenStrings {
    title: string;
    /** Tab-strip label; titles are too long for the strip. Only pinned screens need one. */
    short?: string;
}

export interface DebugStrings {
    panel: { home: string; loading: string; tabStrip: string; disable: string };
    sections: Record<DebugSectionKey, string>;
    screens: Record<DebugScreenKey, ScreenStrings>;
}

const ko: DebugStrings = {
    panel: { home: '메뉴', loading: '불러오는 중…', tabStrip: '고정 화면', disable: '디버그 모드 끄기' },
    sections: { info: '모니터링', tools: '기능 테스트', data: '데이터' },
    screens: {
        State: { title: '상태', short: '상태' },
        Boot: { title: '부팅', short: '부팅' },
        Perf: { title: '성능', short: '성능' },
        Unread: { title: '안읽음', short: '안읽음' },
        Route: { title: '라우트 스택', short: '라우트' },
        DeviceInfo: { title: '기기 정보' },
        Config: { title: '지금 설정' },
        CustomZip: { title: '커스텀 web zip' },
        BootRecords: { title: '부팅 기록 (앱)' },
        Bridge: { title: '브릿지' },
        LogBuffer: { title: '로그 버퍼', short: '로그' },
        CacheMetrics: { title: '캐시 지표', short: '캐시' },
        EmailLogin: { title: '이메일 로그인' },
        CacheTest: { title: '캐시 DB 테스트' },
        UploadTest: { title: '분할 업로드 테스트' },
        Push: { title: '푸시 (토큰·수신)' },
        Sms: { title: '문자 (SMS)' },
        OAuthNative: { title: 'OAuth (네이티브)' },
        AppIcon: { title: '앱 아이콘' },
        Iap: { title: '인앱결제' },
        InviteRedirect: { title: '초대 링크 변환' },
        Deeplink: { title: '딥링크 보내기 (앱)' },
        DBBrowser: { title: 'DB 브라우저', short: 'DB' },
        ProfileEditor: { title: '내 프로필 편집' },
    },
};

const en: DebugStrings = {
    panel: { home: 'Menu', loading: 'Loading…', tabStrip: 'Pinned screens', disable: 'Disable debug mode' },
    sections: { info: 'Monitoring', tools: 'Tools', data: 'Data' },
    screens: {
        State: { title: 'State', short: 'State' },
        Boot: { title: 'Boot', short: 'Boot' },
        Perf: { title: 'Performance', short: 'Perf' },
        Unread: { title: 'Unread', short: 'Unread' },
        Route: { title: 'Route stack', short: 'Route' },
        DeviceInfo: { title: 'Device info' },
        Config: { title: 'Current settings' },
        CustomZip: { title: 'Custom web zip' },
        BootRecords: { title: 'Boot records (app)' },
        Bridge: { title: 'Bridge' },
        LogBuffer: { title: 'Log buffer', short: 'Logs' },
        CacheMetrics: { title: 'Cache metrics', short: 'Cache' },
        EmailLogin: { title: 'Email login' },
        CacheTest: { title: 'Cache DB test' },
        UploadTest: { title: 'Chunk upload test' },
        Push: { title: 'Push (token & receive)' },
        Sms: { title: 'SMS' },
        OAuthNative: { title: 'OAuth (native)' },
        AppIcon: { title: 'App icon' },
        Iap: { title: 'In-app purchase' },
        InviteRedirect: { title: 'Invite link converter' },
        Deeplink: { title: 'Send deeplink (app)' },
        DBBrowser: { title: 'DB browser', short: 'DB' },
        ProfileEditor: { title: 'My profile editor' },
    },
};

const TABLES: Record<'ko' | 'en', DebugStrings> = { ko, en };

/** Exported for the manifest test: every screen must be named in every language. */
export const DEBUG_LOCALE_TABLES = TABLES;

/** Korean is the fallback: the QA docs this panel is used against are Korean (ADR-0080 결정 3). */
const tableFor = (language: string | undefined): DebugStrings =>
    language?.toLowerCase().startsWith('en') ? TABLES.en : TABLES.ko;

// i18next is read directly rather than through `useTranslation` so the panel does not depend on the
// app's i18n having initialised — it is mounted outside AppRuntime precisely to survive a broken
// boot. Every access is optional for the same reason: a missing or uninitialised instance means the
// Korean table, never a crashed panel.
type LanguageSource = {
    resolvedLanguage?: string;
    language?: string;
    on?: (event: 'languageChanged', listener: () => void) => void;
    off?: (event: 'languageChanged', listener: () => void) => void;
};

const source = i18next as LanguageSource | undefined;

const subscribe = (listener: () => void) => {
    source?.on?.('languageChanged', listener);
    return () => source?.off?.('languageChanged', listener);
};

const currentTable = () => tableFor(source?.resolvedLanguage ?? source?.language);

export const useDebugStrings = (): DebugStrings => useSyncExternalStore(subscribe, currentTable, () => TABLES.ko);
