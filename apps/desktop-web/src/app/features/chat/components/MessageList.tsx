import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { DomainChat } from '@chatic/data';

import { buildMessageRows, type MessageViewer } from '../utils';
import { DateSeparator } from './DateSeparator';
import { MessageRow } from './MessageRow';

interface MessageListProps {
    messages: DomainChat[];
    isLoading: boolean;
    viewer: MessageViewer;
}

export const MessageList = ({ messages, isLoading, viewer }: MessageListProps) => {
    const { t } = useTranslation();
    const bottomRef = useRef<HTMLDivElement>(null);

    const rows = useMemo(() => buildMessageRows(messages, viewer), [messages, viewer]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ block: 'end' });
    }, [messages.length]);

    if (isLoading) {
        return (
            <div role="status" aria-live="polite" aria-label={t('chat.loading')} className="flex flex-1 flex-col gap-5 overflow-hidden p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                        <span className="h-9 w-9 shrink-0 rounded-md bg-muted" />
                        <div className="flex flex-1 flex-col gap-2 pt-1">
                            <span className="h-3 w-24 rounded bg-muted" />
                            <span className="h-3 rounded bg-muted/70" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="scrollbar-thin flex flex-1 flex-col gap-0.5 overflow-y-auto p-4">
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
