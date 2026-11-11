import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';

import { groupedJoinText, systemMessageText } from '../utils';

interface SystemNoticeProps {
    chat: DomainChat;
    /** Resolved author of the event; empty when the roster has not named them yet. */
    authorName: string;
    /** Actors of a folded run of joins; when set (2+), the row prints one grouped line. */
    joinedNames?: readonly string[];
    /** Feed-window measurement key (see MessageList); rendered as data-row-key on the row. */
    rowKey?: string;
}

/**
 * One line of transcript the server wrote — someone joined or left the channel.
 *
 * Rendered quietly and without an avatar so it reads as punctuation between messages
 * rather than as a message. Deliberately not a live region: the feed replays its whole
 * history on scroll-back, and a `role="status"` here would make a screen reader
 * re-announce every join the reader scrolls past.
 *
 * Renders nothing when there is no printable text, which is what keeps a subtype this
 * build has never seen from leaving a blank row in the middle of a conversation.
 */
export const SystemNotice = ({ chat, authorName, joinedNames, rowKey }: SystemNoticeProps) => {
    const { t } = useTranslation();
    const grouped = joinedNames && joinedNames.length > 1 ? groupedJoinText(joinedNames) : null;
    const text = grouped ? null : systemMessageText(chat, authorName);
    if (!grouped && !text) return null;

    return (
        <div data-row-key={rowKey} className="flex justify-center px-2 py-1">
            <span className="text-caption text-muted-foreground">
                {grouped
                    ? t(grouped.key, grouped.params)
                    : text?.kind === 'i18n'
                      ? t(text.key, { name: text.name })
                      : text?.text}
            </span>
        </div>
    );
};
