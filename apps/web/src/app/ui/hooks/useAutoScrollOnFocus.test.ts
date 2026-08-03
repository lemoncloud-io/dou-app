import { act, renderHook } from '@testing-library/react';

import { useAutoScrollOnFocus } from './useAutoScrollOnFocus';

/** Screen geometry the fake keyboard shrinks the visual viewport to. */
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

/** jsdom reports every box as 0×0 and has no scroll methods, so both are stubbed per element. */
const makeScroller = (el: HTMLElement, { scrollHeight }: { scrollHeight: number }) => {
    el.style.overflowY = 'auto';
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: VIEWPORT_HEIGHT, configurable: true });
    const scrollBy = jest.fn();
    el.scrollBy = scrollBy;
    return scrollBy;
};

/**
 * Builds the KeyboardAwareLayout shape: a chrome root holding a docked bottom overlay (the CTA
 * panel riding above the keyboard) and a scrollable body with one field.
 */
const buildLayout = ({ fieldTop, withChrome = true }: { fieldTop: number; withChrome?: boolean }) => {
    document.body.innerHTML = '';

    const root = document.createElement('div');
    if (withChrome) root.setAttribute('data-chrome-root', '');

    const body = document.createElement('div');
    const field = document.createElement('input');
    body.appendChild(field);
    root.appendChild(body);

    // The CTA panel sits directly on top of the keyboard, covering 100px of the visible area.
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
        // Band is 0..364 (viewport 464 minus the 100px CTA panel); the field sits at 400..448.
        const { field, scrollBy } = buildLayout({ fieldTop: 400 });

        focusAndSettle(field);

        // Field centre 424 → band centre 182, so the body scrolls down by the difference.
        expect(scrollBy).toHaveBeenCalledWith({ top: 242, behavior: 'smooth' });
    });

    it('이미 읽히는 영역 안에 있으면 스크롤하지 않는다', () => {
        const { field, scrollBy } = buildLayout({ fieldTop: 100 });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });

    it('자체 chrome root가 없는 시트의 입력은 뒤 화면의 CTA에 영향받지 않는다', () => {
        // Same geometry, but the field is not inside a chrome root — the overlay behind it must not
        // shrink the band, so a field above the keyboard counts as visible.
        const { field, scrollBy } = buildLayout({ fieldTop: 400, withChrome: false });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });

    it('visualViewport가 줄지 않는 WebView에서는 --keyboard-height로 키보드를 걷어낸다', () => {
        // The native WebView injects the var instead of shrinking the viewport, so the band has to
        // come from the var alone — the case a sheet's field (no chrome root) depends on entirely.
        Object.defineProperty(window, 'visualViewport', {
            value: { offsetTop: 0, height: VIEWPORT_HEIGHT },
            configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', { value: VIEWPORT_HEIGHT, configurable: true });
        document.documentElement.style.setProperty('--keyboard-height', `${KEYBOARD_HEIGHT}px`);

        // Band is 0..464; the field sits at 500..548, i.e. buried under the keyboard.
        const { field, scrollBy } = buildLayout({ fieldTop: 500, withChrome: false });

        focusAndSettle(field);

        // Field centre 524 → band centre 232.
        expect(scrollBy).toHaveBeenCalledWith({ top: 292, behavior: 'smooth' });
    });

    it('터치 기기가 아니면 아무것도 하지 않는다', () => {
        Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
        const { field, scrollBy } = buildLayout({ fieldTop: 400 });

        focusAndSettle(field);

        expect(scrollBy).not.toHaveBeenCalled();
    });
});
