import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BottomSheet, DefaultAvatar, ImageAvatar, ReactionChip } from '@chatic/web-ui-kit';

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
 * The tabs are the same `ReactionChip` the message rows use, one size up, so the chip that was
 * long-pressed is recognisably the chip that is now selected. Its accent border keeps meaning
 * "mine"; the underline is what marks the open tab. Those are two different facts and a tab can
 * carry either, both, or neither.
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
            hideHeader
            showHandle
            // Half the screen, always: the reactor list grows and shrinks live while the sheet is
            // open, and a sheet that resized under the reader's thumb moved the rows they were
            // reading. Unlike the action sheet, this one's content length is unbounded — one
            // reaction or forty faces — so the fixed panel is what keeps it from covering the
            // message it was opened from.
            className="h-[50vh] rounded-t-[32px]"
        >
            {active && (
                <div className="flex h-full flex-col">
                    {/* Scrolls sideways rather than wrapping: a message with many distinct
                        reactions would otherwise push the reactor list off the screen.
                        `pb-3` leaves room for the selected chip's underline, which hangs
                        below the pill. */}
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
                                onClick={() => setSelectedKey(tally.key)}
                            />
                        ))}
                    </div>

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
