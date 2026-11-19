import { act, fireEvent, render, screen } from '@testing-library/react';

import { DocumentViewer, type DocumentViewerPages } from './DocumentViewer';

// jsdom lays nothing out; the column measures the scroll area's width to size the pages.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
});
afterAll(() => {
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

const pagesOf = (pageCount: number) => {
    const renderPage = jest.fn((_page: number, _canvas: HTMLCanvasElement, _width: number) => ({
        done: Promise.resolve(1.5),
        cancel: jest.fn(),
    }));
    return { pageCount, aspectRatio: 1.414, renderPage } satisfies DocumentViewerPages;
};

const labels = { close: 'Close viewer', loading: 'Opening report.pdf', failed: 'Cannot preview' };

const footer = () => <button type="button">Save</button>;

describe('DocumentViewer', () => {
    it('shows a spinner while the file opens, with the host’s bar already there', () => {
        render(
            <DocumentViewer
                open
                name="report.pdf"
                status="loading"
                onClose={jest.fn()}
                renderFooter={footer}
                labels={labels}
            />
        );

        expect(screen.getByRole('status', { name: 'Opening report.pdf' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
        expect(screen.queryByText(/\/ /)).not.toBeInTheDocument();
    });

    it('says a file cannot be previewed and still offers the bar', () => {
        render(
            <DocumentViewer
                open
                name="report.pdf"
                status="failed"
                onClose={jest.fn()}
                renderFooter={footer}
                labels={labels}
            />
        );

        expect(screen.getByText('Cannot preview')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('lays every page out at the column’s width, draws them, and counts from the first', async () => {
        const pages = pagesOf(3);
        render(<DocumentViewer open name="report.pdf" status="ready" pages={pages} onClose={jest.fn()} />);
        await act(async () => undefined);

        const sheets = screen.getByRole('dialog').querySelectorAll('[data-page]');
        expect(sheets).toHaveLength(3);
        // 390 wide less 16px each side.
        expect((sheets[0] as HTMLElement).style.width).toBe('358px');
        expect(pages.renderPage.mock.calls.map(([page, , width]) => [page, width])).toEqual([
            [1, 358],
            [2, 358],
            [3, 358],
        ]);
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'report.pdf' })).toBeInTheDocument();
    });

    it('takes each page’s own shape once drawn', async () => {
        const pages = pagesOf(1);
        render(<DocumentViewer open name="report.pdf" status="ready" pages={pages} onClose={jest.fn()} />);
        await act(async () => undefined);

        const sheet = screen.getByRole('dialog').querySelector('[data-page]') as HTMLElement;
        expect(sheet.style.height).toBe(`${Math.round(358 * 1.5)}px`);
    });

    it('shows no position for a one-page document', async () => {
        render(<DocumentViewer open name="a.pdf" status="ready" pages={pagesOf(1)} onClose={jest.fn()} />);
        await act(async () => undefined);

        expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    });

    it('closes from its close button', () => {
        const onClose = jest.fn();
        render(<DocumentViewer open name="a.pdf" status="loading" onClose={onClose} labels={labels} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close viewer' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('puts focus on close, not on the host’s first button', () => {
        render(
            <DocumentViewer
                open
                name="a.pdf"
                status="loading"
                onClose={jest.fn()}
                renderFooter={footer}
                labels={labels}
            />
        );

        expect(screen.getByRole('button', { name: 'Close viewer' })).toHaveFocus();
    });

    describe('zoom', () => {
        const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
        const scroller = () => screen.getByRole('dialog').querySelector('[data-zoom]') as HTMLElement;
        const widthOf = (page: number) =>
            (screen.getByRole('dialog').querySelector(`[data-page="${page}"]`) as HTMLElement).style.width;

        const openAt = async () => {
            render(<DocumentViewer open name="report.pdf" status="ready" pages={pagesOf(2)} onClose={jest.fn()} />);
            await act(async () => undefined);
        };

        const tap = (x: number, y: number) => {
            fireEvent.touchStart(scroller(), { touches: [touch(x, y)], changedTouches: [touch(x, y)] });
            fireEvent.touchEnd(scroller(), { touches: [], changedTouches: [touch(0, 0)] });
        };

        it('doubles the pages on a double tap and fits them back on the next', async () => {
            await openAt();

            tap(100, 200);
            tap(104, 202);
            await act(async () => undefined);
            expect(scroller().dataset.zoom).toBe('2');
            expect(widthOf(1)).toBe('716px');

            tap(100, 200);
            tap(100, 200);
            await act(async () => undefined);
            expect(scroller().dataset.zoom).toBe('1');
            expect(widthOf(1)).toBe('358px');
        });

        it('takes a tap that moved for a scroll, not half of a double tap', async () => {
            await openAt();

            fireEvent.touchStart(scroller(), { touches: [touch(100, 200)], changedTouches: [touch(100, 200)] });
            fireEvent.touchMove(scroller(), { touches: [touch(100, 260)], changedTouches: [touch(100, 260)] });
            fireEvent.touchEnd(scroller(), { touches: [], changedTouches: [touch(0, 0)] });
            tap(100, 260);
            await act(async () => undefined);

            expect(scroller().dataset.zoom).toBe('1');
        });

        it('zooms by the pinch, scaled live while the fingers move and drawn sharp when they lift', async () => {
            await openAt();
            const section = screen.getByRole('region', { name: 'report.pdf' });

            fireEvent.touchStart(scroller(), {
                touches: [touch(100, 300), touch(200, 300)],
                changedTouches: [touch(100, 300), touch(200, 300)],
            });
            fireEvent.touchMove(scroller(), {
                touches: [touch(50, 300), touch(250, 300)],
                changedTouches: [touch(50, 300), touch(250, 300)],
            });
            expect(section.style.transform).toBe('scale(2)');

            fireEvent.touchEnd(scroller(), { touches: [touch(250, 300)], changedTouches: [touch(0, 0)] });
            await act(async () => undefined);

            expect(section.style.transform).toBe('');
            expect(scroller().dataset.zoom).toBe('2');
            expect(widthOf(2)).toBe('716px');
        });

        it('holds a pinch within the zoom range', async () => {
            await openAt();

            fireEvent.touchStart(scroller(), {
                touches: [touch(100, 300), touch(110, 300)],
                changedTouches: [touch(100, 300), touch(110, 300)],
            });
            fireEvent.touchMove(scroller(), {
                touches: [touch(0, 300), touch(300, 300)],
                changedTouches: [touch(0, 300), touch(300, 300)],
            });
            fireEvent.touchEnd(scroller(), { touches: [], changedTouches: [touch(0, 0)] });
            await act(async () => undefined);
            expect(scroller().dataset.zoom).toBe('4');

            fireEvent.touchStart(scroller(), {
                touches: [touch(0, 300), touch(300, 300)],
                changedTouches: [touch(0, 300), touch(300, 300)],
            });
            fireEvent.touchMove(scroller(), {
                touches: [touch(140, 300), touch(150, 300)],
                changedTouches: [touch(140, 300), touch(150, 300)],
            });
            fireEvent.touchEnd(scroller(), { touches: [], changedTouches: [touch(0, 0)] });
            await act(async () => undefined);
            expect(scroller().dataset.zoom).toBe('1');
        });
    });

    it('draws nothing while closed', () => {
        render(<DocumentViewer open={false} name="a.pdf" status="loading" onClose={jest.fn()} />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
