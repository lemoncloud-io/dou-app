import { usePreferenceStore } from './usePreferenceStore';
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
    usePreferenceStore.setState({
        blurLastMessage: false,
        isFirstRun: true,
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

    describe('setBlurLastMessage', () => {
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

    describe('completeOnboarding', () => {
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

    describe('resetOnboarding', () => {
        it('isFirstRun을 true로 되돌리고 localStorage를 초기화한다', () => {
            usePreferenceStore.getState().completeOnboarding();
            usePreferenceStore.getState().resetOnboarding();

            expect(usePreferenceStore.getState().isFirstRun).toBe(true);
            expect(localStorage.getItem('chatic-onboarding-completed')).toBe('false');
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

    describe('setBlurLastMessage', () => {
        it('savePreference bridge를 올바른 키와 값으로 호출한다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);

            expect(mockSavePreference).toHaveBeenCalledWith({
                key: 'blurLastMessage',
                value: 'true',
            });
        });

        it('native 환경에서는 localStorage에 쓰지 않는다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            expect(localStorage.getItem('chatic-blur-last-message')).toBeNull();
        });

        it('상태는 bridge 호출과 무관하게 즉시 업데이트된다', () => {
            usePreferenceStore.getState().setBlurLastMessage(true);
            expect(usePreferenceStore.getState().blurLastMessage).toBe(true);
        });
    });

    describe('completeOnboarding', () => {
        it('savePreference bridge를 isFirstRun 키로 호출한다', () => {
            usePreferenceStore.getState().completeOnboarding();

            expect(mockSavePreference).toHaveBeenCalledWith({
                key: 'isFirstRun',
                value: 'true',
            });
            expect(usePreferenceStore.getState().isFirstRun).toBe(false);
        });

        it('native 환경에서는 localStorage에 쓰지 않는다', () => {
            usePreferenceStore.getState().completeOnboarding();
            expect(localStorage.getItem('chatic-onboarding-completed')).toBeNull();
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
        usePreferenceStore.getState().hydrate('theme', 'dark');
        expect(usePreferenceStore.getState().blurLastMessage).toBe(before);
    });
});
