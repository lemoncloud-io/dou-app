import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { IconClose, IconFileSolid, IconSpinner } from '../../resources/icons';
import { MEDIA_VIEWER_FOOTER_TOAST_LIFT } from './MediaViewer';
import { VIEWER_MOTION } from './viewerShell';

/** A page being drawn. `done` resolves to the page's height over width once it is on the canvas. */
export interface DocumentPageRender {
    done: Promise<number>;
    /** Stops the drawing. `done` then rejects. */
    cancel(): void;
}

/**
 * A document opened for the viewer: how many pages, the shape of the first, and how to draw one. The
 * host owns the renderer (pdf.js, in the app) so this kit never loads one.
 */
export interface DocumentViewerPages {
    pageCount: number;
    /** Height over width of the first page: how tall a page is held before its own shape is known. */
    aspectRatio: number;
    /**
     * Draws page `page` (1-based) into `canvas`, `cssWidth` pixels wide on screen. Only one drawing
     * targets a canvas at a time: the viewer cancels the last one and lets it settle first.
     */
    renderPage(page: number, canvas: HTMLCanvasElement, cssWidth: number): DocumentPageRender;
}

export interface DocumentViewerLabels {
    close: string;
    /** The spinner's accessible name while the file is fetched and opened. */
    loading: string;
    /** Drawn under the placeholder when the file could not be shown. */
    failed: string;
}

const DEFAULT_LABELS: DocumentViewerLabels = {
    close: 'Close',
    loading: 'Opening',
    failed: 'This file can’t be previewed.',
};

export type DocumentViewerStatus = 'loading' | 'ready' | 'failed';

export interface DocumentViewerProps {
    open: boolean;
    /** The file's name: the viewer's accessible name and the page list's. Not drawn. */
    name: string;
    status: DocumentViewerStatus;
    /** The document, once `status` is `ready`. */
    pages?: DocumentViewerPages;
    onClose: () => void;
    /**
     * The bar along the bottom edge — the host's share and save, built from `MediaViewerActionButton`
     * as the media viewer's are. Shown in every status, so a file that will not open can still be
     * saved or handed to an app that opens it.
     */
    renderFooter?: () => React.ReactNode;
    labels?: Partial<DocumentViewerLabels>;
}

/** Pages are drawn no wider than this, however wide the window. */
const PAGE_MAX_WIDTH = 880;
/** How far outside the view a page is drawn ahead of the scroll, and kept after it. */
const NEAR_MARGIN = '150% 0px';

/**
 * A document — a PDF, in the app — read on the phone in the same frame as the photo viewer: black, the
 * position along the top ("3 / 12", here the page most in view), close at the top right, and the
 * host's share and save along the bottom over a gradient. The pages run down one column and scroll;
 * the photo viewer's left-right paging does not suit a document whose pages follow on.
 *
 * Only pages near the view hold a canvas; the rest keep their place and shape, so a long file does
 * not hold every page in memory.
 */
export const DocumentViewer = ({ open, name, status, pages, onClose, renderFooter, labels }: DocumentViewerProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const [scrollRoot, setScrollRoot] = React.useState<HTMLDivElement | null>(null);
    const [width, setWidth] = React.useState(0);
    const [current, setCurrent] = React.useState(1);
    const closeRef = React.useRef<HTMLButtonElement>(null);
    const ready = status === 'ready' && pages !== undefined && pages.pageCount > 0;

    useToastLift(open && renderFooter !== undefined ? MEDIA_VIEWER_FOOTER_TOAST_LIFT : null);

    // The column is as wide as the screen allows, less its side padding, up to a page's limit.
    React.useEffect(() => {
        const scroller = scrollRoot;
        if (!scroller) return;
        const measure = (available: number) => {
            if (available > 0) setWidth(Math.min(PAGE_MAX_WIDTH, Math.floor(available)));
        };
        measure(scroller.clientWidth - 32);
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width - 32));
        observer.observe(scroller);
        return () => observer.disconnect();
    }, [scrollRoot]);

    // The page most in view is the one being read.
    React.useEffect(() => {
        if (!ready || !scrollRoot || typeof IntersectionObserver === 'undefined') return;
        const ratios = new Map<number, number>();
        const observer = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    ratios.set(Number((entry.target as HTMLElement).dataset.page), entry.intersectionRatio);
                }
                let best = 0;
                let bestRatio = 0;
                ratios.forEach((ratio, page) => {
                    if (ratio > bestRatio) [best, bestRatio] = [page, ratio];
                });
                if (best) setCurrent(best);
            },
            { root: scrollRoot, threshold: [0, 0.25, 0.5, 0.75, 1] }
        );
        scrollRoot.querySelectorAll('[data-page]').forEach(page => observer.observe(page));
        return () => observer.disconnect();
    }, [ready, scrollRoot, pages, width]);

    // A new document starts at its first page.
    React.useEffect(() => setCurrent(1), [pages]);

    const footer = renderFooter?.();

    return (
        <Dialog.Root open={open} onOpenChange={value => !value && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        'fixed inset-0 z-50 bg-black data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
                        VIEWER_MOTION
                    )}
                />
                <Dialog.Content
                    aria-describedby={undefined}
                    // The viewer fills the screen, so anything "outside" it is drawn on top of it — a
                    // toast with a button of its own. Pressing that button must not close the viewer.
                    onInteractOutside={event => event.preventDefault()}
                    // Focus lands on close rather than the first control in the page order, which is the
                    // host's share or save: a ring on that reads as if it had been pressed.
                    onOpenAutoFocus={event => {
                        event.preventDefault();
                        closeRef.current?.focus({ preventScroll: true });
                    }}
                    className={cn(
                        'fixed inset-0 z-50 overflow-hidden outline-none',
                        'data-[state=closed]:!pointer-events-none',
                        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-full data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full',
                        VIEWER_MOTION
                    )}
                >
                    <Dialog.Title className="sr-only">{name}</Dialog.Title>
                    <div
                        // State, not a ref: the pages observe against it, and it exists only once the
                        // dialog's portal has mounted.
                        ref={setScrollRoot}
                        className={cn(
                            'absolute inset-0 overflow-y-auto overscroll-contain',
                            'pt-[calc(var(--safe-top,0px)+56px)]',
                            footer ? 'pb-[calc(var(--safe-bottom,0px)+76px)]' : 'pb-[calc(var(--safe-bottom,0px)+16px)]'
                        )}
                    >
                        {ready && width > 0 && (
                            <section aria-label={name} className="flex flex-col items-center gap-3 px-4">
                                {Array.from({ length: pages.pageCount }, (_, i) => (
                                    <DocumentPage
                                        key={i + 1}
                                        pages={pages}
                                        page={i + 1}
                                        width={width}
                                        scrollRoot={scrollRoot}
                                    />
                                ))}
                            </section>
                        )}
                    </div>
                    {status === 'loading' && (
                        <span
                            role="status"
                            aria-label={text.loading}
                            className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2"
                        >
                            <IconSpinner className="size-8 animate-spin text-white" aria-hidden="true" />
                        </span>
                    )}
                    {status === 'failed' && (
                        <div className="absolute left-1/2 top-1/2 flex w-[300px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4 text-center">
                            <span
                                data-broken=""
                                aria-hidden="true"
                                className="flex size-24 items-center justify-center rounded-2xl bg-white/10"
                            >
                                <IconFileSolid size={32} className="text-white/60" />
                            </span>
                            <p className="whitespace-pre-line text-[14px] leading-normal text-white/70">
                                {text.failed}
                            </p>
                        </div>
                    )}
                    {ready && pages.pageCount > 1 && (
                        <span
                            aria-live="polite"
                            className="absolute left-1/2 top-[calc(var(--safe-top,0px)+20px)] -translate-x-1/2 text-[15px] font-medium text-white"
                        >
                            {current} / {pages.pageCount}
                        </span>
                    )}
                    {footer && (
                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-4 pb-[calc(var(--safe-bottom,0px)+16px)] pt-6">
                            {footer}
                        </div>
                    )}
                    <Dialog.Close
                        ref={closeRef}
                        aria-label={text.close}
                        className="absolute right-4 top-[calc(var(--safe-top,0px)+12px)] flex size-9 items-center justify-center rounded-full bg-white/20"
                    >
                        <IconClose className="size-5 text-white" />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};

interface DocumentPageProps {
    pages: DocumentViewerPages;
    page: number;
    width: number;
    /** The scroll area: "near the view" is measured against it. */
    scrollRoot: HTMLElement | null;
}

/**
 * One page: a white sheet of the page's shape, drawn while it is near the view. The sheet keeps its
 * height whether or not it holds a canvas, so drawing a page never moves the ones around it.
 */
const DocumentPage = React.memo(function DocumentPage({ pages, page, width, scrollRoot }: DocumentPageProps) {
    const holderRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    // The last drawing on this page, settled or not: the next one waits for it (one per canvas).
    const lastRender = React.useRef<Promise<unknown>>(Promise.resolve());
    // Without an observer (an old engine) every page is drawn.
    const [isNear, setIsNear] = React.useState(() => typeof IntersectionObserver === 'undefined');
    const [aspect, setAspect] = React.useState(pages.aspectRatio);

    React.useEffect(() => {
        const holder = holderRef.current;
        if (!holder || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
            root: scrollRoot,
            rootMargin: NEAR_MARGIN,
        });
        observer.observe(holder);
        return () => observer.disconnect();
    }, [scrollRoot]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!isNear || !canvas) return;
        let isActive = true;
        let render: DocumentPageRender | undefined;
        const drawn = lastRender.current.then(() => {
            if (!isActive) return;
            render = pages.renderPage(page, canvas, width);
            // A page that fails to draw stays a blank sheet; the others still draw.
            return render.done.then(ratio => isActive && setAspect(ratio)).catch(() => undefined);
        });
        lastRender.current = drawn;
        return () => {
            isActive = false;
            render?.cancel();
        };
    }, [pages, page, width, isNear]);

    return (
        <div
            ref={holderRef}
            data-page={page}
            className="shrink-0 overflow-hidden rounded-[2px] bg-white"
            style={{ width, height: Math.round(width * aspect) }}
        >
            {isNear && <canvas ref={canvasRef} className="block h-full w-full" />}
        </div>
    );
});
