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
    document.documentElement.style.removeProperty('--splash-bg');
    document.getElementById('theme-color-meta')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.id = 'theme-color-meta';
    meta.content = '#ffffff';
    document.head.appendChild(meta);
});

const rootClasses = () => document.documentElement.classList;
const themeColor = () => document.getElementById('theme-color-meta')?.getAttribute('content');
const splashBg = () => document.documentElement.style.getPropertyValue('--splash-bg');

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

describe('ThemeApplier — 시스템 UI 색상 동기화', () => {
    it('마운트 시 theme-color를 테마에 맞춘다', () => {
        usePreferenceStore.setState({ theme: 'dark' });
        render(<ThemeApplier />);

        expect(themeColor()).toBe('#121212');
    });

    it('인앱 테마 변경이 리로드 없이 theme-color에 반영된다', () => {
        usePreferenceStore.setState({ theme: 'light' });
        render(<ThemeApplier />);
        expect(themeColor()).toBe('#ffffff');

        // The pre-paint script only runs at boot, so without this the status-bar tint
        // stayed stale until the next reload.
        act(() => usePreferenceStore.getState().setTheme('dark'));

        expect(themeColor()).toBe('#121212');
    });

    it("theme='system'에서 OS 스킴이 바뀌면 함께 따라간다", () => {
        render(<ThemeApplier />);
        expect(themeColor()).toBe('#ffffff');

        act(() => setOsPrefersDark(true));

        expect(themeColor()).toBe('#121212');
    });

    it('id가 아니라 name으로 meta를 찾는다', () => {
        // Coupling to id="theme-color-meta" meant dropping that attribute from index.html would
        // silently disable theme-color sync.
        document.getElementById('theme-color-meta')?.removeAttribute('id');
        usePreferenceStore.setState({ theme: 'dark' });

        render(<ThemeApplier />);

        expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#121212');
    });

    it('theme-color meta가 아예 없어도 예외 없이 동작한다', () => {
        document.getElementById('theme-color-meta')?.remove();
        usePreferenceStore.setState({ theme: 'dark' });

        expect(() => render(<ThemeApplier />)).not.toThrow();
        expect(rootClasses().contains('dark')).toBe(true);
    });

    it('--splash-bg는 건드리지 않는다', () => {
        usePreferenceStore.setState({ theme: 'dark' });
        render(<ThemeApplier />);

        // Its only consumer is the #splash placeholder inside #root, which React has already
        // replaced by the time this component first runs. Writing it was dead code.
        expect(splashBg()).toBe('');
    });
});
