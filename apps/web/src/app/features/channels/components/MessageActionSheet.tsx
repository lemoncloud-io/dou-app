import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet, IconCopy, IconEmojiAdd, IconSpinner, IconThread, SheetAction } from '@chatic/web-ui-kit';

import { useRecentEmojiStore, QUICK_REACTIONS } from '../stores/useRecentEmojiStore';
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
 * quick reactions), then the thread and copy actions. Replaces the old Radix dropdown —
 * a narrow dropdown cannot hold the emoji row, and sheet options are the touch-target
 * size the dropdown items were not (ADR-0045).
 *
 * The quick row's pressed state mirrors the chips: tapping an emoji you already
 * reacted with sends `off`, so the sheet is a toggle surface, not add-only.
 *
 * The panel sizes to its content and carries no title bar — only the grabber (Figma
 * 4712:16421). That reverses the fixed 50vh it used to hold, which existed so the rows
 * would not move under the thumb between long-presses; the design's answer is instead
 * to keep the row COUNT stable — the quick row is always six plus the add button, and
 * the two actions below it are the same two every time. What moves now is the panel's
 * top edge, not the targets' distance from the bottom.
 *
 * WHO reacted is deliberately not here — it lives in `ReactionDetailSheet`, reached by
 * long-pressing the chip itself. This sheet answers "what can I do to this message";
 * that one answers "who is in this reaction", and faces need room this list has not.
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
            hideHeader
            showHandle
            className="rounded-t-[32px] pb-8"
        >
            {canReact && (
                <div className="flex items-center justify-between gap-1 px-4 pb-6 pt-8">
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
                                    'flex size-10 shrink-0 items-center justify-center rounded-full border text-xl transition-colors',
                                    mine
                                        ? 'border-main-accent bg-main-accent/[0.06]'
                                        : 'border-transparent bg-input-border/[0.44] active:bg-input-border/70'
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
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-input-border/[0.44] text-foreground transition-colors active:bg-input-border/70"
                    >
                        <IconEmojiAdd size={20} />
                    </button>
                </div>
            )}

            {/* 스레드 above 메시지 복사 (design order): opening the conversation is the reason
                this sheet gets long-pressed open, and copy is the fallback. */}
            {canReply && (
                <SheetAction icon={<IconThread size={26} />} label={t('chat.thread.replyAction')} onClick={onReply} />
            )}
            <SheetAction
                icon={
                    isCopying ? (
                        <IconSpinner size={20} className="animate-spin text-muted-foreground" />
                    ) : (
                        <IconCopy size={22} />
                    )
                }
                label={t('chat.room.copyMessage')}
                disabled={isCopying}
                onClick={onCopy}
            />
        </BottomSheet>
    );
};
