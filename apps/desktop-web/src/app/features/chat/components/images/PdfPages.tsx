import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import type { PdfDocument, PdfRender } from '../../utils/pdf';

interface PdfPagesProps {
    doc: PdfDocument;
    name: string;
}

const PAGE_MAX_WIDTH = 880;
const THUMB_WIDTH = 120;
/**
 * How far outside its scroll area a page is drawn ahead of the scroll, and kept after it. The rail's
 * thumbnails are small, so a wide margin there would draw a dozen at once.
 */
const NEAR_MARGIN = '150% 0px';
const RAIL_NEAR_MARGIN = '25% 0px';
/** A window drag settles before the pages are drawn again at the new width. */
const RESIZE_SETTLE_MS = 150;

/**
 * A PDF's pages in a column, with a rail of numbered thumbnails beside them (Slack's layout). Only
 * pages near the view hold a canvas; the rest keep their place and shape, so a long file does not
 * hold every page in memory. The thumbnail of the page most in view is marked, and a thumbnail jumps
 * to its page.
 */
export const PdfPages = ({ doc, name }: PdfPagesProps) => {
    const { t } = useTranslation();
    const pages = Array.from({ length: doc.pageCount }, (_, i) => i + 1);
    const railRef = useRef<HTMLElement>(null);
    const columnRef = useRef<HTMLElement>(null);
    const [current, setCurrent] = useState(1);
    const [width, setWidth] = useState(PAGE_MAX_WIDTH);

    useEffect(() => {
        const column = columnRef.current;
        if (!column || typeof ResizeObserver === 'undefined') return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let isFirst = true;
        const observer = new ResizeObserver(([entry]) => {
            // The content box: the column's padding is already left out.
            const available = Math.floor(entry.contentRect.width);
            if (available <= 0) return;
            const apply = () => setWidth(Math.min(PAGE_MAX_WIDTH, available));
            clearTimeout(timer);
            // The first measurement sizes the pages before any is drawn; only later ones wait.
            if (isFirst) apply();
            else timer = setTimeout(apply, RESIZE_SETTLE_MS);
            isFirst = false;
        });
        observer.observe(column);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
        };
    }, []);

    // The page most in view is the one being read.
    useEffect(() => {
        const column = columnRef.current;
        if (!column) return;
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
            { root: column, threshold: [0, 0.25, 0.5, 0.75, 1] }
        );
        column.querySelectorAll('[data-page]').forEach(page => observer.observe(page));
        return () => observer.disconnect();
    }, [doc]);

    const jumpTo = (page: number) =>
        columnRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: 'start' });

    return (
        <div className="flex min-h-0 flex-1">
            <nav
                ref={railRef}
                aria-label={t('chat.file.pages', { name })}
                className="scrollbar-thin flex w-[168px] shrink-0 flex-col items-center gap-4 overflow-y-auto border-r border-hairline bg-background py-4"
            >
                {pages.map(page => (
                    <button
                        key={page}
                        type="button"
                        onClick={() => jumpTo(page)}
                        aria-label={t('chat.file.page', { page })}
                        aria-current={page === current ? 'page' : undefined}
                        className="focus-ring group flex flex-col items-center gap-1.5 rounded-md"
                    >
                        <PdfPage
                            doc={doc}
                            page={page}
                            width={THUMB_WIDTH}
                            scrollRoot={railRef}
                            nearMargin={RAIL_NEAR_MARGIN}
                            className={cn(
                                'border-2',
                                page === current ? 'border-primary' : 'border-transparent group-hover:border-hairline'
                            )}
                        />
                        <span className="text-caption tabular-nums text-description">{page}</span>
                    </button>
                ))}
            </nav>
            <section
                ref={columnRef}
                aria-label={name}
                className="scrollbar-thin flex min-w-0 flex-1 flex-col items-center gap-4 overflow-y-auto px-8 py-6"
            >
                {pages.map(page => (
                    <PdfPage
                        key={page}
                        doc={doc}
                        page={page}
                        width={width}
                        scrollRoot={columnRef}
                        isColumnPage
                        className="shadow-raised"
                    />
                ))}
            </section>
        </div>
    );
};

interface PdfPageProps {
    doc: PdfDocument;
    page: number;
    width: number;
    /** The scroll area the page sits in: "near the view" is measured against it. */
    scrollRoot: RefObject<HTMLElement | null>;
    /** How far outside the scroll area it is drawn ahead. */
    nearMargin?: string;
    /** A page of the reading column, which the current-page tracking and the jumps look for. */
    isColumnPage?: boolean;
    className?: string;
}

/**
 * One page: a white sheet of the page's shape, drawn while it is near the view. The sheet keeps its
 * height whether or not it holds a canvas, so drawing a page never moves the ones around it.
 */
const PdfPage = memo(function PdfPage({
    doc,
    page,
    width,
    scrollRoot,
    nearMargin = NEAR_MARGIN,
    isColumnPage,
    className,
}: PdfPageProps) {
    const holderRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // The last drawing on this page, settled or not: the next one waits for it (one per canvas).
    const lastRender = useRef<Promise<unknown>>(Promise.resolve());
    const [isNear, setIsNear] = useState(false);
    const [aspect, setAspect] = useState(doc.aspectRatio);

    useEffect(() => {
        const holder = holderRef.current;
        if (!holder) return;
        const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
            root: scrollRoot.current,
            rootMargin: nearMargin,
        });
        observer.observe(holder);
        return () => observer.disconnect();
    }, [scrollRoot, nearMargin]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!isNear || !canvas) return;
        let isActive = true;
        let render: PdfRender | undefined;
        const drawn = lastRender.current.then(() => {
            if (!isActive) return;
            render = doc.renderPage(page, canvas, width);
            // A page that fails to draw stays a blank sheet; the others still draw.
            return render.done.then(ratio => isActive && setAspect(ratio)).catch(() => undefined);
        });
        lastRender.current = drawn;
        return () => {
            isActive = false;
            render?.cancel();
        };
    }, [doc, page, width, isNear]);

    return (
        <div
            ref={holderRef}
            data-page={isColumnPage ? page : undefined}
            className={cn('shrink-0 overflow-hidden bg-white', className)}
            style={{ width, height: Math.round(width * aspect) }}
        >
            {isNear && <canvas ref={canvasRef} className="block h-full w-full" />}
        </div>
    );
});
