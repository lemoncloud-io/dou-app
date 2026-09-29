import { useRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useRovingFocus } from './useRovingFocus';

const Feed = ({ count }: { count: number }) => {
    const ref = useRef<HTMLDivElement>(null);
    const roving = useRovingFocus(ref);
    return (
        <div ref={ref} onFocus={roving.onFocus} onKeyDown={roving.onKeyDown}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} data-roving-group="">
                    <button type="button">author {i}</button>
                    <div data-roving-item="" tabIndex={-1} role="article" aria-label={`m${i}`}>
                        <div data-row-actions="">
                            <button type="button">react {i}</button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const stops = () =>
    Array.from(document.querySelectorAll('[data-roving-item]')).filter(el => (el as HTMLElement).tabIndex === 0);

describe('useRovingFocus', () => {
    afterEach(cleanup);

    // Every message was its own tab stop: the composer was stop 161 of 163.
    it('keeps one message in the tab order, the newest until one is chosen', () => {
        render(<Feed count={3} />);
        expect(stops()).toEqual([screen.getByRole('article', { name: 'm2' })]);
    });

    it('steps with the arrows and carries the tab stop along', () => {
        render(<Feed count={3} />);
        const last = screen.getByRole('article', { name: 'm2' });
        last.focus();
        fireEvent.keyDown(last, { key: 'ArrowUp' });
        const middle = screen.getByRole('article', { name: 'm1' });
        expect(document.activeElement).toBe(middle);
        expect(stops()).toEqual([middle]);
        fireEvent.keyDown(middle, { key: 'Home' });
        expect(document.activeElement).toBe(screen.getByRole('article', { name: 'm0' }));
    });

    it('keeps the chosen message as the stop when newer ones arrive', () => {
        const { rerender } = render(<Feed count={2} />);
        const first = screen.getByRole('article', { name: 'm0' });
        first.focus();
        rerender(<Feed count={3} />);
        expect(stops()).toEqual([first]);
    });

    it('moves into the message actions on Enter', () => {
        render(<Feed count={2} />);
        const last = screen.getByRole('article', { name: 'm1' });
        last.focus();
        fireEvent.keyDown(last, { key: 'Enter' });
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'react 1' }));
    });

    // The rows left the tab order but every button in them stayed in it.
    it('keeps only the current message and its block in the tab order', () => {
        render(<Feed count={3} />);
        const tabbable = () =>
            screen
                .getAllByRole('button')
                .filter(button => button.tabIndex >= 0)
                .map(button => button.textContent);
        expect(tabbable()).toEqual(['author 2', 'react 2']);
        screen.getByRole('article', { name: 'm0' }).focus();
        expect(tabbable()).toEqual(['author 0', 'react 0']);
    });
});
