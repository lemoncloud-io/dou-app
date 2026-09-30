import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { useTheme } from '../hooks';
import { type Theme, ThemeProvider } from './ThemeProvider';

// A controllable stand-in for the OS appearance: jsdom ships no matchMedia.
const os = {
    dark: false,
    listeners: new Set<() => void>(),
    set(dark: boolean) {
        os.dark = dark;
        os.listeners.forEach(listener => listener());
    },
};

const Probe = () => {
    const { theme, setTheme, isDarkTheme } = useTheme();
    return (
        <>
            <output aria-label="theme">{theme}</output>
            <output aria-label="dark">{String(isDarkTheme)}</output>
            {(['light', 'dark', 'system'] as Theme[]).map(option => (
                <button key={option} onClick={() => setTheme(option)}>
                    {option}
                </button>
            ))}
        </>
    );
};

const html = () => document.documentElement.classList;

describe('ThemeProvider', () => {
    beforeEach(() => {
        os.dark = false;
        os.listeners.clear();
        localStorage.clear();
        html().remove('light', 'dark');
        window.matchMedia = ((query: string) => ({
            get matches() {
                return query === '(prefers-color-scheme: dark)' && os.dark;
            },
            addEventListener: (_: string, listener: () => void) => os.listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) => os.listeners.delete(listener),
        })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        Reflect.deleteProperty(window, 'matchMedia');
    });

    it('follows a dark OS on a first run when the default is system', () => {
        os.dark = true;
        render(
            <ThemeProvider defaultTheme="system">
                <Probe />
            </ThemeProvider>
        );

        expect(screen.getByLabelText('theme').textContent).toBe('system');
        expect(html().contains('dark')).toBe(true);
        expect(screen.getByLabelText('dark').textContent).toBe('true');
    });

    it('follows an OS appearance change while the choice is system', () => {
        render(
            <ThemeProvider defaultTheme="system">
                <Probe />
            </ThemeProvider>
        );
        expect(html().contains('light')).toBe(true);

        act(() => os.set(true));
        expect(html().contains('dark')).toBe(true);
        expect(html().contains('light')).toBe(false);
        expect(screen.getByLabelText('dark').textContent).toBe('true');

        act(() => os.set(false));
        expect(html().contains('light')).toBe(true);
        expect(screen.getByLabelText('dark').textContent).toBe('false');
    });

    it('ignores the OS while an explicit choice is active, and picks it up again on system', () => {
        localStorage.setItem('vite-ui-theme', 'light');
        render(
            <ThemeProvider defaultTheme="system">
                <Probe />
            </ThemeProvider>
        );

        act(() => os.set(true));
        expect(html().contains('light')).toBe(true);
        expect(os.listeners.size).toBe(0);

        // The OS turned dark while 'light' was chosen; switching to system must see that.
        fireEvent.click(screen.getByRole('button', { name: 'system' }));
        expect(html().contains('dark')).toBe(true);
        expect(localStorage.getItem('vite-ui-theme')).toBe('system');
    });

    it('keeps a stored choice over the default', () => {
        localStorage.setItem('vite-ui-theme', 'dark');
        render(
            <ThemeProvider defaultTheme="system">
                <Probe />
            </ThemeProvider>
        );

        expect(screen.getByLabelText('theme').textContent).toBe('dark');
        expect(html().contains('dark')).toBe(true);
    });
});
