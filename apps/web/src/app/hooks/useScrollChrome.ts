import { useCallback, useRef, useState } from 'react';

export interface ScrollChrome {
    scrolled: boolean;
    pinned: boolean;
}

const AT_TOP: ScrollChrome = { scrolled: false, pinned: false };

export const scrollChromeOf = (scrollTop: number, anchorOffset: number | null, pinAt = 0): ScrollChrome => {
    const scrolled = scrollTop > 0;
    return { scrolled, pinned: scrolled && anchorOffset !== null && anchorOffset <= pinAt };
};

export interface UseScrollChromeResult extends ScrollChrome {
    anchorRef: React.RefObject<HTMLDivElement | null>;
    track: (container: HTMLElement) => void;
}

export const useScrollChrome = (pinAt = 0): UseScrollChromeResult => {
    const anchorRef = useRef<HTMLDivElement>(null);
    const [chrome, setChrome] = useState<ScrollChrome>(AT_TOP);

    const track = useCallback(
        (container: HTMLElement) => {
            const anchor = anchorRef.current;
            const anchorOffset = anchor
                ? anchor.getBoundingClientRect().top - container.getBoundingClientRect().top
                : null;
            const next = scrollChromeOf(container.scrollTop, anchorOffset, pinAt);
            setChrome(prev => (prev.scrolled === next.scrolled && prev.pinned === next.pinned ? prev : next));
        },
        [pinAt]
    );

    return { ...chrome, anchorRef, track };
};
