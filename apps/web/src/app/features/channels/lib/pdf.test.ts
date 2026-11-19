// jsdom's Blob has no `arrayBuffer`; a browser's and Node's do.
import { Blob as NodeBlob } from 'buffer';

import { loadPdf } from './pdf';

const getDocument = jest.fn();
jest.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
    GlobalWorkerOptions: {},
    getDocument: (...args: unknown[]) => getDocument(...args),
}));
jest.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.mjs' }), {
    virtual: true,
});

const blob = new NodeBlob(['%PDF']) as unknown as Blob;

const page = () => {
    const render = { promise: new Promise<void>(() => undefined), cancel: jest.fn() };
    return {
        getViewport: jest.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
        render: jest.fn(() => render),
        cleanup: jest.fn(),
        renderTask: render,
    };
};

const opening = (promise: Promise<unknown>) => {
    // A rejection the test means to see is not an unhandled one.
    promise.catch(() => undefined);
    const task = { promise, destroy: jest.fn(async () => undefined) };
    getDocument.mockReturnValue(task);
    return task;
};

beforeEach(() => getDocument.mockReset());

describe('loadPdf', () => {
    it('opens a document with XFA off, and the data files a Korean PDF may need', async () => {
        const first = page();
        opening(Promise.resolve({ numPages: 3, getPage: jest.fn(async () => first) }));

        const doc = await loadPdf(blob);

        expect(doc.pageCount).toBe(3);
        expect(doc.aspectRatio).toBeCloseTo(800 / 600);
        const options = getDocument.mock.calls[0][0] as Record<string, unknown>;
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

    it('stops a page drawing when asked', async () => {
        const target = page();
        opening(Promise.resolve({ numPages: 1, getPage: jest.fn(async () => target) }));
        const doc = await loadPdf(blob);

        const render = doc.renderPage(1, document.createElement('canvas'), 300);
        render.done.catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(target.render).toHaveBeenCalled();
        render.cancel();
        expect(target.renderTask.cancel).toHaveBeenCalled();
    });
});
