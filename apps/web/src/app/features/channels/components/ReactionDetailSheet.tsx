import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet, DefaultAvatar, ImageAvatar } from '@chatic/web-ui-kit';

import type { ReactionTally } from '../utils/foldReactions';

interface ReactionDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Every reaction on the message — one tab each. Live, so a toggle elsewhere updates the sheet. */
    tallies: ReactionTally[];
    /** Fold key of the chip that was long-pressed; selects the tab the sheet opens on. */
    initialKey?: string;
    nameOf: (userId: string) => string;
    /** Reactor avatar, resolved by the caller (site profile → member cache). */
    avatarOf: (userId: string) => string | undefined;
}

/**
 * Who reacted, one tab per emoji (ADR-0047 revision — see the note below).
 *
 * Reached by long-pressing a reaction chip, not by tapping it: a chip's primary job is the
 * toggle, and the tap has to stay with the job people do constantly. Long-press is the gesture
 * already spent on "tell me more about this thing" everywhere else in the room.
 *
 * A surface of its own rather than a block inside the message action sheet, because the two
 * answer different questions — the action sheet is "what can I do to this message", this is
 * "who is in this reaction" — and because faces need room the action sheet does not have.
 *
 * `tallies` is the live fold: if someone removes their reaction while this is open the tab's
 * count drops under the reader, and a tab that disappears entirely falls back to the first one.
 */
export const ReactionDetailSheet = ({
    open,
    onOpenChange,
    tallies,
    initialKey,
    nameOf,
    avatarOf,
}: ReactionDetailSheetProps) => {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState(initialKey);

    // Re-point at the long-pressed chip each time the sheet is aimed at a new one. Kept in sync
    // via effect rather than a remount so the sheet's close animation survives.
    useEffect(() => setSelectedKey(initialKey), [initialKey]);

    const active = tallies.find(tally => tally.key === selectedKey) ?? tallies[0];

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.reactions')}
            description={t('chat.room.reactionsDescription')}
            onClose={() => onOpenChange(false)}
        >
            {active && (
                <div className="flex flex-col">
                    {/* Scrolls sideways rather than wrapping: a message with many distinct
                        reactions would otherwise push the reactor list off the screen. */}
                    <div
                        role="tablist"
                        aria-label={t('chat.room.reactions')}
                        className="flex items-center gap-1 overflow-x-auto border-b border-border px-4"
                    >
                        {tallies.map(tally => {
                            const isActive = tally.key === active.key;
                            return (
                                <button
                                    key={tally.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setSelectedKey(tally.key)}
                                    className={cn(
                                        'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-lg transition-colors',
                                        isActive ? 'border-primary' : 'border-transparent'
                                    )}
                                >
                                    <span aria-hidden>{tally.emoji}</span>
                                    <span
                                        className={cn(
                                            'text-sm tabular-nums',
                                            isActive ? 'text-primary' : 'text-muted-foreground'
                                        )}
                                    >
                                        {tally.userIds.length}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <ul className="flex max-h-[45vh] flex-col overflow-y-auto px-4 py-1">
                        {active.userIds.map(userId => {
                            const src = avatarOf(userId);
                            return (
                                <li key={userId} className="flex items-center gap-3 py-2">
                                    {src ? <ImageAvatar src={src} alt="" size={36} /> : <DefaultAvatar size={36} />}
                                    <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">
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
