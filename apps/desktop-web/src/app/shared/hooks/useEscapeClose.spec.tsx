import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEscapeClose } from './useEscapeClose';

const press = (prevented: boolean) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    if (prevented) event.preventDefault();
    window.dispatchEvent(event);
};

describe('useEscapeClose', () => {
    it('closes the panel on Escape', () => {
        const close = vi.fn();
        renderHook(() => useEscapeClose(close));
        press(false);
        expect(close).toHaveBeenCalledTimes(1);
    });

    // The inline message editor cancels an edit with Escape. The same press used to close
    // the thread panel around it as well.
    it('leaves an Escape something inside the panel already handled', () => {
        const close = vi.fn();
        renderHook(() => useEscapeClose(close));
        press(true);
        expect(close).not.toHaveBeenCalled();
    });
});
