import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ChatGapSide } from '../hooks/useChats';

interface GapDividerProps {
    status?: 'loading' | 'failed';
    canFill: boolean;
    autoFill?: boolean;
    onFill: (side: ChatGapSide, byTap: boolean) => void;
}

const sideOf = (top: number, bottom: number, viewportHeight: number): ChatGapSide =>
    (top + bottom) / 2 < viewportHeight / 2 ? 'newer' : 'older';

export const GapDivider = ({ status, canFill, autoFill = true, onFill }: GapDividerProps) => {
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
        if (!visibleSide || !canFill || !autoFill || status || askedRef.current) return;
        askedRef.current = true;
        onFill(visibleSide, false);
    }, [visibleSide, canFill, autoFill, status, onFill]);

    const handleClick = () => {
        if (status === 'loading' || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        onFill(sideOf(rect.top, rect.bottom, window.innerHeight), true);
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
