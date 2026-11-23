import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/runtime';

import { groupedJoinText, systemMessageText } from '../utils';

interface SystemNoticeProps {
    chat: DomainChat;
    authorName: string;
    joinedNames?: readonly string[];
    rowKey?: string;
}

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
