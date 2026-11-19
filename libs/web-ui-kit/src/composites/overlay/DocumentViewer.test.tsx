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

    it('draws nothing while closed', () => {
        render(<DocumentViewer open={false} name="a.pdf" status="loading" onClose={jest.fn()} />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
