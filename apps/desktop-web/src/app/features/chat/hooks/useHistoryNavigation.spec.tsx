import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHistoryRequestStore } from '../stores/useHistoryRequestStore';
import { useHistoryNavigation, useHistoryPress } from './useHistoryNavigation';

const routerAt =
    (entries: string[]) =>
    ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            {children}
        </MemoryRouter>
    );

const renderAt = (entries: string[]) => {
    window.history.replaceState({ idx: entries.length - 1 }, '');
    return renderHook(
        () => {
            useHistoryNavigation();
            return useLocation().pathname;
        },
        { wrapper: routerAt(entries) }
    );
};

const pressModBracket = () =>
    act(() => {
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft', metaKey: true, cancelable: true })
        );
    });

const pressMouseBack = () =>
    act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { button: 3, cancelable: true }));
    });

const pressModCloseBracket = () =>
    act(() => {
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key: ']', code: 'BracketRight', metaKey: true, cancelable: true })
        );
    });

const pressMouseForward = () =>
    act(() => {
        window.dispatchEvent(new MouseEvent('mouseup', { button: 4, cancelable: true }));
    });

describe('useHistoryNavigation', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        window.history.replaceState(null, '');
    });

    it('steps back a page on Mod+[', () => {
        const { result } = renderAt(['/', '/settings']);
        pressModBracket();
        expect(result.current).toBe('/');
    });

    it("steps back a page on the mouse's back button", () => {
        const { result } = renderAt(['/settings', '/profile']);
        pressMouseBack();
        expect(result.current).toBe('/settings');
    });

    it('steps forward a page on Mod+] and the mouse forward button, after Back', () => {
        const { result } = renderAt(['/settings', '/profile']);
        pressModBracket();
        expect(result.current).toBe('/settings');
        pressModCloseBracket();
        expect(result.current).toBe('/profile');
        pressMouseBack();
        pressMouseForward();
        expect(result.current).toBe('/profile');
    });

    it('goes home from a page with nothing before it', () => {
        const { result } = renderAt(['/settings']);
        pressModBracket();
        expect(result.current).toBe('/');
    });

    it('goes home rather than out of the app when the entry number says it is the first', () => {
        const { result } = renderAt(['/profile', '/settings']);
        window.history.replaceState({ idx: 0 }, '');
        pressModBracket();
        expect(result.current).toBe('/');
    });

    it('takes Mod+[ from the composer too, where the chord means nothing to the text', () => {
        const { result } = renderAt(['/', '/settings']);
        const composer = document.createElement('div');
        composer.contentEditable = 'true';
        composer.setAttribute('data-composer-input', '');
        document.body.appendChild(composer);
        act(() => {
            composer.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: '[',
                    code: 'BracketLeft',
                    metaKey: true,
                    bubbles: true,
                    cancelable: true,
                })
            );
        });
        expect(result.current).toBe('/');
    });

    it("leaves a press on home to HomePage's channel history", () => {
        const before = useHistoryRequestStore.getState().nonce;
        const { result } = renderAt(['/settings', '/']);
        pressModBracket();
        expect(result.current).toBe('/');
        expect(useHistoryRequestStore.getState().nonce).toBe(before + 1);
    });

    it('does nothing while a dialog is open over the page', () => {
        document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
        const before = useHistoryRequestStore.getState().nonce;
        const { result } = renderAt(['/', '/settings']);
        pressModBracket();
        expect(result.current).toBe('/settings');
        expect(useHistoryRequestStore.getState().nonce).toBe(before);
    });

    it('lets a bare [ through to typing', () => {
        const before = useHistoryRequestStore.getState().nonce;
        renderAt(['/', '/settings']);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft' }));
        });
        expect(useHistoryRequestStore.getState().nonce).toBe(before);
    });
});

describe('useHistoryPress', () => {
    it('does not count a press made before it mounted', () => {
        act(() => useHistoryRequestStore.getState().press('back'));
        const onPress = vi.fn();
        renderHook(() => useHistoryPress(onPress));
        expect(onPress).not.toHaveBeenCalled();
    });

    it('answers each press after it mounted, with its direction', () => {
        const onPress = vi.fn();
        renderHook(() => useHistoryPress(onPress));
        act(() => useHistoryRequestStore.getState().press('back'));
        act(() => useHistoryRequestStore.getState().press('forward'));
        expect(onPress.mock.calls).toEqual([['back'], ['forward']]);
    });
});
