import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet, IconCopy, IconEmojiAdd, IconSpinner, IconThread, SheetAction } from '@chatic/web-ui-kit';
import { Pencil, Trash2 } from 'lucide-react';

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
    /**
     * Edit and delete shown only for a message of mine the server has settled — the shared
     * `canModifyMessage` verdict, which the page computes so every surface asks it the same way.
     */
    canModify: boolean;
    isCopying: boolean;
    onPickEmoji: (emoji: string) => void;
    onMoreEmoji: () => void;
    onCopy: () => void;
    onReply: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

/**
 * Long-press action sheet for one message: a one-tap reaction row (recents + fixed
 * quick reactions), then the thread and copy actions. Replaces the old Radix dropdown —
 * a narrow dropdown cannot hold the emoji row, and sheet options are the touch-target
 * size the dropdown items were not (ADR-0093).
 *
 * The quick row's pressed state mirrors the chips: tapping an emoji you already
 * reacted with sends `off`, so the sheet is a toggle surface, not add-only.
 *
 * The panel sizes to its content and carries no title bar — only the grabber (Figma
 * 4712:16421). That reverses the fixed 50vh it used to hold, which existed so the rows
 * would not move under the thumb between long-presses; the design's answer was instead
 * to keep the row COUNT stable — the quick row is always six plus the add button, and
 * the actions below it were the same two every time. What moves is the panel's top edge,
 * not the targets' distance from the bottom.
 *
 * THAT STABLE COUNT IS GONE, deliberately. Edit and delete only exist for a message of
 * mine, so the list is now two rows or four. Do not "restore" the invariant by pulling
 * them back out: the alternative was a second message-action surface on a phone, and one
 * sheet that sometimes has more in it beats two places to look. What is preserved is the
 * part the invariant was protecting — the existing two actions keep their positions,
 * because the new rows go BELOW them. Adding anything further goes below as well.
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
    canModify,
    isCopying,
    onPickEmoji,
    onMoreEmoji,
    onCopy,
    onReply,
    onEdit,
    onDelete,
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
            {/* Below the existing two, always — see the note on the stable row count above. */}
            {canModify && (
                <>
                    <SheetAction icon={<Pencil size={22} />} label={t('chat.room.editMessage')} onClick={onEdit} />
                    {/* `deleteMessage`, NOT the `delete` key an unsent row's ✕ uses. That one
                        clears a failed send from my own screen; this one removes the message for
                        everyone. They never appear on the same message, but the same person meets
                        both in the same room, and one word for both teaches that the earlier one
                        was hidden from the other side too. */}
                    <SheetAction
                        icon={<Trash2 size={22} className="text-destructive" />}
                        label={t('chat.room.deleteMessage')}
                        onClick={onDelete}
                    />
                </>
            )}
        </BottomSheet>
    );
};
