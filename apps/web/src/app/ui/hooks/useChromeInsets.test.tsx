import { render } from '@testing-library/react';

import { useChromeInsets } from './useChromeInsets';

/**
 * jsdom has no layout engine and no ResizeObserver, so both are stubbed: `offsetHeight` is
 * defined per element, and the observer records what it was told to watch without ever firing.
 *
 * That stub is the point of this suite. If the hook only ever learns its heights from the
 * observer, every assertion below reads 0 — which is exactly the bug these tests exist to hold
 * shut: in a real browser the observer's first callback lands a frame late, so the body paints
 * once with no insets and then jumps.
 */
const observed: Element[] = [];
beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
        observe(target: Element) {
            observed.push(target);
        }
        unobserve() {
            // Never fires: these tests assert what the hook knows WITHOUT the observer's help.
        }
        disconnect() {
            // Same — teardown has nothing to undo when nothing was ever delivered.
        }
    };
});

beforeEach(() => {
    observed.length = 0;
});

const withHeight = (el: HTMLElement | null, height: number) => {
    if (el) Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
};

/** Renders a chrome layout and reports the insets seen on each commit. */
const Harness = ({ withFooter, onRender }: { withFooter: boolean; onRender: (insets: number[]) => void }) => {
    const { headerRef, footerRef, headerHeight, footerHeight } = useChromeInsets();
    onRender([headerHeight, footerHeight]);
    return (
        <div>
            <div ref={el => withHeight((headerRef.current = el as HTMLDivElement), 60)} data-testid="header" />
            {withFooter && <div ref={el => withHeight((footerRef.current = el as HTMLDivElement), 80)} />}
        </div>
    );
};

describe('useChromeInsets', () => {
    it('첫 커밋이 그려지기 전에 헤더 높이를 잰다 — 0으로 한 번 그리지 않는다', () => {
        const commits: number[][] = [];
        render(<Harness withFooter={false} onRender={insets => commits.push(insets)} />);

        // 마지막 값이 아니라 "0으로 페인트된 적이 없다"가 요점이다. 레이아웃 이펙트에서
        // setState하면 React가 페인트 전에 다시 렌더하므로, 사용자가 보는 첫 프레임은 60이다.
        expect(commits[commits.length - 1][0]).toBe(60);
        expect(observed).toContain(document.querySelector('[data-testid="header"]'));
    });

    // 조건부로 붙는 footer(KeyboardAwareLayout)도 같은 대접을 받아야 한다 — 헤더만 동기 측정하고
    // footer는 옵저버에 맡기면 나중에 뜨는 하단 CTA에서 같은 점프가 재현된다.
    it('나중에 붙는 footer도 붙는 커밋에서 잰다', () => {
        const commits: number[][] = [];
        const { rerender } = render(<Harness withFooter={false} onRender={insets => commits.push(insets)} />);
        expect(commits[commits.length - 1][1]).toBe(0);

        rerender(<Harness withFooter onRender={insets => commits.push(insets)} />);

        expect(commits[commits.length - 1][1]).toBe(80);
    });

    // 동기 측정은 강제 레이아웃 읽기다. 메시지 100개짜리 목록이 리렌더될 때마다 반복되면
    // 고치려던 것보다 비싼 문제가 된다 — 요소당 한 번으로 묶여 있어야 한다.
    it('요소당 한 번만 동기 측정한다 — 리렌더마다 다시 재지 않는다', () => {
        const commits: number[][] = [];
        const { rerender } = render(<Harness withFooter={false} onRender={insets => commits.push(insets)} />);

        const header = document.querySelector('[data-testid="header"]') as HTMLElement;
        let reads = 0;
        Object.defineProperty(header, 'offsetHeight', {
            get() {
                reads += 1;
                return 60;
            },
            configurable: true,
        });

        rerender(<Harness withFooter={false} onRender={insets => commits.push(insets)} />);
        rerender(<Harness withFooter={false} onRender={insets => commits.push(insets)} />);

        expect(reads).toBe(0);
    });
});
