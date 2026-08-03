import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import type { ReactionTally } from '../utils';

interface ReactionBarProps {
    tallies: ReactionTally[];
    /** Names the reactors, so a chip can say who rather than only how many. */
    nameOf: (userId: string) => string;
    onToggle: (emoji: string, isMine: boolean) => void;
}

/**
 * The row of reaction chips under a message.
 *
 * Chips only. The control that adds a *new* reaction lives in the hover toolbar with
 * the other message actions, because this row must not exist at all when a message
 * has no reactions — a permanently reserved strip under every message would cost more
 * vertical rhythm than the feature earns.
 *
 * Each chip is a toggle and says so: `aria-pressed` carries whether the reaction is
 * yours, which is the same thing the filled border shows visually.
 */
export const ReactionBar = ({ tallies, nameOf, onToggle }: ReactionBarProps) => {
    const { t } = useTranslation();
    if (tallies.length === 0) return null;

    return (
        <div className="mt-1 flex flex-wrap items-center gap-1">
            {tallies.map(tally => {
                const names = tally.userIds.map(nameOf).filter(Boolean).join(', ');
                return (
                    <button
                        key={tally.emoji}
                        type="button"
                        onClick={() => onToggle(tally.emoji, tally.mine)}
                        aria-pressed={tally.mine}
                        aria-label={t('chat.reaction.who', { emoji: tally.emoji, names })}
                        title={names}
                        className={cn(
                            'focus-ring tactile flex h-6 items-center gap-1 rounded-full border px-2 text-caption transition-colors ease-tactile',
                            tally.mine
                                ? 'border-primary bg-primary/12 text-foreground'
                                : 'border-hairline bg-elevated text-muted-foreground hover:bg-accent'
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
