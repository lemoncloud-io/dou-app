import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom's Blob has no `arrayBuffer`; a browser's and Node's do.
import { Blob as NodeBlob } from 'node:buffer';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { fetchFileBytes } from '../../utils';
import type * as Utils from '../../utils';
import { loadPdf } from '../../utils/pdf';
import { FileViewer } from './FileViewer';

import '../../../../../i18n';

const bytes = (parts: (string | Uint8Array)[]): Blob => new NodeBlob(parts) as unknown as Blob;

vi.mock('../../utils/pdf', () => ({ loadPdf: vi.fn(), preloadPdf: vi.fn() }));
vi.mock('./PdfPages', () => ({ PdfPages: ({ doc }: { doc: { pageCount: number } }) => <p>{doc.pageCount} pages</p> }));
vi.mock('../../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    fetchFileBytes: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Ada', colorSeed: 'ada', time: '7:43 PM' };
const notes = { id: 'f', kind: 'file' as const, name: 'notes.txt', contentType: 'text/plain', url: 'https://s/f' };

const report = { ...notes, name: 'report.pdf', contentType: 'application/pdf' };
const pdf = (pageCount: number) => ({ pageCount, aspectRatio: 1.414, renderPage: vi.fn(), destroy: vi.fn() });

afterEach(() => {
    vi.mocked(fetchFileBytes).mockReset();
    vi.mocked(loadPdf).mockReset();
});

describe('FileViewer', () => {
    it('shows a text file under a header with its sender, time and name', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['hello\nworld']));
        render(<FileViewer file={notes} author={author} onClose={vi.fn()} onSave={vi.fn()} />, { wrapper });

        expect(await screen.findByText(/hello\s+world/)).toBeTruthy();
        expect(screen.getByText('Ada')).toBeTruthy();
        expect(screen.getByText('7:43 PM')).toBeTruthy();
        expect(screen.getAllByText('notes.txt').length).toBeGreaterThan(0);
        // Only the start of a text file is fetched: that is all the viewer shows.
        expect(fetchFileBytes).toHaveBeenCalledWith('https://s/f', expect.any(AbortSignal), 1024 * 1024);
    });

    it('says when only the start of a large file is shown', async () => {
        // Storage answers the range with the start only; the card's size says there is more.
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['x'.repeat(1024 * 1024)]));
        render(
            <FileViewer
                file={{ ...notes, size: 5 * 1024 * 1024 }}
                author={author}
                onClose={vi.fn()}
                onSave={vi.fn()}
            />,
            { wrapper }
        );
        expect(await screen.findByText(/first 1 MB/)).toBeTruthy();
    });

    // An address left open past its signature answers 403; a blank dialog would say nothing.
    it('says the file could not be opened, and still offers to save it', async () => {
        vi.mocked(fetchFileBytes).mockRejectedValue(new Error('403'));
        const onSave = vi.fn();
        render(<FileViewer file={notes} author={author} onClose={vi.fn()} onSave={onSave} />, { wrapper });

        expect(await screen.findByText("Couldn't open this file")).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: 'Save notes.txt' })[0]);
        expect(onSave).toHaveBeenCalled();
    });

    // Focus on save would open its tooltip with the dialog, and the first Esc would only close that.
    it('opens with focus on close', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['a']));
        render(<FileViewer file={notes} author={author} onClose={vi.fn()} onSave={vi.fn()} />, { wrapper });
        await screen.findByText('a');
        expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
    });

    it('closes from its close button', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['a']));
        const onClose = vi.fn();
        render(<FileViewer file={notes} author={author} onClose={onClose} onSave={vi.fn()} />, { wrapper });
        await screen.findByText('a');
        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes on Esc', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['a']));
        const onClose = vi.fn();
        render(<FileViewer file={notes} author={author} onClose={onClose} onSave={vi.fn()} />, { wrapper });
        await screen.findByText('a');
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    // Closing mid-download must not leave the fetch running or set state on an unmounted viewer.
    it('stops the download when closed before it finished', () => {
        vi.mocked(fetchFileBytes).mockReturnValue(new Promise(() => undefined));
        const { unmount } = render(<FileViewer file={notes} author={author} onClose={vi.fn()} onSave={vi.fn()} />, {
            wrapper,
        });
        const signal = vi.mocked(fetchFileBytes).mock.calls[0][1] as AbortSignal;
        expect(signal.aborted).toBe(false);
        unmount();
        expect(signal.aborted).toBe(true);
    });

    it('shows a PDF by its pages', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['%PDF']));
        vi.mocked(loadPdf).mockResolvedValue(pdf(3));
        render(<FileViewer file={report} author={author} onClose={vi.fn()} onSave={vi.fn()} />, { wrapper });
        expect(await screen.findByText('3 pages')).toBeTruthy();
    });

    // A damaged or password-protected PDF is refused by pdf.js; say so, and keep the save.
    it('says a PDF it cannot read could not be opened', async () => {
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['not a pdf']));
        vi.mocked(loadPdf).mockRejectedValue(new Error('InvalidPDFException'));
        render(<FileViewer file={report} author={author} onClose={vi.fn()} onSave={vi.fn()} />, { wrapper });
        expect(await screen.findByText("Couldn't open this file")).toBeTruthy();
    });

    it('lets go of the PDF when it closes', async () => {
        const doc = pdf(2);
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['%PDF']));
        vi.mocked(loadPdf).mockResolvedValue(doc);
        const { unmount } = render(<FileViewer file={report} author={author} onClose={vi.fn()} onSave={vi.fn()} />, {
            wrapper,
        });
        await screen.findByText('2 pages');
        unmount();
        expect(doc.destroy).toHaveBeenCalled();
    });

    // Closed while pdf.js was still parsing: the document it hands back must not outlive the viewer.
    it('lets go of a PDF that finishes loading after the viewer closed', async () => {
        const doc = pdf(2);
        let finish: (value: ReturnType<typeof pdf>) => void = () => undefined;
        vi.mocked(fetchFileBytes).mockResolvedValue(bytes(['%PDF']));
        vi.mocked(loadPdf).mockReturnValue(new Promise(resolve => (finish = resolve)));
        const { unmount } = render(<FileViewer file={report} author={author} onClose={vi.fn()} onSave={vi.fn()} />, {
            wrapper,
        });
        await vi.waitFor(() => expect(loadPdf).toHaveBeenCalled());
        unmount();
        finish(doc);
        await vi.waitFor(() => expect(doc.destroy).toHaveBeenCalled());
    });
});
