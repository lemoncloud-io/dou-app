import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MAX_MESSAGE_LENGTH = 200;

const BUBBLE_BASE = 'whitespace-pre-wrap break-all px-3 py-2 text-[16px] leading-[1.28] tracking-[-0.288px]';
const BUBBLE_MINE_SHAPE = 'rounded-bl-[14px] rounded-tl-[14px] rounded-tr-[14px]';
const BUBBLE_OTHER_SHAPE = 'rounded-bl-[14px] rounded-br-[14px] rounded-tr-[14px]';

interface MessageBubbleProps {
    content: string;
    isMine: boolean;
    onViewAll?: () => void;
    status?: 'pending' | 'failed';
}

export const MessageBubble = ({ content, isMine, onViewAll, status }: MessageBubbleProps) => {
    const { t } = useTranslation();
    const isLongMessage = !status && content.length > MAX_MESSAGE_LENGTH;

    const bubbleClassName = (() => {
        if (status === 'pending') {
            return `${BUBBLE_BASE} ${BUBBLE_MINE_SHAPE} bg-bubble-mine text-bubble-mine-foreground opacity-50`;
        }
        if (status === 'failed') {
            return `${BUBBLE_BASE} ${BUBBLE_MINE_SHAPE} border border-destructive/30 bg-destructive/10 text-destructive`;
        }
        return `${BUBBLE_BASE} ${
            isMine
                ? `${BUBBLE_MINE_SHAPE} bg-bubble-mine text-bubble-mine-foreground`
                : `${BUBBLE_OTHER_SHAPE} bg-bubble-other text-bubble-other-foreground`
        }`;
    })();

    return (
        <div className={bubbleClassName}>
            {isLongMessage ? (
                <>
                    {content.slice(0, MAX_MESSAGE_LENGTH)}...
                    <button
                        onClick={onViewAll}
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
