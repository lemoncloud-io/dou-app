import { act, fireEvent, render, screen } from '@testing-library/react';

import { FloatingButton } from './FloatingButton';

describe('FloatingButton', () => {
    it('renders the label and fires onClick when enabled', () => {
        const onClick = jest.fn();
        render(<FloatingButton label="완료" onClick={onClick} />);

        const button = screen.getByRole('button', { name: '완료' });
        fireEvent.click(button);

        expect(button).toBeEnabled();
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('does not fire onClick when disabled', () => {
        const onClick = jest.fn();
        render(<FloatingButton label="완료" disabled onClick={onClick} />);

        const button = screen.getByRole('button', { name: '완료' });
        fireEvent.click(button);

        expect(button).toBeDisabled();
        expect(onClick).not.toHaveBeenCalled();
    });

    it('disables the button and hides the label while loading', () => {
        render(<FloatingButton label="완료" loading />);

        expect(screen.getByRole('button')).toBeDisabled();
        expect(screen.queryByText('완료')).not.toBeInTheDocument();
    });

    describe('snackbar lift', () => {
        const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');
        let resize: (() => void) | undefined;
        let height = 0;

        beforeEach(() => {
            height = 104;
            jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
                () => ({ height }) as DOMRect
            );
            (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
                constructor(callback: () => void) {
                    resize = callback;
                }
                observe = jest.fn();
                disconnect = jest.fn();
            };
        });

        afterEach(() => {
            jest.restoreAllMocks();
            delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
            resize = undefined;
        });

        it('lifts the snackbar by the panel height while it is mounted', () => {
            const { unmount } = render(<FloatingButton label="Done" />);
            expect(lift()).toBe('104px');

            unmount();
            expect(lift()).toBe('');
        });

        it('follows the panel when it grows, e.g. a link appearing under the button', () => {
            const { unmount } = render(<FloatingButton label="Done" />);

            height = 148;
            act(() => resize?.());

            expect(lift()).toBe('148px');
            unmount();
        });
    });
});
