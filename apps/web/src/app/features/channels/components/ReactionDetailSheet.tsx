import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, DefaultAvatar, ImageAvatar, ReactionChip } from '@chatic/web-ui-kit';

import { emojiNameKey } from '../utils/emoji';
import type { ReactionTally } from '../utils/foldReactions';

interface ReactionDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tallies: ReactionTally[];
    initialKey?: string;
    nameOf: (userId: string) => string;
    avatarOf: (userId: string) => string | undefined;
}

export const ReactionDetailSheet = ({
    open,
    onOpenChange,
    tallies,
    initialKey,
    nameOf,
    avatarOf,
}: ReactionDetailSheetProps) => {
    const { t } = useTranslation();
    const { t: tEmoji } = useTranslation('emoji', { useSuspense: false });
    const emojiName = (emoji: string) => tEmoji(emojiNameKey(emoji), { defaultValue: '' });
    const [selectedKey, setSelectedKey] = useState(initialKey);

    useEffect(() => setSelectedKey(initialKey), [initialKey]);

    const active = tallies.find(tally => tally.key === selectedKey) ?? tallies[0];
    const activeName = active ? emojiName(active.emoji) : '';

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.reactions')}
            description={t('chat.room.reactionsDescription')}
            hideHeader
            showHandle
            className="h-[50vh] rounded-t-[32px]"
        >
            {active && (
                <div className="flex h-full flex-col">
                    <div
                        role="tablist"
                        aria-label={t('chat.room.reactions')}
                        className="flex shrink-0 items-center gap-2.5 overflow-x-auto px-4 pb-4 pt-8"
                    >
                        {tallies.map(tally => (
                            <ReactionChip
                                key={tally.key}
                                emoji={tally.emoji}
                                count={tally.userIds.length}
                                mine={tally.mine}
                                size="md"
                                selected={tally.key === active.key}
                                role="tab"
                                aria-selected={tally.key === active.key}
                                aria-pressed={undefined}
                                aria-label={
                                    emojiName(tally.emoji)
                                        ? `${emojiName(tally.emoji)} ${tally.userIds.length}`
                                        : undefined
                                }
                                onClick={() => setSelectedKey(tally.key)}
                            />
                        ))}
                    </div>

                    {activeName && (
                        <p
                            data-testid="reaction-emoji-name"
                            className="shrink-0 truncate px-4 pb-1 text-[13px] leading-[18px] text-muted-foreground"
                        >
                            {activeName}
                        </p>
                    )}

                    <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2">
                        {active.userIds.map(userId => {
                            const src = avatarOf(userId);
                            return (
                                <li key={userId} className="flex items-center gap-2.5 px-1 py-2">
                                    {src ? <ImageAvatar src={src} alt="" size={36} /> : <DefaultAvatar size={36} />}
                                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-[18px] tracking-[-0.075px] text-foreground">
                                        {nameOf(userId)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </BottomSheet>
    );
};
