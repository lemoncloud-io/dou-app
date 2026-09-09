import { act, renderHook } from '@testing-library/react';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { appBridge } from '../bridge';
import { useTheme } from './useTheme';

jest.mock('@chatic/bridges', () => ({ isNative: jest.fn(() => false) }));
jest.mock('@chatic/config', () => ({
    config: { set: jest.fn() },
}));
jest.mock('@chatic/config/react', () => ({
    useConfigValue: jest.fn(),
}));
jest.mock('../bridge', () => ({
    appBridge: { savePreferenceConfirmed: jest.fn().mockResolvedValue({ success: true }) },
}));

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;
const mockUseConfigValue = useConfigValue as jest.MockedFunction<typeof useConfigValue>;
const mockSet = config.set as jest.Mock;
const mockSavePreferenceConfirmed = appBridge.savePreferenceConfirmed as jest.MockedFunction<
    typeof appBridge.savePreferenceConfirmed
>;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------
// matchMedia mock — jsdom does not implement it. setOsPrefersDark() simulates
// a live OS scheme toggle firing the 'change' listeners.
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();
let osPrefersDark = false;

const setOsPrefersDark = (next: boolean) => {
    osPrefersDark = next;
    listeners.forEach(listener => listener());
};

beforeAll(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
        get matches() {
            return osPrefersDark;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
});

beforeEach(() => {
    localStorage.clear();
    listeners.clear();
    osPrefersDark = false;
    jest.clearAllMocks();
    mockUseConfigValue.mockReturnValue('system');
    mockIsNative.mockReturnValue(false);
    mockSavePreferenceConfirmed.mockResolvedValue({ success: true } as never);
});

describe('useTheme — 테마 해석', () => {
    it("theme='dark'면 OS 스킴과 무관하게 isDarkTheme이 true다", () => {
        mockUseConfigValue.mockReturnValue('dark');
        const { result } = renderHook(() => useTheme());
        expect(result.current.isDarkTheme).toBe(true);
    });

    it("theme='light'면 OS가 다크여도 isDarkTheme이 false다", () => {
        osPrefersDark = true;
        mockUseConfigValue.mockReturnValue('light');
        const { result } = renderHook(() => useTheme());
        expect(result.current.isDarkTheme).toBe(false);
    });

    it("theme='system'이면 OS 스킴을 따른다", () => {
        osPrefersDark = true;
        const { result } = renderHook(() => useTheme());
        expect(result.current.isDarkTheme).toBe(true);
    });

    it("theme='system'일 때 OS 스킴 변경이 실시간 반영된다", () => {
        const { result } = renderHook(() => useTheme());
        expect(result.current.isDarkTheme).toBe(false);

        act(() => setOsPrefersDark(true));
        expect(result.current.isDarkTheme).toBe(true);
    });

    it('값이 없으면 light로 떨어진다', () => {
        mockUseConfigValue.mockReturnValue(undefined);
        const { result } = renderHook(() => useTheme());
        expect(result.current.theme).toBe('light');
    });
});

describe('useTheme — setTheme', () => {
    it('shell 레인으로 config.set을 호출한다 — local은 셸 값에 가려질 수 있다', () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));

        expect(mockSet).toHaveBeenCalledWith('ui.theme', 'dark', { lane: 'shell' });
    });

    it('공유 키(vite-ui-theme)도 함께 갱신한다 — 다른 앱들이 직접 읽는 키다', () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));

        expect(localStorage.getItem('vite-ui-theme')).toBe('dark');
    });

    it('웹 환경에서는 네이티브 themeStore 브릿지를 호출하지 않는다', () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));

        expect(mockSavePreferenceConfirmed).not.toHaveBeenCalled();
    });

    it('네이티브에서는 상태바 등을 소유한 옛 themeStore로도 확인형 전송을 한다', async () => {
        mockIsNative.mockReturnValue(true);
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));
        await flush();

        expect(mockSavePreferenceConfirmed).toHaveBeenCalledWith({ key: 'theme', value: 'dark' });
    });

    it('themeStore 브릿지가 실패하면 한 번 재시도한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockSavePreferenceConfirmed.mockRejectedValueOnce(new Error('dropped'));
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));
        await flush();
        await flush();

        expect(mockSavePreferenceConfirmed).toHaveBeenCalledTimes(2);
    });

    it('재시도까지 실패해도 예외가 새지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockSavePreferenceConfirmed.mockRejectedValue(new Error('offline'));
        const { result } = renderHook(() => useTheme());

        expect(() => act(() => result.current.setTheme('dark'))).not.toThrow();
        await flush();
        await flush();

        expect(mockSavePreferenceConfirmed).toHaveBeenCalledTimes(2);
    });
});
