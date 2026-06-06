import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';

import { buildMessageRows } from '../utils';
import { DateSeparator } from './DateSeparator';
import { MessageRow } from './MessageRow';

interface MessageListProps {
    messages: DomainChat[];
    isLoading: boolean;
}

export const MessageList = ({ messages, isLoading }: MessageListProps) => {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);

    const rows = useMemo(() => buildMessageRows(messages), [messages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages.length]);

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                {t('chat.loading')}
            </div>
        );
    }

    return (
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-4">
            {rows.map(row =>
                row.kind === 'date' ? (
                    <DateSeparator key={row.key} timestamp={row.timestamp} />
                ) : (
                    <MessageRow key={row.group.key} group={row.group} />
                )
            )}
            <div ref={bottomRef} />
        </div>
    );
};
