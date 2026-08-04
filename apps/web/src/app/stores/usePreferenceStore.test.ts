import {
    hasLocalPreference,
    parseChannelSort,
    parseInviteIds,
    parsePinnedChannels,
    parseTheme,
    usePreferenceStore,
} from './usePreferenceStore';
import { placeScopeKey } from './preferenceKeys';
import { appBridge } from '../bridge';

// Mock isNative so we can test both branches without a real native environment.
jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(() => false),
}));

jest.mock('../bridge', () => ({
    appBridge: {
        savePreference: jest.fn(),
    },
}));

import { isNative } from '@chatic/bridges';

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;
const mockSavePreference = appBridge.savePreference as jest.MockedFunction<typeof appBridge.savePreference>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const resetStore = () => {
    localStorage.clear();
    sessionStorage.clear();
    usePreferenceStore.setState({
        blurLastMessage: false,
        isFirstRun: true,
        theme: 'system',
        issueReportHidden: false,
        channelSort: {},
        pinnedChannels: {},
        dismissedUpdateVersion: '',
    });
    jest.clearAllMocks();
};

// ---------------------------------------------------------------------------
// Web 환경 (isNative = false)
// ---------------------------------------------------------------------------

describe('usePreferenceStore — web 환경', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        resetStore();
    });

    describe('setBlurLastMessage — 블러 설정', () => {
        it('true로 설정하면 localStorage에 저장되고 상태가 반영된다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);

            expect(usePreferenceStore.getState().blurLastMessage).toBe(true);
            expect(localStorage.getItem('chatic-blur-last-message')).toBe('true');
        });

        it('false로 설정하면 localStorage에 false가 저장된다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            usePreferenceStore.getState().setBlurLastMessage(false);

            expect(usePreferenceStore.getState().blurLastMessage).toBe(false);
            expect(localStorage.getItem('chatic-blur-last-message')).toBe('false');
        });

        it('web 환경에서는 savePreference bridge를 호출하지 않는다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            expect(mockSavePreference).not.toHaveBeenCalled();
        });
    });

    describe('completeOnboarding — 온보딩 완료', () => {
        it('isFirstRun을 false로 바꾸고 localStorage에 저장한다', () => {
            usePreferenceStore.getState().completeOnboarding();

            expect(usePreferenceStore.getState().isFirstRun).toBe(false);
            expect(localStorage.getItem('chatic-onboarding-completed')).toBe('true');
        });

        it('web 환경에서는 savePreference bridge를 호출하지 않는다', () => {
            usePreferenceStore.getState().completeOnboarding();
            expect(mockSavePreference).not.toHaveBeenCalled();
        });
    });

    describe('resetOnboarding — 온보딩 초기화', () => {
        it('isFirstRun을 true로 되돌리고 localStorage를 초기화한다', () => {
            usePreferenceStore.getState().completeOnboarding();
            usePreferenceStore.getState().resetOnboarding();

            expect(usePreferenceStore.getState().isFirstRun).toBe(true);
            expect(localStorage.getItem('chatic-onboarding-completed')).toBe('false');
        });
    });

    describe('setTheme — 테마 설정', () => {
        it('상태와 localStorage(vite-ui-theme)에 함께 반영된다', () => {
            usePreferenceStore.getState().setTheme('dark');

            expect(usePreferenceStore.getState().theme).toBe('dark');
            expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
        });

        it('web 환경에서는 savePreference bridge를 호출하지 않는다', () => {
            usePreferenceStore.getState().setTheme('dark');
            expect(mockSavePreference).not.toHaveBeenCalled();
        });
    });
});

// ---------------------------------------------------------------------------
// Native 환경 (isNative = true)
// ---------------------------------------------------------------------------

describe('usePreferenceStore — native 환경', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(true);
        resetStore();
    });

    describe('setBlurLastMessage — 블러 설정', () => {
        it('savePreference bridge를 올바른 키와 값으로 호출한다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);

            expect(mockSavePreference).toHaveBeenCalledWith({
                key: 'blurLastMessage',
                value: 'true',
            });
        });

        it('native 환경에서도 localStorage 캐시에 함께 쓴다 (write-through)', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            expect(localStorage.getItem('chatic-blur-last-message')).toBe('true');
        });

        it('상태는 bridge 호출과 무관하게 즉시 업데이트된다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            expect(usePreferenceStore.getState().blurLastMessage).toBe(true);
        });
    });

    describe('completeOnboarding — 온보딩 완료', () => {
        it('savePreference bridge를 isFirstRun 키로 호출한다', () => {
            usePreferenceStore.getState().completeOnboarding();

            expect(mockSavePreference).toHaveBeenCalledWith({
                key: 'isFirstRun',
                value: 'true',
            });
            expect(usePreferenceStore.getState().isFirstRun).toBe(false);
        });

        it('native 환경에서도 localStorage 캐시에 함께 쓴다 (write-through)', () => {
            usePreferenceStore.getState().completeOnboarding();
            expect(localStorage.getItem('chatic-onboarding-completed')).toBe('true');
        });
    });

    describe('setTheme — 테마 설정', () => {
        it('savePreference bridge를 평문 값으로 호출한다', () => {
            usePreferenceStore.getState().setTheme('dark');

            expect(mockSavePreference).toHaveBeenCalledWith({
                key: 'theme',
                value: 'dark',
            });
        });

        it('native 환경에서도 localStorage 캐시에 함께 쓴다 (write-through)', () => {
            usePreferenceStore.getState().setTheme('light');
            expect(localStorage.getItem('vite-ui-theme')).toBe('light');
        });
    });
});

// ---------------------------------------------------------------------------
// hydrate (PreferenceLoader가 native 값을 스토어에 주입하는 경로)
// ---------------------------------------------------------------------------

describe('usePreferenceStore — hydrate', () => {
    beforeEach(resetStore);

    it('blurLastMessage 키로 hydrate하면 상태가 boolean으로 업데이트된다', () => {
        usePreferenceStore.getState().hydrate('blurLastMessage', true);
        expect(usePreferenceStore.getState().blurLastMessage).toBe(true);
    });

    it('"true" 문자열도 true로 파싱된다', () => {
        usePreferenceStore.getState().hydrate('blurLastMessage', 'true');
        expect(usePreferenceStore.getState().blurLastMessage).toBe(true);
    });

    it('isFirstRun 키로 hydrate하면 상태가 업데이트된다', () => {
        usePreferenceStore.setState({ isFirstRun: false });
        usePreferenceStore.getState().hydrate('isFirstRun', true);
        expect(usePreferenceStore.getState().isFirstRun).toBe(true);
    });

    it('알 수 없는 키는 상태를 변경하지 않는다', () => {
        const before = usePreferenceStore.getState().blurLastMessage;
        usePreferenceStore.getState().hydrate('language', 'ko');
        expect(usePreferenceStore.getState().blurLastMessage).toBe(before);
    });

    it('hydrate는 로컬 캐시도 함께 seeding한다 (다음 읽기는 동기적으로 캐시 hit)', () => {
        usePreferenceStore.getState().hydrate('blurLastMessage', true);
        expect(localStorage.getItem('chatic-blur-last-message')).toBe('true');
        expect(hasLocalPreference('blurLastMessage')).toBe(true);
    });

    it('theme 키를 평문 값으로 hydrate하면 상태와 캐시가 갱신된다', () => {
        usePreferenceStore.getState().hydrate('theme', 'dark');

        expect(usePreferenceStore.getState().theme).toBe('dark');
        expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
    });

    it('모바일 zustand-persist JSON 봉투 형태도 파싱해 hydrate한다', () => {
        usePreferenceStore.getState().hydrate('theme', '{"state":{"theme":"dark"},"version":0}');

        expect(usePreferenceStore.getState().theme).toBe('dark');
        // The cache is seeded with the normalized plain value, not the envelope.
        expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
    });

    it('해석 불가능한 theme 값은 무시하고 기본값을 유지한다', () => {
        usePreferenceStore.getState().hydrate('theme', 'not-a-theme');

        expect(usePreferenceStore.getState().theme).toBe('system');
        expect(localStorage.getItem('vite-ui-theme')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// parseTheme (bridge/localStorage 원시 값 정규화)
// ---------------------------------------------------------------------------

describe('parseTheme — 테마 값 파싱', () => {
    it('평문 테마 문자열을 그대로 반환한다', () => {
        expect(parseTheme('dark')).toBe('dark');
        expect(parseTheme('light')).toBe('light');
        expect(parseTheme('system')).toBe('system');
    });

    it('zustand-persist JSON 봉투에서 내부 테마 값을 꺼낸다', () => {
        expect(parseTheme('{"state":{"theme":"light"},"version":0}')).toBe('light');
    });

    it('유효하지 않은 값은 null을 반환한다', () => {
        expect(parseTheme('blue')).toBeNull();
        expect(parseTheme('{"state":{"theme":"blue"}}')).toBeNull();
        expect(parseTheme('{broken json')).toBeNull();
        expect(parseTheme(null)).toBeNull();
        expect(parseTheme(123)).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// hasLocalPreference (PreferenceLoader가 bridge fallback 여부를 판단하는 경로)
// ---------------------------------------------------------------------------

describe('hasLocalPreference — 로컬 캐시 존재 여부', () => {
    beforeEach(resetStore);

    it('캐시가 비어있으면 false를 반환한다', () => {
        expect(hasLocalPreference('blurLastMessage')).toBe(false);
    });

    it('값이 쓰여지면 true를 반환한다', () => {
        usePreferenceStore.getState().setBlurLastMessage(true);
        expect(hasLocalPreference('blurLastMessage')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// setIssueReportHidden — 플로팅 이슈 리포트 버튼 표시/숨김 (local 전략)
// ---------------------------------------------------------------------------

describe('setIssueReportHidden — 이슈 리포트 버튼 숨김', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        resetStore();
    });

    it('기본값은 노출(false)이다', () => {
        expect(usePreferenceStore.getState().issueReportHidden).toBe(false);
    });

    it('true로 설정하면 localStorage에 저장되고 상태가 반영된다', () => {
        usePreferenceStore.getState().setIssueReportHidden(true);
        expect(usePreferenceStore.getState().issueReportHidden).toBe(true);
        expect(localStorage.getItem('chatic-issue-report-hidden')).toBe('true');
    });

    it('local 전략이라 네이티브에서도 브리지로 저장하지 않는다', () => {
        mockIsNative.mockReturnValue(true);
        usePreferenceStore.getState().setIssueReportHidden(true);
        expect(mockSavePreference).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// setChannelSort — 플레이스별 채팅방 정렬 기준 (local 전략, JSON 맵)
// ---------------------------------------------------------------------------

describe('setChannelSort — 채팅방 정렬 기준', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        resetStore();
    });

    it('cid:sid 스코프별로 정렬 기준을 상태와 localStorage(JSON 맵)에 저장한다', () => {
        usePreferenceStore.getState().setChannelSort('cloud-1:place-1', 'unread');

        expect(usePreferenceStore.getState().channelSort['cloud-1:place-1']).toBe('unread');
        expect(JSON.parse(localStorage.getItem('chatic-channel-sort') ?? '{}')).toEqual({
            'cloud-1:place-1': 'unread',
        });
    });

    it('다른 클라우드·플레이스의 정렬 기준을 덮어쓰지 않고 병합한다', () => {
        usePreferenceStore.getState().setChannelSort('cloud-1:place-1', 'unread');
        usePreferenceStore.getState().setChannelSort('cloud-2:place-2', 'recent');

        expect(usePreferenceStore.getState().channelSort).toEqual({
            'cloud-1:place-1': 'unread',
            'cloud-2:place-2': 'recent',
        });
        expect(JSON.parse(localStorage.getItem('chatic-channel-sort') ?? '{}')).toEqual({
            'cloud-1:place-1': 'unread',
            'cloud-2:place-2': 'recent',
        });
    });

    it('같은 스코프를 다시 설정하면 값이 교체된다', () => {
        usePreferenceStore.getState().setChannelSort('cloud-1:place-1', 'unread');
        usePreferenceStore.getState().setChannelSort('cloud-1:place-1', 'recent');

        expect(usePreferenceStore.getState().channelSort['cloud-1:place-1']).toBe('recent');
    });

    it('local 전략이라 네이티브에서도 브리지로 저장하지 않는다', () => {
        mockIsNative.mockReturnValue(true);
        usePreferenceStore.getState().setChannelSort('cloud-1:place-1', 'unread');
        expect(mockSavePreference).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// setChannelPinned — 플레이스별 채팅방 고정 (local 전략, JSON 맵, 서버 pin 필드 없음)
// ---------------------------------------------------------------------------

describe('setChannelPinned — 채팅방 고정', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        resetStore();
    });

    it('고정한 채널을 상태와 localStorage(JSON 맵)에 저장한다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);

        expect(usePreferenceStore.getState().pinnedChannels).toEqual({ 'cloud-1:place-1': ['ch-1'] });
        expect(JSON.parse(localStorage.getItem('chatic-pinned-channels') ?? '{}')).toEqual({
            'cloud-1:place-1': ['ch-1'],
        });
    });

    it('같은 채널을 두 번 고정해도 중복되지 않는다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);

        expect(usePreferenceStore.getState().pinnedChannels['cloud-1:place-1']).toEqual(['ch-1']);
    });

    it('다른 클라우드·플레이스의 고정 목록을 덮어쓰지 않고 병합한다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        usePreferenceStore.getState().setChannelPinned('cloud-2:place-2', 'ch-2', true);

        expect(usePreferenceStore.getState().pinnedChannels).toEqual({
            'cloud-1:place-1': ['ch-1'],
            'cloud-2:place-2': ['ch-2'],
        });
    });

    it('해제하면 해당 채널만 목록에서 빠진다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-2', true);
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', false);

        expect(usePreferenceStore.getState().pinnedChannels['cloud-1:place-1']).toEqual(['ch-2']);
    });

    it('마지막 고정을 해제하면 스코프 항목 자체를 지운다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', false);

        expect(usePreferenceStore.getState().pinnedChannels).toEqual({});
        expect(JSON.parse(localStorage.getItem('chatic-pinned-channels') ?? '{}')).toEqual({});
    });

    it('local 전략이라 네이티브에서도 브리지로 저장하지 않는다', () => {
        mockIsNative.mockReturnValue(true);
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        expect(mockSavePreference).not.toHaveBeenCalled();
    });

    it('같은 sid라도 클라우드가 다르면 고정이 섞이지 않는다', () => {
        usePreferenceStore.getState().setChannelPinned('cloud-1:place-1', 'ch-1', true);
        usePreferenceStore.getState().setChannelPinned('cloud-2:place-1', 'ch-9', true);

        expect(usePreferenceStore.getState().pinnedChannels).toEqual({
            'cloud-1:place-1': ['ch-1'],
            'cloud-2:place-1': ['ch-9'],
        });
    });
});

// ---------------------------------------------------------------------------
// dismissUpdate — 업데이트 안내 팝업 버전당 1회 dismiss (local 전략)
// ---------------------------------------------------------------------------

describe('dismissUpdate — 업데이트 안내 dismiss', () => {
    beforeEach(() => {
        mockIsNative.mockReturnValue(false);
        resetStore();
    });

    it('기본값은 빈 문자열(dismiss된 적 없음)이다', () => {
        expect(usePreferenceStore.getState().dismissedUpdateVersion).toBe('');
    });

    it('버전을 저장하면 상태와 localStorage에 반영된다', () => {
        usePreferenceStore.getState().dismissUpdate('1.3.0');

        expect(usePreferenceStore.getState().dismissedUpdateVersion).toBe('1.3.0');
        expect(localStorage.getItem('chatic-dismissed-update-version')).toBe('1.3.0');
    });

    it('local 전략이라 네이티브에서도 브리지로 저장하지 않는다', () => {
        mockIsNative.mockReturnValue(true);
        usePreferenceStore.getState().dismissUpdate('1.3.0');
        expect(mockSavePreference).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// placeScopeKey / 레거시 키 정리
// ---------------------------------------------------------------------------

describe('placeScopeKey — cid:sid 스코프', () => {
    it('양쪽이 있을 때만 키를 만든다', () => {
        expect(placeScopeKey('cloud-1', 'place-1')).toBe('cloud-1:place-1');
        expect(placeScopeKey('default', 'place-1')).toBe('default:place-1');
        expect(placeScopeKey(null, 'place-1')).toBeNull();
        expect(placeScopeKey('cloud-1', undefined)).toBeNull();
        expect(placeScopeKey('', '')).toBeNull();
    });

    it('cid 없이 저장된 레거시 항목은 읽을 때 버린다', () => {
        // A bare placeId can't be attributed to a cloud, so honoring it would leak one cloud's
        // setting into another cloud's same-id place.
        localStorage.setItem(
            'chatic-channel-sort',
            JSON.stringify({ 'place-1': 'unread', 'cloud-1:place-1': 'unread' })
        );
        localStorage.setItem(
            'chatic-pinned-channels',
            JSON.stringify({ 'place-1': ['ch-legacy'], 'cloud-1:place-1': ['ch-1'] })
        );

        expect(parseChannelSort(localStorage.getItem('chatic-channel-sort') as string)).toEqual({
            'cloud-1:place-1': 'unread',
        });
        expect(parsePinnedChannels(localStorage.getItem('chatic-pinned-channels') as string)).toEqual({
            'cloud-1:place-1': ['ch-1'],
        });
    });

    // Moved here with the ids themselves: the invite feature used to hand-roll this in its own
    // localStorage helpers (useLocallyCanceledInvites / relayInviteDecline).
    describe('invite id lists', () => {
        it('손상된 값은 "기록 없음"으로 degrade한다 — 던지지 않는다', () => {
            expect(parseInviteIds('not json')).toEqual([]);
            expect(parseInviteIds('{"a":1}')).toEqual([]);
            expect(parseInviteIds('[1, null, "", "ok"]')).toEqual(['ok']);
        });

        it('취소는 중복 없이 쌓이고 localStorage에 반영된다', () => {
            usePreferenceStore.setState({ canceledInviteIds: [] });

            usePreferenceStore.getState().markInviteCanceled('invite-1');
            usePreferenceStore.getState().markInviteCanceled('invite-1');
            usePreferenceStore.getState().markInviteCanceled('invite-2');

            expect(usePreferenceStore.getState().canceledInviteIds).toEqual(['invite-1', 'invite-2']);
            expect(localStorage.getItem('dou.relayInvite.locallyCanceled.v1')).toBe('["invite-1","invite-2"]');
        });

        it('거절은 50개 링으로 오래된 것부터 밀려난다', () => {
            usePreferenceStore.setState({ declinedInviteIds: [] });

            for (let i = 0; i < 55; i += 1) usePreferenceStore.getState().markInviteDeclined(`invite-${i}`);

            const ids = usePreferenceStore.getState().declinedInviteIds;
            expect(ids).toHaveLength(50);
            expect(ids).not.toContain('invite-0');
            expect(ids).toContain('invite-54');
        });

        it('같은 초대를 다시 거절하면 중복되지 않고 가장 최근 자리로 옮겨진다', () => {
            usePreferenceStore.setState({ declinedInviteIds: [] });

            usePreferenceStore.getState().markInviteDeclined('invite-1');
            usePreferenceStore.getState().markInviteDeclined('invite-2');
            usePreferenceStore.getState().markInviteDeclined('invite-1');

            expect(usePreferenceStore.getState().declinedInviteIds).toEqual(['invite-2', 'invite-1']);
        });
    });
});
