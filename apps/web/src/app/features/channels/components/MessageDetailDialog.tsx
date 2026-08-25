import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';

import { MessageText } from './MessageText';

export interface MessageDetailDialogProps {
    /** The message being expanded (null = closed). */
    message: { content: string } | null;
    onClose: () => void;
}

/**
 * Full body of a message the bubble had to truncate — the "전체보기" destination. Shared by the room
 * and the thread: a long reply is truncated by the same rule the room truncates by, so it needs the
 * same way out (the thread used to render the affordance with nothing behind it).
 */
export const MessageDetailDialog = ({ message, onClose }: MessageDetailDialogProps) => {
    const { t } = useTranslation();

    return (
        <Dialog open={!!message} onOpenChange={open => !open && onClose()}>
            <DialogContent variant="slide-up" hideClose className="flex flex-col gap-0 bg-background">
                <DialogDescription className="sr-only">View full message content</DialogDescription>
                <header className="relative flex min-h-[48px] items-center justify-center border-b border-border px-4 py-3">
                    <DialogTitle className="text-[15px] font-semibold text-foreground">
                        {t('chat.room.messageDetail')}
                    </DialogTitle>
                    <button
                        onClick={onClose}
                        className="absolute right-3 flex size-8 items-center justify-center rounded-full outline-none transition-colors active:bg-muted"
                    >
                        <X size={20} className="text-muted-foreground" />
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto px-4 py-3">
                    <p className="whitespace-pre-wrap break-all text-[15px] leading-[1.55] text-foreground">
                        {/* Full content, so no `truncated` — a URL the bubble had to cut is a
                            complete, tappable link here, and every fence is closed. */}
                        {message && <MessageText text={message.content} />}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
};
