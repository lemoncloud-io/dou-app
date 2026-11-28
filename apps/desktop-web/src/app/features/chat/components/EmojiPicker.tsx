import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { Hint } from '@chatic/design-system-components-desktop';

import { useRecentEmojiStore } from '../stores';
import { EMOJI_CATEGORIES, emojiNameKey } from '../utils';

interface EmojiPickerProps {
    onPick: (emoji: string) => void;
}

export const EmojiPicker = ({ onPick }: EmojiPickerProps) => {
    const { t } = useTranslation();
    const { t: tEmoji } = useTranslation('emoji');
    const recent = useRecentEmojiStore(s => s.recent);
    const remember = useRecentEmojiStore(s => s.remember);
    const [categoryKey, setCategoryKey] = useState(recent.length > 0 ? 'recent' : EMOJI_CATEGORIES[0].key);

    const pick = (emoji: string) => {
        remember(emoji);
        onPick(emoji);
    };

    const isRecent = categoryKey === 'recent';
    const category = EMOJI_CATEGORIES.find(c => c.key === categoryKey) ?? EMOJI_CATEGORIES[0];
    const label = isRecent ? t('emoji.recent') : t(`emoji.cat.${category.key}`);
    const emojis = isRecent ? recent : category.emojis;

    return (
        <div className="flex w-72 flex-col gap-1.5">
            <div
                role="tablist"
                aria-label={t('chat.composer.emoji')}
                className="scrollbar-thin flex shrink-0 items-center gap-0.5 overflow-x-auto"
            >
                {recent.length > 0 && (
                    <Hint label={t('emoji.recent')}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isRecent}
                            aria-label={t('emoji.recent')}
                            onClick={() => setCategoryKey('recent')}
                            className={cn(
                                'focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lead transition-colors ease-tactile hover:bg-accent',
                                isRecent && 'bg-accent'
                            )}
                        >
                            🕘
                        </button>
                    </Hint>
                )}
                {EMOJI_CATEGORIES.map(cat => (
                    <Hint key={cat.key} label={t(`emoji.cat.${cat.key}`)}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={categoryKey === cat.key}
                            aria-label={t(`emoji.cat.${cat.key}`)}
                            onClick={() => setCategoryKey(cat.key)}
                            className={cn(
                                'focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lead transition-colors ease-tactile hover:bg-accent',
                                categoryKey === cat.key && 'bg-accent'
                            )}
                        >
                            {cat.icon}
                        </button>
                    </Hint>
                ))}
            </div>
            <p className="px-0.5 text-overline uppercase text-muted-foreground">{label}</p>
            <div className="scrollbar-thin grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
                {emojis.map(emoji => {
                    const name = tEmoji(emojiNameKey(emoji), { defaultValue: '' });
                    const button = (
                        <button
                            type="button"
                            onClick={() => pick(emoji)}
                            aria-label={name || undefined}
                            className="focus-ring tactile flex h-9 w-9 items-center justify-center rounded-md text-title font-normal transition-colors ease-tactile hover:bg-accent"
                        >
                            {emoji}
                        </button>
                    );
                    return name ? (
                        <Hint key={emoji} label={name}>
                            {button}
                        </Hint>
                    ) : (
                        <Fragment key={emoji}>{button}</Fragment>
                    );
                })}
            </div>
        </div>
    );
};
