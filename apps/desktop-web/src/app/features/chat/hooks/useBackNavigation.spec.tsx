import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBackRequestStore } from '../stores/useBackRequestStore';
import { useBackNavigation, useBackPress } from './useBackNavigation';

const routerAt =
    (entries: string[]) =>
    ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            {children}
        </MemoryRouter>
    );

// The memory router keeps its entries to itself; the hook reads the browser router's entry
// number from `history.state`, so each test states which entry it stands on.
const renderAt = (entries: string[]) => {
    window.history.replaceState({ idx: entries.length - 1 }, '');
    return renderHook(
        () => {
            useBackNavigation();
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

describe('useBackNavigation', () => {
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

    it('goes home from a page with nothing before it', () => {
        const { result } = renderAt(['/settings']);
        pressModBracket();
        expect(result.current).toBe('/');
    });

    // A reload or a replace can leave the first entry with a fresh key; the entry number still says
    // there is nothing of the app's before it.
    it('goes home rather than out of the app when the entry number says it is the first', () => {
        // Stepping back would land on /profile; the app's first entry goes home instead.
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

    it("leaves a press on home to HomePage's jump return", () => {
        const before = useBackRequestStore.getState().nonce;
        const { result } = renderAt(['/settings', '/']);
        pressModBracket();
        expect(result.current).toBe('/');
        expect(useBackRequestStore.getState().nonce).toBe(before + 1);
    });

    it('does nothing while a dialog is open over the page', () => {
        document.body.innerHTML = '<div role="dialog" data-state="open"></div>';
        const before = useBackRequestStore.getState().nonce;
        const { result } = renderAt(['/', '/settings']);
        pressModBracket();
        expect(result.current).toBe('/settings');
        expect(useBackRequestStore.getState().nonce).toBe(before);
    });

    it('lets a bare [ through to typing', () => {
        const before = useBackRequestStore.getState().nonce;
        renderAt(['/', '/settings']);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '[', code: 'BracketLeft' }));
        });
        expect(useBackRequestStore.getState().nonce).toBe(before);
    });
});

describe('useBackPress', () => {
    // The press that brought the reader home must not also spend the jump return.
    it('does not count a press made before it mounted', () => {
        act(() => useBackRequestStore.getState().press());
        const onPress = vi.fn();
        renderHook(() => useBackPress(onPress));
        expect(onPress).not.toHaveBeenCalled();
    });

    it('answers each press after it mounted', () => {
        const onPress = vi.fn();
        renderHook(() => useBackPress(onPress));
        act(() => useBackRequestStore.getState().press());
        act(() => useBackRequestStore.getState().press());
        expect(onPress).toHaveBeenCalledTimes(2);
    });
});
