import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom's Blob has no `arrayBuffer`; a browser's and Node's do.
import { Blob as NodeBlob } from 'node:buffer';

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { loadPdf } from './pdf';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.mjs' }));

const blob = new NodeBlob(['%PDF']) as unknown as Blob;
const viewport = { width: 600, height: 800 };

const page = () => {
    const render = { promise: new Promise<void>(() => undefined), cancel: vi.fn() };
    return {
        getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
        render: vi.fn(() => render),
        cleanup: vi.fn(),
        renderTask: render,
    };
};

const opening = (promise: Promise<unknown>) => {
    const task = { promise, destroy: vi.fn(async () => undefined) };
    vi.mocked(getDocument).mockReturnValue(task as unknown as ReturnType<typeof getDocument>);
    return task;
};

beforeEach(() => vi.mocked(getDocument).mockReset());

describe('loadPdf', () => {
    it('opens a document with scripts and XFA off, and the data files it may need', async () => {
        const first = page();
        opening(Promise.resolve({ numPages: 3, getPage: vi.fn(async () => first) }));

        const doc = await loadPdf(blob);

        expect(doc.pageCount).toBe(3);
        expect(doc.aspectRatio).toBeCloseTo(viewport.height / viewport.width);
        const options = vi.mocked(getDocument).mock.calls[0][0] as Record<string, unknown>;
        expect(options).toMatchObject({ enableXfa: false, cMapPacked: true });
        expect(String(options.cMapUrl)).toMatch(/\/pdfjs\/cmaps\/$/);
        expect(String(options.standardFontDataUrl)).toMatch(/\/pdfjs\/standard_fonts\/$/);
        expect(String(options.wasmUrl)).toMatch(/\/pdfjs\/wasm\/$/);
    });

    // pdf.js keeps the worker of a document it could not open until told otherwise.
    it('lets go of the worker when the file will not open', async () => {
        const task = opening(Promise.reject(new Error('PasswordException')));
        await expect(loadPdf(blob)).rejects.toThrow('PasswordException');
        expect(task.destroy).toHaveBeenCalled();
    });

    it('stops a page drawing when asked, and frees the page after', async () => {
        const target = page();
        opening(Promise.resolve({ numPages: 1, getPage: vi.fn(async () => target) }));
        const doc = await loadPdf(blob);

        const render = doc.renderPage(1, document.createElement('canvas'), 300);
        await vi.waitFor(() => expect(target.render).toHaveBeenCalled());
        render.cancel();
        expect(target.renderTask.cancel).toHaveBeenCalled();
    });

    // A chunk that failed to load (a dropped connection) is fetched again on the next open.
    it('tries loading pdf.js again after a failed load', async () => {
        vi.resetModules();
        vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => {
            throw new Error('chunk load failed');
        });
        const fresh = await import('./pdf');
        await expect(fresh.loadPdf(blob)).rejects.toThrow();

        const first = page();
        vi.doMock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
            GlobalWorkerOptions: {},
            getDocument: () => ({
                promise: Promise.resolve({ numPages: 1, getPage: async () => first }),
                destroy: async () => undefined,
            }),
        }));
        vi.resetModules();
        // The same module instance: a remembered failure would reject again here.
        await expect(fresh.loadPdf(blob)).resolves.toMatchObject({ pageCount: 1 });
    });
});
