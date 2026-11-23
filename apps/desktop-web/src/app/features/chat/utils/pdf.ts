import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfRender {
    done: Promise<number>;
    cancel(): void;
}

export interface PdfDocument {
    pageCount: number;
    aspectRatio: number;
    renderPage(page: number, canvas: HTMLCanvasElement, cssWidth: number): PdfRender;
    destroy(): void;
}

const MAX_CANVAS_PIXELS = 16_000_000;

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
            pdfJs = undefined;
            throw error;
        }
    ));

export const preloadPdf = (): void => void loadPdfJs().catch(() => undefined);

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
        void task.destroy();
        throw error;
    }
};
