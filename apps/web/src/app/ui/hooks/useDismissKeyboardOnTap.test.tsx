import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useDismissKeyboardOnTap } from './useDismissKeyboardOnTap';

const PHONE_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

let userAgent = PHONE_UA;

beforeAll(() => {
    jest.spyOn(navigator, 'userAgent', 'get').mockImplementation(() => userAgent);
});

afterAll(() => {
    jest.restoreAllMocks();
});

beforeEach(() => {
    userAgent = PHONE_UA;
});

const Host = ({ children }: { children: ReactNode }) => {
    useDismissKeyboardOnTap();
    return <>{children}</>;
};

interface PointerInit {
    pointerId?: number;
    isPrimary?: boolean;
    clientX?: number;
    clientY?: number;
}

/**
 * jsdom has no `PointerEvent`, and `fireEvent.pointerDown` falls back to a bare `Event` that drops
 * the pointer fields. A `MouseEvent` carries the coordinates; the two pointer fields are added on it.
 */
const pointer = (
    el: Element,
    type: string,
    { pointerId = 1, isPrimary = true, clientX = 100, clientY = 100 }: PointerInit = {}
) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: isPrimary } });
    act(() => {
        el.dispatchEvent(event);
    });
};

/** A finger press on `el` that lifts `moveBy` pixels further down. */
const tap = (el: Element, { moveBy = 0, pointerId = 1, isPrimary = true } = {}) => {
    pointer(el, 'pointerdown', { pointerId, isPrimary });
    pointer(el, 'pointerup', { pointerId, isPrimary, clientY: 100 + moveBy });
};

const renderForm = () =>
    render(
        <Host>
            <div data-testid="empty">
                <p>caption</p>
                <input aria-label="name" />
                <input aria-label="phone" type="tel" />
                <button type="button">send code</button>
                <div role="dialog" tabIndex={-1} data-testid="panel">
                    <span>panel text</span>
                </div>
            </div>
        </Host>
    );

const focus = (name: string) => {
    const el = screen.getByLabelText(name);
    el.focus();
    return el;
};

describe('useDismissKeyboardOnTap', () => {
    it('blurs the focused field when a tap lands on empty space', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByText('caption'));

        expect(document.activeElement).not.toBe(name);
    });

    it('blurs on a tap on a dialog panel, which is focusable only by script', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByText('panel text'));

        expect(document.activeElement).not.toBe(name);
    });

    it('keeps the keyboard for a tap on a button', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByRole('button', { name: 'send code' }));

        expect(document.activeElement).toBe(name);
    });

    it('keeps the keyboard for a tap on another field and on the focused field itself', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByLabelText('phone'));
        expect(document.activeElement).toBe(name);

        tap(name);
        expect(document.activeElement).toBe(name);
    });

    it('keeps the keyboard when the press moved like a scroll', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByText('caption'), { moveBy: 40 });

        expect(document.activeElement).toBe(name);
    });

    it('keeps the keyboard when the browser cancels the press', () => {
        renderForm();
        const name = focus('name');
        const caption = screen.getByText('caption');

        pointer(caption, 'pointerdown');
        pointer(caption, 'pointercancel');
        pointer(caption, 'pointerup');

        expect(document.activeElement).toBe(name);
    });

    it('ignores a second finger', () => {
        renderForm();
        const name = focus('name');

        tap(screen.getByText('caption'), { isPrimary: false });

        expect(document.activeElement).toBe(name);
    });

    it('leaves the chat composer alone', () => {
        render(
            <Host>
                <p>message</p>
                <div data-no-autoscroll>
                    <textarea aria-label="composer" />
                </div>
            </Host>
        );
        const composer = focus('composer');

        tap(screen.getByText('message'));

        expect(document.activeElement).toBe(composer);
    });

    it('treats a verification code group as one control, gaps included', () => {
        render(
            <Host>
                <div data-return-key-unit data-testid="code">
                    <input aria-label="digit 1" />
                    <input aria-label="digit 2" />
                </div>
            </Host>
        );
        const digit = focus('digit 1');

        tap(screen.getByTestId('code'));

        expect(document.activeElement).toBe(digit);
    });

    it('blurs a textarea too', () => {
        render(
            <Host>
                <p>caption</p>
                <textarea aria-label="feedback" />
            </Host>
        );
        const feedback = focus('feedback');

        tap(screen.getByText('caption'));

        expect(document.activeElement).not.toBe(feedback);
    });

    it('does nothing on a hardware keyboard', () => {
        userAgent = DESKTOP_UA;
        renderForm();
        const name = focus('name');

        tap(screen.getByText('caption'));

        expect(document.activeElement).toBe(name);
    });

    it('stops listening once unmounted', () => {
        const { unmount } = renderForm();
        unmount();
        render(
            <>
                <p>caption</p>
                <input aria-label="name" />
            </>
        );
        const name = focus('name');

        tap(screen.getByText('caption'));

        expect(document.activeElement).toBe(name);
    });
});
