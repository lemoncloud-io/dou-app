import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChatGapSide } from '../hooks/useChats';

interface GapDividerProps {
    /** `loading` while a page of this gap is in flight, `failed` after the last one failed. */
    status?: 'loading' | 'failed';
    /** A page can be sent now (the socket is verified). The divider waits for it rather than asking into nothing. */
    canFill: boolean;
    onFill: (side: ChatGapSide) => void;
}

/**
 * Which side of the divider the reader is on, from where it sits in the viewport: in the upper half
 * it came into view from above, so the reader is below it — on the newer side, scrolling up.
 */
const sideOf = (top: number, bottom: number, viewportHeight: number): ChatGapSide =>
    (top + bottom) / 2 < viewportHeight / 2 ? 'newer' : 'older';

/**
 * Stands where the cache skips history no page has fetched yet, between two runs of messages.
 *
 * It fills itself: once it is on screen and a page can be sent, it asks for one page from the side the
 * reader is coming from. The parent keys it by the gap, and a filled page moves the gap, so the next
 * divider asks again if it is still in view — a reader parked on it pulls the whole gap in, one page
 * at a time, the way scrolling to the top pulls in older pages. A tap does the same, and is the retry
 * after a failure, which never refires by itself.
 */
export const GapDivider = ({ status, canFill, onFill }: GapDividerProps) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLButtonElement>(null);
    const [visibleSide, setVisibleSide] = useState<ChatGapSide | null>(null);
    const askedRef = useRef(false);

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry) return;
            const height = entry.rootBounds?.height ?? window.innerHeight;
            setVisibleSide(
                entry.isIntersecting
                    ? sideOf(entry.boundingClientRect.top, entry.boundingClientRect.bottom, height)
                    : null
            );
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!visibleSide || !canFill || status || askedRef.current) return;
        askedRef.current = true;
        onFill(visibleSide);
    }, [visibleSide, canFill, status, onFill]);

    const handleClick = () => {
        if (status === 'loading' || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        onFill(sideOf(rect.top, rect.bottom, window.innerHeight));
    };

    return (
        <button
            ref={ref}
            type="button"
            data-chat-gap
            onClick={handleClick}
            disabled={status === 'loading'}
            className="mx-auto flex items-center gap-1.5 rounded-full bg-brand-ink/5 px-3 py-1.5 text-[13px] text-muted-foreground"
        >
            {status === 'loading' && <Loader2 size={14} className="animate-spin" />}
            {status === 'loading'
                ? t('chat.room.gap.loading')
                : status === 'failed'
                  ? t('chat.room.gap.retry')
                  : t('chat.room.gap.load')}
        </button>
    );
};
