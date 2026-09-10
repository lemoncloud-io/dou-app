import { storageKeyFor } from '@chatic/config';
import { migrateLegacyPreferences, syncThemeFromSharedKey } from './legacyPreferenceMigration';

describe('migrateLegacyPreferences', () => {
    beforeEach(() => localStorage.clear());

    it('불리언 키를 그대로 이전하고 옛 키는 지운다', () => {
        localStorage.setItem('chatic-blur-last-message', 'true');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.blurLastMessage'))).toBe('true');
        expect(localStorage.getItem('chatic-blur-last-message')).toBeNull();
    });

    it('온보딩 완료 극성은 그대로다 — 옛 키도 이미 "완료" 의미였다', () => {
        localStorage.setItem('chatic-onboarding-completed', 'true');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.onboardingCompleted'))).toBe('true');
    });

    it('문자열 키는 JSON으로 감싸 이전한다', () => {
        localStorage.setItem('chatic-dismissed-update-version', '1.3.0');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.dismissedUpdateVersion'))).toBe('"1.3.0"');
    });

    it('JSON 맵 키는 유효한 항목만 걸러 이전한다', () => {
        localStorage.setItem(
            'chatic-channel-sort',
            JSON.stringify({ 'place-1': 'unread', 'cloud-1:place-1': 'unread' })
        );

        migrateLegacyPreferences();

        expect(JSON.parse(localStorage.getItem(storageKeyFor('ui.channelSort')) ?? '{}')).toEqual({
            'cloud-1:place-1': 'unread',
        });
    });

    it('핀 채널·최근검색어도 이전한다', () => {
        localStorage.setItem('chatic-pinned-channels', JSON.stringify({ 'cloud-1:place-1': ['ch-1'] }));
        localStorage.setItem('chatic-recent-searches', JSON.stringify(['lemon']));

        migrateLegacyPreferences();

        expect(JSON.parse(localStorage.getItem(storageKeyFor('ui.pinnedChannels')) ?? '{}')).toEqual({
            'cloud-1:place-1': ['ch-1'],
        });
        expect(JSON.parse(localStorage.getItem(storageKeyFor('ui.recentSearches')) ?? '[]')).toEqual(['lemon']);
    });

    it('클라우드 프로모 dismiss 시각을 숫자로 이전한다', () => {
        localStorage.setItem('chatic-cloud-promo-dismissed-at', '1700000000000');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.cloudPromoDismissedAt'))).toBe('1700000000000');
    });

    it('빈 문자열(닫은 적 없음)은 이전하지 않는다 — 기본값 0과 같다', () => {
        localStorage.setItem('chatic-cloud-promo-dismissed-at', '');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.cloudPromoDismissedAt'))).toBeNull();
        expect(localStorage.getItem('chatic-cloud-promo-dismissed-at')).toBeNull();
    });

    it('옛 키가 없으면 아무것도 하지 않는다', () => {
        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.blurLastMessage'))).toBeNull();
    });

    it('이미 새 키에 값이 있으면 덮어쓰지 않고 옛 키만 지운다', () => {
        localStorage.setItem(storageKeyFor('ui.blurLastMessage'), 'false');
        localStorage.setItem('chatic-blur-last-message', 'true');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.blurLastMessage'))).toBe('false');
        expect(localStorage.getItem('chatic-blur-last-message')).toBeNull();
    });

    it('한 번 이전되면 다음 부팅에서 되살아나지 않는다 — 지운 값이 부활하지 않는다', () => {
        localStorage.setItem('chatic-blur-last-message', 'true');
        migrateLegacyPreferences();
        // Simulates a later config.clear() removing the override.
        localStorage.removeItem(storageKeyFor('ui.blurLastMessage'));

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.blurLastMessage'))).toBeNull();
    });

    it('망가진 JSON 맵은 옛 키만 지우고 새 키는 만들지 않는다', () => {
        localStorage.setItem('chatic-channel-sort', '{broken');

        migrateLegacyPreferences();

        expect(localStorage.getItem(storageKeyFor('ui.channelSort'))).toBeNull();
        expect(localStorage.getItem('chatic-channel-sort')).toBeNull();
    });
});

describe('syncThemeFromSharedKey', () => {
    beforeEach(() => localStorage.clear());

    it('공유 키(vite-ui-theme)를 config 네임스페이스 키로 거울처럼 남긴다', () => {
        localStorage.setItem('vite-ui-theme', 'dark');

        syncThemeFromSharedKey();

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBe('"dark"');
    });

    it('공유 키는 지우지 않는다 — 다른 4개 앱이 계속 읽는다', () => {
        localStorage.setItem('vite-ui-theme', 'dark');

        syncThemeFromSharedKey();

        expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
    });

    it('공유 키가 없으면 아무것도 하지 않는다', () => {
        syncThemeFromSharedKey();

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBeNull();
    });

    it('매 부팅 다시 동기화한다 — 다른 앱에서 바뀐 값도 반영된다', () => {
        localStorage.setItem('vite-ui-theme', 'dark');
        syncThemeFromSharedKey();
        localStorage.setItem('vite-ui-theme', 'light');

        syncThemeFromSharedKey();

        expect(localStorage.getItem(storageKeyFor('ui.theme'))).toBe('"light"');
    });
});
