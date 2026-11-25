import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';
import { useOnboarding } from './useOnboarding';

jest.mock('@chatic/runtime-react', () =>
    require('@chatic/runtime-react/testing').fakeRuntimeModule({
        settings: { set: jest.fn(), useConfigValue: jest.fn() },
    })
);

const mockUseConfigValue = runtime.settings.useConfigValue as jest.MockedFunction<
    typeof runtime.settings.useConfigValue
>;
const mockSet = runtime.settings.set as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('useOnboarding', () => {
    it('onboardingCompleted가 false면 isFirstRun은 true다', () => {
        mockUseConfigValue.mockReturnValue(false);
        const { result } = renderHook(() => useOnboarding());
        expect(result.current.isFirstRun).toBe(true);
    });

    it('onboardingCompleted가 true면 isFirstRun은 false다', () => {
        mockUseConfigValue.mockReturnValue(true);
        const { result } = renderHook(() => useOnboarding());
        expect(result.current.isFirstRun).toBe(false);
    });

    it('값이 없으면 isFirstRun은 true다 — 온보딩 안 한 사용자가 기본값이다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => useOnboarding());
        expect(result.current.isFirstRun).toBe(true);
    });

    it('completeOnboarding은 shell 레인으로 true를 쓴다', () => {
        const { result } = renderHook(() => useOnboarding());
        result.current.completeOnboarding();
        expect(mockSet).toHaveBeenCalledWith('ui.onboardingCompleted', true, { lane: 'shell' });
    });

    it('resetOnboarding은 shell 레인으로 false를 쓴다', () => {
        const { result } = renderHook(() => useOnboarding());
        result.current.resetOnboarding();
        expect(mockSet).toHaveBeenCalledWith('ui.onboardingCompleted', false, { lane: 'shell' });
    });
});
