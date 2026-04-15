import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const MAX_MESSAGE_LENGTH = 200;

interface MessageBubbleProps {
    content: string;
    isMine: boolean;
    onViewAll: () => void;
}

export const MessageBubble = ({ content, isMine, onViewAll }: MessageBubbleProps) => {
    const { t } = useTranslation();
    const isLongMessage = content.length > MAX_MESSAGE_LENGTH;

    return (
        <div
            className={`whitespace-pre-wrap break-all px-3 py-2 text-[16px] leading-[1.28] tracking-[-0.288px] ${
                isMine
                    ? 'rounded-bl-[14px] rounded-tl-[14px] rounded-tr-[14px] bg-bubble-mine text-bubble-mine-foreground'
                    : 'rounded-bl-[14px] rounded-br-[14px] rounded-tr-[14px] bg-bubble-other text-bubble-other-foreground'
            }`}
        >
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
