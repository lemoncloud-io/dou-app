import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';

import { systemMessageText } from '../utils';

interface SystemNoticeProps {
    chat: DomainChat;
    /** Resolved author of the event; empty when the roster has not named them yet. */
    authorName: string;
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
export const SystemNotice = ({ chat, authorName }: SystemNoticeProps) => {
    const { t } = useTranslation();
    const text = systemMessageText(chat, authorName);
    if (!text) return null;

    return (
        <div className="flex justify-center px-2 py-1">
            <span className="text-caption text-muted-foreground">
                {text.kind === 'i18n' ? t(text.key, { name: text.name }) : text.text}
            </span>
        </div>
    );
};
