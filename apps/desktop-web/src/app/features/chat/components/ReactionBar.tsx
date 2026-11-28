import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { Hint } from '@chatic/design-system-components-desktop';

import { type ReactionTally, emojiNameKey } from '../utils';

interface ReactionBarProps {
    tallies: ReactionTally[];
    nameOf: (userId: string) => string;
    onToggle: (emoji: string, isMine: boolean) => void;
}

export const ReactionBar = ({ tallies, nameOf, onToggle }: ReactionBarProps) => {
    const { t } = useTranslation();
    const { t: tEmoji } = useTranslation('emoji');
    if (tallies.length === 0) return null;

    return (
        <div className="mt-1 flex flex-wrap items-center gap-1">
            {tallies.map(tally => {
                const names = tally.userIds.map(nameOf).filter(Boolean).join(', ');
                const emojiName = tEmoji(emojiNameKey(tally.emoji), { defaultValue: '' });
                return (
                    <Hint key={tally.emoji} label={emojiName ? `${emojiName}\n${names}` : names}>
                        <button
                            type="button"
                            onClick={() => onToggle(tally.emoji, tally.mine)}
                            aria-pressed={tally.mine}
                            aria-label={t('chat.reaction.who', { emoji: tally.emoji, names })}
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
                    </Hint>
                );
            })}
        </div>
    );
};
