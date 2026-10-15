import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { GapDivider } from './GapDivider';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

// jsdom has no IntersectionObserver; this one lets a test say when the divider is on screen and where.
let observed: ((entry: Partial<IntersectionObserverEntry>) => void) | null = null;
class FakeObserver {
    constructor(callback: (entries: Partial<IntersectionObserverEntry>[]) => void) {
        observed = entry => callback([entry]);
    }
    observe = jest.fn();
    disconnect = jest.fn();
}

const onScreen = (top: number, viewportHeight = 800) =>
    act(() =>
        observed?.({
            isIntersecting: true,
            boundingClientRect: { top, bottom: top + 30 } as DOMRectReadOnly,
            rootBounds: { height: viewportHeight } as DOMRectReadOnly,
        })
    );

beforeEach(() => {
    observed = null;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
});

afterEach(() => {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('GapDivider', () => {
    it('fills from the newer side when it comes into view in the upper half (the reader is below it)', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill onFill={onFill} />);

        onScreen(100);

        expect(onFill).toHaveBeenCalledWith('newer', false);
    });

    it('fills from the older side when it comes into view in the lower half (the reader is above it)', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill onFill={onFill} />);

        onScreen(700);

        expect(onFill).toHaveBeenCalledWith('older', false);
    });

    it('asks once per divider, however often it is seen', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill onFill={onFill} />);

        onScreen(100);
        onScreen(120);

        expect(onFill).toHaveBeenCalledTimes(1);
    });

    it('waits for a page to be sendable, then asks', () => {
        const onFill = jest.fn();
        const { rerender } = render(<GapDivider canFill={false} onFill={onFill} />);
        onScreen(100);
        expect(onFill).not.toHaveBeenCalled();

        rerender(<GapDivider canFill onFill={onFill} />);

        expect(onFill).toHaveBeenCalledWith('newer', false);
    });

    it('does not refire after a failure by itself, and retries on a tap', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill status="failed" onFill={onFill} />);
        onScreen(100);
        expect(onFill).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('chat.room.gap.retry'));

        expect(onFill).toHaveBeenCalledTimes(1);
    });

    it('with auto-fill off, waits on screen for a tap and says it came from one', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill autoFill={false} onFill={onFill} />);
        onScreen(100);
        expect(onFill).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText('chat.room.gap.load'));

        expect(onFill).toHaveBeenCalledWith(expect.stringMatching(/^(newer|older)$/), true);
    });

    it('shows that a page is on its way and takes no tap meanwhile', () => {
        const onFill = jest.fn();
        render(<GapDivider canFill status="loading" onFill={onFill} />);

        fireEvent.click(screen.getByText('chat.room.gap.loading'));

        expect(onFill).not.toHaveBeenCalled();
        expect(screen.getByRole('button')).toBeDisabled();
    });
});
