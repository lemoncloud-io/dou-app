import type { KeyboardEvent } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import { useListboxNav } from './useListboxNav';

const key = (k: string, isComposing = false) =>
    ({ key: k, preventDefault: vi.fn(), nativeEvent: { isComposing } }) as unknown as KeyboardEvent<HTMLElement>;

describe('useListboxNav', () => {
    it('wraps with the arrows and picks the active option on Enter', () => {
        const onPick = vi.fn();
        const { result } = renderHook(() => useListboxNav(3, onPick));

        act(() => result.current.inputProps.onKeyDown(key('ArrowUp')));
        expect(result.current.activeIndex).toBe(2);

        act(() => result.current.inputProps.onKeyDown(key('ArrowDown')));
        expect(result.current.activeIndex).toBe(0);

        act(() => result.current.inputProps.onKeyDown(key('Enter')));
        expect(onPick).toHaveBeenCalledWith(0);
    });

    it('points aria-activedescendant at the active option', () => {
        const { result } = renderHook(() => useListboxNav(2, vi.fn()));
        act(() => result.current.inputProps.onKeyDown(key('ArrowDown')));
        expect(result.current.inputProps['aria-activedescendant']).toBe(result.current.optionId(1));
        expect(result.current.inputProps.role).toBe('combobox');
    });

    it('leaves the arrows to an IME that is composing', () => {
        const { result } = renderHook(() => useListboxNav(3, vi.fn()));
        act(() => result.current.inputProps.onKeyDown(key('ArrowDown', true)));
        expect(result.current.activeIndex).toBe(0);
    });

    it('returns to the first option when the reset key changes', () => {
        const { result, rerender } = renderHook(({ q }) => useListboxNav(3, vi.fn(), q), {
            initialProps: { q: 'a' },
        });
        act(() => result.current.inputProps.onKeyDown(key('ArrowDown')));
        expect(result.current.activeIndex).toBe(1);
        rerender({ q: 'ab' });
        expect(result.current.activeIndex).toBe(0);
    });

    it('announces nothing and picks nothing on an empty list', () => {
        const onPick = vi.fn();
        const { result } = renderHook(() => useListboxNav(0, onPick));
        act(() => result.current.inputProps.onKeyDown(key('Enter')));
        expect(onPick).not.toHaveBeenCalled();
        expect(result.current.inputProps['aria-activedescendant']).toBeUndefined();
    });
});
