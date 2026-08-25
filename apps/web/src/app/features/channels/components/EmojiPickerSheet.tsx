import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet } from '@chatic/web-ui-kit';

import { useRecentEmojiStore } from '../stores/useRecentEmojiStore';
import { EMOJI_CATEGORIES } from '../utils/emoji';

interface EmojiPickerSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onPick: (emoji: string) => void;
}

/**
 * Category-tabbed emoji grid as a bottom sheet — the mobile port of desktop's
 * EmojiPicker popover. Picks are remembered in the device-local LRU ("recently used"
 * tab). No external emoji DB — categories are the curated sets in utils/emoji.ts,
 * kept identical to desktop so the two apps offer the same reaction set (ADR-0045).
 */
export const EmojiPickerSheet = ({ open, onOpenChange, onPick }: EmojiPickerSheetProps) => {
    const { t } = useTranslation();
    const recent = useRecentEmojiStore(s => s.recent);
    const remember = useRecentEmojiStore(s => s.remember);
    const [categoryKey, setCategoryKey] = useState(EMOJI_CATEGORIES[0].key);

    const pick = (emoji: string) => {
        remember(emoji);
        onPick(emoji);
    };

    const isRecent = categoryKey === 'recent';
    const category = EMOJI_CATEGORIES.find(c => c.key === categoryKey) ?? EMOJI_CATEGORIES[0];
    const label = isRecent ? t('emoji.recent') : t(`emoji.cat.${category.key}`);
    const emojis = isRecent ? recent : category.emojis;

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.pickEmoji')}
            onClose={() => onOpenChange(false)}
        >
            <div className="flex flex-col gap-2 px-4 pb-2">
                <div role="tablist" aria-label={t('chat.room.pickEmoji')} className="flex items-center gap-0.5">
                    {recent.length > 0 && (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isRecent}
                            title={t('emoji.recent')}
                            onClick={() => setCategoryKey('recent')}
                            className={cn(
                                'flex size-9 items-center justify-center rounded-md text-base transition-colors active:bg-accent',
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
                                'flex size-9 items-center justify-center rounded-md text-base transition-colors active:bg-accent',
                                categoryKey === cat.key && 'bg-accent'
                            )}
                        >
                            {cat.icon}
                        </button>
                    ))}
                </div>
                <p className="px-0.5 text-xs uppercase text-muted-foreground">{label}</p>
                {/* Fixed height, not `max-h`: the categories hold different counts (recent can hold
                    one), so a height that follows the content made the sheet jump every time a tab
                    was switched. The grid keeps its rows at the top and scrolls the overflow. */}
                <div className="grid h-64 grid-cols-8 content-start gap-0.5 overflow-y-auto">
                    {emojis.map(emoji => (
                        <button
                            key={emoji}
                            type="button"
                            onClick={() => pick(emoji)}
                            className="flex size-10 items-center justify-center rounded-md text-xl transition-colors active:bg-accent"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </BottomSheet>
    );
};
