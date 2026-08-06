import { Copy, Loader2, MessageSquare, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet } from '@chatic/web-ui-kit';

import { useRecentEmojiStore, QUICK_REACTIONS } from '../../../stores/useRecentEmojiStore';
import { hasMyReaction, type ReactionTally } from '../utils/foldReactions';

// Fills the quick row when the person has few recents. Together with QUICK_REACTIONS
// these are conversation acknowledgements, not a "top emoji" chart.
const QUICK_FALLBACK = ['😂', '❤️', '🙏', '😮'];
const QUICK_ROW_SIZE = 6;

interface MessageActionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Folded reactions of the target message — pressed state for the quick row. */
    tallies?: ReactionTally[];
    /** Quick row + "more" picker shown only when the target can be reacted to (persisted row). */
    canReact: boolean;
    /** Reply action shown only for persisted, top-level messages (flat threads, ADR-0008). */
    canReply: boolean;
    isCopying: boolean;
    onPickEmoji: (emoji: string) => void;
    onMoreEmoji: () => void;
    onCopy: () => void;
    onReply: () => void;
}

/**
 * Long-press action sheet for one message: a one-tap reaction row (recents + fixed
 * quick reactions), then copy and reply. Replaces the old Radix dropdown — a narrow
 * dropdown cannot hold the emoji row, and sheet options are the touch-target size the
 * dropdown items were not (ADR-0045).
 *
 * The quick row's pressed state mirrors the chips: tapping an emoji you already
 * reacted with sends `off`, so the sheet is a toggle surface, not add-only.
 */
export const MessageActionSheet = ({
    open,
    onOpenChange,
    tallies,
    canReact,
    canReply,
    isCopying,
    onPickEmoji,
    onMoreEmoji,
    onCopy,
    onReply,
}: MessageActionSheetProps) => {
    const { t } = useTranslation();
    const recent = useRecentEmojiStore(s => s.recent);

    // Recents first (habit wins), topped up with the fixed acknowledgements — deduped
    // on the raw string; the fold key only matters once a reaction exists.
    const quickEmojis = [...new Set([...recent, ...QUICK_REACTIONS, ...QUICK_FALLBACK])].slice(0, QUICK_ROW_SIZE);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.messageActions')}
            description={t('chat.room.messageActionsDescription')}
            onClose={() => onOpenChange(false)}
        >
            <div className="flex flex-col px-4 pb-2">
                {canReact && (
                    <div className="flex items-center justify-between gap-1 pb-3 pt-1">
                        {quickEmojis.map(emoji => {
                            const mine = hasMyReaction(tallies, emoji);
                            return (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => onPickEmoji(emoji)}
                                    aria-pressed={mine}
                                    aria-label={t('chat.room.reactWith', { emoji })}
                                    className={cn(
                                        'flex size-11 items-center justify-center rounded-full text-2xl transition-colors active:bg-accent',
                                        mine && 'bg-primary/10 ring-1 ring-primary'
                                    )}
                                >
                                    {emoji}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={onMoreEmoji}
                            aria-label={t('chat.room.moreEmoji')}
                            className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors active:bg-accent"
                        >
                            <Plus size={22} />
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    disabled={isCopying}
                    onClick={onCopy}
                    className="flex h-14 w-full items-center gap-3 border-b border-border text-[15px] text-foreground active:bg-accent"
                >
                    {isCopying ? (
                        <Loader2 size={18} className="animate-spin text-muted-foreground" />
                    ) : (
                        <Copy size={18} className="text-muted-foreground" />
                    )}
                    <span>{t('chat.room.copyMessage')}</span>
                </button>

                {canReply && (
                    <button
                        type="button"
                        onClick={onReply}
                        className="flex h-14 w-full items-center gap-3 text-[15px] text-foreground active:bg-accent"
                    >
                        <MessageSquare size={18} className="text-muted-foreground" />
                        <span>{t('chat.thread.replyAction')}</span>
                    </button>
                )}
            </div>
        </BottomSheet>
    );
};
