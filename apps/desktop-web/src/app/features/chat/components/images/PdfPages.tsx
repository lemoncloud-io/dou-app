import { memo, useEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

import type { PdfDocument, PdfRender } from '../../utils/pdf';

interface PdfPagesProps {
    doc: PdfDocument;
    name: string;
}

const PAGE_MAX_WIDTH = 880;
const THUMB_WIDTH = 120;
const NEAR_MARGIN = '150% 0px';
const RAIL_NEAR_MARGIN = '25% 0px';
const RESIZE_SETTLE_MS = 150;

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
            const available = Math.floor(entry.contentRect.width);
            if (available <= 0) return;
            const apply = () => setWidth(Math.min(PAGE_MAX_WIDTH, available));
            clearTimeout(timer);
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
    scrollRoot: RefObject<HTMLElement | null>;
    nearMargin?: string;
    isColumnPage?: boolean;
    className?: string;
}

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
