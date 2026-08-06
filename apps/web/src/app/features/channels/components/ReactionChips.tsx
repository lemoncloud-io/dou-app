import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';

import type { ReactionTally } from '../utils/foldReactions';

interface ReactionChipsProps {
    tallies: ReactionTally[];
    /** Names the reactors, so a chip can say who rather than only how many. */
    nameOf: (userId: string) => string;
    onToggle: (emoji: string, isMine: boolean) => void;
}

/**
 * The row of reaction chips under a message (mobile port of desktop's ReactionBar).
 *
 * Chips only. The control that adds a *new* reaction lives on the long-press action
 * sheet, because this row must not exist at all when a message has no reactions — a
 * permanently reserved strip under every message would cost more vertical rhythm than
 * the feature earns.
 *
 * Each chip is a toggle and says so: `aria-pressed` carries whether the reaction is
 * yours, which is the same thing the filled border shows visually.
 */
export const ReactionChips = ({ tallies, nameOf, onToggle }: ReactionChipsProps) => {
    const { t } = useTranslation();
    if (tallies.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1">
            {tallies.map(tally => {
                const names = tally.userIds.map(nameOf).filter(Boolean).join(', ');
                return (
                    <button
                        key={tally.emoji}
                        type="button"
                        onClick={() => onToggle(tally.emoji, tally.mine)}
                        aria-pressed={tally.mine}
                        aria-label={t('chat.room.reactionWho', { emoji: tally.emoji, names })}
                        className={cn(
                            'flex h-7 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
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
        </div>
    );
};
