import { act, render } from '@testing-library/react';

import { ThemeApplier } from './ThemeApplier';
import { usePreferenceStore } from '../stores/usePreferenceStore';

// Mock the bridge chain the same way usePreferenceStore.test.ts does — the
// component exercises the real store, which touches these on writes.
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
    document.documentElement.classList.remove('light', 'dark');
});

const rootClasses = () => document.documentElement.classList;

describe('ThemeApplier — <html> 클래스 적용', () => {
    it("theme='light'면 html에 light 클래스를 적용한다", () => {
        usePreferenceStore.setState({ theme: 'light' });
        render(<ThemeApplier />);

        expect(rootClasses().contains('light')).toBe(true);
        expect(rootClasses().contains('dark')).toBe(false);
    });

    it("theme='system' + OS 다크면 dark 클래스를 적용한다", () => {
        osPrefersDark = true;
        render(<ThemeApplier />);

        expect(rootClasses().contains('dark')).toBe(true);
        expect(rootClasses().contains('light')).toBe(false);
    });

    it("theme='system'일 때 OS 스킴이 바뀌면 클래스가 갈아끼워진다", () => {
        render(<ThemeApplier />);
        expect(rootClasses().contains('light')).toBe(true);

        act(() => setOsPrefersDark(true));
        expect(rootClasses().contains('dark')).toBe(true);
        expect(rootClasses().contains('light')).toBe(false);
    });

    it('스토어에서 테마를 바꾸면 클래스가 즉시 반영된다', () => {
        render(<ThemeApplier />);
        expect(rootClasses().contains('light')).toBe(true);

        act(() => usePreferenceStore.getState().setTheme('dark'));
        expect(rootClasses().contains('dark')).toBe(true);
        expect(rootClasses().contains('light')).toBe(false);
    });
});
