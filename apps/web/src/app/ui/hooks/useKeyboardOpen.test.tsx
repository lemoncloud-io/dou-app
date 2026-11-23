import { act, render } from '@testing-library/react';

import { useKeyboardOpen } from './useKeyboardOpen';

type Emit = (blockSize: number) => void;

let emit: Emit;
let disconnected = 0;

beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        constructor(private readonly callback: ResizeObserverCallback) {}
        observe(target: Element) {
            emit = blockSize =>
                act(() => {
                    this.callback(
                        [{ target, borderBoxSize: [{ blockSize, inlineSize: 0 }] } as unknown as ResizeObserverEntry],
                        this as unknown as ResizeObserver
                    );
                });
        }
        unobserve() {
            // The hook only ever disconnects.
        }
        disconnect() {
            disconnected += 1;
        }
    };
});

const LAYOUT_HEIGHT = 800;
const viewport = { height: LAYOUT_HEIGHT, addEventListener: jest.fn(), removeEventListener: jest.fn() };

beforeAll(() => {
    Object.defineProperty(window, 'innerHeight', { value: LAYOUT_HEIGHT, configurable: true });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
});

const setViewportHeight = (height: number) => {
    viewport.height = height;
};

const probe = () => document.body.querySelector('div[aria-hidden="true"]');

const Harness = ({ onRender }: { onRender: (open: boolean) => void }) => {
    onRender(useKeyboardOpen());
    return null;
};

const renderHook = () => {
    const states: boolean[] = [];
    const view = render(<Harness onRender={open => states.push(open)} />);
    return { states, latest: () => states[states.length - 1], ...view };
};

beforeEach(() => {
    disconnected = 0;
    setViewportHeight(LAYOUT_HEIGHT);
});

describe('useKeyboardOpen', () => {
    it('아무 신호도 없으면 닫힘이다', () => {
        const { latest } = renderHook();

        expect(latest()).toBe(false);
        expect(probe()).not.toBeNull();
    });

    it('주입된 --keyboard-height가 자라면 열림으로 본다', () => {
        const { latest } = renderHook();

        emit(336);

        expect(latest()).toBe(true);
    });

    it('키보드라 할 수 없는 짧은 인셋(액세서리 바 등)은 무시한다', () => {
        const { latest } = renderHook();

        emit(44);

        expect(latest()).toBe(false);
    });

    it('키보드가 내려가면 다시 닫힘으로 돌아온다', () => {
        const { latest } = renderHook();

        emit(336);
        emit(0);

        expect(latest()).toBe(false);
    });

    it('변수가 없는 브라우저에서는 줄어든 visual viewport로 판단한다', () => {
        setViewportHeight(470);
        const { latest } = renderHook();

        expect(latest()).toBe(true);
    });

    it('언마운트하면 프로브와 옵저버를 걷어낸다', () => {
        const { unmount } = renderHook();

        unmount();

        expect(probe()).toBeNull();
        expect(disconnected).toBe(1);
    });
});
