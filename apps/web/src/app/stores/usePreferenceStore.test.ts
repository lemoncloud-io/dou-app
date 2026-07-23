import { hasLocalPreference, parseTheme, usePreferenceStore } from './usePreferenceStore';
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
