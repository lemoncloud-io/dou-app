import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useReturnKeyFlow } from './useReturnKeyFlow';

/**
 * jsdom lays nothing out, so every element reports no client rects and would read as hidden. Stub
 * it so an element counts as laid out unless it sits under `[hidden]` — the one way these fixtures
 * hide a field.
 */
beforeAll(() => {
    jest.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
        return (this.closest('[hidden]') ? [] : [{}]) as unknown as DOMRectList;
    });
});

afterAll(() => {
    jest.restoreAllMocks();
});

const PHONE_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

let userAgent = PHONE_UA;

// The flow is for the soft keyboard, so every case runs as a touch phone unless it says otherwise.
beforeAll(() => {
    jest.spyOn(navigator, 'userAgent', 'get').mockImplementation(() => userAgent);
});

beforeEach(() => {
    userAgent = PHONE_UA;
});

const Host = ({ children }: { children: ReactNode }) => {
    useReturnKeyFlow();
    return <>{children}</>;
};

const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement | HTMLTextAreaElement;

const hint = (name: string) => field(name).getAttribute('enterkeyhint');

/** Focuses `name` and presses return on it; returns whether the press was default-prevented. */
const pressReturn = (name: string, init: KeyboardEventInit = {}) => {
    const el = field(name);
    el.focus();
    return !fireEvent.keyDown(el, { key: 'Enter', ...init });
};

describe('useReturnKeyFlow', () => {
    describe('a form of several fields', () => {
        const renderForm = () =>
            render(
                <Host>
                    <input aria-label="name" />
                    <input aria-label="phone" type="tel" />
                </Host>
            );

        it('labels every field but the last "next", and the last "done"', () => {
            renderForm();

            field('name').focus();
            field('phone').focus();

            expect(hint('name')).toBe('next');
            expect(hint('phone')).toBe('done');
        });

        it('labels a field when it is pressed, before the tap focuses it', () => {
            renderForm();

            fireEvent.pointerDown(field('name'));

            expect(hint('name')).toBe('next');
            expect(document.activeElement).not.toBe(field('name'));
        });

        it('moves the cursor down to the next field on return', () => {
            renderForm();

            expect(pressReturn('name')).toBe(true);

            expect(document.activeElement).toBe(field('phone'));
        });

        it('closes the keyboard on return in the last field', () => {
            renderForm();

            expect(pressReturn('phone')).toBe(true);

            expect(document.activeElement).toBe(document.body);
        });
    });

    it('labels a single field "done" and closes the keyboard on return, without submitting its form', () => {
        const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
        render(
            <Host>
                <form onSubmit={onSubmit}>
                    <input aria-label="nick" />
                    <button type="submit">save</button>
                </form>
            </Host>
        );

        field('nick').focus();
        expect(hint('nick')).toBe('done');

        expect(pressReturn('nick')).toBe(true);
        expect(document.activeElement).toBe(document.body);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('advances from an input into the textarea after it, where return stays a newline', () => {
        render(
            <Host>
                <input aria-label="title" />
                <textarea aria-label="body" />
            </Host>
        );

        field('title').focus();
        expect(hint('title')).toBe('next');
        expect(pressReturn('title')).toBe(true);
        expect(document.activeElement).toBe(field('body'));

        expect(pressReturn('body')).toBe(false);
        expect(document.activeElement).toBe(field('body'));
        expect(hint('body')).toBeNull();
    });

    it('leaves the chat composer alone', () => {
        render(
            <Host>
                <div data-no-autoscroll>
                    <input aria-label="composer" />
                </div>
            </Host>
        );

        field('composer').focus();
        expect(hint('composer')).toBeNull();
        expect(pressReturn('composer')).toBe(false);
        expect(document.activeElement).toBe(field('composer'));
    });

    it('keeps a search box on its own search key and closes the keyboard after the page has searched', () => {
        const onSearch = jest.fn();
        render(
            <Host>
                <input
                    aria-label="search"
                    type="search"
                    onKeyDown={event => {
                        if (event.key === 'Enter') onSearch(document.activeElement);
                    }}
                />
                <input aria-label="other" />
            </Host>
        );

        field('search').focus();
        expect(hint('search')).toBeNull();

        expect(pressReturn('search')).toBe(true);
        expect(onSearch).toHaveBeenCalledWith(field('search'));
        expect(document.activeElement).toBe(document.body);
    });

    it('does not count a search box as the field before another', () => {
        render(
            <Host>
                <input aria-label="name" />
                <input aria-label="filter" type="search" />
            </Host>
        );

        field('name').focus();

        expect(hint('name')).toBe('done');
    });

    it('scopes a sheet or dialog to its own fields, not the page behind it', () => {
        render(
            <Host>
                <input aria-label="page" />
                <div role="dialog">
                    <input aria-label="sheet" />
                </div>
            </Host>
        );

        field('page').focus();
        expect(hint('page')).toBe('done');

        expect(pressReturn('sheet')).toBe(true);
        expect(document.activeElement).toBe(document.body);
    });

    it('skips a field that is disabled, read-only or not laid out', () => {
        render(
            <Host>
                <input aria-label="phone" />
                <input aria-label="code" disabled />
                <input aria-label="readonly" readOnly />
                <div hidden>
                    <input aria-label="hidden" />
                </div>
            </Host>
        );

        field('phone').focus();
        expect(hint('phone')).toBe('done');

        expect(pressReturn('phone')).toBe(true);
        expect(document.activeElement).toBe(document.body);
    });

    it('treats the cells of a verification code as one field', () => {
        render(
            <Host>
                <div data-return-key-unit>
                    <input aria-label="cell 1" />
                    <input aria-label="cell 2" />
                </div>
                <input aria-label="after" />
            </Host>
        );

        field('cell 1').focus();
        expect(hint('cell 1')).toBe('next');

        expect(pressReturn('cell 1')).toBe(true);
        expect(document.activeElement).toBe(field('after'));
    });

    it('finishes a verification code from any cell when it is the last field', () => {
        render(
            <Host>
                <div data-return-key-unit>
                    <input aria-label="cell 1" />
                    <input aria-label="cell 2" />
                </div>
            </Host>
        );

        field('cell 1').focus();
        expect(hint('cell 1')).toBe('done');

        expect(pressReturn('cell 1')).toBe(true);
        expect(document.activeElement).toBe(document.body);
    });

    it('acts on the key the keyboard shows when a later field is enabled after the label was set', () => {
        const { rerender } = render(
            <Host>
                <input aria-label="phone" />
                <input aria-label="code" disabled />
            </Host>
        );
        field('phone').focus();
        expect(hint('phone')).toBe('done');

        // "Send code" enables the code field while the phone field keeps focus and its "done" key.
        rerender(
            <Host>
                <input aria-label="phone" />
                <input aria-label="code" />
            </Host>
        );

        expect(pressReturn('phone')).toBe(true);
        expect(document.activeElement).toBe(document.body);
    });

    it('skips a field inside an inert subtree', () => {
        render(
            <Host>
                <input aria-label="name" />
                <div inert>
                    <input aria-label="behind" />
                </div>
            </Host>
        );

        field('name').focus();

        expect(hint('name')).toBe('done');
    });

    it('leaves a hardware keyboard alone, form submit included', () => {
        userAgent = DESKTOP_UA;
        const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
        render(
            <Host>
                <form onSubmit={onSubmit}>
                    <input aria-label="name" />
                    <input aria-label="nick" />
                    <button type="submit">save</button>
                </form>
            </Host>
        );

        field('name').focus();
        expect(hint('name')).toBeNull();
        expect(pressReturn('name')).toBe(false);
        expect(document.activeElement).toBe(field('name'));
    });

    it('ignores the return that commits an IME composition', () => {
        render(
            <Host>
                <input aria-label="name" />
                <input aria-label="phone" />
            </Host>
        );

        expect(pressReturn('name', { isComposing: true })).toBe(false);
        expect(pressReturn('name', { keyCode: 229 })).toBe(false);
        expect(document.activeElement).toBe(field('name'));
    });

    it('steps aside for a screen that handled return itself', () => {
        render(
            <Host>
                <input aria-label="name" onKeyDown={event => event.key === 'Enter' && event.preventDefault()} />
                <input aria-label="phone" />
            </Host>
        );

        pressReturn('name');

        expect(document.activeElement).toBe(field('name'));
    });

    it('stops listening once unmounted', () => {
        const { unmount } = render(<Host />);
        unmount();
        render(
            <>
                <input aria-label="name" />
                <input aria-label="phone" />
            </>
        );

        expect(pressReturn('name')).toBe(false);
        expect(document.activeElement).toBe(field('name'));
    });
});
