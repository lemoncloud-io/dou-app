import type { DomainChat } from '@chatic/data';

import { isViewerId, type MessageViewer } from './buildMessageRows';

/** One emoji on one message, and who put it there. */
export interface ReactionTally {
    /** The emoji as the picker produced it — never the normalised fold key. */
    emoji: string;
    /**
     * The normalised form this tally is bucketed under. Carried so callers can ask
     * "is this the same reaction?" the way the fold does, instead of comparing display
     * strings — `❤️` and `❤` are one reaction here but two strings.
     */
    key: string;
    /** Reactors, in the order they first reacted. */
    userIds: string[];
    /** Whether the signed-in user is among them, under their account id or their cloud id. */
    mine: boolean;
}

/**
 * Fold key for one emoji: NFC, minus variation selectors.
 *
 * The same rule the server applies (`normalizeEmoji` in socials-api), and it has to
 * be, or the two sides would bucket differently and a reaction sent from one client
 * would not cancel the same reaction from another. Skin-tone modifiers and ZWJ
 * sequences are left alone — those are genuinely different emoji.
 *
 * Fold key only. Stripping U+FE0F turns codepoints like ❤ (U+2764) back into their
 * text presentation, so what gets *displayed* is the string the event carried.
 */
const reactionKey = (emoji: string): string => emoji.normalize('NFC').replace(/\uFE0F/g, '');

interface ReactionEvent {
    targetId: string;
    key: string;
    emoji: string;
    userId: string;
    /** Who acted, one value per person — all of the viewer's ids collapse into `VIEWER_ACTOR`. */
    actor: string;
    mine: boolean;
    on: boolean;
    order: number;
}

// My optimistic events carry my account id and the persisted ones my per-channel cloud id.
// Keyed apart they would count me twice, and an optimistic `off` could not cancel a
// persisted `on` until the server echoed it.
const VIEWER_ACTOR = '\u0000viewer';

const asEvent = (chat: DomainChat, index: number, viewer: MessageViewer): ReactionEvent | null => {
    const reaction = chat.reaction$;
    const targetId = reaction?.chatId;
    const emoji = reaction?.emoji;
    // The actor is the event's own author — the reaction carries no separate field.
    const userId = chat.ownerId;
    if (!targetId || !emoji || !userId) return null;
    const mine = isViewerId(userId, viewer);
    return {
        targetId,
        key: reactionKey(emoji),
        emoji,
        userId,
        actor: mine ? VIEWER_ACTOR : userId,
        mine,
        on: reaction?.action !== 'off',
        // chatNo orders events server-side; an event still in flight has none yet, so
        // fall back to arrival order, which puts it last — where an optimistic write belongs.
        order: chat.chatNo || Number.MAX_SAFE_INTEGER - index,
    };
};

/**
 * Derive each message's reactions from the reaction events in the loaded feed.
 *
 * The server keeps no reaction state. Every toggle is published as its own chat with
 * `subType='reaction'`, and the truth is whatever the newest event for a given
 * (message, person, emoji) says. That is the whole model: fold the events, last one
 * wins, and an `off` means the person is simply absent from the tally.
 *
 * Feed order is by `chatNo`, so a rapid on/off/on resolves correctly even if the rows
 * arrive out of order — each triple keeps only its highest-numbered event.
 *
 * Takes the *unfiltered* message list. `isFeedVisible` removes exactly these events
 * from what gets rendered, so folding its output would silently yield nothing.
 */
export const foldReactions = (messages: DomainChat[], viewer: MessageViewer): Map<string, ReactionTally[]> => {
    const latest = new Map<string, ReactionEvent>();
    messages.forEach((chat, index) => {
        if (chat.subType !== 'reaction') return;
        const event = asEvent(chat, index, viewer);
        if (!event) return;
        const tripleKey = `${event.targetId}\u0000${event.actor}\u0000${event.key}`;
        const seen = latest.get(tripleKey);
        if (!seen || event.order > seen.order) latest.set(tripleKey, event);
    });

    const byTarget = new Map<string, ReactionTally[]>();
    for (const event of latest.values()) {
        if (!event.on) continue;
        let tallies = byTarget.get(event.targetId);
        if (!tallies) {
            tallies = [];
            byTarget.set(event.targetId, tallies);
        }
        const existing = tallies.find(tally => tally.key === event.key);
        if (existing) {
            existing.userIds.push(event.userId);
            existing.mine ||= event.mine;
        } else {
            tallies.push({
                emoji: event.emoji,
                key: event.key,
                userIds: [event.userId],
                mine: event.mine,
            });
        }
    }
    return byTarget;
};

/**
 * Whether the signed-in user already reacted to this message with `emoji`.
 *
 * Exists so the picker asks the question the same way the fold answers it. Comparing
 * display strings gets it wrong for any emoji whose picker output differs by a
 * variation selector: you would send a second `on` instead of turning yours off.
 */
export const hasMyReaction = (tallies: ReactionTally[] | undefined, emoji: string): boolean =>
    !!tallies?.find(tally => tally.key === reactionKey(emoji))?.mine;
