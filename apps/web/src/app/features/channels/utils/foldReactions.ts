import type { DomainChat } from '@chatic/runtime';

export interface ReactionTally {
    emoji: string;
    key: string;
    userIds: string[];
    mine: boolean;
}

const reactionKey = (emoji: string): string => emoji.normalize('NFC').replace(/\uFE0F/g, '');

interface ReactionEvent {
    targetId: string;
    key: string;
    emoji: string;
    userId: string;
    on: boolean;
    order: number;
}

const asEvent = (chat: DomainChat, index: number): ReactionEvent | null => {
    const reaction = chat.reaction$;
    const targetId = reaction?.chatId;
    const emoji = reaction?.emoji;
    const userId = chat.ownerId;
    if (!targetId || !emoji || !userId) return null;
    return {
        targetId,
        key: reactionKey(emoji),
        emoji,
        userId,
        on: reaction?.action !== 'off',
        order: chat.chatNo || Number.MAX_SAFE_INTEGER - index,
    };
};

export const foldReactions = (messages: DomainChat[], myUid: string | null): Map<string, ReactionTally[]> => {
    const latest = new Map<string, ReactionEvent>();
    messages.forEach((chat, index) => {
        if (chat.subType !== 'reaction') return;
        const event = asEvent(chat, index);
        if (!event) return;
        const tripleKey = `${event.targetId}\u0000${event.userId}\u0000${event.key}`;
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
            if (!existing.userIds.includes(event.userId)) existing.userIds.push(event.userId);
            existing.mine ||= event.userId === myUid;
        } else {
            tallies.push({
                emoji: event.emoji,
                key: event.key,
                userIds: [event.userId],
                mine: event.userId === myUid,
            });
        }
    }
    return byTarget;
};

export const hasMyReaction = (tallies: ReactionTally[] | undefined, emoji: string): boolean =>
    !!tallies?.find(tally => tally.key === reactionKey(emoji))?.mine;
