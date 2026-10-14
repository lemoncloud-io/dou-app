import { describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import { SegmentedControl } from './SegmentedControl';

const renderControl = (value = 'b') => {
    const onSelect = vi.fn();
    render(
        <SegmentedControl
            options={['a', 'b', 'c'] as const}
            value={value}
            onSelect={onSelect}
            getLabel={option => ({ a: 'All', b: 'Mentions', c: 'Off' })[option]}
            ariaLabel="Notifications"
        />
    );
    return onSelect;
};

describe('SegmentedControl', () => {
    it('checks only the current option', () => {
        renderControl();
        const radios = screen.getAllByRole('radio');
        expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    });

    it('selects on click', () => {
        const onSelect = renderControl();
        fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
        expect(onSelect).toHaveBeenCalledWith('c');
    });

    it('moves with the arrow keys', () => {
        const onSelect = renderControl();
        fireEvent.keyDown(screen.getByRole('radio', { name: 'Mentions' }), { key: 'ArrowRight' });
        expect(onSelect).toHaveBeenCalledWith('c');
    });

    it('is one tab stop', () => {
        renderControl();
        const radios = screen.getAllByRole('radio');
        expect(radios.map(radio => radio.tabIndex)).toEqual([-1, 0, -1]);
    });

    it('stands at least 36px tall', () => {
        renderControl();
        expect(screen.getByRole('radiogroup').className).toContain('min-h-9');
    });

    // The picked option is the brand lime with ink text — hue, weight and ink
    // change together, never shade alone.
    it('fills the picked option lime', () => {
        renderControl();
        const picked = screen.getByRole('radio', { name: 'Mentions' });
        expect(picked.className).toContain('bg-primary');
        expect(picked.textContent).toBeTruthy();
    });
});
