import { renderHook } from '@testing-library/react';

import { useEscapeClose } from './useEscapeClose';

const press = (prevented: boolean) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    if (prevented) event.preventDefault();
    window.dispatchEvent(event);
};

describe('useEscapeClose', () => {
    it('closes the panel on Escape', () => {
        const close = jest.fn();
        renderHook(() => useEscapeClose(close));
        press(false);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('leaves an Escape something inside the panel already handled', () => {
        const close = jest.fn();
        renderHook(() => useEscapeClose(close));
        press(true);
        expect(close).not.toHaveBeenCalled();
    });
});
