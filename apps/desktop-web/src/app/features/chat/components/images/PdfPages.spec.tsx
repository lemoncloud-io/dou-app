import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { PdfDocument } from '../../utils/pdf';
import { PdfPages } from './PdfPages';

import '../../../../../i18n';

// jsdom has no IntersectionObserver; this one lets a test say which pages are in view.
type Callback = (entries: Pick<IntersectionObserverEntry, 'target' | 'isIntersecting' | 'intersectionRatio'>[]) => void;
const observers: { callback: Callback; targets: Element[]; options?: IntersectionObserverInit }[] = [];
class FakeObserver {
    targets: Element[] = [];
    constructor(callback: Callback, options?: IntersectionObserverInit) {
        observers.push({ callback, targets: this.targets, options });
    }
    observe = (target: Element) => this.targets.push(target);
    unobserve = vi.fn();
    disconnect = vi.fn();
}
const showPages = (numbers: number[]) =>
    act(() => {
        for (const { callback, targets } of observers) {
            callback(
                targets.map(target => {
                    const page = Number((target as HTMLElement).dataset.page);
                    const inView = numbers.includes(page);
                    return { target, isIntersecting: inView, intersectionRatio: inView ? 1 : 0 };
                })
            );
        }
    });

const flush = () => act(async () => undefined);

const doc = (pageCount: number): PdfDocument => ({
    pageCount,
    aspectRatio: 1.414,
    renderPage: vi.fn(() => ({ done: Promise.resolve(1.414), cancel: vi.fn() })),
    destroy: vi.fn(),
});

beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

describe('PdfPages', () => {
    it('lays out every page and a numbered thumbnail for each', () => {
        render(<PdfPages doc={doc(3)} name="a.pdf" />);
        expect(document.querySelectorAll('[data-page]').length).toBeGreaterThanOrEqual(3);
        expect(screen.getByRole('button', { name: 'Page 1' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Page 3' })).toBeTruthy();
    });

    // A 300-page file drawn whole at DPR 2 holds gigabytes of canvas.
    it('draws only the pages near the view', async () => {
        const pdf = doc(50);
        render(<PdfPages doc={pdf} name="a.pdf" />);
        showPages([1, 2]);
        await flush();
        const drawn = vi.mocked(pdf.renderPage).mock.calls.map(([page]) => page);
        expect(drawn).toContain(1);
        expect(drawn).toContain(2);
        expect(drawn).not.toContain(40);
    });

    // "Near" is measured against the scroll area the pages sit in, or the draw-ahead margin does nothing.
    it('measures nearness against the page column and the rail, not the window', () => {
        render(<PdfPages doc={doc(2)} name="a.pdf" />);
        const roots = observers.map(({ options }) => options?.root);
        expect(roots).toContain(document.querySelector('section'));
        expect(roots).toContain(document.querySelector('nav'));
        expect(roots).not.toContain(undefined);
    });

    // pdf.js refuses a second drawing on a canvas still being drawn.
    it('stops drawing a page that leaves the view', async () => {
        const cancel = vi.fn();
        const pdf = { ...doc(3), renderPage: vi.fn(() => ({ done: new Promise<number>(() => undefined), cancel })) };
        render(<PdfPages doc={pdf} name="a.pdf" />);
        showPages([1]);
        await flush();
        expect(pdf.renderPage).toHaveBeenCalled();
        showPages([]);
        expect(cancel).toHaveBeenCalled();
    });

    it('jumps to a page from its thumbnail', () => {
        render(<PdfPages doc={doc(5)} name="a.pdf" />);
        fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
        const target = document.querySelector('section [data-page="4"]');
        expect(target?.scrollIntoView).toHaveBeenCalled();
    });

    it('marks the thumbnail of the page being read', () => {
        render(<PdfPages doc={doc(5)} name="a.pdf" />);
        showPages([3]);
        expect(screen.getByRole('button', { name: 'Page 3' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('button', { name: 'Page 1' }).getAttribute('aria-current')).toBeNull();
    });
});
