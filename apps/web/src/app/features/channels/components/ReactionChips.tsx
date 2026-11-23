import { useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { ReactionAddButton, ReactionChip } from '@chatic/web-ui-kit';

import type { ReactionTally } from '../utils/foldReactions';
import { LONG_PRESS_DELAY_MS } from '../utils/longPress';

interface ReactionChipsProps {
    tallies: ReactionTally[];
    nameOf: (userId: string) => string;
    onToggle: (emoji: string, isMine: boolean) => void;
    onAdd?: () => void;
    onShowReactors?: (key: string) => void;
    align?: 'start' | 'end';
}

export const ReactionChips = ({
    tallies,
    nameOf,
    onToggle,
    onAdd,
    onShowReactors,
    align = 'start',
}: ReactionChipsProps) => {
    const { t } = useTranslation();

    const timerRef = useRef<number | null>(null);
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
        <div className={cn('flex flex-wrap items-center gap-1', align === 'end' && 'justify-end')}>
            {tallies.map(tally => {
                const names = tally.userIds.map(nameOf).filter(Boolean).join(', ');
                return (
                    <ReactionChip
                        key={tally.emoji}
                        emoji={tally.emoji}
                        count={tally.userIds.length}
                        mine={tally.mine}
                        onClick={() => {
                            if (longPressFiredRef.current) return;
                            onToggle(tally.emoji, tally.mine);
                        }}
                        onPointerDown={() => startLongPress(tally.key)}
                        onPointerUp={clearTimer}
                        onPointerLeave={clearTimer}
                        onPointerCancel={clearTimer}
                        onContextMenu={event => handleContextMenu(event, tally.key)}
                        aria-label={t('chat.room.reactionWho', { emoji: tally.emoji, names })}
                    />
                );
            })}
            {onAdd && <ReactionAddButton onClick={onAdd} aria-label={t('chat.room.addReaction')} />}
        </div>
    );
};
