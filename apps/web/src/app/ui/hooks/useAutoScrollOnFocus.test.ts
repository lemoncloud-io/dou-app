import { act, renderHook } from '@testing-library/react';

import { useAutoScrollOnFocus } from './useAutoScrollOnFocus';

const VIEWPORT_HEIGHT = 800;
const KEYBOARD_HEIGHT = 336;

const setRect = (el: Element, top: number, height: number) => {
    el.getBoundingClientRect = () => ({
        top,
        bottom: top + height,
        height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: top,
        toJSON: () => ({}),
    });
};

const makeScroller = (el: HTMLElement, { scrollHeight }: { scrollHeight: number }) => {
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: VIEWPORT_HEIGHT, configurable: true });
    const scrollBy = jest.fn();
    el.scrollBy = scrollBy;
    return scrollBy;
};

const buildLayout = ({ fieldTop, withChrome = true }: { fieldTop: number; withChrome?: boolean }) => {
    document.body.innerHTML = '';

    const root = document.createElement('div');
    if (withChrome) root.setAttribute('data-chrome-root', '');

    const body = document.createElement('div');
    const field = document.createElement('input');
    body.appendChild(field);
    root.appendChild(body);

    const footer = document.createElement('div');
    footer.setAttribute('data-chrome-overlay', 'bottom');
    setRect(footer, VIEWPORT_HEIGHT - KEYBOARD_HEIGHT - 100, 100 + KEYBOARD_HEIGHT);
    root.appendChild(footer);

    document.body.appendChild(root);

    setRect(field, fieldTop, 48);
    const scrollBy = makeScroller(body, { scrollHeight: 1200 });

    return { field, scrollBy };
};

describe('useAutoScrollOnFocus', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 1, configurable: true });
        Object.defineProperty(window, 'visualViewport', {
            value: { offsetTop: 0, height: VIEWPORT_HEIGHT - KEYBOARD_HEIGHT },
            configurable: true,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
        document.documentElement.style.removeProperty('--keyboard-height');
    });

    const focusAndSettle = (field: HTMLElement) => {
        renderHook(() => useAutoScrollOnFocus());
        act(() => {
            field.focus();
            jest.advanceTimersByTime(300);
        });
    };

    it('스크롤로 하단 고정 CTA에 가린 입력을 읽히는 영역 가운데로 올린다', () => {
        const { field, scrollBy } = buildLayout({ fieldTop: 400 });

        focusAndSettle(field);

        expect(scrollBy).toHaveBeenCalledWith({ top: 242, behavior: 'smooth' });
    });

    it('이미 읽히는 영역 안에 있으면 스크롤하지 않는다', () => {
        const { field, scrollBy } = buildLayout({ fieldTop: 100 });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });

    it('자체 chrome root가 없는 시트의 입력은 뒤 화면의 CTA에 영향받지 않는다', () => {
        const { field, scrollBy } = buildLayout({ fieldTop: 400, withChrome: false });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });

    it('visualViewport가 줄지 않는 WebView에서는 --keyboard-height로 키보드를 걷어낸다', () => {
        Object.defineProperty(window, 'visualViewport', {
            value: { offsetTop: 0, height: VIEWPORT_HEIGHT },
            configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', { value: VIEWPORT_HEIGHT, configurable: true });
        document.documentElement.style.setProperty('--keyboard-height', `${KEYBOARD_HEIGHT}px`);

        const { field, scrollBy } = buildLayout({ fieldTop: 500, withChrome: false });

        focusAndSettle(field);

        expect(scrollBy).toHaveBeenCalledWith({ top: 292, behavior: 'smooth' });
    });

    it('터치 기기가 아니면 아무것도 하지 않는다', () => {
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
        const { field, scrollBy } = buildLayout({ fieldTop: 400 });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });
});
