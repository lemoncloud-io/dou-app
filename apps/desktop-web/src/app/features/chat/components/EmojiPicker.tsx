import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';

import { EMOJI_CATEGORIES } from '../utils';

const RECENT_KEY = 'chatic.emoji.recent';
const RECENT_MAX = 16;

const readRecent = (): string[] => {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
};

interface EmojiPickerProps {
    onPick: (emoji: string) => void;
}

/**
 * Category-tabbed emoji grid for the composer popover. Picks are remembered in
 * a device-local LRU ("recently used" tab). No external emoji DB — categories
 * are the curated sets in utils/emoji.ts.
 */
export const EmojiPicker = ({ onPick }: EmojiPickerProps) => {
    const { t } = useTranslation();
    const [recent, setRecent] = useState(readRecent);
    const [categoryKey, setCategoryKey] = useState(EMOJI_CATEGORIES[0].key);

    const pick = (emoji: string) => {
        const next = [emoji, ...recent.filter(e => e !== emoji)].slice(0, RECENT_MAX);
        setRecent(next);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
        onPick(emoji);
    };

    const isRecent = categoryKey === 'recent';
    const category = EMOJI_CATEGORIES.find(c => c.key === categoryKey) ?? EMOJI_CATEGORIES[0];
    const label = isRecent ? t('emoji.recent') : t(`emoji.cat.${category.key}`);
    const emojis = isRecent ? recent : category.emojis;

    return (
        <div className="flex w-72 flex-col gap-1.5">
            <div role="tablist" aria-label={t('chat.composer.emoji')} className="flex items-center gap-0.5">
                {recent.length > 0 && (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={isRecent}
                        title={t('emoji.recent')}
                        onClick={() => setCategoryKey('recent')}
                        className={cn(
                            'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors ease-tactile hover:bg-accent',
                            isRecent && 'bg-accent'
                        )}
                    >
                        🕘
                    </button>
                )}
                {EMOJI_CATEGORIES.map(cat => (
                    <button
                        key={cat.key}
                        type="button"
                        role="tab"
                        aria-selected={categoryKey === cat.key}
                        title={t(`emoji.cat.${cat.key}`)}
                        onClick={() => setCategoryKey(cat.key)}
                        className={cn(
                            'focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors ease-tactile hover:bg-accent',
                            categoryKey === cat.key && 'bg-accent'
                        )}
                    >
                        {cat.icon}
                    </button>
                ))}
            </div>
            <p className="px-0.5 text-overline uppercase text-muted-foreground">{label}</p>
            <div className="scrollbar-thin grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
                {emojis.map(emoji => (
                    <button
                        key={emoji}
                        type="button"
                        onClick={() => pick(emoji)}
                        className="focus-ring tactile flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors ease-tactile hover:bg-accent"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
};
