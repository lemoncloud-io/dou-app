import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export const useChromeInsets = () => {
    const headerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    const footerFollower = useRef<((height: number) => void) | null>(null);

    const syncMeasured = useRef(new WeakSet<Element>());

    useLayoutEffect(() => {
        const headerEl = headerRef.current;
        const footerEl = footerRef.current;
        if (!headerEl && !footerEl) return;

        if (headerEl && !syncMeasured.current.has(headerEl)) {
            syncMeasured.current.add(headerEl);
            setHeaderHeight(headerEl.offsetHeight);
        }
        if (footerEl && !syncMeasured.current.has(footerEl)) {
            syncMeasured.current.add(footerEl);
            setFooterHeight(footerEl.offsetHeight);
        }

        const measure = (entry: ResizeObserverEntry): number =>
            entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const height = measure(entry);
                if (entry.target === headerEl) setHeaderHeight(height);
                if (entry.target !== footerEl) continue;
                const follow = footerFollower.current;
                if (follow) follow(height);
                else setFooterHeight(height);
            }
        });
        if (headerEl) observer.observe(headerEl, { box: 'border-box' });
        if (footerEl) observer.observe(footerEl, { box: 'border-box' });
        return () => observer.disconnect();
    });

    const followFooter = useCallback((follow: ((height: number) => void) | null) => {
        const was = footerFollower.current;
        footerFollower.current = follow;
        if (follow || !was) return;
        const footer = footerRef.current;
        if (!footer) return;
        const height = footer.getBoundingClientRect().height;
        was(height);
        setFooterHeight(height);
    }, []);

    return { headerRef, footerRef, headerHeight, footerHeight, followFooter };
};
