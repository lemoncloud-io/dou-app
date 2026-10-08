import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import { SLIDE_FALLBACK_MS, SLIDE_MS } from '../overlay/slidePresence';
import { AttachPanel, type AttachPanelHandle, type AttachPanelProps } from './AttachPanel';

const labels = { photo: '사진', camera: '카메라', file: '파일', title: '첨부' };

const props = (overrides: Partial<AttachPanelProps> = {}): AttachPanelProps => ({
    open: true,
    height: 306,
    onPhoto: jest.fn(),
    onCamera: jest.fn(),
    onFile: jest.fn(),
    onClose: jest.fn(),
    labels,
    ...overrides,
});

const panel = () => screen.queryByRole('dialog', { name: '첨부', hidden: true });

const lift = () => document.documentElement.style.getPropertyValue('--toast-lift');

describe('AttachPanel', () => {
    afterEach(() => jest.useRealTimers());

    it('offers photos, camera and files in the design order and fires each', () => {
        const onPhoto = jest.fn();
        const onCamera = jest.fn();
        const onFile = jest.fn();
        render(<AttachPanel {...props({ onPhoto, onCamera, onFile })} />);

        const names = screen.getAllByRole('button').map(button => button.textContent);
        expect(names).toEqual(['사진', '카메라', '파일']);

        fireEvent.click(screen.getByRole('button', { name: '사진' }));
        fireEvent.click(screen.getByRole('button', { name: '카메라' }));
        fireEvent.click(screen.getByRole('button', { name: '파일' }));
        expect(onPhoto).toHaveBeenCalledTimes(1);
        expect(onCamera).toHaveBeenCalledTimes(1);
        expect(onFile).toHaveBeenCalledTimes(1);
    });

    it('hides the files entry when there is nothing to open', () => {
        render(<AttachPanel {...props({ onFile: undefined })} />);

        expect(screen.queryByRole('button', { name: '파일' })).not.toBeInTheDocument();
    });

    // A shell that cannot read the library passes no row; the panel must not draw an empty one.
    it('draws the recent row only when one is given', () => {
        const { rerender } = render(<AttachPanel {...props()} />);
        expect(screen.queryByTestId('recent')).not.toBeInTheDocument();

        rerender(<AttachPanel {...props({ recent: <div data-testid="recent" /> })} />);
        expect(screen.getByTestId('recent')).toBeInTheDocument();
    });

    // The app's back handler finds the topmost overlay by `[data-state="open"][role="dialog"]`; the
    // panel has to match it to be closed by back, and must not claim the page as a modal would.
    it('is an open, named, non-modal dialog while open', () => {
        render(<AttachPanel {...props()} />);

        const dialog = panel() as HTMLElement;
        expect(dialog).toHaveAttribute('data-state', 'open');
        expect(dialog).toHaveAttribute('aria-modal', 'false');
        expect(dialog).not.toHaveAttribute('inert');
    });

    it('takes the height it is given plus the bottom safe area', () => {
        render(<AttachPanel {...props({ height: 280 })} />);

        expect((panel() as HTMLElement).style.height).toBe('calc(280px + var(--safe-bottom, 0px))');
    });

    describe('sliding', () => {
        beforeEach(() => jest.useFakeTimers());

        it('is not in the page while closed, and rises into place when opened', () => {
            const { rerender } = render(<AttachPanel {...props({ open: false })} />);
            expect(panel()).not.toBeInTheDocument();

            rerender(<AttachPanel {...props()} />);
            expect(panel()).toHaveClass('translate-y-0');
        });

        it('slides down closed, untouchable on the way, and leaves the page once down', () => {
            const { rerender } = render(<AttachPanel {...props()} />);

            rerender(<AttachPanel {...props({ open: false })} />);
            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveAttribute('data-state', 'closed');
            expect(dialog).toHaveClass('translate-y-full');
            expect(dialog).toHaveAttribute('inert');

            act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
            expect(panel()).not.toBeInTheDocument();
        });

        it('moves for someone who asked for less motion only by appearing and disappearing', () => {
            render(<AttachPanel {...props()} />);

            expect(panel()).toHaveClass('motion-reduce:transition-none');
        });
    });

    // The keyboard and the panel hand the same slot to each other: where the keyboard does the moving,
    // the panel has to be there, or gone, without a slide of its own.
    describe('enter and exit', () => {
        const transformEnd = (element: Element) => {
            const event = new Event('transitionend', { bubbles: true });
            Object.defineProperty(event, 'propertyName', { value: 'transform' });
            act(() => {
                element.dispatchEvent(event);
            });
        };

        beforeEach(() => jest.useFakeTimers());

        it('slides in by default, and reports it once the slide has ended', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ open: false, onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ onTransitionEnd })} />);
            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveClass('transition-transform', 'duration-300', 'translate-y-0');
            expect(onTransitionEnd).not.toHaveBeenCalled();

            transformEnd(dialog);
            expect(onTransitionEnd).toHaveBeenCalledTimes(1);
            expect(onTransitionEnd).toHaveBeenCalledWith('open');
        });

        it('is in place at once with no transition for an instant enter, and says so right away', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ open: false, enter: 'instant', onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ enter: 'instant', onTransitionEnd })} />);

            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveClass('translate-y-0', 'transition-none');
            expect(dialog).not.toHaveClass('transition-transform');
            expect(dialog).toHaveAttribute('data-state', 'open');
            expect(onTransitionEnd).toHaveBeenCalledTimes(1);
            expect(onTransitionEnd).toHaveBeenCalledWith('open');
        });

        it('slides out by default, and reports it as it leaves the page', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ open: false, onTransitionEnd })} />);
            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveClass('transition-transform', 'translate-y-full');
            expect(onTransitionEnd).not.toHaveBeenCalled();

            transformEnd(dialog);
            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd).toHaveBeenCalledTimes(1);
            expect(onTransitionEnd).toHaveBeenCalledWith('closed');
        });

        it('is gone at once for an instant exit, and says so right away', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ open: false, exit: 'instant', onTransitionEnd })} />);

            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd).toHaveBeenCalledTimes(1);
            expect(onTransitionEnd).toHaveBeenCalledWith('closed');
        });

        // The swap the room makes: in instantly behind the keyboard, out with a slide on ×.
        it('mixes the two: an instant enter followed by a slide out slides', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ open: false, enter: 'instant', onTransitionEnd })} />);
            rerender(<AttachPanel {...props({ enter: 'instant', onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ open: false, enter: 'instant', onTransitionEnd })} />);

            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveClass('transition-transform', 'translate-y-full');
            expect(dialog).not.toHaveClass('transition-none');
            act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd.mock.calls).toEqual([['open'], ['closed']]);
        });

        // Hidden tab or reduced motion: no transitionend ever comes, and a held composer offset must still go.
        it('reports a slide whose end is never reported once the slide’s length has passed', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ open: false, onTransitionEnd })} />);

            rerender(<AttachPanel {...props({ onTransitionEnd })} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS));
            expect(onTransitionEnd).not.toHaveBeenCalled();
            act(() => jest.advanceTimersByTime(100));
            expect(onTransitionEnd).toHaveBeenCalledWith('open');

            rerender(<AttachPanel {...props({ open: false, onTransitionEnd })} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS + 100));
            expect(onTransitionEnd).toHaveBeenLastCalledWith('closed');
            expect(onTransitionEnd).toHaveBeenCalledTimes(2);
        });

        it('says nothing for the state it first renders in', () => {
            const onTransitionEnd = jest.fn();
            render(<AttachPanel {...props({ onTransitionEnd })} />);
            act(() => jest.advanceTimersByTime(SLIDE_MS * 2));

            expect(onTransitionEnd).not.toHaveBeenCalled();
        });
    });

    // The host moves the panel and its composer from one frame loop, so the two cannot part by a frame.
    describe('moved by its host', () => {
        const handle = React.createRef<AttachPanelHandle>();
        const external = (overrides: Partial<AttachPanelProps> = {}) => (
            <AttachPanel ref={handle} {...props({ motion: 'external', ...overrides })} />
        );
        const settle = () => act(() => handle.current?.settle());

        beforeEach(() => jest.useFakeTimers());

        it('hands its host the element that slides, while it is in the page', () => {
            const { rerender } = render(external({ open: false }));
            expect(handle.current?.surface).toBeNull();

            rerender(external());
            expect(handle.current?.surface).toBe(panel());
        });

        it('draws no transition of its own, rising from below only as its host moves it', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(external({ open: false, onTransitionEnd }));

            rerender(external({ onTransitionEnd }));
            const dialog = panel() as HTMLElement;
            // In the page at once, at the slide's start, for the host's first frame.
            expect(dialog).toHaveClass('translate-y-full', 'transition-none');
            expect(dialog).not.toHaveClass('transition-transform');
            expect(dialog).toHaveAttribute('data-state', 'open');
            dialog.style.transform = 'translateY(0%)';
            act(() => jest.advanceTimersByTime(SLIDE_MS));
            expect(onTransitionEnd).not.toHaveBeenCalled();

            settle();
            expect(dialog).toHaveClass('translate-y-0', 'transition-none');
            expect(onTransitionEnd.mock.calls).toEqual([['open']]);
        });

        it('stays in the page, closed and untouchable, until its host’s slide down is over', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(external({ onTransitionEnd }));

            rerender(external({ open: false, onTransitionEnd }));
            const dialog = panel() as HTMLElement;
            expect(dialog).toHaveAttribute('data-state', 'closed');
            expect(dialog).toHaveAttribute('inert');
            // Where the slide starts, until the host has drawn its first frame.
            expect(dialog).toHaveClass('translate-y-0');
            expect(onTransitionEnd).not.toHaveBeenCalled();

            settle();
            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd.mock.calls).toEqual([['closed']]);
        });

        it('comes to rest anyway when its host never says its slide is over', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(external({ onTransitionEnd }));

            rerender(external({ open: false, onTransitionEnd }));
            act(() => jest.advanceTimersByTime(SLIDE_FALLBACK_MS));

            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd.mock.calls).toEqual([['closed']]);
        });

        it('keeps instant changes its own, clearing what its host last drew', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(external({ onTransitionEnd }));
            rerender(external({ open: false, onTransitionEnd }));
            (panel() as HTMLElement).style.transform = 'translateY(60%)';

            rerender(external({ enter: 'instant', onTransitionEnd }));
            expect(panel()).toHaveClass('translate-y-0');
            expect((panel() as HTMLElement).style.transform).toBe('');

            rerender(external({ open: false, exit: 'instant', onTransitionEnd }));
            expect(panel()).not.toBeInTheDocument();
            expect(onTransitionEnd.mock.calls).toEqual([['open'], ['closed']]);
        });

        // Its own transition says when a slide ends; a stray settle must not cut one short.
        it('ignores settle while it moves itself', () => {
            const onTransitionEnd = jest.fn();
            const { rerender } = render(<AttachPanel ref={handle} {...props({ onTransitionEnd })} />);
            rerender(<AttachPanel ref={handle} {...props({ open: false, onTransitionEnd })} />);

            settle();

            expect(panel()).toBeInTheDocument();
            expect(onTransitionEnd).not.toHaveBeenCalled();
        });
    });

    describe('Escape and back', () => {
        it('closes on Escape while it is the topmost open overlay', () => {
            const onClose = jest.fn();
            render(<AttachPanel {...props({ onClose })} />);

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('ignores other keys, and Escape while closed', () => {
            const onClose = jest.fn();
            const { rerender } = render(<AttachPanel {...props({ onClose })} />);
            fireEvent.keyDown(document, { key: 'Enter' });

            rerender(<AttachPanel {...props({ open: false, onClose })} />);
            fireEvent.keyDown(document, { key: 'Escape' });

            expect(onClose).not.toHaveBeenCalled();
        });

        // The photo grid and the editor open above the panel, portalled after it; Escape and back are theirs.
        it('leaves Escape to an overlay opened above it', () => {
            const onClose = jest.fn();
            render(
                <>
                    <AttachPanel {...props({ onClose })} />
                    <div role="dialog" data-state="open" />
                </>
            );

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(onClose).not.toHaveBeenCalled();
        });

        it('closes on Escape again once the overlay above it has closed', () => {
            const onClose = jest.fn();
            const { rerender } = render(
                <>
                    <AttachPanel {...props({ onClose })} />
                    <div role="dialog" data-state="open" />
                </>
            );
            rerender(
                <>
                    <AttachPanel {...props({ onClose })} />
                    <div role="dialog" data-state="closed" />
                </>
            );

            fireEvent.keyDown(document, { key: 'Escape' });

            expect(onClose).toHaveBeenCalledTimes(1);
        });

        // A Radix overlay dismisses itself on the press and marks it handled before the panel hears it.
        it('ignores an Escape something else already handled', () => {
            const onClose = jest.fn();
            render(<AttachPanel {...props({ onClose })} />);
            const claim = (event: KeyboardEvent) => event.preventDefault();
            document.addEventListener('keydown', claim, { capture: true });

            fireEvent.keyDown(document, { key: 'Escape' });
            document.removeEventListener('keydown', claim, { capture: true });

            expect(onClose).not.toHaveBeenCalled();
        });

        it('marks the Escape it acts on as handled', () => {
            render(<AttachPanel {...props()} />);

            const notPrevented = fireEvent.keyDown(document, { key: 'Escape' });

            expect(notPrevented).toBe(false);
        });
    });

    // A snackbar raised while the panel is up would otherwise sit on its tiles.
    it('lifts the snackbar by its height while open, and stops on close', () => {
        const { rerender, unmount } = render(<AttachPanel {...props({ height: 306 })} />);
        expect(lift()).toBe('306px');

        rerender(<AttachPanel {...props({ height: 306, open: false })} />);
        expect(lift()).toBe('');
        unmount();
    });

    // On a white page the panel has no other edge; the design draws it with an upward shadow.
    it('draws the panel with the rounded top and the upward shadow', () => {
        render(<AttachPanel {...props()} />);

        expect(panel()).toHaveClass('rounded-t-[20px]', 'shadow-[0_-2px_6px_rgba(0,0,0,0.12)]');
    });
});
