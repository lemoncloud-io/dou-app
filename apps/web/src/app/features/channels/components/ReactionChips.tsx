import { Plus } from 'lucide-react';
import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

import type { ReactionTally } from '../utils/foldReactions';
import { LONG_PRESS_DELAY_MS } from '../utils/longPress';

interface ReactionChipsProps {
    tallies: ReactionTally[];
    /** Names the reactors, so a chip can say who rather than only how many. */
    nameOf: (userId: string) => string;
    onToggle: (emoji: string, isMine: boolean) => void;
    /** Opens the emoji picker for this message. Omitted where adding isn't offered. */
    onAdd?: () => void;
    /** Long-press on a chip — opens the reactor detail sheet on that emoji's tab. */
    onShowReactors?: (key: string) => void;
}

/**
 * The row of reaction chips under a message (mobile port of desktop's ReactionBar).
 *
 * The row ends with an add button, so a second reaction costs one tap instead of the
 * 450ms long-press and the action sheet the first one did (ADR-0047 decision 1). It is
 * deliberately not a general entry point: this row doesn't render at all without chips,
 * which is exactly the "only once a message has reactions" rule the button wants — a
 * strip reserved under every message would cost more vertical rhythm than it earns.
 *
 * A chip carries two gestures, split by how often each is wanted. Tap toggles — the
 * common act, on the cheap gesture — and `aria-pressed` says whether the reaction is
 * yours, the same thing the filled border shows. Press and hold opens the reactor sheet
 * for that emoji. The add button is neither: it is not a toggle and carries no pressed
 * state, because tapping a chip and tapping `+` are different acts.
 */
export const ReactionChips = ({ tallies, nameOf, onToggle, onAdd, onShowReactors }: ReactionChipsProps) => {
    const { t } = useTranslation();

    // Long press per chip. The timer lives here rather than on the message row because the
    // chip row sits OUTSIDE the bubble's long-press target — otherwise the bubble's gesture
    // would swallow taps on the chips (see ChannelMessageRow's layout note).
    const timerRef = useRef<number | null>(null);
    // A long press still ends in a `click` on the chip; without this the sheet would open and
    // the reaction would toggle from the one gesture.
    const longPressFiredRef = useRef(false);

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const startLongPress = (key: string) => {
        if (!onShowReactors) return;
        clearTimer();
        longPressFiredRef.current = false;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            longPressFiredRef.current = true;
            onShowReactors(key);
        }, LONG_PRESS_DELAY_MS);
    };

    const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>, key: string) => {
        if (!onShowReactors) return;
        event.preventDefault();
        clearTimer();
        longPressFiredRef.current = true;
        onShowReactors(key);
    };

    if (tallies.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1">
            {tallies.map(tally => {
                const names = tally.userIds.map(nameOf).filter(Boolean).join(', ');
                return (
                    <button
                        key={tally.emoji}
                        type="button"
                        onClick={() => {
                            if (longPressFiredRef.current) return;
                            onToggle(tally.emoji, tally.mine);
                        }}
                        onPointerDown={() => startLongPress(tally.key)}
                        onPointerUp={clearTimer}
                        onPointerLeave={clearTimer}
                        onPointerCancel={clearTimer}
                        onContextMenu={event => handleContextMenu(event, tally.key)}
                        aria-pressed={tally.mine}
                        aria-label={t('chat.room.reactionWho', { emoji: tally.emoji, names })}
                        className={cn(
                            'flex h-7 select-none items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                            tally.mine
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border bg-muted text-muted-foreground active:bg-accent'
                        )}
                    >
                        <span aria-hidden>{tally.emoji}</span>
                        <span className="tabular-nums">{tally.userIds.length}</span>
                    </button>
                );
            })}
            {onAdd && (
                // Chip-shaped and chip-sized so it reads as the row's last item rather than a
                // separate control bolted onto the end.
                <button
                    type="button"
                    onClick={onAdd}
                    aria-label={t('chat.room.addReaction')}
                    className="flex h-7 items-center rounded-full border border-border bg-muted px-2 text-muted-foreground transition-colors active:bg-accent"
                >
                    <Plus size={14} />
                </button>
            )}
        </div>
    );
};
