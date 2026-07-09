import { act, renderHook } from '@testing-library/react';

import { useTheme } from './useTheme';
import { usePreferenceStore } from '../stores/usePreferenceStore';

// Mock the bridge chain the same way usePreferenceStore.test.ts does — the
// hook exercises the real store, which touches these on writes.
jest.mock('@chatic/bridges', () => ({
    isNative: jest.fn(() => false),
}));

jest.mock('../bridge', () => ({
    appBridge: {
        savePreference: jest.fn(),
    },
}));

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
    usePreferenceStore.setState({ theme: 'system' });
});

describe('useTheme — 테마 해석', () => {
    it("theme='dark'면 OS 스킴과 무관하게 isDarkTheme이 true다", () => {
        usePreferenceStore.setState({ theme: 'dark' });
        const { result } = renderHook(() => useTheme());
        expect(result.current.isDarkTheme).toBe(true);
    });

    it("theme='light'면 OS가 다크여도 isDarkTheme이 false다", () => {
        osPrefersDark = true;
        usePreferenceStore.setState({ theme: 'light' });
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

    it('setTheme으로 스토어의 테마가 변경된다', () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.setTheme('dark'));
        expect(usePreferenceStore.getState().theme).toBe('dark');
        expect(result.current.theme).toBe('dark');
    });
});
