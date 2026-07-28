import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Measures overlay chrome (a floating header and/or bottom bar) so the scrollable body can
 * reserve exactly that much padding.
 *
 * Screens are laid out full-screen with the header and bottom bar stacked on top via z-index,
 * rather than as flex-col siblings that push the body down. That is what lets the translucent
 * chrome show the content scrolling underneath it — but it also means the body no longer gets
 * its offset for free, so the header/footer heights have to be fed back in as padding.
 */
export const useChromeInsets = () => {
    const headerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const [headerHeight, setHeaderHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);

    useLayoutEffect(() => {
        const headerEl = headerRef.current;
        const footerEl = footerRef.current;
        if (!headerEl && !footerEl) return;

        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                const height = entry.contentRect.height;
                if (entry.target === headerEl) setHeaderHeight(height);
                if (entry.target === footerEl) setFooterHeight(height);
            }
        });
        if (headerEl) observer.observe(headerEl);
        if (footerEl) observer.observe(footerEl);
        return () => observer.disconnect();
    });

    return { headerRef, footerRef, headerHeight, footerHeight };
};
