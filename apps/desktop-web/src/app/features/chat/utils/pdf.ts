import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';

/** A page being drawn. `done` resolves to the page's height over width once it is on the canvas. */
export interface PdfRender {
    done: Promise<number>;
    /** Stops the drawing. `done` then rejects. */
    cancel(): void;
}

/** A PDF opened for the viewer. The only surface that touches pdf.js. */
export interface PdfDocument {
    pageCount: number;
    /** Height over width of the first page: how tall a page is held before its own shape is known. */
    aspectRatio: number;
    /**
     * Draws page `page` (1-based) into `canvas`, `cssWidth` pixels wide on screen. Only one drawing
     * may target a canvas at a time: cancel the last one and let it settle before starting another.
     */
    renderPage(page: number, canvas: HTMLCanvasElement, cssWidth: number): PdfRender;
    /** Frees the document and its worker. */
    destroy(): void;
}

// An A4 page 880 px wide at DPR 2 is ~4.4 MP; a cap well above that only stops outliers.
const MAX_CANVAS_PIXELS = 16_000_000;

/** Where the pdf.js data files are served (the `pdfjs-assets` plugin in `vite.config.mts`). */
const assetUrl = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;

let pdfJs: Promise<typeof PdfJs> | undefined;
const loadPdfJs = () =>
    (pdfJs ??= Promise.all([
        import('pdfjs-dist/legacy/build/pdf.mjs'),
        import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(
        ([pdfjs, worker]) => {
            pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
            return pdfjs;
        },
        error => {
            // A failed chunk load is tried again on the next open, not remembered.
            pdfJs = undefined;
            throw error;
        }
    ));

/** Starts loading pdf.js, so it arrives while the file is still downloading. */
export const preloadPdf = (): void => void loadPdfJs().catch(() => undefined);

/**
 * Opens a PDF's bytes with pdf.js, loaded on first use so the feed never pays for it.
 *
 * The legacy build, not the modern one: the modern build calls `Map.prototype.getOrInsertComputed`,
 * which Chromium does not ship yet (not in 142, nor in the shell's 130), and the legacy build
 * polyfills it. Pages are drawn to canvas only — no text or annotation layer, so no links or forms
 * in a file someone else sent. XFA forms are off for the same reason, and scripts never run.
 *
 * The CMaps and standard fonts are passed so a PDF that names a font without embedding it (common in
 * Korean files) still draws its text, and the wasm so JPEG 2000 and JBIG2 images decode.
 */
export const loadPdf = async (blob: Blob): Promise<PdfDocument> => {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        enableXfa: false,
        cMapUrl: assetUrl('cmaps'),
        cMapPacked: true,
        standardFontDataUrl: assetUrl('standard_fonts'),
        iccUrl: assetUrl('iccs'),
        wasmUrl: assetUrl('wasm'),
    });
    try {
        const doc = await task.promise;
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        return {
            pageCount: doc.numPages,
            aspectRatio: first.height / first.width,
            renderPage: (page, canvas, cssWidth) => {
                let cancelled = false;
                let cancelRender: (() => void) | undefined;
                const done = (async () => {
                    const pdfPage = await doc.getPage(page);
                    if (cancelled) throw new Error('render cancelled');
                    const base = pdfPage.getViewport({ scale: 1 });
                    const cssScale = cssWidth / base.width;
                    const ratio = Math.min(
                        window.devicePixelRatio || 1,
                        Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height * cssScale * cssScale))
                    );
                    const viewport = pdfPage.getViewport({ scale: cssScale * ratio });
                    canvas.width = Math.floor(viewport.width);
                    canvas.height = Math.floor(viewport.height);
                    const render = pdfPage.render({ canvas, viewport });
                    cancelRender = () => render.cancel();
                    try {
                        await render.promise;
                    } finally {
                        // The page's parsed drawing is not kept: a page scrolled past is drawn again if it comes back.
                        pdfPage.cleanup();
                    }
                    return base.height / base.width;
                })();
                return {
                    done,
                    cancel: () => {
                        cancelled = true;
                        cancelRender?.();
                    },
                };
            },
            destroy: () => void task.destroy(),
        };
    } catch (error) {
        // A damaged or locked file: pdf.js keeps the worker it started unless told to let it go.
        void task.destroy();
        throw error;
    }
};
