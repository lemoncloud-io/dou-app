import { act, fireEvent, render, screen } from '@testing-library/react';

import { BottomSheet } from './BottomSheet';
import { SheetOption } from './SheetOption';

describe('BottomSheet', () => {
    it('renders the title, children and footer when open', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="신고하기" footer={<button>신고</button>}>
                <div>body</div>
            </BottomSheet>
        );

        expect(screen.getByText('신고하기')).toBeInTheDocument();
        expect(screen.getByText('body')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '신고' })).toBeInTheDocument();
    });

    it('fires onClose and closes when the close button is pressed', () => {
        const onClose = jest.fn();
        const onOpenChange = jest.fn();
        render(<BottomSheet open onOpenChange={onOpenChange} title="신고하기" onClose={onClose} closeLabel="닫기" />);

        fireEvent.click(screen.getByRole('button', { name: '닫기' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('rides above the soft keyboard and gives back the same height', () => {
        render(<BottomSheet open onOpenChange={jest.fn()} title="신고하기" footer={<button>신고</button>} />);

        const panel = screen.getByRole('dialog');
        expect(panel).toHaveClass('[transform:translateY(calc(var(--sheet-drag-y,0px)-var(--keyboard-height,0px)))]');
        expect(panel).toHaveClass('max-h-[calc(90vh-var(--keyboard-height,0px))]');
    });

    it('hideHeader drops the title bar and close button but keeps the accessible name', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" onClose={jest.fn()} hideHeader>
                <p>body</p>
            </BottomSheet>
        );

        expect(screen.getByText('반응한 사람')).toHaveClass('sr-only');
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAccessibleName('반응한 사람');
    });

    it('draws the title bar and close button by default', () => {
        render(
            <BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" onClose={jest.fn()}>
                <p>body</p>
            </BottomSheet>
        );

        expect(screen.getByText('반응한 사람')).not.toHaveClass('sr-only');
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });

    it('shows the grabber only when asked', () => {
        const { rerender } = render(<BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" hideHeader />);
        expect(screen.getByRole('dialog').querySelector('span[aria-hidden].w-9')).toBeNull();

        rerender(<BottomSheet open onOpenChange={jest.fn()} title="반응한 사람" hideHeader showHandle />);
        expect(screen.getByRole('dialog').querySelector('span[aria-hidden].w-9')).not.toBeNull();
    });

    it('renders nothing when closed', () => {
        render(<BottomSheet open={false} onOpenChange={jest.fn()} title="신고하기" />);

        expect(screen.queryByText('신고하기')).not.toBeInTheDocument();
    });
});

describe('BottomSheet drag to dismiss', () => {
    const PANEL_HEIGHT = 400;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(PANEL_HEIGHT);
        HTMLElement.prototype.setPointerCapture = jest.fn();
        HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    const openSheet = (props: Partial<React.ComponentProps<typeof BottomSheet>> = {}) => {
        const onOpenChange = jest.fn();
        const view = render(
            <BottomSheet open onOpenChange={onOpenChange} title="신고하기" showHandle {...props}>
                <div>body</div>
            </BottomSheet>
        );
        return { onOpenChange, panel: screen.getByRole('dialog'), view };
    };

    const pointer = (type: string, el: HTMLElement, clientY: number, at: number, pointerId = 1) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientY });
        Object.defineProperty(event, 'pointerId', { value: pointerId });
        Object.defineProperty(event, 'timeStamp', { value: at });
        fireEvent(el, event);
    };

    const drag = (panel: HTMLElement, { to, overMs = 400 }: { to: number; overMs?: number }) => {
        pointer('pointerdown', panel, 0, 0);
        pointer('pointermove', panel, to / 2, overMs / 2);
        pointer('pointermove', panel, to, overMs);
        pointer('pointerup', panel, to, overMs);
    };

    it('follows the pointer down while the gesture is in progress', () => {
        const { panel } = openSheet();

        pointer('pointerdown', panel, 0, 0);
        pointer('pointermove', panel, 40, 200);

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('40px');
        expect(panel).toHaveClass('!animate-none');
    });

    it('does not move the panel upward', () => {
        const { panel } = openSheet();

        pointer('pointerdown', panel, 100, 0);
        pointer('pointermove', panel, 20, 200);

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
    });

    it('dismisses through onOpenChange once the panel has left, not at the moment of release', () => {
        const { panel, onOpenChange } = openSheet();

        drag(panel, { to: PANEL_HEIGHT / 2 });

        expect(onOpenChange).not.toHaveBeenCalled();
        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe(`${PANEL_HEIGHT}px`);

        act(() => void jest.advanceTimersByTime(220));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('springs back and keeps the sheet open when the release cleared neither threshold', () => {
        const { panel, onOpenChange } = openSheet();

        drag(panel, { to: 20 });

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');

        act(() => void jest.advanceTimersByTime(220));

        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('keeps the transition in place for the whole spring-back, then drops it', () => {
        const { panel } = openSheet();

        drag(panel, { to: 20 });

        act(() => void jest.advanceTimersByTime(100));
        expect(panel).toHaveClass('transition-transform');

        act(() => void jest.advanceTimersByTime(100));
        expect(panel).not.toHaveClass('transition-transform');
    });

    it('leaves the keyframes alone on a tap, so the sheet does not slide in again', () => {
        const { panel } = openSheet();

        pointer('pointerdown', panel, 0, 0);
        pointer('pointerup', panel, 0, 80);

        expect(panel).not.toHaveClass('!animate-none');
        expect(panel).not.toHaveAttribute('data-drag-phase');
    });

    it('treats a press that wobbled inside the slop as a tap, not a drag', () => {
        const { panel } = openSheet();

        pointer('pointerdown', panel, 0, 0);
        pointer('pointermove', panel, 5, 40);
        pointer('pointerup', panel, 5, 80);

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
        expect(panel).not.toHaveClass('!animate-none');
        expect(HTMLElement.prototype.setPointerCapture).not.toHaveBeenCalled();
    });

    it('keeps the keyframes off after a spring-back for as long as the sheet stays open', () => {
        const { panel } = openSheet();

        drag(panel, { to: 20 });
        act(() => void jest.advanceTimersByTime(1000));

        expect(panel).toHaveClass('!animate-none');
        expect(panel).not.toHaveClass('transition-transform');
    });

    it('lets the first finger finish its drag when a second one lands on the panel', () => {
        const { panel } = openSheet();

        pointer('pointerdown', panel, 0, 0);
        pointer('pointermove', panel, 60, 200);
        pointer('pointerdown', panel, 100, 250, 2);
        pointer('pointerup', panel, 100, 300, 2);

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('60px');
        pointer('pointerup', panel, 60, 400);
        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
    });

    it('gives a reopened sheet its enter keyframe back after a spring-back', () => {
        const { panel, view } = openSheet();
        drag(panel, { to: 20 });
        act(() => void jest.advanceTimersByTime(1000));

        view.rerender(
            <BottomSheet open={false} onOpenChange={jest.fn()} title="신고하기" showHandle>
                <div>body</div>
            </BottomSheet>
        );
        view.rerender(
            <BottomSheet open onOpenChange={jest.fn()} title="신고하기" showHandle>
                <div>body</div>
            </BottomSheet>
        );

        expect(screen.getByRole('dialog')).not.toHaveClass('!animate-none');
    });

    it('dismisses on a fast flick that never reached the distance threshold', () => {
        const { panel, onOpenChange } = openSheet();

        drag(panel, { to: 40, overMs: 20 });
        act(() => void jest.advanceTimersByTime(220));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('refuses to start once the body has been scrolled, so the gesture stays a scroll', () => {
        const { panel, onOpenChange } = openSheet();
        const body = panel.querySelector('.overflow-y-auto') as HTMLElement;
        Object.defineProperty(body, 'scrollTop', { value: 120, configurable: true });

        drag(panel, { to: PANEL_HEIGHT });

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('reads the content scroller passed as scrollRef instead of the body, which never scrolls then', () => {
        const scroller = document.createElement('div');
        Object.defineProperty(scroller, 'scrollTop', { value: 120, configurable: true });
        const { panel, onOpenChange } = openSheet({ scrollRef: { current: scroller } });

        drag(panel, { to: PANEL_HEIGHT });

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('still dismisses with a scrollRef whose element is at its top', () => {
        const scroller = document.createElement('div');
        const { panel, onOpenChange } = openSheet({ scrollRef: { current: scroller } });

        drag(panel, { to: PANEL_HEIGHT });
        act(() => void jest.advanceTimersByTime(220));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('ignores the gesture entirely when drag to dismiss is turned off', () => {
        const { panel, onOpenChange } = openSheet({ disableDragToDismiss: true });

        drag(panel, { to: PANEL_HEIGHT });

        act(() => void jest.advanceTimersByTime(220));

        expect(panel.style.getPropertyValue('--sheet-drag-y')).toBe('0px');
        expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('does not fire onOpenChange twice when the host closes the sheet mid-dismissal', () => {
        const onOpenChange = jest.fn();
        const { rerender } = render(
            <BottomSheet open onOpenChange={onOpenChange} title="신고하기">
                <div>body</div>
            </BottomSheet>
        );
        drag(screen.getByRole('dialog'), { to: PANEL_HEIGHT / 2 });

        rerender(
            <BottomSheet open={false} onOpenChange={onOpenChange} title="신고하기">
                <div>body</div>
            </BottomSheet>
        );
        act(() => void jest.advanceTimersByTime(400));

        expect(onOpenChange).not.toHaveBeenCalled();
    });
});

describe('SheetOption', () => {
    it('reflects selected state and fires onSelect', () => {
        const onSelect = jest.fn();
        const { rerender } = render(<SheetOption label="혐오 발언" selected={false} onSelect={onSelect} />);

        const option = screen.getByRole('radio', { name: '혐오 발언' });
        expect(option).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(option);
        expect(onSelect).toHaveBeenCalledTimes(1);

        rerender(<SheetOption label="혐오 발언" selected onSelect={onSelect} />);
        expect(screen.getByRole('radio', { name: '혐오 발언' })).toHaveAttribute('aria-checked', 'true');
    });
});
