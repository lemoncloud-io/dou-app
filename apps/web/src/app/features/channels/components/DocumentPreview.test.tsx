import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { ChatFileSlot } from '@chatic/runtime';

import { DocumentPreview, type DocumentPreviewTarget } from './DocumentPreview';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
    }),
}));
const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));

const fetchInBrowser = jest.fn();
const saveBlob = jest.fn();
jest.mock('../lib/fileDownload', () => ({
    fetchInBrowser: (...args: unknown[]) => fetchInBrowser(...args),
    saveBlob: (...args: unknown[]) => saveBlob(...args),
}));
const loadPdf = jest.fn();
jest.mock('../lib/pdf', () => ({
    loadPdf: (...args: unknown[]) => loadPdf(...args),
    preloadPdf: () => undefined,
}));
let browserShares = true;
const shareFileInBrowser = jest.fn();
jest.mock('../lib/browserShare', () => ({
    canShareFilesInBrowser: () => browserShares,
    shareFileInBrowser: (...args: unknown[]) => shareFileInBrowser(...args),
}));
const download = jest.fn();
const freshFileUrl = jest.fn();
jest.mock('../hooks/useFileDownloads', () => ({
    freshFileUrl: (...args: unknown[]) => freshFileUrl(...args),
    useFileDownloads: () => ({ download, stateOf: () => 'idle', progressOf: () => null }),
}));

// jsdom lays nothing out; the viewer measures its scroll area to size the pages.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 });
});
afterAll(() => {
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

const file: ChatFileSlot = {
    key: 'c/u-1',
    uploadId: 'u-1',
    name: 'report.pdf',
    url: 'https://bucket/old',
    state: 'ready',
};
const target: DocumentPreviewTarget = { file, chatId: 'm' };
const bytes = new Blob(['%PDF'], { type: 'application/pdf' });

const docOf = (pageCount: number) => ({
    pageCount,
    aspectRatio: 1.4,
    renderPage: jest.fn(() => ({ done: Promise.resolve(1.4), cancel: jest.fn() })),
    destroy: jest.fn(),
});

const settle = () => act(async () => undefined);
const saveButton = () => screen.getByRole('button', { name: 'chat.attach.document.save:{"name":"report.pdf"}' });
const shareButton = () => screen.getByRole('button', { name: 'chat.attach.document.share:{"name":"report.pdf"}' });

beforeEach(() => {
    browserShares = true;
    toast.mockReset();
    fetchInBrowser.mockReset().mockResolvedValue({ kind: 'blob', blob: bytes });
    saveBlob.mockReset();
    loadPdf.mockReset().mockResolvedValue(docOf(2));
    shareFileInBrowser.mockReset().mockResolvedValue('shared');
    download.mockReset();
    freshFileUrl.mockReset();
});

describe('DocumentPreview', () => {
    it('fetches the file, opens it, and shows its pages', async () => {
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        expect(screen.getByRole('status')).toBeInTheDocument();

        await settle();

        expect(fetchInBrowser).toHaveBeenCalledWith('https://bucket/old', expect.anything());
        expect(loadPdf).toHaveBeenCalledWith(bytes);
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('reads the message again once for an expired address', async () => {
        fetchInBrowser.mockResolvedValueOnce({ kind: 'expired' });
        freshFileUrl.mockResolvedValue('https://bucket/fresh');

        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        expect(freshFileUrl).toHaveBeenCalledWith('c', 'm', file);
        expect(fetchInBrowser).toHaveBeenLastCalledWith('https://bucket/fresh', expect.anything());
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('saves the bytes it holds under the file’s name, without fetching again', async () => {
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        fireEvent.click(saveButton());

        expect(saveBlob).toHaveBeenCalledWith(bytes, 'report.pdf');
        expect(fetchInBrowser).toHaveBeenCalledTimes(1);
        expect(download).not.toHaveBeenCalled();
    });

    it('saves as the card’s button does before the bytes arrive, and holds share back', () => {
        fetchInBrowser.mockReturnValue(new Promise(() => undefined));
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);

        fireEvent.click(saveButton());

        expect(download).toHaveBeenCalledWith(file, 'm');
        expect(shareButton()).toBeDisabled();
    });

    it('shares the bytes it holds, and asks for another tap when the browser wants one', async () => {
        shareFileInBrowser.mockResolvedValueOnce('needs-gesture');
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        await act(async () => fireEvent.click(shareButton()));

        expect(shareFileInBrowser).toHaveBeenCalledWith(bytes, 'report.pdf');
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.browserShare.again' });
    });

    it('still saves and shares a file that will not open', async () => {
        loadPdf.mockRejectedValue(new Error('PasswordException'));
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        expect(screen.getByText('chat.attach.document.failed')).toBeInTheDocument();
        fireEvent.click(saveButton());
        expect(saveBlob).toHaveBeenCalledWith(bytes, 'report.pdf');
        await act(async () => fireEvent.click(shareButton()));
        expect(shareFileInBrowser).toHaveBeenCalledWith(bytes, 'report.pdf');
    });

    it('fetches again to share a file whose fetch failed, and says so when that fails too', async () => {
        fetchInBrowser.mockResolvedValue({ kind: 'failed' });
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        await act(async () => fireEvent.click(shareButton()));

        expect(fetchInBrowser).toHaveBeenCalledTimes(2);
        expect(shareFileInBrowser).not.toHaveBeenCalled();
        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.fileCard.downloadFailed', variant: 'destructive' });
    });

    it('leaves share out where the browser cannot share files', async () => {
        browserShares = false;
        render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        expect(
            screen.queryByRole('button', { name: 'chat.attach.document.share:{"name":"report.pdf"}' })
        ).not.toBeInTheDocument();
        expect(saveButton()).toBeInTheDocument();
    });

    it('frees the document when it closes', async () => {
        const doc = docOf(1);
        loadPdf.mockResolvedValue(doc);
        const { rerender } = render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();

        rerender(<DocumentPreview cid="c" target={null} onClose={jest.fn()} />);

        expect(doc.destroy).toHaveBeenCalled();
    });

    it('starts from the spinner when the same file opens again, not from the document the close freed', async () => {
        const first = docOf(2);
        loadPdf.mockResolvedValueOnce(first);
        const { rerender } = render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();
        rerender(<DocumentPreview cid="c" target={null} onClose={jest.fn()} />);
        expect(first.destroy).toHaveBeenCalled();

        fetchInBrowser.mockReturnValue(new Promise(() => undefined));
        rerender(<DocumentPreview cid="c" target={{ ...target }} onClose={jest.fn()} />);

        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
    });

    it('lets go of the bytes once the viewer has slid away', async () => {
        jest.useFakeTimers();
        try {
            const { rerender, container } = render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });
            rerender(<DocumentPreview cid="c" target={null} onClose={jest.fn()} />);

            await act(async () => {
                jest.advanceTimersByTime(600);
            });

            expect(container).toBeEmptyDOMElement();
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        } finally {
            jest.useRealTimers();
        }
    });

    it('never shares a file whose fetch was still running when the viewer closed', async () => {
        fetchInBrowser.mockResolvedValueOnce({ kind: 'failed' });
        const { rerender } = render(<DocumentPreview cid="c" target={target} onClose={jest.fn()} />);
        await settle();
        let finish: (result: unknown) => void = () => undefined;
        fetchInBrowser.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));

        fireEvent.click(shareButton());
        rerender(<DocumentPreview cid="c" target={null} onClose={jest.fn()} />);
        await act(async () => finish({ kind: 'blob', blob: bytes }));

        expect(shareFileInBrowser).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
    });

    it('draws nothing before a file was ever opened', () => {
        const { container } = render(<DocumentPreview cid="c" target={null} onClose={jest.fn()} />);

        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
