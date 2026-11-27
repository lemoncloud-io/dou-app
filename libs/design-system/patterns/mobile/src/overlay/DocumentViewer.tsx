import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { IconClose, IconFileSolid, IconSpinner } from '@chatic/design-system-assets/icons';
import {
    clampDocumentZoom,
    documentZoomScroll,
    doubleTapDocumentZoom,
    isDocumentDoubleTap,
    type DocumentPoint,
    type DocumentTap,
} from './documentZoom';
import { MEDIA_VIEWER_FOOTER_TOAST_LIFT } from './MediaViewer';
import { VIEWER_MOTION } from './viewerShell';

export interface DocumentPageRender {
    done: Promise<number>;
    cancel(): void;
}

export interface DocumentViewerPages {
    pageCount: number;
    aspectRatio: number;
    renderPage(page: number, canvas: HTMLCanvasElement, cssWidth: number): DocumentPageRender;
}

export interface DocumentViewerLabels {
    close: string;
    loading: string;
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
    name: string;
    status: DocumentViewerStatus;
    pages?: DocumentViewerPages;
    onClose: () => void;
    renderFooter?: () => React.ReactNode;
    labels?: Partial<DocumentViewerLabels>;
}

const PAGE_MAX_WIDTH = 880;
const NEAR_MARGIN = '150% 0px';

export const DocumentViewer = ({ open, name, status, pages, onClose, renderFooter, labels }: DocumentViewerProps) => {
    const text = { ...DEFAULT_LABELS, ...labels };
    const [scrollRoot, setScrollRoot] = React.useState<HTMLDivElement | null>(null);
    const [width, setWidth] = React.useState(0);
    const [current, setCurrent] = React.useState(1);
    const closeRef = React.useRef<HTMLButtonElement>(null);
    const ready = status === 'ready' && pages !== undefined && pages.pageCount > 0;
    const [zoom, setZoom] = React.useState(1);
    const sectionRef = React.useRef<HTMLElement>(null);
    const pinchRef = React.useRef<{ distance: number; focal: DocumentPoint; scale: number } | null>(null);
    const pendingScroll = React.useRef<DocumentPoint | null>(null);
    const lastTap = React.useRef<DocumentTap | null>(null);
    const tapStart = React.useRef<DocumentPoint | null>(null);

    useToastLift(open && renderFooter !== undefined ? MEDIA_VIEWER_FOOTER_TOAST_LIFT : null);

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

    React.useEffect(() => {
        setCurrent(1);
        setZoom(1);
    }, [pages]);

    React.useLayoutEffect(() => {
        const target = pendingScroll.current;
        if (!target || !scrollRoot) return;
        pendingScroll.current = null;
        scrollRoot.scrollLeft = target.x;
        scrollRoot.scrollTop = target.y;
    }, [zoom, scrollRoot]);

    const pointIn = (clientX: number, clientY: number): DocumentPoint => {
        const box = scrollRoot?.getBoundingClientRect();
        return { x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) };
    };

    const zoomTo = (next: number, focal: DocumentPoint) => {
        const to = clampDocumentZoom(next);
        if (!scrollRoot || to === zoom) return;
        pendingScroll.current = documentZoomScroll(
            { x: scrollRoot.scrollLeft, y: scrollRoot.scrollTop },
            focal,
            zoom,
            to
        );
        setZoom(to);
    };

    const setLiveScale = (scale: number, focal: DocumentPoint | null) => {
        const section = sectionRef.current;
        if (!section) return;
        if (!focal || scale === 1) {
            section.style.transform = '';
            section.style.transformOrigin = '';
            return;
        }
        const originX = (scrollRoot?.scrollLeft ?? 0) + focal.x - section.offsetLeft;
        const originY = (scrollRoot?.scrollTop ?? 0) + focal.y - section.offsetTop;
        section.style.transformOrigin = `${originX}px ${originY}px`;
        section.style.transform = `scale(${scale})`;
    };

    const onTouchStart = (event: React.TouchEvent) => {
        if (event.touches.length === 2) {
            const [a, b] = [event.touches[0], event.touches[1]];
            pinchRef.current = {
                distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                focal: pointIn((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2),
                scale: 1,
            };
            tapStart.current = null;
            return;
        }
        if (event.touches.length === 1) {
            tapStart.current = pointIn(event.touches[0].clientX, event.touches[0].clientY);
        }
    };

    const onTouchMove = (event: React.TouchEvent) => {
        const pinch = pinchRef.current;
        if (pinch && event.touches.length === 2) {
            const [a, b] = [event.touches[0], event.touches[1]];
            const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            pinch.scale = clampDocumentZoom((zoom * distance) / pinch.distance) / zoom;
            setLiveScale(pinch.scale, pinch.focal);
            return;
        }
        const start = tapStart.current;
        if (start && event.touches.length === 1) {
            const point = pointIn(event.touches[0].clientX, event.touches[0].clientY);
            if (Math.hypot(point.x - start.x, point.y - start.y) > 10) tapStart.current = null;
        }
    };

    const onTouchEnd = (event: React.TouchEvent) => {
        const pinch = pinchRef.current;
        if (pinch && event.touches.length < 2) {
            pinchRef.current = null;
            setLiveScale(1, null);
            zoomTo(zoom * pinch.scale, pinch.focal);
            lastTap.current = null;
            return;
        }
        const start = tapStart.current;
        tapStart.current = null;
        if (!start || event.touches.length > 0) return;
        const tap = { ...start, at: Date.now() };
        if (isDocumentDoubleTap(lastTap.current, tap)) {
            lastTap.current = null;
            zoomTo(doubleTapDocumentZoom(zoom), tap);
            return;
        }
        lastTap.current = tap;
    };

    const pageWidth = Math.round(width * zoom);

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
                    onInteractOutside={event => event.preventDefault()}
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
                        ref={setScrollRoot}
                        onTouchStart={onTouchStart}
                        onTouchMove={onTouchMove}
                        onTouchEnd={onTouchEnd}
                        onTouchCancel={() => {
                            pinchRef.current = null;
                            tapStart.current = null;
                            setLiveScale(1, null);
                        }}
                        onDoubleClick={event =>
                            zoomTo(doubleTapDocumentZoom(zoom), pointIn(event.clientX, event.clientY))
                        }
                        data-zoom={zoom}
                        className={cn(
                            'absolute inset-0 touch-pan-x touch-pan-y overflow-auto overscroll-contain',
                            'pt-[calc(var(--safe-top,0px)+56px)]',
                            footer ? 'pb-[calc(var(--safe-bottom,0px)+76px)]' : 'pb-[calc(var(--safe-bottom,0px)+16px)]'
                        )}
                    >
                        {ready && width > 0 && (
                            <section
                                ref={sectionRef}
                                aria-label={name}
                                className="flex w-max min-w-full flex-col items-center gap-3 px-4"
                            >
                                {Array.from({ length: pages.pageCount }, (_, i) => (
                                    <DocumentPage
                                        key={i + 1}
                                        pages={pages}
                                        page={i + 1}
                                        width={pageWidth}
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
    scrollRoot: HTMLElement | null;
}

const DocumentPage = React.memo(function DocumentPage({ pages, page, width, scrollRoot }: DocumentPageProps) {
    const holderRef = React.useRef<HTMLDivElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const lastRender = React.useRef<Promise<unknown>>(Promise.resolve());
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
