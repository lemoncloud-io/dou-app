import { ChevronRight } from 'lucide-react';
import { useRef, type MouseEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_MESSAGE_LENGTH = 200;

const BUBBLE_BASE = 'whitespace-pre-wrap break-all px-3 py-2 text-[16px] leading-[1.28] tracking-[-0.288px]';
const BUBBLE_MINE_SHAPE = 'rounded-bl-[14px] rounded-tl-[14px] rounded-tr-[14px]';
const BUBBLE_OTHER_SHAPE = 'rounded-bl-[14px] rounded-br-[14px] rounded-tr-[14px]';

interface MessageBubbleProps {
    content: string;
    isMine: boolean;
    onAction?: () => void;
    onLongPress?: () => void;
    status?: 'pending' | 'failed';
}

const LONG_PRESS_DELAY_MS = 450;

export const MessageBubble = ({ content, isMine, onAction, onLongPress, status }: MessageBubbleProps) => {
    const { t } = useTranslation();
    const longPressTimerRef = useRef<number | null>(null);
    const isLongMessage = !status && content.length > MAX_MESSAGE_LENGTH;

    const bubbleClassName = (() => {
        if (status === 'failed') {
            return `${BUBBLE_BASE} ${BUBBLE_MINE_SHAPE} border border-destructive/30 bg-destructive/10 text-destructive`;
        }
        return `${BUBBLE_BASE} ${
            isMine
                ? `${BUBBLE_MINE_SHAPE} bg-bubble-mine text-bubble-mine-foreground`
                : `${BUBBLE_OTHER_SHAPE} bg-bubble-other text-bubble-other-foreground`
        }`;
    })();

    const clearLongPressTimer = () => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!onLongPress || !content) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
            longPressTimerRef.current = null;
            onLongPress();
        }, LONG_PRESS_DELAY_MS);
    };

    const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
        if (!onLongPress || !content) return;
        event.preventDefault();
        clearLongPressTimer();
        onLongPress();
    };

    return (
        <div
            className={bubbleClassName}
            onPointerDown={handlePointerDown}
            onPointerUp={clearLongPressTimer}
            onPointerCancel={clearLongPressTimer}
            onPointerLeave={clearLongPressTimer}
            onContextMenu={handleContextMenu}
        >
            {isLongMessage ? (
                <>
                    {content.slice(0, MAX_MESSAGE_LENGTH)}...
                    <button
                        onPointerDown={event => event.stopPropagation()}
                        onClick={onAction}
                        className={`ml-auto mt-1 flex items-center gap-0.5 text-[14px] font-medium ${
                            isMine ? 'text-bubble-mine-foreground/80' : 'text-muted-foreground'
                        }`}
                    >
                        {t('chat.room.viewAll')}
                        <ChevronRight size={16} />
                    </button>
                </>
            ) : (
                content
            )}
        </div>
    );
};
